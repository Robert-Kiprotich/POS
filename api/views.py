from django.db import transaction
from django.db.models import Sum, Count, F,Q,ProtectedError
from django.db.models.functions import Coalesce,TruncDate
from django.utils import timezone
from .serializers import *
from django.shortcuts import get_object_or_404
from decimal import Decimal, InvalidOperation
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from .utils import get_head_office_branch
from .models import *
from .serializers import *
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
import calendar
from datetime import date
from django.db.models import Sum



class BranchViewSet(viewsets.ModelViewSet):
    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "code", "location"]
    ordering_fields = ["name", "created_at"]


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related("category").annotate(
        total_stock=Coalesce(Sum("branch_stocks__stock_quantity"), 0)
    )
    serializer_class = ProductSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "item_number", "description"]
    ordering_fields = ["name", "retail_price", "wholesale_price", "total_stock", "expiry_date", "created_at"]
    def get_queryset(self):
        qs = super().get_queryset()
        category_id = self.request.query_params.get("category")
        is_active = self.request.query_params.get("is_active")
        if category_id:
            qs = qs.filter(category_id=category_id)
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ("1", "true", "yes"))
        return qs

    @action(detail=False, methods=["get"])
    def lookup_item_number(self, request):
        """
        GET /api/pos/products/lookup_item_number/?code=XXXX
        For checkout: resolve a typed/scanned item number to a product.
        """
        code = request.query_params.get("code")
        if not code:
            return Response({"error": "Query param 'code' is required."}, status=status.HTTP_400_BAD_REQUEST)
        product = self.get_queryset().filter(item_number=code).first()
        if not product:
            return Response({"error": f"No product found for item number '{code}'."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(product).data)
    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "This product has sales history and can't be deleted. Mark it inactive instead."},
                status=status.HTTP_409_CONFLICT,
            )

class BranchStockViewSet(viewsets.ModelViewSet):
    """Per-branch stock levels. Filter with ?branch=<id> and/or ?product=<id>."""

    queryset = BranchStock.objects.select_related("branch", "product").all()
    serializer_class = BranchStockSerializer
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["stock_quantity", "product__name"]

    def get_queryset(self):
        qs = super().get_queryset()
        branch_id = self.request.query_params.get("branch")
        product_id = self.request.query_params.get("product")
        low_stock = self.request.query_params.get("low_stock")
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if product_id:
            qs = qs.filter(product_id=product_id)
        if low_stock and low_stock.lower() in ("1", "true", "yes"):
            qs = qs.filter(stock_quantity__lte=F("reorder_level"))
        return qs

    @action(detail=False, methods=["get"])
    def low_stock(self, request):
        """GET /api/pos/branch-stocks/low_stock/?branch=<id> — items at/below reorder level."""
        qs = self.get_queryset().filter(stock_quantity__lte=F("reorder_level"))
        page = self.paginate_queryset(qs)
        serializer = self.get_serializer(page or qs, many=True)
        return self.get_paginated_response(serializer.data) if page is not None else Response(serializer.data)

    @action(detail=True, methods=["post"])
    def adjust_stock(self, request, pk=None):
        """
        POST /api/pos/branch-stocks/{id}/adjust_stock/
        body: { "quantity_change": 10, "movement_type": "restock", "note": "..." }
        """
        branch_stock = self.get_object()
        quantity_change = request.data.get("quantity_change")
        movement_type = request.data.get("movement_type", StockMovement.MovementType.ADJUSTMENT)
        note = request.data.get("note", "")

        try:
            quantity_change = int(quantity_change)
        except (TypeError, ValueError):
            return Response({"error": "quantity_change must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            branch_stock.stock_quantity = max(0, branch_stock.stock_quantity + quantity_change)
            branch_stock.save(update_fields=["stock_quantity"])
            StockMovement.objects.create(
                product=branch_stock.product,
                branch=branch_stock.branch,
                movement_type=movement_type,
                quantity_change=quantity_change,
                note=note,
                created_by=request.user if request.user.is_authenticated else None,
            )

        return Response(BranchStockSerializer(branch_stock).data)

    @action(detail=False, methods=["post"])
    def transfer_from_head_office(self, request):
        """
        POST /api/pos/branch-stocks/transfer_from_head_office/
        body: { "branch": <id>, "product": <id>, "quantity": 5, "reorder_level": 5 }
        Deducts from Head Office and adds to the target branch, atomically.
        """
        try:
            qty = int(request.data.get("quantity", 0))
            reorder = int(request.data.get("reorder_level", 5))
        except (TypeError, ValueError):
            return Response(
                {"error": "Quantity and reorder level must be whole numbers."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if qty <= 0:
            return Response({"error": "Quantity must be greater than 0."}, status=status.HTTP_400_BAD_REQUEST)

        branch = get_object_or_404(Branch, pk=request.data.get("branch"))
        product = get_object_or_404(Product, pk=request.data.get("product"))
        head_office = get_head_office_branch()

        if branch.pk == head_office.pk:
            return Response(
                {"error": "Cannot transfer from Head Office to itself."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user if request.user.is_authenticated else None

        with transaction.atomic():
            # Lock the Head Office row so concurrent transfers can't overspend it
            hq_stock = (
                BranchStock.objects.select_for_update()
                .filter(branch=head_office, product=product)
                .first()
            )
            available = hq_stock.stock_quantity if hq_stock else 0

            if available < qty:
                return Response(
                    {"error": f'Not enough stock at Head Office for "{product.name}". '
                              f"Available: {available}, requested: {qty}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            dest, created = BranchStock.objects.select_for_update().get_or_create(
                branch=branch,
                product=product,
                defaults={"stock_quantity": 0, "reorder_level": reorder},
            )

            hq_stock.stock_quantity -= qty
            hq_stock.save(update_fields=["stock_quantity"])
            dest.stock_quantity += qty
            dest.save(update_fields=["stock_quantity"])

            StockMovement.objects.create(
                product=product,
                branch=head_office,                 # source
                destination_branch=branch,          # where it went
                movement_type=StockMovement.MovementType.TRANSFER,
                quantity_change=-qty,               # leaves Head Office
                note=f"Transferred {qty} to {branch.name}",
                created_by=user,
            )

            return Response(
                self.get_serializer(dest).data,
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
            )


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "phone", "email"]
    ordering_fields = ["name", "created_at"]


class SaleViewSet(viewsets.ModelViewSet):
    queryset = Sale.objects.select_related("branch", "customer", "cashier").prefetch_related("items__product", "payments").all()
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["order_number", "customer__name", "customer__phone"]
    ordering_fields = ["created_at", "total_amount"]

    def get_serializer_class(self):
        if self.action == "create":
            return SaleCreateSerializer
        return SaleSerializer
    @staticmethod
    def _sync_payment_status(sale):
        sale.refresh_from_db()
        paid = sale.payments.aggregate(
            t=Coalesce(Sum("amount"), Decimal("0.00"))
        )["t"]
        sale.amount_paid = paid
        if sale.status != Sale.Status.CANCELLED:
            # Any payment recorded at the till = completed sale.
            # The unpaid remainder is tracked as the balance (total - paid).
            sale.status = Sale.Status.COMPLETED if paid > 0 else Sale.Status.PENDING
        sale.save(update_fields=["amount_paid", "status", "updated_at"])
        return sale

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            sale = serializer.save()
            sale_type = request.data.get("sale_type")
            if sale_type in ("Retail", "Wholesale", "Credit"):
                sale.sale_type = sale_type
                sale.save(update_fields=["sale_type"])

            # Safety net: if SaleCreateSerializer didn't save the payments
            # (the likely reason it still shows pending), create them here.
            if not sale.payments.exists():
                for p in request.data.get("payments", []):
                    amount = Decimal(str(p.get("amount") or 0))
                    if amount > 0:
                        Payment.objects.create(
                            sale=sale,
                            method=p.get("method"),
                            amount=amount,
                            reference=p.get("reference", ""),
                            received_by_id=p.get("received_by") or request.user.id,
                        )

            sale = self._sync_payment_status(sale)

        return Response(
            SaleSerializer(sale, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get("status")
        branch_id = self.request.query_params.get("branch")
        customer_id = self.request.query_params.get("customer")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")

        if status_param:
            qs = qs.filter(status=status_param)
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        return qs

    @action(detail=True, methods=["post"])
    def add_payment(self, request, pk=None):
        sale = self.get_object()
        serializer = PaymentSerializer(data={**request.data, "sale": sale.id})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save(received_by=request.user if request.user.is_authenticated else None)
            sale = self._sync_payment_status(sale)
        return Response(SaleSerializer(sale).data)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """POST /api/pos/sales/{id}/cancel/ — cancels a sale and restocks its items at the sale's branch."""
        sale = self.get_object()
        if sale.status == Sale.Status.CANCELLED:
            return Response({"error": "Sale is already cancelled."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            for item in sale.items.select_related("product"):
                branch_stock, _ = BranchStock.objects.select_for_update().get_or_create(
                    branch=sale.branch, product=item.product, defaults={"stock_quantity": 0}
                )
                branch_stock.stock_quantity += item.quantity
                branch_stock.save(update_fields=["stock_quantity"])
                StockMovement.objects.create(
                    product=item.product,
                    branch=sale.branch,
                    movement_type=StockMovement.MovementType.RETURN,
                    quantity_change=item.quantity,
                    note=f"Cancelled {sale.order_number}",
                    created_by=request.user if request.user.is_authenticated else None,
                )
            sale.status = Sale.Status.CANCELLED
            sale.save(update_fields=["status", "updated_at"])

        return Response(SaleSerializer(sale).data)

    @action(detail=False, methods=["get"])
    def daily_summary(self, request):
        """
        GET /api/pos/sales/daily_summary/?date=YYYY-MM-DD&branch=<id>
        Defaults to today and all branches. Returns totals for completed sales on that date.
        """
        date_str = request.query_params.get("date")
        branch_id = request.query_params.get("branch")
        target_date = timezone.datetime.fromisoformat(date_str).date() if date_str else timezone.localdate()

        qs = self.get_queryset().filter(created_at__date=target_date, status=Sale.Status.COMPLETED)
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        summary = qs.aggregate(
            total_sales=Count("id"),
            total_revenue=Sum("total_amount"),
            total_tax=Sum("tax_amount"),
            total_discount=Sum("discount_amount"),
        )
        return Response({
            "date": str(target_date),
            "branch": int(branch_id) if branch_id else "all",
            "total_sales": summary["total_sales"] or 0,
            "total_revenue": summary["total_revenue"] or 0,
            "total_tax": summary["total_tax"] or 0,
            "total_discount": summary["total_discount"] or 0,
        })
    @action(detail=False, methods=["get"])
    def receipts(self, request):
        """
        GET /api/pos/sales/receipts/?search=<order#-or-customer>
        Lightweight listing for the POS "Saved Receipts" panel.
        """
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        serializer = SaleReceiptSerializer(page or qs, many=True)
        return self.get_paginated_response(serializer.data) if page is not None else Response(serializer.data)

class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.select_related("sale", "received_by").all()
    serializer_class = PaymentSerializer
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["paid_at", "amount"]

    def get_queryset(self):
        qs = super().get_queryset()
        sale_id = self.request.query_params.get("sale")
        if sale_id:
            qs = qs.filter(sale_id=sale_id)
        return qs
def _parse_price(value):
    """Return Decimal, None (not supplied), or raise ValueError."""
    if value in (None, ""):
        return None
    try:
        d = Decimal(str(value))
    except InvalidOperation:
        raise ValueError("Prices must be valid numbers.")
    if d < 0:
        raise ValueError("Prices cannot be negative.")
    return d

class StockMovementViewSet(viewsets.ModelViewSet):
    queryset = StockMovement.objects.select_related("product", "branch", "destination_branch", "created_by").all()
    serializer_class = StockMovementSerializer
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        product_id = self.request.query_params.get("product")
        branch_id = self.request.query_params.get("branch")
        movement_type = self.request.query_params.get("movement_type")
        if product_id:
            qs = qs.filter(product_id=product_id)
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if movement_type:
            qs = qs.filter(movement_type=movement_type)
        return qs
    @action(detail=False, methods=["post"])
    def adjust(self, request):
        """
        POST /api/pos/stock-movements/adjust/
        body: { product, branch, quantity_change (signed, may be 0),
                retail_price?, wholesale_price?, note? }
        Adjusts stock and/or the branch-specific prices, atomically.
        """
        product_id = request.data.get("product")
        branch_id = request.data.get("branch")
        note = request.data.get("note", "")

        if not product_id or not branch_id:
            return Response({"error": "product and branch are required."},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            quantity_change = int(request.data.get("quantity_change", 0))
            retail_price = _parse_price(request.data.get("retail_price"))
            wholesale_price = _parse_price(request.data.get("wholesale_price"))
        except (TypeError, ValueError) as e:
            return Response({"error": str(e) or "quantity_change must be an integer."},
                            status=status.HTTP_400_BAD_REQUEST)

        if quantity_change == 0 and retail_price is None and wholesale_price is None:
            return Response({"error": "Nothing to adjust: enter a quantity or a price."},
                            status=status.HTTP_400_BAD_REQUEST)

        product = get_object_or_404(Product, pk=product_id)
        branch = get_object_or_404(Branch, pk=branch_id)

        with transaction.atomic():
            bs, _ = BranchStock.objects.select_for_update().get_or_create(
                branch=branch, product=product, defaults={"stock_quantity": 0}
            )
            new_qty = bs.stock_quantity + quantity_change
            if new_qty < 0:
                return Response(
                    {"error": f"Cannot reduce below zero. Current stock at {branch.name}: {bs.stock_quantity}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            bs.stock_quantity = new_qty
            fields = ["stock_quantity"]
            parts = []
            if retail_price is not None:
                parts.append(f"retail {bs.retail_price} -> {retail_price}")
                bs.retail_price = retail_price
                fields.append("retail_price")
            if wholesale_price is not None:
                parts.append(f"wholesale {bs.wholesale_price} -> {wholesale_price}")
                bs.wholesale_price = wholesale_price
                fields.append("wholesale_price")
            bs.save(update_fields=fields)

            movement = StockMovement.objects.create(
                product=product,
                branch=branch,
                movement_type=StockMovement.MovementType.ADJUSTMENT,
                quantity_change=quantity_change,
                note=(note + (" | " if note and parts else "") + ", ".join(parts)).strip(),
                created_by=request.user if request.user.is_authenticated else None,
            )

        return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"])
    def transfer(self, request):
        """
        POST /api/pos/stock-movements/transfer/
        body: { "product": <id>, "from_branch": <id>, "to_branch": <id>, "quantity": <int>, "note": "..." }
        Moves stock from one branch to another: decrements the source branch's
        BranchStock, increments (or creates) the destination branch's
        BranchStock, and records a single StockMovement of type TRANSFER.
        Bypasses StockMovementSerializer.create() deliberately, since that
        only knows how to adjust a single (source) branch — a transfer needs
        both sides adjusted together, atomically.
        """
        product_id = request.data.get("product")
        from_branch_id = request.data.get("from_branch")
        to_branch_id = request.data.get("to_branch")
        quantity = request.data.get("quantity")
        note = request.data.get("note", "")

        if not all([product_id, from_branch_id, to_branch_id, quantity]):
            return Response(
                {"error": "product, from_branch, to_branch and quantity are all required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if str(from_branch_id) == str(to_branch_id):
            return Response({"error": "from_branch and to_branch must be different."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            quantity = int(quantity)
        except (TypeError, ValueError):
            return Response({"error": "quantity must be an integer."}, status=status.HTTP_400_BAD_REQUEST)
        if quantity <= 0:
            return Response({"error": "quantity must be greater than zero."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            retail_price = _parse_price(request.data.get("retail_price"))
            wholesale_price = _parse_price(request.data.get("wholesale_price"))
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        try:
            product = Product.objects.get(pk=product_id)
            from_branch = Branch.objects.get(pk=from_branch_id)
            to_branch = Branch.objects.get(pk=to_branch_id)
        except (Product.DoesNotExist, Branch.DoesNotExist):
            return Response({"error": "product, from_branch or to_branch not found."}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            source_stock, _ = BranchStock.objects.select_for_update().get_or_create(
                branch=from_branch, product=product, defaults={"stock_quantity": 0}
            )
            if source_stock.stock_quantity < quantity:
                return Response(
                    {"error": f"Insufficient stock at {from_branch.name}: only {source_stock.stock_quantity} available."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            source_stock.stock_quantity -= quantity
            source_stock.save(update_fields=["stock_quantity"])

            dest_stock, _ = BranchStock.objects.select_for_update().get_or_create(
                branch=to_branch, product=product, defaults={"stock_quantity": 0}
            )
            dest_stock.stock_quantity += quantity
            update_fields = ["stock_quantity"]
            if retail_price is not None:
                dest_stock.retail_price = retail_price
                update_fields.append("retail_price")
            if wholesale_price is not None:
                dest_stock.wholesale_price = wholesale_price
                update_fields.append("wholesale_price")
            dest_stock.save(update_fields=update_fields)
            price_note = ""
            if retail_price is not None or wholesale_price is not None:
                price_note = f" | Prices at {to_branch.name}: retail={retail_price}, wholesale={wholesale_price}"

            movement = StockMovement.objects.create(
                product=product,
                branch=from_branch,
                destination_branch=to_branch,
                movement_type=StockMovement.MovementType.TRANSFER,
                quantity_change=-quantity,
                 note=(note or "") + price_note,
                created_by=request.user if request.user.is_authenticated else None,
            )

        return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)

class IsAdminUserCustom(IsAuthenticated):
    """Allow read to any authenticated user; write only to admins."""
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        return self._check_admin(request.user)

    @staticmethod
    def _check_admin(user):
        if getattr(user, 'is_admin', False):
            return True
        try:
            return 'admin' in (user.role.role_name or '').lower()
        except Exception:
            return False


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().select_related('role')
    serializer_class = UserBasicSerializer
    permission_classes = [IsAdminUserCustom]
    pagination_class = None
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['username', 'firstname', 'lastname', 'email']
    filterset_fields = ['role', 'is_active']
    ordering_fields = ['username', 'date_joined']
    ordering = ['-date_joined']

    def create(self, request, *args, **kwargs):
        from users.models import Roles

        data = request.data
        try:
            user = User(
                username=str(data.get('username', '')).lower(),
                firstname=data.get('firstname', ''),
                lastname=data.get('lastname', ''),
                email=data.get('email', ''),
                phone=data.get('phone') or '',
                address=data.get('address') or 'N/A',
                can_login=True,
                is_admin=False,
                offdays={},
            )
            user.set_password(data.get('password') or str(data.get('username', '')).lower())
            role_id = data.get('role')
            if role_id:
                user.role = Roles.objects.get(pk=role_id)
            user.save()

            from users.models import ActivityLog
            ActivityLog.log('user_created', user=request.user, entity='User', entity_id=user.id,
                            detail=f'Created user {user.username}', request=request)
            serializer = self.get_serializer(user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def update(self, request, *args, **kwargs):
        from users.models import Roles
        partial = kwargs.pop('partial', False)
        user = self.get_object()
        data = request.data
        for field in ('firstname', 'lastname', 'email', 'phone', 'address'):
            if field in data:
                setattr(user, field, data[field])
        if 'role' in data:
            user.role = Roles.objects.get(pk=data['role'])
        if 'is_active' in data:
            user.is_active = data['is_active']
        if data.get('password'):
            user.set_password(data['password'])
        user.save()
        from users.models import ActivityLog
        ActivityLog.log('user_updated', user=request.user, entity='User', entity_id=user.id,
                        detail=f'Updated user {user.username}', request=request)
        return Response(self.get_serializer(user).data)

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        from users.models import ActivityLog
        ActivityLog.log('user_deleted', user=request.user, entity='User', entity_id=user.id,
                        detail=f'Deleted user {user.username}', request=request)
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def me(self, request):
        if request.method == 'GET':
            return Response(self.get_serializer(request.user).data)
        serializer = self.get_serializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def _is_admin(self, user):
        return IsAdminUserCustom._check_admin(user)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def reset_password(self, request, pk=None):
        if not self._is_admin(request.user):
            return Response({'error': 'Admin only'}, status=status.HTTP_403_FORBIDDEN)
        user = self.get_object()
        new_password = request.data.get('password') or user.username
        user.set_password(new_password)
        user.save()
        return Response({'message': 'Password reset successfully'})

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def toggle_status(self, request, pk=None):
        if not self._is_admin(request.user):
            return Response({'error': 'Admin only'}, status=status.HTTP_403_FORBIDDEN)
        user = self.get_object()
        user.is_active = not user.is_active
        user.save()
        return Response({'is_active': user.is_active, 'message': f'User {"enabled" if user.is_active else "disabled"}'})

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def form_data(self, request):
        """Returns roles for the create/edit form."""
        from users.models import Roles
        roles = Roles.objects.all().values('id', 'role_name', 'role_description')
        return Response({'roles': list(roles)})


from rest_framework.decorators import api_view, permission_classes as drf_permission_classes


@api_view(['GET'])
@drf_permission_classes([IsAuthenticated])
def activity_logs(request):
    """Return paginated activity logs — admin/supervisor only."""
    from users.models import ActivityLog
    if not IsAdminUserCustom._check_admin(request.user):
        return Response({'error': 'Admin only'}, status=403)

    qs = ActivityLog.objects.select_related('user').order_by('-timestamp')

    action_f = request.GET.get('action')
    user_f   = request.GET.get('user')
    entity_f = request.GET.get('entity')
    date_f   = request.GET.get('date_from')
    date_t   = request.GET.get('date_to')
    search   = request.GET.get('search')

    if action_f:  qs = qs.filter(action=action_f)
    if user_f:    qs = qs.filter(user__id=user_f)
    if entity_f:  qs = qs.filter(entity=entity_f)
    if date_f:    qs = qs.filter(timestamp__date__gte=date_f)
    if date_t:    qs = qs.filter(timestamp__date__lte=date_t)
    if search:    qs = qs.filter(detail__icontains=search)

    total = qs.count()
    page  = max(1, int(request.GET.get('page', 1)))
    size  = min(100, int(request.GET.get('page_size', 50)))
    logs  = qs[(page - 1) * size: page * size]

    results = []
    for log in logs:
        u = log.user
        results.append({
            'id':         log.id,
            'action':     log.action,
            'entity':     log.entity,
            'entity_id':  log.entity_id,
            'detail':     log.detail,
            'ip_address': log.ip_address,
            'timestamp':  log.timestamp.isoformat(),
            'user_id':    u.id if u else None,
            'user_name':  f'{u.firstname} {u.lastname}'.strip() if u else 'System',
            'user_role':  u.role.role_name if u and u.role else '',
        })

    return Response({'total': total, 'page': page, 'page_size': size, 'results': results})

class VeterinaryEPrescriptionViewSet(viewsets.ModelViewSet):
    queryset = VeterinaryEPrescription.objects.all()
    serializer_class = VeterinaryEPrescriptionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "drug_trade_name",
        "animal_species",
        "name_of_the_buyer",
        "manufacturer",
        "batch_no",
    ]
    ordering_fields = ["date_of_prescription", "created_at", "drug_trade_name"]
    ordering = ["-date_of_prescription", "-id"]

    def get_queryset(self):
        qs = super().get_queryset()
        category  = self.request.query_params.get("drug_category")
        target    = self.request.query_params.get("prescription_target")
        species   = self.request.query_params.get("animal_species")
        date_from = self.request.query_params.get("date_from")
        date_to   = self.request.query_params.get("date_to")

        if category:
            qs = qs.filter(drug_category=category)
        if target:
            qs = qs.filter(prescription_target=target)
        if species:
            qs = qs.filter(animal_species__iexact=species)
        if date_from:
            qs = qs.filter(date_of_prescription__gte=date_from)
        if date_to:
            qs = qs.filter(date_of_prescription__lte=date_to)

        return qs

    @action(detail=False, methods=["get"])
    def stats(self, request):
        qs = self.get_queryset()
        return Response({
            "total": qs.count(),
            "drug_category_i": qs.filter(drug_category="I").count(),
            "drug_category_ii": qs.filter(drug_category="II").count(),
            "vet_surgeon": qs.filter(prescription_target="vet_surgeon").count(),
            "para_professional": qs.filter(prescription_target="para_professional").count(),
            "buyers": qs.values("name_of_the_buyer").distinct().count(),
        })

class SalesInvoiceViewSet(viewsets.ModelViewSet):
    queryset = SalesInvoice.objects.select_related(
        "sale", "sale__branch", "sale__customer"
    ).all()
    serializer_class = SalesInvoiceSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "invoice_number",
        "billed_to_name",
        "billed_to_phone",
        "sale__order_number",
    ]
    ordering_fields = ["issue_date", "due_date", "total_amount", "created_at"]
    ordering = ["-issue_date", "-id"]
    invoice_type_display = serializers.CharField(source="get_invoice_type_display", read_only=True)

    def get_queryset(self):
        qs = super().get_queryset()
        status_f = self.request.query_params.get("status")
        sale_f   = self.request.query_params.get("sale")
        date_from = self.request.query_params.get("date_from")
        date_to   = self.request.query_params.get("date_to")

        if status_f:
            qs = qs.filter(status=status_f)
        if sale_f:
            qs = qs.filter(sale_id=sale_f)
        if date_from:
            qs = qs.filter(issue_date__gte=date_from)
        if date_to:
            qs = qs.filter(issue_date__lte=date_to)
        return qs

    @action(detail=False, methods=["get"])
    def stats(self, request):
        qs = self.get_queryset()
        totals = qs.aggregate(
            total_billed=Coalesce(Sum("total_amount"), Decimal("0.00")),
            total_paid=Coalesce(Sum("amount_paid"), Decimal("0.00")),
            total_outstanding=Coalesce(Sum("balance_due"), Decimal("0.00")),
        )
        return Response({
            "total_invoices": qs.count(),
            "draft": qs.filter(status=SalesInvoice.Status.DRAFT).count(),
            "issued": qs.filter(status=SalesInvoice.Status.ISSUED).count(),
            "paid": qs.filter(status=SalesInvoice.Status.PAID).count(),
            "overdue": qs.filter(status=SalesInvoice.Status.OVERDUE).count(),
            "total_billed": totals["total_billed"],
            "total_paid": totals["total_paid"],
            "total_outstanding": totals["total_outstanding"],
        })

    @action(detail=True, methods=["post"])
    def mark_issued(self, request, pk=None):
        inv = self.get_object()
        if inv.status not in (SalesInvoice.Status.DRAFT, SalesInvoice.Status.ISSUED):
            return Response(
                {"error": f"Cannot issue an invoice in status '{inv.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        inv.status = SalesInvoice.Status.ISSUED
        inv.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(inv).data)

    @action(detail=True, methods=["post"])
    def mark_paid(self, request, pk=None):
        inv = self.get_object()
        inv.status = SalesInvoice.Status.PAID
        inv.balance_due = Decimal("0.00")
        inv.amount_paid = inv.total_amount
        inv.save(update_fields=["status", "balance_due", "amount_paid", "updated_at"])
        return Response(self.get_serializer(inv).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        inv = self.get_object()
        if inv.status == SalesInvoice.Status.CANCELLED:
            return Response({"error": "Invoice is already cancelled."},
                            status=status.HTTP_400_BAD_REQUEST)
        inv.status = SalesInvoice.Status.CANCELLED
        inv.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(inv).data)

    @action(detail=False, methods=["post"], url_path="from-sale/(?P<sale_id>[^/.]+)")
    def from_sale(self, request, sale_id=None):
        """
        POST /api/sales-invoices/from-sale/<sale_id>/
        Idempotently create (or return the existing) invoice for a sale.
        """
        try:
            sale = Sale.objects.get(pk=sale_id)
        except Sale.DoesNotExist:
            return Response({"error": "Sale not found."}, status=status.HTTP_404_NOT_FOUND)

        existing = SalesInvoice.objects.filter(sale=sale).first()
        if existing:
            return Response(self.get_serializer(existing).data)

        data = {
            "sale": sale.id,
            "invoice_type": request.data.get("invoice_type")
        or ("credit" if getattr(sale, "sale_type", "") == "Credit" else "supply"),
            "issue_date": request.data.get("issue_date") or timezone.localdate().isoformat(),
            "due_date": request.data.get("due_date") or None,
            "terms": request.data.get("terms", ""),
            "notes": request.data.get("notes", ""),

        }
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = (
        Employee.objects
        .select_related("role", "user", "branch", "manager")
        .all()
    )
    serializer_class = EmployeeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "employee_number", "first_name", "middle_name", "last_name",
        "personal_email", "work_email", "phone",
        "position", "department", "national_id",
        "user__username", "role__role_name",
    ]
    ordering_fields = ["employee_number", "first_name", "last_name", "hire_date", "created_at"]
    ordering = ["-created_at", "-id"]

    def get_queryset(self):
        qs = super().get_queryset()
        status_f     = self.request.query_params.get("status")
        department_f = self.request.query_params.get("department")
        branch_f     = self.request.query_params.get("branch")
        type_f       = self.request.query_params.get("employment_type")
        role_f       = self.request.query_params.get("role")

        # NEW: filter by system-access category
        access_f = self.request.query_params.get("access")
        # values: hr_only | pending | active | disabled

        if status_f:
            qs = qs.filter(status=status_f)
        if department_f:
            qs = qs.filter(department__iexact=department_f)
        if branch_f:
            qs = qs.filter(branch_id=branch_f)
        if type_f:
            qs = qs.filter(employment_type=type_f)
        if role_f:
            qs = qs.filter(role_id=role_f)

        if access_f == "hr_only":
            # requires_login resolves to False
            qs = qs.filter(
                models.Q(requires_login_override=False) |
                models.Q(requires_login_override__isnull=True, role__requires_login=False) |
                models.Q(requires_login_override__isnull=True, role__isnull=True)
            )
        elif access_f == "pending":
            # requires_login resolves to True, but user is null
            qs = qs.filter(user__isnull=True).filter(
                models.Q(requires_login_override=True) |
                models.Q(requires_login_override__isnull=True, role__requires_login=True)
            )
        elif access_f == "active":
            qs = qs.filter(user__isnull=False, user__is_active=True)
        elif access_f == "disabled":
            qs = qs.filter(user__isnull=False, user__is_active=False)

        return qs

    @action(detail=False, methods=["get"])
    def stats(self, request):
        qs = self.get_queryset()
        # Derived counts — cheap enough to compute in Python for realistic sizes.
        employees = list(qs.values("requires_login_override", "role__requires_login", "user_id", "user__is_active"))
        def state(e):
            override = e["requires_login_override"]
            role_flag = e["role__requires_login"]
            requires = override if override is not None else (bool(role_flag) if role_flag is not None else False)
            if not requires:
                return "hr_only"
            if not e["user_id"]:
                return "pending"
            return "active" if e["user__is_active"] else "disabled"

        buckets = {"hr_only": 0, "pending": 0, "active": 0, "disabled": 0}
        for e in employees:
            buckets[state(e)] += 1

        return Response({
            "total": qs.count(),
            "active_employment": qs.filter(status=Employee.Status.ACTIVE).count(),
            "with_login": qs.filter(user__isnull=False).count(),
            "without_login": qs.filter(user__isnull=True).count(),
            # System-access breakdown
            "hr_only": buckets["hr_only"],
            "pending_login": buckets["pending"],
            "active_login": buckets["active"],
            "disabled_login": buckets["disabled"],
        })

    @action(detail=False, methods=["get"])
    def form_data(self, request):
        from users.models import Roles, User as UserModel
        from .models import Branch

        taken_user_ids = Employee.objects.exclude(user__isnull=True).values_list("user_id", flat=True)
        available_users = (
            UserModel.objects
            .exclude(id__in=taken_user_ids)
            .values("id", "username", "firstname", "lastname", "email", "role")
        )

        return Response({
            "roles": list(Roles.objects.values("id", "role_name", "role_description", "requires_login")),
            "available_users": list(available_users),
            "branches": list(Branch.objects.values("id", "name", "code")),
            "managers": list(
                Employee.objects.values("id", "employee_number", "first_name", "last_name")
            ),
            "employment_types": [{"value": v, "label": l} for v, l in Employee.EmploymentType.choices],
            "statuses": [{"value": v, "label": l} for v, l in Employee.Status.choices],
            "genders": [{"value": v, "label": l} for v, l in Employee.Gender.choices],
        })

    @action(detail=True, methods=["post"])
    def set_status(self, request, pk=None):
        emp = self.get_object()
        new_status = request.data.get("status")
        valid = [c[0] for c in Employee.Status.choices]
        if new_status not in valid:
            return Response({"error": f"status must be one of {valid}"},
                            status=status.HTTP_400_BAD_REQUEST)
        emp.status = new_status
        end_date = request.data.get("end_date")
        if end_date:
            emp.end_date = end_date
        emp.save(update_fields=["status", "end_date", "updated_at"])
        return Response(self.get_serializer(emp).data)

    @action(detail=True, methods=["post"])
    def grant_login(self, request, pk=None):
        """
        POST /api/employees/{id}/grant_login/
        Creates and links a User account. Refuses for HR-only employees.
        """
        from users.models import User as UserModel
        emp = self.get_object()

        if not emp.requires_login:
            return Response(
                {"error": "This employee is HR-only. Clear the override or use a "
                          "role that requires login before granting access."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if emp.user_id:
            return Response(
                {"error": f"Already linked to user '{emp.user.username}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not emp.role_id:
            return Response(
                {"error": "Assign a role to the employee before granting login."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        username = (request.data.get("username") or emp.employee_number).lower()
        if UserModel.objects.filter(username=username).exists():
            return Response({"error": f"Username '{username}' is already taken."},
                            status=status.HTTP_400_BAD_REQUEST)

        user = UserModel(
            username=username,
            firstname=emp.first_name,
            lastname=emp.last_name,
            email=request.data.get("email") or emp.work_email or emp.personal_email or "",
            phone=emp.phone or "",
            address=emp.address or "N/A",
            role=emp.role,
            can_login=True,
            is_admin=False,
            offdays={},
        )
        user.set_password(request.data.get("password") or username)
        user.save()

        emp.user = user
        emp.save(update_fields=["user", "updated_at"])
        return Response(self.get_serializer(emp).data)

    @action(detail=True, methods=["post"])
    def revoke_login(self, request, pk=None):
        emp = self.get_object()
        if not emp.user_id:
            return Response({"error": "This employee has no linked user."},
                            status=status.HTTP_400_BAD_REQUEST)
        user = emp.user
        user.is_active = False
        user.save(update_fields=["is_active"])
        emp.user = None
        emp.save(update_fields=["user", "updated_at"])
        return Response(self.get_serializer(emp).data)


from datetime import timedelta
from decimal import Decimal

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


def _parse_range(request):
    """
    Resolve the requested range into (start_date, end_date, prev_start, prev_end, label).

    Accepts either an explicit ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD (used for
    custom ranges and for today/week/month/year presets computed on the client),
    or falls back to 'today' if nothing is supplied.
    """
    date_from = request.query_params.get("date_from")
    date_to   = request.query_params.get("date_to")
    label     = request.query_params.get("range", "today")

    today = timezone.localdate()

    if date_from and date_to:
        start = timezone.datetime.fromisoformat(date_from).date()
        end   = timezone.datetime.fromisoformat(date_to).date()
    else:
        start = end = today

    span = (end - start).days + 1
    prev_end   = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span - 1)

    return start, end, prev_start, prev_end, label


def _sale_qs(start, end, statuses=None):
    qs = Sale.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    if statuses:
        qs = qs.filter(status__in=statuses)
    return qs


def _pct_change(current, previous):
    if previous in (None, 0):
        return 0 if not current else 100
    return round(((current - previous) / previous) * 100, 1)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_dashboard(request):
    """
    GET /api/admin-dashboard/
    Query params:
      date_from, date_to   → explicit range (used by 'custom' and by client-computed presets)
      range                → informational label: today | week | month | year | custom | all
    """
    start, end, prev_start, prev_end, label = _parse_range(request)

    # ---------- Sales ----------
    completed = [Sale.Status.COMPLETED]
    cur_sales  = _sale_qs(start, end, completed)
    prev_sales = _sale_qs(prev_start, prev_end, completed)

    sales_total  = cur_sales.aggregate(t=Coalesce(Sum("total_amount"), Decimal("0.00")))["t"]
    prev_sales_total = prev_sales.aggregate(t=Coalesce(Sum("total_amount"), Decimal("0.00")))["t"]

    # ---------- Orders ----------
    orders_total = cur_sales.count()
    prev_orders_total = prev_sales.count()

    # ---------- Profit (needs cost_price on sale items; adjust field names if different) ----------
    def _profit(qs):
        # sale_item.line_subtotal - sum(quantity * product.cost_price)
        agg = SaleItem.objects.filter(sale__in=qs).aggregate(
            revenue=Coalesce(Sum(F("quantity") * F("unit_price")), Decimal("0.00")),
            cost=Coalesce(Sum(F("quantity") * F("product__cost_price")), Decimal("0.00")),
        )
        return (agg["revenue"] or Decimal("0.00")) - (agg["cost"] or Decimal("0.00"))

    profit_total      = _profit(cur_sales)
    prev_profit_total = _profit(prev_sales)

    # ---------- Items sold ----------
    items_total = SaleItem.objects.filter(sale__in=cur_sales).aggregate(
        t=Coalesce(Sum("quantity"), 0)
    )["t"]
    prev_items_total = SaleItem.objects.filter(sale__in=prev_sales).aggregate(
        t=Coalesce(Sum("quantity"), 0)
    )["t"]

    # ---------- Low stock ----------
    low_stock_qs = (
        BranchStock.objects
        .filter(stock_quantity__lte=F("reorder_level"))
        .select_related("product", "branch")
    )
    low_stock_total = low_stock_qs.count()
    low_stock_items = [
        {
            "name": bs.product.name,
            "quantity": bs.stock_quantity,
            "branch": bs.branch.name,
            "reorder_level": bs.reorder_level,
        }
        for bs in low_stock_qs[:10]
    ]

    # ---------- Customers ----------
    # New customers in range; for 'total', use all-time count. Fall back to all if no created_at on Customer.
    customers_total = Customer.objects.count()
    new_customers = Customer.objects.filter(created_at__date__gte=start, created_at__date__lte=end).count()
    prev_new_customers = Customer.objects.filter(
        created_at__date__gte=prev_start, created_at__date__lte=prev_end
    ).count()

    outstanding_qs = (
    Sale.objects
    .exclude(status=Sale.Status.CANCELLED)
    .filter(total_amount__gt=F("amount_paid"))
    )
    outstanding_total = outstanding_qs.aggregate(
        t=Coalesce(Sum(F("total_amount") - F("amount_paid")), Decimal("0.00"))
    )["t"]
    outstanding_count = outstanding_qs.count()

    # ---------- Cash in till ----------
    # Cash = payments with method='cash' received today (adjust method value if different).
    cash_today = Payment.objects.filter(
        paid_at__date=timezone.localdate(),
        method="cash",
    ).aggregate(t=Coalesce(Sum("amount"), Decimal("0.00")))["t"]

    # ---------- Sales trend ----------
    trend_rows = (
        cur_sales
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(amount=Coalesce(Sum("total_amount"), Decimal("0.00")))
        .order_by("day")
    )
    sales_trend = [
        {"date": row["day"].strftime("%d %b"), "amount": float(row["amount"])}
        for row in trend_rows
    ]

    # ---------- Payment breakdown ----------
    pay_rows = (
        Payment.objects
        .filter(sale__in=cur_sales)
        .values("method")
        .annotate(amount=Coalesce(Sum("amount"), Decimal("0.00")))
        .order_by("-amount")
    )
    method_labels = dict(Payment.Method.choices) if hasattr(Payment, "Method") else {}
    payment_breakdown = [
        {
            "method": method_labels.get(row["method"], row["method"].title()),
            "amount": float(row["amount"]),
        }
        for row in pay_rows
    ]

    # ---------- Top products ----------
    top_rows = (
        SaleItem.objects
        .filter(sale__in=cur_sales)
        .values("product__name")
        .annotate(
            quantity_sold=Coalesce(Sum("quantity"), 0),
            revenue=Coalesce(Sum(F("quantity") * F("unit_price")), Decimal("0.00")),
        )
        .order_by("-quantity_sold")[:5]
    )
    top_products = [
        {
            "name": row["product__name"],
            "quantity_sold": row["quantity_sold"],
            "revenue": float(row["revenue"]),
        }
        for row in top_rows
    ]

    return Response({
        "status": "success",
        "range": {
            "label": label,
            "start": str(start),
            "end": str(end),
        },
        "sales": {
            "total": float(sales_total),
            "change_pct": _pct_change(sales_total, prev_sales_total),
        },
        "orders": {
            "total": orders_total,
            "change_pct": _pct_change(orders_total, prev_orders_total),
        },
        "profit": {
            "total": float(profit_total),
            "change_pct": _pct_change(profit_total, prev_profit_total),
        },
        "items_sold": {
            "total": items_total,
            "change_pct": _pct_change(items_total, prev_items_total),
        },
        "low_stock": {
            "total": low_stock_total,
            "items": low_stock_items,
        },
        "customers": {
            "total": customers_total,
            "change_pct": _pct_change(new_customers, prev_new_customers),
        },
        "outstanding_payments": {
            "total": float(outstanding_total),
            "count": outstanding_count,
        },
        "cash_in_till": {
            "total": float(cash_today),
            "as_of": timezone.localtime().strftime("%H:%M"),
        },
        "sales_trend": sales_trend,
        "payment_breakdown": payment_breakdown,
        "top_products": top_products,
    })

class ComplianceRecordViewSet(viewsets.ModelViewSet):
    queryset = ComplianceRecord.objects.select_related("uploaded_by").all()
    serializer_class = ComplianceRecordSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["title", "notes"]
    ordering_fields = ["created_at", "expiry_date", "title"]

    def get_queryset(self):
        qs = super().get_queryset()
        doc_type = self.request.query_params.get("document_type")
        if doc_type:
            qs = qs.filter(document_type=doc_type)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        serializer.save(uploaded_by=user if user.is_authenticated else None)

    def perform_update(self, serializer):
        old_name = serializer.instance.file.name if serializer.instance.file else None
        instance = serializer.save()
        # Remove the replaced file from disk so it doesn't orphan
        if old_name and instance.file.name != old_name:
            instance.file.storage.delete(old_name)

    def perform_destroy(self, instance):
        if instance.file:
            instance.file.delete(save=False)
        instance.delete()

class IsAdminOnly(IsAuthenticated):
    """Admins only, for reads as well (salary data is sensitive)."""
    def has_permission(self, request, view):
        return super().has_permission(request, view) and IsAdminUserCustom._check_admin(request.user)


def _parse_period(value):
    """Accepts 'YYYY-MM' or 'YYYY-MM-DD'; returns the first day of that month, or None."""
    if not value:
        return None
    try:
        parts = str(value).split("-")
        return date(int(parts[0]), int(parts[1]), 1)
    except (ValueError, IndexError):
        return None


class SalaryPaymentViewSet(viewsets.ModelViewSet):
    queryset = SalaryPayment.objects.select_related("employee", "employee__branch", "paid_by").all()
    serializer_class = SalaryPaymentSerializer
    permission_classes = [IsAdminOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["employee__first_name", "employee__last_name", "employee__employee_number", "reference"]
    ordering_fields = ["period", "net_pay", "paid_on", "created_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("employee"):
            qs = qs.filter(employee_id=p["employee"])
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("branch"):
            qs = qs.filter(employee__branch_id=p["branch"])
        if p.get("year"):
            qs = qs.filter(period__year=p["year"])
        month = _parse_period(p.get("period"))   # ?period=2026-09
        if month:
            qs = qs.filter(period=month)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        serializer.save(created_by=user if user.is_authenticated else None)

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        if obj.status != SalaryPayment.Status.DRAFT:
            return Response(
                {"error": "Only draft salary records can be deleted. Cancel this one instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """
        POST /api/salary-payments/generate/
        body: { "period": "2026-09", "employee_ids": [1,2] (optional), "branch": <id> (optional) }
        Creates DRAFT payslips (basic salary only, no deductions) for active employees who have a
        basic salary and don't already have a live record for that month. Fill in deductions after.
        """
        period = _parse_period(request.data.get("period"))
        if not period:
            return Response({"error": "period is required, e.g. '2026-09'."}, status=status.HTTP_400_BAD_REQUEST)

        month_end = date(period.year, period.month, calendar.monthrange(period.year, period.month)[1])

        employees = Employee.objects.filter(status=Employee.Status.ACTIVE, basic_salary__isnull=False)
        if request.data.get("employee_ids"):
            employees = employees.filter(id__in=request.data["employee_ids"])
        if request.data.get("branch"):
            employees = employees.filter(branch_id=request.data["branch"])

        existing = set(
            SalaryPayment.objects.filter(period=period)
            .exclude(status=SalaryPayment.Status.CANCELLED)
            .values_list("employee_id", flat=True)
        )

        created, skipped = [], []
        with transaction.atomic():
            for emp in employees:
                if emp.id in existing:
                    skipped.append({"employee": emp.full_name, "reason": "Already has a record for this month"})
                elif emp.hire_date and emp.hire_date > month_end:
                    skipped.append({"employee": emp.full_name, "reason": "Hired after this month"})
                else:
                    sp = SalaryPayment.objects.create(
                        employee=emp, period=period, basic_salary=emp.basic_salary,
                        created_by=request.user if request.user.is_authenticated else None,
                    )
                    created.append(sp.id)

        return Response(
            {"created": len(created), "skipped": skipped, "ids": created},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def mark_paid(self, request, pk=None):
        """
        POST /api/salary-payments/{id}/mark_paid/
        body: { "payment_method": "bank_transfer", "reference": "...", "paid_on": "2026-09-30" (optional) }
        """
        method = request.data.get("payment_method")
        if method not in SalaryPayment.Method.values:
            return Response(
                {"error": f"payment_method must be one of {SalaryPayment.Method.values}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        paid_on = request.data.get("paid_on") or timezone.localdate().isoformat()
        try:
            paid_on = date.fromisoformat(paid_on)
        except ValueError:
            return Response({"error": "paid_on must be YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            sp = SalaryPayment.objects.select_for_update().get(pk=self.get_object().pk)
            if sp.status != SalaryPayment.Status.DRAFT:
                return Response(
                    {"error": f"Only draft records can be paid (this one is {sp.get_status_display().lower()})."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if sp.net_pay <= 0:
                return Response({"error": "Net pay must be greater than zero."}, status=status.HTTP_400_BAD_REQUEST)

            sp.status = SalaryPayment.Status.PAID
            sp.payment_method = method
            sp.reference = request.data.get("reference", "")
            sp.paid_on = paid_on
            sp.paid_by = request.user if request.user.is_authenticated else None
            sp.save()

            from users.models import ActivityLog
            ActivityLog.log("salary_paid", user=request.user, entity="SalaryPayment", entity_id=sp.id,
                            detail=f"Paid {sp.net_pay} to {sp.employee.full_name} for {sp.period:%b %Y}",
                            request=request)

        return Response(self.get_serializer(sp).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """POST /api/salary-payments/{id}/cancel/ body: { "reason": "..." }"""
        sp = self.get_object()
        if sp.status == SalaryPayment.Status.CANCELLED:
            return Response({"error": "Already cancelled."}, status=status.HTTP_400_BAD_REQUEST)

        was_paid = sp.status == SalaryPayment.Status.PAID
        reason = request.data.get("reason", "")
        sp.status = SalaryPayment.Status.CANCELLED
        sp.notes = f"{sp.notes}\nCancelled: {reason}".strip() if reason else sp.notes
        sp.save()

        from users.models import ActivityLog
        ActivityLog.log("salary_cancelled", user=request.user, entity="SalaryPayment", entity_id=sp.id,
                        detail=f"Cancelled {'PAID ' if was_paid else ''}salary for {sp.employee.full_name} "
                               f"({sp.period:%b %Y}). {reason}", request=request)
        return Response(self.get_serializer(sp).data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        """GET /api/salary-payments/stats/?period=2026-09 (all filters from the list apply)"""
        qs = self.filter_queryset(self.get_queryset()).exclude(status=SalaryPayment.Status.CANCELLED)
        zero = Decimal("0.00")
        totals = qs.aggregate(
            gross=Coalesce(Sum("gross_pay"), zero),
            deductions=Coalesce(Sum("total_deductions"), zero),
            net=Coalesce(Sum("net_pay"), zero),
            paye=Coalesce(Sum("paye"), zero),
            nssf=Coalesce(Sum("nssf"), zero),
            health=Coalesce(Sum("health_insurance"), zero),
            housing=Coalesce(Sum("housing_levy"), zero),
        )
        paid = qs.filter(status=SalaryPayment.Status.PAID)
        draft = qs.filter(status=SalaryPayment.Status.DRAFT)
        return Response({
            "records": qs.count(),
            "paid_count": paid.count(),
            "draft_count": draft.count(),
            "total_gross": totals["gross"],
            "total_deductions": totals["deductions"],
            "total_net": totals["net"],
            "paid_net": paid.aggregate(t=Coalesce(Sum("net_pay"), zero))["t"],
            "pending_net": draft.aggregate(t=Coalesce(Sum("net_pay"), zero))["t"],
            "statutory": {
                "paye": totals["paye"], "nssf": totals["nssf"],
                "health_insurance": totals["health"], "housing_levy": totals["housing"],
            },
        })

def _parse_date(value, default=None):
            """'YYYY-MM-DD' -> date. Returns default when empty; raises ValueError when malformed."""
            if not value:
                return default
            return date.fromisoformat(str(value))
    

class ChequeDepositViewSet(viewsets.ModelViewSet):
    queryset = ChequeDeposit.objects.select_related(
        "customer", "sale", "branch", "deposited_by", "created_by"
    ).all()
    serializer_class = ChequeDepositSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "cheque_number", "drawer_name", "drawer_bank", "deposit_slip_no",
        "customer__name", "sale__order_number",
    ]
    ordering_fields = ["received_on", "cheque_date", "deposited_on", "amount", "created_at"]
    ordering = ["-received_on", "-id"]

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("customer"):
            qs = qs.filter(customer_id=p["customer"])
        if p.get("sale"):
            qs = qs.filter(sale_id=p["sale"])
        if p.get("branch"):
            qs = qs.filter(branch_id=p["branch"])
        if p.get("date_from"):
            qs = qs.filter(received_on__gte=p["date_from"])
        if p.get("date_to"):
            qs = qs.filter(received_on__lte=p["date_to"])
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        serializer.save(created_by=user if user.is_authenticated else None)

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        if obj.status != ChequeDeposit.Status.RECEIVED:
            return Response(
                {"error": "Only cheques still in hand can be deleted. Cancel this one instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @staticmethod
    def _log(request, action_name, cq, detail):
        from users.models import ActivityLog
        ActivityLog.log(action_name, user=request.user, entity="ChequeDeposit",
                        entity_id=cq.id, detail=detail, request=request)
   

    @action(detail=True, methods=["post"])
    def deposit(self, request, pk=None):
        """
        POST /api/cheque-deposits/{id}/deposit/
        body: { "deposit_bank": "...", "deposit_account": "", "deposit_slip_no": "", "deposited_on": "YYYY-MM-DD" }
        """
        deposit_bank = (request.data.get("deposit_bank") or "").strip()
        if not deposit_bank:
            return Response({"error": "deposit_bank is required."}, status=status.HTTP_400_BAD_REQUEST)
        today = timezone.localdate()
        try:
            deposited_on = _parse_date(request.data.get("deposited_on"), today)
        except ValueError:
            return Response({"error": "deposited_on must be YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
        if deposited_on > today:
            return Response({"error": "Deposit date cannot be in the future."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            cq = ChequeDeposit.objects.select_for_update().get(pk=self.get_object().pk)
            if cq.status != ChequeDeposit.Status.RECEIVED:
                return Response(
                    {"error": f"Only cheques in hand can be deposited (this one is {cq.get_status_display().lower()})."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if deposited_on < cq.cheque_date:
                return Response(
                    {"error": f"This is a post-dated cheque. It can't be deposited before {cq.cheque_date:%d %b %Y}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            cq.status = ChequeDeposit.Status.DEPOSITED
            cq.deposit_bank = deposit_bank
            cq.deposit_account = (request.data.get("deposit_account") or "").strip()
            cq.deposit_slip_no = (request.data.get("deposit_slip_no") or "").strip()
            cq.deposited_on = deposited_on
            cq.deposited_by = request.user if request.user.is_authenticated else None
            cq.save()
            self._log(request, "cheque_deposited", cq,
                      f"Deposited cheque {cq.cheque_number} ({cq.amount}) to {deposit_bank}")
        return Response(self.get_serializer(cq).data)

    @action(detail=True, methods=["post"])
    def clear(self, request, pk=None):
        """
        POST /api/cheque-deposits/{id}/clear/   body: { "cleared_on": "YYYY-MM-DD" (optional) }
        Marks the cheque cleared and, if linked to a sale, records a cheque Payment on it.
        """
        today = timezone.localdate()
        try:
            cleared_on = _parse_date(request.data.get("cleared_on"), today)
        except ValueError:
            return Response({"error": "cleared_on must be YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
        if cleared_on > today:
            return Response({"error": "Clearance date cannot be in the future."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            cq = ChequeDeposit.objects.select_for_update().get(pk=self.get_object().pk)
            if cq.status != ChequeDeposit.Status.DEPOSITED:
                return Response(
                    {"error": f"Only deposited cheques can be cleared (this one is {cq.get_status_display().lower()})."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if cq.deposited_on and cleared_on < cq.deposited_on:
                return Response({"error": "Clearance date cannot be before the deposit date."},
                                status=status.HTTP_400_BAD_REQUEST)

            user = request.user if request.user.is_authenticated else None
            if cq.sale_id:
                cq.payment = Payment.objects.create(
                    sale=cq.sale, method=Payment.Method.CHEQUE, amount=cq.amount,
                    reference=f"CHQ {cq.cheque_number}", received_by=user,
                )
            cq.status = ChequeDeposit.Status.CLEARED
            cq.cleared_on = cleared_on
            cq.save()
            if cq.sale_id:
                SaleViewSet._sync_payment_status(cq.sale)
            self._log(request, "cheque_cleared", cq, f"Cheque {cq.cheque_number} ({cq.amount}) cleared")
        return Response(self.get_serializer(cq).data)

    @action(detail=True, methods=["post"])
    def bounce(self, request, pk=None):
        """POST /api/cheque-deposits/{id}/bounce/   body: { "reason": "Insufficient funds", "bounced_on": "" }"""
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"error": "A bounce reason is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            bounced_on = _parse_date(request.data.get("bounced_on"), timezone.localdate())
        except ValueError:
            return Response({"error": "bounced_on must be YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            cq = ChequeDeposit.objects.select_for_update().get(pk=self.get_object().pk)
            if cq.status != ChequeDeposit.Status.DEPOSITED:
                return Response(
                    {"error": f"Only deposited cheques can bounce (this one is {cq.get_status_display().lower()})."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            cq.status = ChequeDeposit.Status.BOUNCED
            cq.bounced_on = bounced_on
            cq.bounce_reason = reason
            cq.save()
            self._log(request, "cheque_bounced", cq,
                      f"Cheque {cq.cheque_number} ({cq.amount}) from {cq.drawer_name} bounced. {reason}")
        return Response(self.get_serializer(cq).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """POST /api/cheque-deposits/{id}/cancel/   body: { "reason": "..." }"""
        with transaction.atomic():
            cq = ChequeDeposit.objects.select_for_update().get(pk=self.get_object().pk)
            if cq.status not in (ChequeDeposit.Status.RECEIVED, ChequeDeposit.Status.DEPOSITED):
                return Response(
                    {"error": f"A {cq.get_status_display().lower()} cheque can't be cancelled."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            reason = (request.data.get("reason") or "").strip()
            cq.status = ChequeDeposit.Status.CANCELLED
            if reason:
                cq.notes = f"{cq.notes}\nCancelled: {reason}".strip()
            cq.save()
            self._log(request, "cheque_cancelled", cq, f"Cancelled cheque {cq.cheque_number}. {reason}")
        return Response(self.get_serializer(cq).data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        """GET /api/cheque-deposits/stats/ (all list filters apply)"""
        qs = self.filter_queryset(self.get_queryset())
        zero = Decimal("0.00")
        today = timezone.localdate()

        def bucket(st):
            return qs.filter(status=st).aggregate(n=Count("id"), t=Coalesce(Sum("amount"), zero))

        received, deposited = bucket("received"), bucket("deposited")
        cleared, bounced = bucket("cleared"), bucket("bounced")
        return Response({
            "in_hand_count": received["n"], "in_hand_amount": received["t"],
            "deposited_count": deposited["n"], "deposited_amount": deposited["t"],
            "cleared_count": cleared["n"], "cleared_amount": cleared["t"],
            "bounced_count": bounced["n"], "bounced_amount": bounced["t"],
            "post_dated_count": qs.filter(status="received", cheque_date__gt=today).count(),
            "ready_to_deposit_count": qs.filter(status="received", cheque_date__lte=today).count(),
        })
   
