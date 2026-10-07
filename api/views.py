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
from django.db.models import Sum,Count, F, Q,Avg, Case,Value, When,DecimalField, ExpressionWrapper
from django.db.models.functions import Coalesce, TruncDate, Abs
from django.db.models import OuterRef, Subquery
from rest_framework.exceptions import PermissionDenied, ValidationError as DRFValidationError
from .branch_scope import (scope_by_branch, check_branch_access, visible_branch_id,
                           sees_all_branches, user_branch_id)
from .utils import get_head_office_branch



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
        qs = scope_by_branch(super().get_queryset(), self.request, "branch_id")
        product_id = self.request.query_params.get("product")
        low_stock = self.request.query_params.get("low_stock")
        if product_id:
        
            qs = qs.filter(product_id=product_id)
        if low_stock and low_stock.lower() in ("1", "true", "yes"):
            qs = qs.filter(stock_quantity__lte=F("reorder_level"))
        return qs
    def perform_create(self, serializer):
        check_branch_access(self.request.user, serializer.validated_data["branch"].pk)
        serializer.save()
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
        if not sees_all_branches(request.user):
            raise PermissionDenied("Only Head Office can transfer stock.")
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
            try:
                movement_fee = _parse_price(request.data.get("movement_fee")) or Decimal("0.00")
            except ValueError:
                return Response({"error": "Movement fee must be a valid, non-negative number."},
                            status=status.HTTP_400_BAD_REQUEST)
            StockMovement.objects.create(
                product=product,
                branch=head_office,                 # source
                destination_branch=branch,          # where it went
                movement_type=StockMovement.MovementType.TRANSFER,
                quantity_change=-qty,               # leaves Head Office
                note=f"Transferred {qty} to {branch.name}",
                                movement_fee=movement_fee,
                fee_branch=head_office,
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
    search_fields = ["name", "business_name", "phone", "alt_phone", "email"]
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
        check_branch_access(request.user, serializer.validated_data["branch"].pk)
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
        qs = scope_by_branch(super().get_queryset(), self.request, "branch_id")
        status_param = self.request.query_params.get("status")
        customer_id = self.request.query_params.get("customer")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")

        if status_param:
            qs = qs.filter(status=status_param)
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
        target_date = timezone.datetime.fromisoformat(date_str).date() if date_str else timezone.localdate()

        qs = self.get_queryset().filter(created_at__date=target_date, status=Sale.Status.COMPLETED)
       
        summary = qs.aggregate(
            total_sales=Count("id"),
            total_revenue=Sum("total_amount"),
            total_tax=Sum("tax_amount"),
            total_discount=Sum("discount_amount"),
        )
        return Response({
            "date": str(target_date),
            "branch": visible_branch_id(request) or "all",
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
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["paid_at", "amount"]

    def get_queryset(self):
        qs = scope_by_branch(super().get_queryset(), self.request, "sale__branch_id")
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
        qs = scope_by_branch(super().get_queryset(), self.request, "branch_id", "destination_branch_id")
        product_id = self.request.query_params.get("product")
        movement_type = self.request.query_params.get("movement_type")
        if product_id:
            qs = qs.filter(product_id=product_id)
        
        if movement_type:
            qs = qs.filter(movement_type=movement_type)
        return qs

    def perform_create(self, serializer):
        check_branch_access(self.request.user, serializer.validated_data["branch"].pk)
        serializer.save()
    @action(detail=False, methods=["post"])
    def adjust(self, request):
        """
        POST /api/pos/stock-movements/adjust/
        body: { product, branch, quantity_change (signed, non-zero), note? }
        """
        product_id = request.data.get("product")
        branch_id = request.data.get("branch")
        note = request.data.get("note", "")

        if not product_id or not branch_id:
            return Response({"error": "product and branch are required."},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            quantity_change = int(request.data.get("quantity_change", 0))
        except (TypeError, ValueError):
            return Response({"error": "quantity_change must be an integer."},
                            status=status.HTTP_400_BAD_REQUEST)
        if quantity_change == 0:
            return Response({"error": "Enter a quantity to adjust."},
                            status=status.HTTP_400_BAD_REQUEST)

        product = get_object_or_404(Product, pk=product_id)
        branch = get_object_or_404(Branch, pk=branch_id)
        check_branch_access(request.user, branch.pk)

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
            bs.save(update_fields=["stock_quantity"])

            movement = StockMovement.objects.create(
                product=product,
                branch=branch,
                movement_type=StockMovement.MovementType.ADJUSTMENT,
                quantity_change=quantity_change,
                note=note,
                created_by=request.user if request.user.is_authenticated else None,
            )

        return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)
    @action(detail=False, methods=["post"])
    def transfer(self, request):
        """
        POST /api/pos/stock-movements/transfer/
        body: { product, from_branch, to_branch, quantity, movement_fee?, note? }
        Moves stock between branches at the SAME price. A per-unit movement fee
        (x quantity) is recorded against the Head Office branch.
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
            return Response({"error": "from_branch and to_branch must be different."},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            quantity = int(quantity)
        except (TypeError, ValueError):
            return Response({"error": "quantity must be an integer."}, status=status.HTTP_400_BAD_REQUEST)
        if quantity <= 0:
            return Response({"error": "quantity must be greater than zero."},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            movement_fee = _parse_price(request.data.get("movement_fee")) or Decimal("0.00")
        except ValueError:
            return Response({"error": "Movement fee must be a valid, non-negative number."},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            product = Product.objects.get(pk=product_id)
            from_branch = Branch.objects.get(pk=from_branch_id)
            to_branch = Branch.objects.get(pk=to_branch_id)
        except (Product.DoesNotExist, Branch.DoesNotExist):
            return Response({"error": "product, from_branch or to_branch not found."},
                            status=status.HTTP_404_NOT_FOUND)
        check_branch_access(request.user, from_branch.pk)
        head_office = get_head_office_branch()

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

            # New destination rows inherit the source's prices so the price stays the same.
            dest_stock, _ = BranchStock.objects.select_for_update().get_or_create(
                branch=to_branch, product=product,
                defaults={
                    "stock_quantity": 0,
                    "retail_price": source_stock.retail_price,
                    "wholesale_price": source_stock.wholesale_price,
                },
            )
            dest_stock.stock_quantity += quantity
            dest_stock.save(update_fields=["stock_quantity"])

            fee_note = ""
            if movement_fee > 0:
                fee_note = f" | Movement fee: {movement_fee} x {quantity} = {movement_fee * quantity}"

            movement = StockMovement.objects.create(
                product=product,
                branch=from_branch,
                destination_branch=to_branch,
                movement_type=StockMovement.MovementType.TRANSFER,
                quantity_change=-quantity,
                movement_fee=movement_fee,
                fee_branch=head_office,
                note=((note or "") + fee_note).strip(),
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
            branch_id = data.get('branch')
            if branch_id:
                user.branch = Branch.objects.get(pk=branch_id)
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
        if 'branch' in data:
            b = data['branch']
            user.branch = Branch.objects.get(pk=b) if b not in (None, '') else None
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
        from users.models import Roles
        roles = Roles.objects.all().values('id', 'role_name', 'role_description')
        branches = Branch.objects.filter(is_active=True).values('id', 'name', 'code')
        return Response({'roles': list(roles), 'branches': list(branches)})

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
        "sale", "sale__branch", "sale__customer","supplier",
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
        qs = scope_by_branch(super().get_queryset(), self.request, "sale__branch_id")
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
        if self.request.query_params.get("supplier"):
            qs = qs.filter(supplier_id=self.request.query_params["supplier"])
        if self.request.query_params.get("invoice_type"):
            qs = qs.filter(invoice_type=self.request.query_params["invoice_type"])
        
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
        sale = scope_by_branch(Sale.objects.all(), request, "branch_id").filter(pk=sale_id).first()
        if not sale:
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
             branch=emp.branch,
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


def _sale_qs(start, end, statuses=None, branch_id=None):
    qs = Sale.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    if statuses:
        qs = qs.filter(status__in=statuses)
    if branch_id:
        qs = qs.filter(branch_id=branch_id)
    return qs

def _pct_change(current, previous):
    if previous in (None, 0):
        return 0 if not current else 100
    return round(((current - previous) / previous) * 100, 1)



def _dashboard_view(user):
    """'full' (admin/manager) | 'stock' (storekeeper) | 'sales' (sales/cashier)."""
    if IsAdminUserCustom._check_admin(user):
        return "full"
    name = (getattr(getattr(user, "role", None), "role_name", "") or "").lower()
    if "manager" in name:
        return "full"
    if "store" in name or "stock" in name:
        return "stock"
    return "sales"   # sales, cashier and anything else


SALES_KEYS = ["sales", "orders", "profit", "items_sold", "customers",
              "outstanding_payments", "cash_in_till", "sales_trend",
              "payment_breakdown", "top_products"]
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
    bid = visible_branch_id(request)
    _b = lambda qs, f="branch_id": qs.filter(**{f: bid}) if bid else qs

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

        # ---------- Stock statistics ----------
    today = timezone.localdate()
    stock_qs = BranchStock.objects.filter(product__is_active=True)
    stock_value = stock_qs.aggregate(
        t=Coalesce(Sum(ExpressionWrapper(
            F("stock_quantity") * F("product__cost_price"),
            output_field=DecimalField(max_digits=14, decimal_places=2))), Decimal("0.00"))
    )["t"]
    products_qs = Product.objects.filter(is_active=True)
    expiry_qs = products_qs.filter(expiry_date__isnull=False)
    fee_qs = StockMovement.objects.filter(
        movement_type=StockMovement.MovementType.TRANSFER,
        created_at__date__gte=start, created_at__date__lte=end,
    )
    movement_fees = fee_qs.aggregate(
        t=Coalesce(Sum(ExpressionWrapper(
            F("movement_fee") * Abs(F("quantity_change")),
            output_field=DecimalField(max_digits=14, decimal_places=2))), Decimal("0.00"))
    )["t"]
    stock_block = {
        "total_products": products_qs.count(),
        "units_on_hand": stock_qs.aggregate(t=Coalesce(Sum("stock_quantity"), 0))["t"],
        "stock_value": float(stock_value),
        "out_of_stock": stock_qs.filter(stock_quantity__lte=0).count(),
        "expiring_soon": expiry_qs.filter(
            expiry_date__gte=today, expiry_date__lte=today + timedelta(days=90)).count(),
        "expired": expiry_qs.filter(expiry_date__lt=today).count(),
        "movement_fees": float(movement_fees),
        "recent_movements": [
            {
                "product": m.product.name,
                "type": m.get_movement_type_display(),
                "qty": m.quantity_change,
                "branch": m.branch.name if m.branch else "—",
                "date": m.created_at.strftime("%d %b %H:%M"),
            }
            for m in StockMovement.objects.select_related("product", "branch").order_by("-created_at")[:8]
        ],
    }
    view = _dashboard_view(request.user)
    payload ={
        "status": "success",
        "view": view,
        "stock": stock_block,
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
        
    }
    if view == "stock":
        for k in SALES_KEYS:
            payload.pop(k, None)
    elif view == "sales":
        payload.pop("profit", None)
        payload.pop("stock", None)
        payload.pop("low_stock", None)

    return Response(payload)


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
        qs = scope_by_branch(super().get_queryset(), self.request, "branch_id")
        p = self.request.query_params
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("customer"):
            qs = qs.filter(customer_id=p["customer"])
        if p.get("sale"):
            qs = qs.filter(sale_id=p["sale"])
       
        if p.get("date_from"):
            qs = qs.filter(received_on__gte=p["date_from"])
        if p.get("date_to"):
            qs = qs.filter(received_on__lte=p["date_to"])
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        extra = {} if sees_all_branches(user) else {"branch_id": user_branch_id(user)}
        serializer.save(created_by=user, **extra)
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
def _annotate_supplier_money(qs):
    dec = DecimalField(max_digits=14, decimal_places=2)
    billed = (SalesInvoice.objects
              .filter(supplier=OuterRef("pk"), invoice_type=SalesInvoice.InvoiceType.PURCHASE)
              .exclude(status=SalesInvoice.Status.CANCELLED)
              .order_by().values("supplier").annotate(t=Sum("total_amount")).values("t"))
    paid = (BusinessPayment.objects
            .filter(supplier=OuterRef("pk"), status=BusinessPayment.Status.PAID)
            .order_by().values("supplier").annotate(t=Sum("amount")).values("t"))
    return qs.annotate(
        total_billed=Coalesce(Subquery(billed, output_field=dec), Decimal("0.00"), output_field=dec),
        total_paid=Coalesce(Subquery(paid, output_field=dec), Decimal("0.00"), output_field=dec),
    )
class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "contact_person", "phone", "email", "kra_pin"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        qs = _annotate_supplier_money(super().get_queryset())
        is_active = self.request.query_params.get("is_active")
        terms = self.request.query_params.get("payment_terms")
        if is_active is not None and is_active != "":
            qs = qs.filter(is_active=is_active.lower() in ("1", "true", "yes"))
        if terms:
            qs = qs.filter(payment_terms=terms)
        return qs

    def perform_destroy(self, instance):
        from users.models import ActivityLog
        ActivityLog.log("supplier_deleted", user=self.request.user, entity="Supplier",
                        entity_id=instance.id, detail=f"Deleted supplier {instance.name}",
                        request=self.request)
        instance.delete()

    def perform_create(self, serializer):
        from users.models import ActivityLog
        obj = serializer.save()
        ActivityLog.log("supplier_created", user=self.request.user, entity="Supplier",
                        entity_id=obj.id, detail=f"Created supplier {obj.name}",
                        request=self.request)

    def perform_update(self, serializer):
        from users.models import ActivityLog
        obj = serializer.save()
        ActivityLog.log("supplier_updated", user=self.request.user, entity="Supplier",
                        entity_id=obj.id, detail=f"Updated supplier {obj.name}",
                        request=self.request)

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"error": "This supplier is linked to other records and can't be deleted. Mark it inactive instead."},
                status=status.HTTP_409_CONFLICT,
            )

    @action(detail=True, methods=["post"])
    def toggle_status(self, request, pk=None):
        """POST /api/pos/suppliers/{id}/toggle_status/ — flip active/inactive."""
        supplier = self.get_object()
        supplier.is_active = not supplier.is_active
        supplier.save(update_fields=["is_active", "updated_at"])
        return Response(self.get_serializer(supplier).data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        qs = Supplier.objects.all()
        rows = list(_annotate_supplier_money(qs).values_list("total_billed", "total_paid"))
        return Response({
            "total": qs.count(),
            "active": qs.filter(is_active=True).count(),
            "inactive": qs.filter(is_active=False).count(),
            "on_credit": qs.exclude(payment_terms=Supplier.PaymentTerms.CASH).count(),
            "total_billed": sum(b for b, _ in rows),
            "total_paid": sum(p for _, p in rows),
            "total_owed": sum(max(b - p, 0) for b, p in rows),
        })

    @action(detail=True, methods=["post"])
    def add_bill(self, request, pk=None):
        """POST /api/pos/suppliers/{id}/add_bill/  body: { amount, supplier_ref?, issue_date?, due_date?, notes? }"""
        supplier = self.get_object()
        try:
            amount = _parse_price(request.data.get("amount"))
            issue = _parse_date(request.data.get("issue_date"), timezone.localdate())
            due = _parse_date(request.data.get("due_date"), None)
        except ValueError:
            return Response({"error": "Enter a valid amount and dates (YYYY-MM-DD)."},
                            status=status.HTTP_400_BAD_REQUEST)
        if not amount or amount <= 0:
            return Response({"error": "Bill amount must be greater than zero."},
                            status=status.HTTP_400_BAD_REQUEST)
        if due and due < issue:
            return Response({"error": "Due date cannot be earlier than the issue date."},
                            status=status.HTTP_400_BAD_REQUEST)
        inv = SalesInvoice.objects.create(
            invoice_type=SalesInvoice.InvoiceType.PURCHASE, supplier=supplier,
            status=SalesInvoice.Status.ISSUED, issue_date=issue, due_date=due,
            billed_to_name=supplier.name, billed_to_phone=supplier.phone,
            billed_to_email=supplier.email, billed_to_address=supplier.address,
            subtotal=amount, notes=request.data.get("notes", ""),
            extra_data={"supplier_ref": (request.data.get("supplier_ref") or "").strip()},
        )
        return Response(SalesInvoiceSerializer(inv).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def statement(self, request, pk=None):
        """GET /api/pos/suppliers/{id}/statement/ — bills and payments for one supplier."""
        s = self.get_object()
        bills = s.purchase_invoices.exclude(status="cancelled").order_by("-issue_date")
        pays = s.business_payments.filter(status="paid").order_by("-payment_date")
        return Response({
            "supplier": self.get_serializer(s).data,
            "bills": [{"id": b.id, "invoice_number": b.invoice_number,
                       "supplier_ref": b.extra_data.get("supplier_ref", ""), "issue_date": b.issue_date,
                       "due_date": b.due_date, "total": b.total_amount, "paid": b.amount_paid,
                       "balance": b.balance_due, "payment_status": b.payment_status} for b in bills],
            "payments": [{"id": p.id, "date": p.payment_date, "amount": p.amount, "method": p.get_method_display(),
                          "reference": p.reference, "bill": p.purchase_invoice.invoice_number if p.purchase_invoice else None}
                         for p in pays],
        })

class PettyCashExpenseViewSet(viewsets.ModelViewSet):
    """
    Cashiers see and manage only their own expenses. Admins see everyone's and approve/reject.
    """
    queryset = PettyCashExpense.objects.select_related("branch", "cashier", "reviewed_by").all()
    serializer_class = PettyCashExpenseSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["description", "receipt_number", "cashier__firstname", "cashier__lastname"]
    ordering_fields = ["expense_date", "amount", "created_at"]
    ordering = ["-expense_date", "-id"]

    def _is_admin(self):
        return IsAdminUserCustom._check_admin(self.request.user)

    def get_queryset(self):
        qs = scope_by_branch(super().get_queryset(), self.request, "branch_id")
        p = self.request.query_params
        if self._is_admin():
            if p.get("cashier"):
                qs = qs.filter(cashier_id=p["cashier"])
        else:
            qs = qs.filter(cashier=self.request.user)   # cashiers only ever see their own
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("category"):
            qs = qs.filter(category=p["category"])
       
        if p.get("date_from"):
            qs = qs.filter(expense_date__gte=p["date_from"])
        if p.get("date_to"):
            qs = qs.filter(expense_date__lte=p["date_to"])
        return qs

    @staticmethod
    def _log(request, action_name, exp, detail):
        from users.models import ActivityLog
        ActivityLog.log(action_name, user=request.user, entity="PettyCashExpense",
                        entity_id=exp.id, detail=detail, request=request)

    def perform_create(self, serializer):
        user = self.request.user
        extra = {} if sees_all_branches(user) else {"branch_id": user_branch_id(user)}
        exp = serializer.save(cashier=user, **extra)
        self._log(self.request, "petty_cash_created", exp,
                  f"Recorded petty cash {exp.amount} ({exp.get_category_display()}): {exp.description}")

    def perform_update(self, serializer):
        if serializer.instance.status != PettyCashExpense.Status.PENDING:
            raise DRFValidationError({"error": "Only pending expenses can be edited."})
        exp = serializer.save()
        self._log(self.request, "petty_cash_updated", exp, f"Updated petty cash #{exp.id} ({exp.amount})")

    def destroy(self, request, *args, **kwargs):
        exp = self.get_object()
        can_delete = exp.status == PettyCashExpense.Status.PENDING or (
            self._is_admin() and exp.status == PettyCashExpense.Status.REJECTED
        )
        if not can_delete:
            return Response(
                {"error": "Only pending expenses can be deleted (admins can also delete rejected ones)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        self._log(request, "petty_cash_deleted", exp, f"Deleted petty cash {exp.amount}: {exp.description}")
        if exp.receipt_image:
            exp.receipt_image.delete(save=False)
        exp.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        if not self._is_admin():
            return Response({"error": "Admin only."}, status=status.HTTP_403_FORBIDDEN)
        exp = self.get_object()
        if exp.status == PettyCashExpense.Status.APPROVED:
            return Response({"error": "Already approved."}, status=status.HTTP_400_BAD_REQUEST)
        exp.status = PettyCashExpense.Status.APPROVED
        exp.reviewed_by = request.user
        exp.reviewed_at = timezone.now()
        exp.review_note = ""
        exp.save()
        self._log(request, "petty_cash_approved", exp, f"Approved petty cash {exp.amount} ({exp.description})")
        return Response(self.get_serializer(exp).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        if not self._is_admin():
            return Response({"error": "Admin only."}, status=status.HTTP_403_FORBIDDEN)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"error": "A rejection reason is required."}, status=status.HTTP_400_BAD_REQUEST)
        exp = self.get_object()
        if exp.status == PettyCashExpense.Status.REJECTED:
            return Response({"error": "Already rejected."}, status=status.HTTP_400_BAD_REQUEST)
        exp.status = PettyCashExpense.Status.REJECTED
        exp.reviewed_by = request.user
        exp.reviewed_at = timezone.now()
        exp.review_note = reason[:255]
        exp.save()
        self._log(request, "petty_cash_rejected", exp, f"Rejected petty cash {exp.amount}. {reason}")
        return Response(self.get_serializer(exp).data)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def cashier_records(request):
    """
    GET /api/pos/cashier-records/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&cashier=<id>&branch=<id>

    One call for the cashier screen: sales, petty cash and a till summary for the period.
    Cashiers always get their own records. Admins get everyone's unless ?cashier= is given.
    """
    user = request.user
    is_admin = IsAdminUserCustom._check_admin(user)
    p = request.query_params
    today = timezone.localdate()

    try:
        start = _parse_date(p.get("date_from"), today)
        end = _parse_date(p.get("date_to"), today)
    except ValueError:
        return Response({"error": "Dates must be YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
    if start > end:
        return Response({"error": "date_from cannot be after date_to."}, status=status.HTTP_400_BAD_REQUEST)

    cashier_id = p.get("cashier") if is_admin else user.id
    branch_id = visible_branch_id(request)
    zero = Decimal("0.00")

    # ---------- Sales ----------
    sales = Sale.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    if cashier_id:
        sales = sales.filter(cashier_id=cashier_id)
    if branch_id:
        sales = sales.filter(branch_id=branch_id)
    live_sales = sales.exclude(status=Sale.Status.CANCELLED)

    sales_totals = live_sales.aggregate(
        total=Coalesce(Sum("total_amount"), zero),
        paid=Coalesce(Sum("amount_paid"), zero),
        count=Count("id"),
    )

    # ---------- Money received, by method ----------
    method_labels = dict(Payment.Method.choices)
    pay_rows = (
        Payment.objects.filter(sale__in=live_sales)
        .values("method").annotate(amount=Coalesce(Sum("amount"), zero)).order_by("-amount")
    )
    payment_breakdown = [
        {"method": method_labels.get(r["method"], r["method"]), "key": r["method"], "amount": r["amount"]}
        for r in pay_rows
    ]
    cash_collected = next((r["amount"] for r in pay_rows if r["method"] == "cash"), zero)

    # ---------- Petty cash (rejected expenses don't count against the till) ----------
    expenses = PettyCashExpense.objects.select_related("branch", "cashier", "reviewed_by").filter(
        expense_date__gte=start, expense_date__lte=end
    )
    if cashier_id:
        expenses = expenses.filter(cashier_id=cashier_id)
    if branch_id:
        expenses = expenses.filter(branch_id=branch_id)
    counted = expenses.exclude(status=PettyCashExpense.Status.REJECTED)
    petty_total = counted.aggregate(t=Coalesce(Sum("amount"), zero))["t"]
    petty_pending = expenses.filter(status=PettyCashExpense.Status.PENDING).aggregate(
        t=Coalesce(Sum("amount"), zero))["t"]

    # ---------- Sales rows (lightweight) ----------
    sale_rows = []
    for s in sales.select_related("customer", "branch", "cashier").prefetch_related("payments")[:500]:
        c = s.cashier
        sale_rows.append({
            "id": s.id,
            "order_number": s.order_number,
            "created_at": s.created_at.isoformat(),
            "customer_name": s.customer.name if s.customer else "Walk-in",
            "branch_name": s.branch.name if s.branch else "",
            "cashier_name": (f"{c.firstname} {c.lastname}".strip() or c.username) if c else "—",
            "sale_type": s.sale_type,
            "status": s.status,
            "total_amount": s.total_amount,
            "amount_paid": s.amount_paid,
            "balance_due": s.total_amount - s.amount_paid,
            "methods": sorted({method_labels.get(pm.method, pm.method) for pm in s.payments.all()}),
        })

    cashiers = []
    if is_admin:
        cashiers = list(
            User.objects.filter(is_active=True).order_by("firstname", "username")
            .values("id", "username", "firstname", "lastname")
        )

    return Response({
        "range": {"start": str(start), "end": str(end)},
        "is_admin": is_admin,
        "cashiers": cashiers,
        "summary": {
            "sales_count": sales_totals["count"],
            "sales_total": sales_totals["total"],
            "amount_received": sales_totals["paid"],
            "outstanding": sales_totals["total"] - sales_totals["paid"],
            "cash_collected": cash_collected,
            "petty_cash_total": petty_total,
            "petty_cash_pending": petty_pending,
            # Cash collected minus petty cash spent. Doesn't include any opening float.
            "expected_cash": cash_collected - petty_total,
        },
        "payment_breakdown": payment_breakdown,
        "sales": sale_rows,
        "expenses": PettyCashExpenseSerializer(
            expenses, many=True, context={"request": request}
        ).data,
    })
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_menu_access(request):
    """
    GET /api/pos/menu-permissions/mine/
    What the sidebar needs for the logged-in user. Admins always use the built-in
    admin menu, so they can never lock themselves out.
    """
    user = request.user
    if IsAdminUserCustom._check_admin(user):
        return Response({"is_admin": True, "configured": False, "keys": []})
    role_id = getattr(user, "role_id", None)
    rec = RoleMenuPermission.objects.filter(role_id=role_id).first() if role_id else None
    return Response({
        "is_admin": False,
        "configured": rec is not None,
        "keys": rec.menu_keys if rec else [],
    })


@api_view(["GET", "PUT"])
@permission_classes([IsAdminOnly])
def menu_permissions(request):
    """
    GET  /api/pos/menu-permissions/
         -> { roles: [...], permissions: { "<role_id>": ["pos", "sales", ...] } }
         (only roles an admin has customised appear in `permissions`)

    PUT  /api/pos/menu-permissions/
         body { "role": <id>, "menu_keys": ["pos", "sales"] }  -> save this role's menu
         body { "role": <id>, "menu_keys": null }              -> reset the role to built-in defaults
    """
    from users.models import Roles, ActivityLog

    if request.method == "GET":
        # HR-only roles (requires_login=False, e.g. cleaners) never log in, so they have no menu to configure.
        roles = list(
            Roles.objects.filter(requires_login=True).values("id", "role_name", "role_description", "requires_login")
        )
        permissions = {str(p.role_id): p.menu_keys for p in RoleMenuPermission.objects.all()}
        return Response({"roles": roles, "permissions": permissions})

    role = get_object_or_404(Roles, pk=request.data.get("role"))
    if "admin" in (role.role_name or "").lower():
        return Response({"error": "Administrator access is fixed and can't be changed."},
                        status=status.HTTP_400_BAD_REQUEST)
    if not role.requires_login:
        return Response({"error": "This is an HR-only role. It has no system login, so there is no menu to set."},
                        status=status.HTTP_400_BAD_REQUEST)
    if "menu_keys" not in request.data:
        return Response({"error": "menu_keys is required (use null to reset to defaults)."},
                        status=status.HTTP_400_BAD_REQUEST)

    keys = request.data.get("menu_keys")

    if keys is None:
        RoleMenuPermission.objects.filter(role=role).delete()
        ActivityLog.log("menu_access_reset", user=request.user, entity="Roles", entity_id=role.id,
                        detail=f"Reset menu access for role {role.role_name} to defaults", request=request)
        return Response({"role": role.id, "configured": False, "menu_keys": []})

    if not isinstance(keys, list) or not all(isinstance(k, str) and len(k) <= 64 for k in keys):
        return Response({"error": "menu_keys must be a list of menu key strings."},
                        status=status.HTTP_400_BAD_REQUEST)

    keys = sorted({k.strip() for k in keys if k.strip()})
    RoleMenuPermission.objects.update_or_create(
        role=role, defaults={"menu_keys": keys, "updated_by": request.user}
    )
    ActivityLog.log("menu_access_updated", user=request.user, entity="Roles", entity_id=role.id,
                    detail=f"Set menu access for role {role.role_name}: {len(keys)} items", request=request)
    return Response({"role": role.id, "configured": True, "menu_keys": keys})
REPORT_ADMIN_ONLY = {"salaries", "cheques"}   # everything else: admins + branch managers
ROW_LIMIT = 5000
ZERO = Decimal("0.00")


# ---------- helpers ----------
def _f(v):
    return float(v or 0)

def _dec():
    return DecimalField(max_digits=14, decimal_places=2)

def _col(key, label, kind="text"):
    return {"key": key, "label": label, "type": kind}

def _sum(label, value, kind="money"):
    return {"label": label, "value": value, "type": kind}

def _iso(d):
    return d.isoformat() if d else ""

def _person(u):
    return (f"{u.firstname} {u.lastname}".strip() or u.username) if u else "—"

def _result(columns, rows, summary, note=None):
    return {
        "columns": columns,
        "rows": rows[:ROW_LIMIT],
        "truncated": len(rows) > ROW_LIMIT,
        "summary": summary,
        "note": note,
    }

def _group(qs, expr, aggs, sort_key=None):
    """Group a queryset by `expr` and aggregate. Sorted by `sort_key` desc, or by group label."""
    rows = list(qs.annotate(grp=expr).values("grp").annotate(**aggs).order_by())
    if sort_key:
        rows.sort(key=lambda r: r[sort_key] or 0, reverse=True)
    else:
        rows.sort(key=lambda r: str(r["grp"]))
    return rows

def _can_view_reports(user):
    if IsAdminUserCustom._check_admin(user):
        return True
    try:
        return "manager" in (user.role.role_name or "").lower()
    except Exception:
        return False
def _forced_branch(user):
    if sees_all_branches(user):
        return None
    bid = user_branch_id(user)
    if not bid:
        raise PermissionDenied("Your account isn't assigned to a branch.")
    return bid

class _P:
    """Parsed request parameters shared by all reports."""
    def __init__(self, request, forced_branch=None):
        self.q = request.query_params
        today = timezone.localdate()
        self.start = _parse_date(self.q.get("date_from"), today.replace(day=1))
        self.end = _parse_date(self.q.get("date_to"), today)
        if self.start > self.end:
            raise ValueError("date_from cannot be after date_to.")
        self.branch = str(forced_branch) if forced_branch else (self.q.get("branch") or None)
        self.cashier = self.q.get("cashier") or None
        self.category = self.q.get("category") or None

    def get(self, key):
        return (self.q.get(key) or "").strip()


# ---------- filter specs ----------
def _sel(name, label, options):
    return {"name": name, "label": label, "kind": "select",
            "options": [{"value": v, "label": l} for v, l in options]}

BRANCH = {"name": "branch", "label": "Branch", "kind": "branch"}
CASHIER = {"name": "cashier", "label": "Cashier", "kind": "cashier"}
CATEGORY = {"name": "category", "label": "Category", "kind": "category"}


# =====================================================================
# SALES
# =====================================================================
def _r_sales(p):
    qs = Sale.objects.filter(created_at__date__gte=p.start, created_at__date__lte=p.end)
    st = p.get("status")
    qs = qs.filter(status=st) if st else qs.exclude(status=Sale.Status.CANCELLED)
    if p.branch:
        qs = qs.filter(branch_id=p.branch)
    if p.cashier:
        qs = qs.filter(cashier_id=p.cashier)
    if p.get("sale_type"):
        qs = qs.filter(sale_type=p.get("sale_type"))

    t = qs.aggregate(
        n=Count("id"), total=Coalesce(Sum("total_amount"), ZERO), tax=Coalesce(Sum("tax_amount"), ZERO),
        disc=Coalesce(Sum("discount_amount"), ZERO), paid=Coalesce(Sum("amount_paid"), ZERO),
    )
    summary = [
        _sum("Sales", t["n"], "number"), _sum("Total sales", _f(t["total"])),
        _sum("Received", _f(t["paid"])), _sum("Outstanding", _f(t["total"]) - _f(t["paid"])),
        _sum("Tax", _f(t["tax"])), _sum("Discounts", _f(t["disc"])),
    ]

    g = p.get("group_by")
    groups = {
        "day": ("Date", TruncDate("created_at")),
        "branch": ("Branch", Coalesce(F("branch__name"), Value("—"))),
        "cashier": ("Cashier", Coalesce(F("cashier__username"), Value("—"))),
        "customer": ("Customer", Coalesce(F("customer__name"), Value("Walk-in"))),
        "sale_type": ("Sale type", F("sale_type")),
    }
    if g in groups:
        label, expr = groups[g]
        rows = _group(qs, expr, dict(n=Count("id"), total=Sum("total_amount"), tax=Sum("tax_amount"),
                                     disc=Sum("discount_amount"), paid=Sum("amount_paid")),
                      None if g == "day" else "total")
        data = [{"grp": str(r["grp"]), "n": r["n"], "total": _f(r["total"]), "tax": _f(r["tax"]),
                 "disc": _f(r["disc"]), "paid": _f(r["paid"]),
                 "balance": _f(r["total"]) - _f(r["paid"])} for r in rows]
        cols = [_col("grp", label, "date" if g == "day" else "text"), _col("n", "Sales", "number"),
                _col("total", "Total", "money"), _col("tax", "Tax", "money"),
                _col("disc", "Discounts", "money"), _col("paid", "Received", "money"),
                _col("balance", "Balance", "money")]
        return _result(cols, data, summary)

    data = [{
        "order_number": s.order_number, "date": s.created_at.isoformat(),
        "customer": s.customer.name if s.customer else "Walk-in",
        "branch": s.branch.name if s.branch else "—", "cashier": _person(s.cashier),
        "sale_type": s.sale_type, "status": s.get_status_display(),
        "total": _f(s.total_amount), "paid": _f(s.amount_paid),
        "balance": _f(s.total_amount) - _f(s.amount_paid),
    } for s in qs.select_related("branch", "customer", "cashier").order_by("-created_at")[:ROW_LIMIT + 1]]
    cols = [_col("order_number", "Order #"), _col("date", "Date", "datetime"), _col("customer", "Customer"),
            _col("branch", "Branch"), _col("cashier", "Cashier"), _col("sale_type", "Type"),
            _col("status", "Status", "badge"), _col("total", "Total", "money"),
            _col("paid", "Paid", "money"), _col("balance", "Balance", "money")]
    return _result(cols, data, summary)


def _r_product_sales(p):
    items = SaleItem.objects.filter(
        sale__created_at__date__gte=p.start, sale__created_at__date__lte=p.end
    ).exclude(sale__status=Sale.Status.CANCELLED)
    if p.branch:
        items = items.filter(sale__branch_id=p.branch)
    if p.cashier:
        items = items.filter(sale__cashier_id=p.cashier)
    if p.category:
        items = items.filter(product__category_id=p.category)

    revenue = ExpressionWrapper(F("quantity") * F("unit_price") - F("discount_amount"), output_field=_dec())
    cost = ExpressionWrapper(F("quantity") * F("product__cost_price"), output_field=_dec())
    rows = list(
        items.values("product__name", "product__item_number", "product__category__name")
        .annotate(qty=Sum("quantity"), revenue=Sum(revenue), cost=Sum(cost)).order_by()
    )
    data = []
    for r in rows:
        rev, cst = _f(r["revenue"]), _f(r["cost"])
        data.append({
            "product": r["product__name"], "item_number": r["product__item_number"],
            "category": r["product__category__name"] or "—", "qty": r["qty"] or 0,
            "revenue": rev, "cost": cst, "profit": rev - cst,
            "margin": round((rev - cst) / rev * 100, 1) if rev else 0,
        })
    data.sort(key=lambda r: r["revenue"], reverse=True)
    tot_rev, tot_cost = sum(r["revenue"] for r in data), sum(r["cost"] for r in data)
    summary = [_sum("Products sold", len(data), "number"), _sum("Units sold", sum(r["qty"] for r in data), "number"),
               _sum("Revenue", tot_rev), _sum("Cost of goods", tot_cost), _sum("Gross profit", tot_rev - tot_cost)]
    cols = [_col("product", "Product"), _col("item_number", "Item #"), _col("category", "Category"),
            _col("qty", "Units sold", "number"), _col("revenue", "Revenue", "money"),
            _col("cost", "Cost", "money"), _col("profit", "Profit", "money"), _col("margin", "Margin", "percent")]
    return _result(cols, data, summary,
                   note="Revenue is before tax. Cost uses each product's current cost price.")


def _r_payments(p):
    qs = Payment.objects.select_related("sale", "received_by").filter(
        paid_at__date__gte=p.start, paid_at__date__lte=p.end
    ).exclude(sale__status=Sale.Status.CANCELLED)
    if p.branch:
        qs = qs.filter(sale__branch_id=p.branch)
    if p.cashier:
        qs = qs.filter(received_by_id=p.cashier)
    if p.get("method"):
        qs = qs.filter(method=p.get("method"))
    labels = dict(Payment.Method.choices)
    lab = lambda m: labels.get(m, (m or "").replace("_", " ").title())

    by_method = list(qs.values("method").annotate(t=Coalesce(Sum("amount"), ZERO)).order_by("-t"))
    total = sum(_f(r["t"]) for r in by_method)
    summary = [_sum("Payments", qs.count(), "number"), _sum("Total received", total)] + \
              [_sum(lab(r["method"]), _f(r["t"])) for r in by_method[:4]]

    g = p.get("group_by")
    groups = {
        "method": ("Method", F("method")),
        "day": ("Date", TruncDate("paid_at")),
        "cashier": ("Received by", Coalesce(F("received_by__username"), Value("—"))),
    }
    if g in groups:
        label, expr = groups[g]
        rows = _group(qs, expr, dict(n=Count("id"), total=Sum("amount")), None if g == "day" else "total")
        data = [{"grp": lab(r["grp"]) if g == "method" else str(r["grp"]), "n": r["n"], "total": _f(r["total"])}
                for r in rows]
        return _result([_col("grp", label, "date" if g == "day" else "text"), _col("n", "Payments", "number"),
                        _col("total", "Amount", "money")], data, summary)

    data = [{
        "date": x.paid_at.isoformat(), "order": x.sale.order_number, "method": lab(x.method),
        "amount": _f(x.amount), "reference": x.reference or "—", "received_by": _person(x.received_by),
    } for x in qs.order_by("-paid_at")[:ROW_LIMIT + 1]]
    cols = [_col("date", "Date", "datetime"), _col("order", "Order #"), _col("method", "Method"),
            _col("amount", "Amount", "money"), _col("reference", "Reference"), _col("received_by", "Received by")]
    return _result(cols, data, summary)


def _r_customer_balances(p):
    qs = Sale.objects.exclude(status=Sale.Status.CANCELLED).filter(
        created_at__date__gte=p.start, created_at__date__lte=p.end)
    if p.branch:
        qs = qs.filter(branch_id=p.branch)
    rows = qs.values("customer_id", "customer__name", "customer__phone").annotate(
        n=Count("id"), total=Sum("total_amount"), paid=Sum("amount_paid")).order_by()
    data = []
    for r in rows:
        bal = _f(r["total"]) - _f(r["paid"])
        if p.get("show") != "all" and bal <= 0:
            continue
        data.append({"customer": r["customer__name"] or "Walk-in", "phone": r["customer__phone"] or "—",
                     "n": r["n"], "total": _f(r["total"]), "paid": _f(r["paid"]), "balance": bal})
    data.sort(key=lambda r: r["balance"], reverse=True)
    summary = [_sum("Customers", len(data), "number"), _sum("Total billed", sum(r["total"] for r in data)),
               _sum("Received", sum(r["paid"] for r in data)), _sum("Outstanding", sum(r["balance"] for r in data))]
    cols = [_col("customer", "Customer"), _col("phone", "Phone"), _col("n", "Sales", "number"),
            _col("total", "Billed", "money"), _col("paid", "Paid", "money"), _col("balance", "Balance", "money")]
    return _result(cols, data, summary)


# =====================================================================
# STOCK
# =====================================================================
def _r_stock(p):
    qs = BranchStock.objects.select_related("branch", "product", "product__category").filter(product__is_active=True)
    if p.branch:
        qs = qs.filter(branch_id=p.branch)
    if p.category:
        qs = qs.filter(product__category_id=p.category)
    f = p.get("stock_status")
    if f == "out":
        qs = qs.filter(stock_quantity__lte=0)
    elif f == "low":
        qs = qs.filter(stock_quantity__gt=0, stock_quantity__lte=F("reorder_level"))
    elif f == "ok":
        qs = qs.filter(stock_quantity__gt=F("reorder_level"))

    data, units, cost_val, retail_val, low, out = [], 0, Decimal("0"), Decimal("0"), 0, 0
    for bs in qs.order_by("product__name", "branch__name"):
        qty = bs.stock_quantity
        state = "Out of stock" if qty <= 0 else "Low" if qty <= bs.reorder_level else "OK"
        low += state == "Low"
        out += state == "Out of stock"
        units += qty
        cost_val += qty * bs.product.cost_price
        retail_val += qty * bs.effective_retail_price
        data.append({
            "product": bs.product.name, "item_number": bs.product.item_number,
            "category": bs.product.category.name if bs.product.category else "—",
            "branch": bs.branch.name, "qty": qty, "reorder": bs.reorder_level, "status": state,
            "price": _f(bs.effective_retail_price), "value": _f(qty * bs.product.cost_price),
        })
    summary = [_sum("Stock lines", len(data), "number"), _sum("Units on hand", units, "number"),
               _sum("Stock value (cost)", _f(cost_val)), _sum("Stock value (retail)", _f(retail_val)),
               _sum("Low stock", low, "number"), _sum("Out of stock", out, "number")]
    cols = [_col("product", "Product"), _col("item_number", "Item #"), _col("category", "Category"),
            _col("branch", "Branch"), _col("qty", "In stock", "number"), _col("reorder", "Reorder level", "number"),
            _col("status", "Status", "badge"), _col("price", "Retail price", "money"),
            _col("value", "Value (cost)", "money")]
    return _result(cols, data, summary)


def _r_stock_movements(p):
    qs = StockMovement.objects.select_related("product", "branch", "destination_branch", "created_by").filter(
        created_at__date__gte=p.start, created_at__date__lte=p.end)
    if p.branch:
        qs = qs.filter(Q(branch_id=p.branch) | Q(destination_branch_id=p.branch))
    if p.get("movement_type"):
        qs = qs.filter(movement_type=p.get("movement_type"))

    fee_expr = ExpressionWrapper(F("movement_fee") * Abs(F("quantity_change")), output_field=_dec())
    t = qs.aggregate(
        n=Count("id"),
        inn=Coalesce(Sum("quantity_change", filter=Q(quantity_change__gt=0)), 0),
        out=Coalesce(Sum("quantity_change", filter=Q(quantity_change__lt=0)), 0),
        fees=Coalesce(Sum(fee_expr), ZERO),
    )
    summary = [_sum("Movements", t["n"], "number"), _sum("Units in", t["inn"], "number"),
               _sum("Units out", abs(t["out"]), "number"), _sum("Net change", t["inn"] + t["out"], "number"),
               _sum("Movement fees", _f(t["fees"]))]
    data = [{
        "date": m.created_at.isoformat(), "product": m.product.name, "type": m.get_movement_type_display(),
        "qty": m.quantity_change, "branch": m.branch.name if m.branch else "—",
        "to": m.destination_branch.name if m.destination_branch else "—",
        "fee": _f(m.total_fee),
        "by": _person(m.created_by), "note": m.note or "—",
    } for m in qs.order_by("-created_at")[:ROW_LIMIT + 1]]
    cols = [_col("date", "Date", "datetime"), _col("product", "Product"), _col("type", "Type", "badge"),
            _col("qty", "Qty change", "number"), _col("branch", "Branch"), _col("to", "Moved to"),
            _col("fee", "Movement fee", "money"),
            _col("by", "By"), _col("note", "Note")]
    return _result(cols, data, summary,
                   note="Movement fees are charged per unit on branch transfers and belong to Head Office.")
def _r_expiry(p):
    today = timezone.localdate()
    window = p.get("window") or "90"
    qs = Product.objects.filter(is_active=True, expiry_date__isnull=False).select_related("category")
    if window == "expired":
        qs = qs.filter(expiry_date__lt=today)
    else:
        try:
            days = int(window)
        except ValueError:
            days = 90
        qs = qs.filter(expiry_date__gte=today, expiry_date__lte=today + timedelta(days=days))
    stock_filter = Q(branch_stocks__branch_id=p.branch) if p.branch else None
    qs = qs.annotate(stock=Coalesce(Sum("branch_stocks__stock_quantity", filter=stock_filter), 0))
    if p.category:
        qs = qs.filter(category_id=p.category)
    if p.get("with_stock") != "all":
        qs = qs.filter(stock__gt=0)

    data = []
    for pr in qs.order_by("expiry_date"):
        left = (pr.expiry_date - today).days
        data.append({
            "product": pr.name, "item_number": pr.item_number,
            "category": pr.category.name if pr.category else "—", "expiry": _iso(pr.expiry_date),
            "days_left": left, "status": "Expired" if left < 0 else "Expiring soon",
            "stock": pr.stock, "value": _f(pr.stock * pr.cost_price),
        })
    summary = [_sum("Products", len(data), "number"), _sum("Units affected", sum(r["stock"] for r in data), "number"),
               _sum("Value at risk (cost)", sum(r["value"] for r in data))]
    cols = [_col("product", "Product"), _col("item_number", "Item #"), _col("category", "Category"),
            _col("expiry", "Expiry date", "date"), _col("days_left", "Days left", "number"),
            _col("status", "Status", "badge"), _col("stock", "Units in stock", "number"),
            _col("value", "Value (cost)", "money")]
    return _result(cols, data, summary)


# =====================================================================
# INVOICES, SUPPLIERS, PETTY CASH, CHEQUES, SALARIES, PRESCRIPTIONS
# =====================================================================
def _r_invoices(p):
    qs = SalesInvoice.objects.select_related("sale").filter(issue_date__gte=p.start, issue_date__lte=p.end)
    if p.get("status"):
        qs = qs.filter(status=p.get("status"))
    if p.get("invoice_type"):
        qs = qs.filter(invoice_type=p.get("invoice_type"))
    if p.branch:
        qs = qs.filter(sale__branch_id=p.branch)
    today = timezone.localdate()
    data, overdue_amt = [], 0.0
    for inv in qs.order_by("-issue_date", "-id"):
        open_ = inv.status not in (SalesInvoice.Status.PAID, SalesInvoice.Status.CANCELLED)
        late = (today - inv.due_date).days if (open_ and inv.due_date and inv.due_date < today
                                                and (inv.balance_due or 0) > 0) else 0
        if late:
            overdue_amt += _f(inv.balance_due)
        data.append({
            "number": inv.invoice_number, "issue": _iso(inv.issue_date), "due": _iso(inv.due_date),
            "billed_to": inv.billed_to_name or "—", "type": inv.get_invoice_type_display(),
            "status": inv.get_status_display(), "total": _f(inv.total_amount), "paid": _f(inv.amount_paid),
            "balance": _f(inv.balance_due), "late": late,
        })
    summary = [_sum("Invoices", len(data), "number"), _sum("Billed", sum(r["total"] for r in data)),
               _sum("Paid", sum(r["paid"] for r in data)), _sum("Outstanding", sum(r["balance"] for r in data)),
               _sum("Past due", overdue_amt)]
    cols = [_col("number", "Invoice #"), _col("issue", "Issued", "date"), _col("due", "Due", "date"),
            _col("billed_to", "Billed to"), _col("type", "Type"), _col("status", "Status", "badge"),
            _col("total", "Total", "money"), _col("paid", "Paid", "money"), _col("balance", "Balance", "money"),
            _col("late", "Days overdue", "number")]
    return _result(cols, data, summary)


def _r_suppliers(p):
    qs = _annotate_supplier_money(Supplier.objects.all())
    if p.get("status"):
        qs = qs.filter(is_active=(p.get("status") == "active"))
    if p.get("payment_terms"):
        qs = qs.filter(payment_terms=p.get("payment_terms"))
    labels = {"not_paid": "Not paid", "partial": "Partially paid", "paid": "Paid"}
    data = []
    for s in qs.order_by("name"):
        billed, paid = _f(s.total_billed), _f(s.total_paid)
        st = None if (billed <= 0 and paid <= 0) else "not_paid" if paid <= 0 else "paid" if paid >= billed else "partial"
        data.append({"name": s.name, "contact": s.contact_person or "—", "phone": s.phone or "—",
                     "terms": s.get_payment_terms_display(), "billed": billed, "paid": paid,
                     "balance": billed - paid, "pay_status": labels.get(st, "—"),
                     "status": "Active" if s.is_active else "Inactive"})
    summary = [_sum("Suppliers", len(data), "number"),
               _sum("Total billed", sum(r["billed"] for r in data)),
               _sum("Total paid", sum(r["paid"] for r in data)),
               _sum("Outstanding", sum(max(r["balance"], 0) for r in data))]
    cols = [_col("name", "Supplier"), _col("contact", "Contact person"), _col("phone", "Phone"),
            _col("terms", "Payment terms"), _col("billed", "Billed", "money"), _col("paid", "Paid", "money"),
            _col("balance", "Balance", "money"), _col("pay_status", "Payment status"),
            _col("status", "Status", "badge")]
    return _result(cols, data, summary,
                   note="Billed is the total of purchase invoices. Paid includes every payment made to the supplier.")
def _r_petty_cash(p):
    qs = PettyCashExpense.objects.select_related("branch", "cashier").filter(
        expense_date__gte=p.start, expense_date__lte=p.end)
    if p.branch:
        qs = qs.filter(branch_id=p.branch)
    if p.cashier:
        qs = qs.filter(cashier_id=p.cashier)
    if p.get("category_type"):
        qs = qs.filter(category=p.get("category_type"))
    if p.get("status"):
        qs = qs.filter(status=p.get("status"))

    by_status = {r["status"]: _f(r["t"]) for r in qs.values("status").annotate(t=Sum("amount")).order_by()}
    summary = [_sum("Expenses", qs.count(), "number"),
               _sum("Counted (excl. rejected)", by_status.get("pending", 0) + by_status.get("approved", 0)),
               _sum("Approved", by_status.get("approved", 0)), _sum("Pending", by_status.get("pending", 0)),
               _sum("Rejected", by_status.get("rejected", 0))]
    labels = dict(PettyCashExpense.Category.choices)
    g = p.get("group_by")
    groups = {
        "category": ("Category", F("category")),
        "cashier": ("Cashier", Coalesce(F("cashier__username"), Value("—"))),
        "day": ("Date", F("expense_date")),
    }
    if g in groups:
        label, expr = groups[g]
        rows = _group(qs.exclude(status="rejected"), expr, dict(n=Count("id"), total=Sum("amount")),
                      None if g == "day" else "total")
        data = [{"grp": labels.get(r["grp"], str(r["grp"])) if g == "category" else str(r["grp"]),
                 "n": r["n"], "total": _f(r["total"])} for r in rows]
        return _result([_col("grp", label, "date" if g == "day" else "text"), _col("n", "Expenses", "number"),
                        _col("total", "Amount", "money")], data, summary,
                       note="Grouped totals exclude rejected expenses.")
    data = [{
        "date": e.expense_date.isoformat(), "cashier": _person(e.cashier), "branch": e.branch.name if e.branch else "—",
        "category": e.get_category_display(), "description": e.description, "receipt": e.receipt_number or "—",
        "amount": _f(e.amount), "status": e.get_status_display(),
    } for e in qs.order_by("-expense_date", "-id")[:ROW_LIMIT + 1]]
    cols = [_col("date", "Date", "date"), _col("cashier", "Cashier"), _col("branch", "Branch"),
            _col("category", "Category"), _col("description", "Description"), _col("receipt", "Receipt #"),
            _col("amount", "Amount", "money"), _col("status", "Status", "badge")]
    return _result(cols, data, summary)


def _r_cheques(p):
    qs = ChequeDeposit.objects.select_related("customer").filter(received_on__gte=p.start, received_on__lte=p.end)
    if p.branch:
        qs = qs.filter(branch_id=p.branch)
    if p.get("status"):
        qs = qs.filter(status=p.get("status"))
    by = {r["status"]: (r["n"], _f(r["t"])) for r in
          qs.values("status").annotate(n=Count("id"), t=Sum("amount")).order_by()}
    summary = [_sum("In hand", by.get("received", (0, 0))[1]), _sum("Deposited", by.get("deposited", (0, 0))[1]),
               _sum("Cleared", by.get("cleared", (0, 0))[1]), _sum("Bounced", by.get("bounced", (0, 0))[1])]
    data = [{
        "cheque": c.cheque_number, "drawer": c.drawer_name, "bank": c.drawer_bank,
        "customer": c.customer.name if c.customer else "—", "amount": _f(c.amount),
        "cheque_date": _iso(c.cheque_date), "received": _iso(c.received_on),
        "status": c.get_status_display(), "deposited": _iso(c.deposited_on), "cleared": _iso(c.cleared_on),
    } for c in qs.order_by("-received_on", "-id")[:ROW_LIMIT + 1]]
    cols = [_col("cheque", "Cheque #"), _col("drawer", "Drawer"), _col("bank", "Bank"), _col("customer", "Customer"),
            _col("amount", "Amount", "money"), _col("cheque_date", "Cheque date", "date"),
            _col("received", "Received", "date"), _col("status", "Status", "badge"),
            _col("deposited", "Deposited", "date"), _col("cleared", "Cleared", "date")]
    return _result(cols, data, summary)


def _r_salaries(p):
    qs = SalaryPayment.objects.select_related("employee", "employee__branch").filter(
        period__gte=p.start.replace(day=1), period__lte=p.end)
    if not p.get("status"):
        qs = qs.exclude(status=SalaryPayment.Status.CANCELLED)
    else:
        qs = qs.filter(status=p.get("status"))
    if p.branch:
        qs = qs.filter(employee__branch_id=p.branch)
    rows = list(qs.order_by("-period", "employee__first_name"))
    data = [{
        "employee": s.employee.full_name, "number": s.employee.employee_number,
        "branch": s.employee.branch.name if s.employee.branch else "—", "period": s.period.strftime("%b %Y"),
        "basic": _f(s.basic_salary), "gross": _f(s.gross_pay), "paye": _f(s.paye), "nssf": _f(s.nssf),
        "shif": _f(s.health_insurance), "housing": _f(s.housing_levy),
        "other": _f(s.advance_recovery + s.other_deductions), "net": _f(s.net_pay),
        "status": s.get_status_display(),
    } for s in rows]
    summary = [_sum("Payslips", len(data), "number"), _sum("Gross pay", sum(r["gross"] for r in data)),
               _sum("PAYE", sum(r["paye"] for r in data)), _sum("NSSF", sum(r["nssf"] for r in data)),
               _sum("SHIF", sum(r["shif"] for r in data)), _sum("Housing levy", sum(r["housing"] for r in data)),
               _sum("Net pay", sum(r["net"] for r in data))]
    cols = [_col("employee", "Employee"), _col("number", "Emp #"), _col("branch", "Branch"),
            _col("period", "Month"), _col("basic", "Basic", "money"), _col("gross", "Gross", "money"),
            _col("paye", "PAYE", "money"), _col("nssf", "NSSF", "money"), _col("shif", "SHIF", "money"),
            _col("housing", "Housing levy", "money"), _col("other", "Other deductions", "money"),
            _col("net", "Net pay", "money"), _col("status", "Status", "badge")]
    return _result(cols, data, summary, note="Only months inside the selected date range are included.")


def _r_prescriptions(p):
    qs = VeterinaryEPrescription.objects.filter(date_of_prescription__gte=p.start, date_of_prescription__lte=p.end)
    if p.get("drug_category"):
        qs = qs.filter(drug_category=p.get("drug_category"))
    if p.get("prescription_target"):
        qs = qs.filter(prescription_target=p.get("prescription_target"))
    data = [{
        "date": x.date_of_prescription.isoformat(), "drug": x.drug_trade_name, "species": x.animal_species,
        "buyer": x.name_of_the_buyer, "category": x.drug_category, "target": x.get_prescription_target_display(),
        "manufacturer": x.manufacturer or "—", "batch": x.batch_no or "—", "qty": x.quantity_purchased or "—",
    } for x in qs.order_by("-date_of_prescription", "-id")[:ROW_LIMIT + 1]]
    summary = [_sum("Prescriptions", len(data), "number"),
               _sum("Category I", sum(r["category"] == "I" for r in data), "number"),
               _sum("Category II", sum(r["category"] == "II" for r in data), "number"),
               _sum("Buyers", len({r["buyer"] for r in data}), "number")]
    cols = [_col("date", "Date", "date"), _col("drug", "Drug"), _col("species", "Species"), _col("buyer", "Buyer"),
            _col("category", "Category"), _col("target", "Prescribed for"), _col("manufacturer", "Manufacturer"),
            _col("batch", "Batch #"), _col("qty", "Quantity")]
    return _result(cols, data, summary)

def _r_tax(p):
    from collections import defaultdict

    items = (SaleItem.objects
             .select_related("sale", "sale__branch", "sale__customer")
             .filter(sale__created_at__date__gte=p.start, sale__created_at__date__lte=p.end)
             .exclude(sale__status=Sale.Status.CANCELLED))
    if p.branch:
        items = items.filter(sale__branch_id=p.branch)
    tt = p.get("tax_type")
    if tt == "taxable":
        items = items.filter(tax_rate__gt=0)
    elif tt == "exempt":
        items = items.filter(tax_rate=0)

    g = p.get("group_by")
    taxable = exempt = output_tax = ZERO
    buckets = defaultdict(lambda: {"net": ZERO, "tax": ZERO, "sales": set(), "meta": {}})

    for i in items.order_by("sale__created_at", "id"):
        net, tax = i.line_subtotal, i.line_tax
        if i.tax_rate > 0:
            taxable += net
        else:
            exempt += net
        output_tax += tax

        s = i.sale
        if g == "rate":
            key, meta = i.tax_rate, {"grp": f"{i.tax_rate.normalize():f}%"}
        elif g == "day":
            d = timezone.localtime(s.created_at).date()
            key, meta = d, {"grp": d.isoformat()}
        elif g == "branch":
            key, meta = s.branch_id, {"grp": s.branch.name if s.branch else "—"}
        else:
            key = s.id
            meta = {
                "order_number": s.order_number, "date": s.created_at.isoformat(),
                "branch": s.branch.name if s.branch else "—",
                "customer": s.customer.name if s.customer else "Walk-in",
            }
        b = buckets[key]
        b["net"] += net
        b["tax"] += tax
        b["sales"].add(s.id)
        b["meta"] = meta

    # Input tax (VAT on supplier bills). Bills have no branch, so skip when filtering by branch.
    input_tax = None
    if not p.branch:
        input_tax = SalesInvoice.objects.filter(
            invoice_type=SalesInvoice.InvoiceType.PURCHASE,
            issue_date__gte=p.start, issue_date__lte=p.end,
        ).exclude(status=SalesInvoice.Status.CANCELLED).aggregate(
            t=Coalesce(Sum("tax_amount"), ZERO))["t"]

    summary = [_sum("Taxable sales", _f(taxable)), _sum("Zero-rated / exempt sales", _f(exempt)),
               _sum("Tax collected (output)", _f(output_tax))]
    if input_tax is not None:
        summary += [_sum("Tax on purchases (input)", _f(input_tax)),
                    _sum("Net tax payable", _f(output_tax - input_tax))]

    note = ("Amounts are before any whole-sale discount. Tax is worked out from each item's tax rate. "
            + ("Input tax comes from supplier bills in the date range." if input_tax is not None
               else "Input tax is not shown when a branch is selected, because supplier bills are not tied to a branch."))

    if g in ("rate", "day", "branch"):
        keys = sorted(buckets, key=lambda k: buckets[k]["net"], reverse=True) if g != "day" else sorted(buckets)
        label = {"rate": "Tax rate", "day": "Date", "branch": "Branch"}[g]
        data = [{"grp": buckets[k]["meta"]["grp"], "n": len(buckets[k]["sales"]),
                 "net": _f(buckets[k]["net"]), "tax": _f(buckets[k]["tax"]),
                 "gross": _f(buckets[k]["net"] + buckets[k]["tax"])} for k in keys]
        cols = [_col("grp", label, "date" if g == "day" else "text"), _col("n", "Sales", "number"),
                _col("net", "Sales before tax", "money"), _col("tax", "Tax", "money"),
                _col("gross", "Total with tax", "money")]
        return _result(cols, data, summary, note=note)

    data = [{**b["meta"], "net": _f(b["net"]), "tax": _f(b["tax"]), "gross": _f(b["net"] + b["tax"])}
            for b in buckets.values()]
    data.sort(key=lambda r: r["date"], reverse=True)
    cols = [_col("order_number", "Order #"), _col("date", "Date", "datetime"), _col("branch", "Branch"),
            _col("customer", "Customer"), _col("net", "Sales before tax", "money"),
            _col("tax", "Tax", "money"), _col("gross", "Total with tax", "money")]
    return _result(cols, data, summary, note=note)
# =====================================================================
# REGISTRY — one entry per report. `date` is the label of the date filter (None = no date filter).
# =====================================================================
REPORTS = {
    "sales": {"label": "Sales", "group": "Sales", "date": "Sale date", "fn": _r_sales,
              "filters": [BRANCH, CASHIER,
                          _sel("status", "Status", Sale.Status.choices),
                          _sel("sale_type", "Sale type", [("Retail", "Retail"), ("Wholesale", "Wholesale"), ("Credit", "Credit")]),
                          _sel("group_by", "Group by", [("day", "Day"), ("branch", "Branch"), ("cashier", "Cashier"),
                                                        ("customer", "Customer"), ("sale_type", "Sale type")])]},
    "product_sales": {"label": "Product sales & profit", "group": "Sales", "date": "Sale date", "fn": _r_product_sales,
                      "filters": [BRANCH, CASHIER, CATEGORY]},
    "payments": {"label": "Payments received", "group": "Sales", "date": "Payment date", "fn": _r_payments,
                 "filters": [BRANCH, CASHIER, _sel("method", "Method", Payment.Method.choices),
                             _sel("group_by", "Group by", [("method", "Method"), ("day", "Day"), ("cashier", "Received by")])]},
    "customer_balances": {"label": "Customer balances (owing)", "group": "Sales", "date": "Sale date",
                          "fn": _r_customer_balances,
                          "filters": [BRANCH, _sel("show", "Show", [("owing", "Only customers who owe"), ("all", "All customers")])]},
    "stock": {"label": "Stock levels & value", "group": "Stock", "date": None, "fn": _r_stock,
              "filters": [BRANCH, CATEGORY, _sel("stock_status", "Stock status",
                                                 [("low", "Low stock"), ("out", "Out of stock"), ("ok", "Healthy")])]},
    "stock_movements": {"label": "Stock movements", "group": "Stock", "date": "Movement date", "fn": _r_stock_movements,
                        "filters": [BRANCH, _sel("movement_type", "Type", StockMovement.MovementType.choices)]},
    "expiry": {"label": "Expiring & expired products", "group": "Stock", "date": None, "fn": _r_expiry,
               "filters": [BRANCH, CATEGORY,
                           _sel("window", "Expiry window", [("expired", "Already expired"), ("30", "Next 30 days"),
                                                            ("60", "Next 60 days"), ("90", "Next 90 days"),
                                                            ("180", "Next 180 days")]),
                           _sel("with_stock", "Stock", [("yes", "Only with stock"), ("all", "Include zero stock")])]},
    "invoices": {"label": "Invoices", "group": "Finance", "date": "Issue date", "fn": _r_invoices,
                 "filters": [BRANCH, _sel("status", "Status", SalesInvoice.Status.choices),
                             _sel("invoice_type", "Invoice type", SalesInvoice.InvoiceType.choices)]},
      "tax": {"label": "Tax (VAT) report", "group": "Finance", "date": "Sale date", "fn": _r_tax,
            "filters": [BRANCH,
                        _sel("tax_type", "Tax type", [("taxable", "Taxable items only"),
                                                      ("exempt", "Zero-rated / exempt only")]),
                        _sel("group_by", "Group by", [("rate", "Tax rate"), ("day", "Day"), ("branch", "Branch")])]},                        
    "petty_cash": {"label": "Petty cash expenses", "group": "Finance", "date": "Expense date", "fn": _r_petty_cash,
                   "filters": [BRANCH, CASHIER,
                               _sel("category_type", "Category", PettyCashExpense.Category.choices),
                               _sel("status", "Status", PettyCashExpense.Status.choices),
                               _sel("group_by", "Group by", [("category", "Category"), ("cashier", "Cashier"), ("day", "Day")])]},
    "cheques": {"label": "Cheques", "group": "Finance", "date": "Received date", "fn": _r_cheques,
                "filters": [BRANCH, _sel("status", "Status", ChequeDeposit.Status.choices)]},
    "salaries": {"label": "Salaries & statutory deductions", "group": "Finance", "date": "Salary month", "fn": _r_salaries,
                 "filters": [BRANCH, _sel("status", "Status", SalaryPayment.Status.choices)]},
    "suppliers": {"label": "Suppliers", "group": "Purchasing", "date": None, "fn": _r_suppliers,
                  "filters": [_sel("status", "Status", [("active", "Active"), ("inactive", "Inactive")]),
                              _sel("payment_terms", "Payment terms", Supplier.PaymentTerms.choices)]},
    "prescriptions": {"label": "Veterinary prescriptions", "group": "Compliance", "date": "Prescription date",
                      "fn": _r_prescriptions,
                      "filters": [_sel("drug_category", "Drug category", [("I", "Category I"), ("II", "Category II")]),
                                  _sel("prescription_target", "Prescribed for",
                                       VeterinaryEPrescription.PRESCRIPTION_TARGETS)]},
}


# =====================================================================
# ENDPOINTS
# =====================================================================
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_options(request):
    """GET /api/pos/reports/options/ — what the page needs to build its dropdowns."""
    user = request.user
    if not _can_view_reports(user):
        return Response({"error": "Reports are available to administrators and branch managers."}, status=403)
    is_admin = IsAdminUserCustom._check_admin(user)
    forced = _forced_branch(user)

    branches = Branch.objects.filter(is_active=True)
    if forced:
        branches = branches.filter(pk=forced)
    cashiers = [{"id": u["id"], "name": f"{u['firstname']} {u['lastname']}".strip() or u["username"]}
                for u in User.objects.filter(is_active=True).order_by("firstname", "username")
                .values("id", "username", "firstname", "lastname")]
    return Response({
        "is_admin": is_admin,
        "forced_branch": forced,
        "reports": [
            {"key": k, "label": s["label"], "group": s["group"], "date": s["date"], "filters": s["filters"]}
            for k, s in REPORTS.items() if is_admin or k not in REPORT_ADMIN_ONLY
        ],
        "branches": list(branches.values("id", "name", "code")),
        "categories": list(Category.objects.filter(is_active=True).values("id", "name")),
        "cashiers": cashiers,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def run_report(request):
    """
    GET /api/pos/reports/?report=sales&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&branch=1&group_by=day ...
    Returns { columns, rows, summary, note, truncated, range }.
    """
    user = request.user
    if not _can_view_reports(user):
        return Response({"error": "Reports are available to administrators and branch managers."}, status=403)
    key = request.query_params.get("report")
    spec = REPORTS.get(key)
    if not spec:
        return Response({"error": "Unknown report."}, status=status.HTTP_400_BAD_REQUEST)
    if key in REPORT_ADMIN_ONLY and not IsAdminUserCustom._check_admin(user):
        return Response({"error": "Admin only."}, status=status.HTTP_403_FORBIDDEN)
    try:
        p = _P(request, _forced_branch(user))
    except ValueError as e:
        return Response({"error": str(e) if "date_from" in str(e) else "Dates must be YYYY-MM-DD."},
                        status=status.HTTP_400_BAD_REQUEST)

    result = spec["fn"](p)
    result.update({
        "report": key,
        "title": spec["label"],
        "range": {"start": str(p.start), "end": str(p.end)} if spec["date"] else None,
    })
    return Response(result)
def _dashboard_view(user):
    """'full' (admin/manager) | 'stock' (storekeeper) | 'sales' (sales/cashier)."""
    if IsAdminUserCustom._check_admin(user):
        return "full"
    name = (getattr(getattr(user, "role", None), "role_name", "") or "").lower()
    if "manager" in name:
        return "full"
    if "store" in name or "stock" in name:
        return "stock"
    return "sales"   # sales, cashier and anything else


SALES_KEYS = ["sales", "orders", "profit", "items_sold", "customers",
              "outstanding_payments", "cash_in_till", "sales_trend",
              "payment_breakdown", "top_products"]

class BusinessPaymentViewSet(viewsets.ModelViewSet):
    queryset = BusinessPayment.objects.select_related("supplier", "branch","purchase_invoice", "created_by").all()
    serializer_class = BusinessPaymentSerializer
    permission_classes = [IsAdminOnly]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["payee", "description", "reference", "invoice_number", "supplier__name"]
    ordering_fields = ["payment_date", "amount", "created_at"]
    ordering = ["-payment_date", "-id"]

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("category"):
            qs = qs.filter(category=p["category"])
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("branch"):
            qs = qs.filter(branch_id=p["branch"])
        if p.get("supplier"):
            qs = qs.filter(supplier_id=p["supplier"])
        if p.get("method"):
            qs = qs.filter(method=p["method"])
        if p.get("purchase_invoice"): 
            qs = qs.filter(purchase_invoice_id=p["purchase_invoice"])
        if p.get("date_from"):
            qs = qs.filter(payment_date__gte=p["date_from"])
        if p.get("date_to"):
            qs = qs.filter(payment_date__lte=p["date_to"])
        return qs

    @staticmethod
    def _log(request, action_name, pay, detail):
        from users.models import ActivityLog
        ActivityLog.log(action_name, user=request.user, entity="BusinessPayment",
                        entity_id=pay.id, detail=detail, request=request)

    @staticmethod
    def _resync(*invoice_ids):
        for inv in SalesInvoice.objects.select_for_update().filter(pk__in={i for i in invoice_ids if i}):
            inv.sync_from_payments()

    def perform_create(self, serializer):
        with transaction.atomic():
            pay = serializer.save(created_by=self.request.user)
            self._resync(pay.purchase_invoice_id)
        self._log(self.request, "payment_created", pay,
                  f"Recorded {pay.get_category_display()} payment of {pay.amount}")

    def perform_update(self, serializer):
        old_invoice = serializer.instance.purchase_invoice_id
        with transaction.atomic():
            pay = serializer.save()
            self._resync(old_invoice, pay.purchase_invoice_id)
        self._log(self.request, "payment_updated", pay, f"Updated payment #{pay.id} ({pay.amount})")

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"error": "A cancellation reason is required."},
                            status=status.HTTP_400_BAD_REQUEST)
        pay = self.get_object()
        if pay.status == BusinessPayment.Status.CANCELLED:
            return Response({"error": "Already cancelled."}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            pay.status = BusinessPayment.Status.CANCELLED
            pay.cancel_reason = reason[:255]
            pay.save(update_fields=["status", "cancel_reason", "updated_at"])
            self._resync(pay.purchase_invoice_id)
        self._log(request, "payment_cancelled", pay,
                  f"Cancelled {pay.get_category_display()} payment of {pay.amount}. {reason}")
        return Response(self.get_serializer(pay).data)

    @action(detail=False, methods=["get"])
    def open_invoices(self, request):
        """GET business-payments/open_invoices/?supplier=<id>&include=<invoice id> — bills still owing."""
        supplier = request.query_params.get("supplier")
        if not supplier:
            return Response({"error": "supplier is required."}, status=status.HTTP_400_BAD_REQUEST)
        keep = Q(total_amount__gt=F("amount_paid"))
        if request.query_params.get("include"):
            keep |= Q(pk=request.query_params["include"])
        qs = (SalesInvoice.objects
              .filter(invoice_type=SalesInvoice.InvoiceType.PURCHASE, supplier_id=supplier)
              .exclude(status=SalesInvoice.Status.CANCELLED).filter(keep).order_by("issue_date", "id"))
        return Response([{
            "id": i.id, "invoice_number": i.invoice_number,
            "supplier_ref": (i.extra_data or {}).get("supplier_ref", ""),
            "issue_date": i.issue_date, "due_date": i.due_date,
            "total_amount": i.total_amount, "amount_paid": i.amount_paid,
            "balance_due": i.balance_due, "payment_status": i.payment_status,
        } for i in qs])
    def destroy(self, request, *args, **kwargs):
        return Response({"error": "Payments can't be deleted. Cancel it instead."},
                        status=status.HTTP_400_BAD_REQUEST)

   
    @action(detail=False, methods=["get"])
    def stats(self, request):
        """GET /api/pos/business-payments/stats/ (all list filters apply; cancelled are excluded)"""
        qs = self.filter_queryset(self.get_queryset()).exclude(status=BusinessPayment.Status.CANCELLED)
        zero = Decimal("0.00")
        labels = dict(BusinessPayment.Category.choices)
        rows = qs.values("category").annotate(n=Count("id"), t=Coalesce(Sum("amount"), zero)).order_by("-t")
        return Response({
            "count": qs.count(),
            "total": qs.aggregate(t=Coalesce(Sum("amount"), zero))["t"],
            "by_category": [
                {"category": r["category"], "label": labels.get(r["category"], r["category"]),
                 "count": r["n"], "total": r["t"]} for r in rows
            ],
        })

class StoreViewSet(viewsets.ModelViewSet):
    """
    The central store. Stock is received here, then moved to Head Office.

    GET   /api/pos/store/                          list (?search=, ?low_stock=true, ?in_stock=true)
    POST  /api/pos/store/                          start tracking a product in the store (quantity 0)
    PATCH /api/pos/store/{id}/                     change reorder level
    POST  /api/pos/store/receive/                  { product, quantity, note? }
    POST  /api/pos/store/move_to_head_office/      { product, quantity, note? }
                                                   or { items: [{product, quantity}, ...], note? }
    POST  /api/pos/store/{id}/write_off/           { quantity, reason: "damaged"|"expired", note? }
    GET   /api/pos/store/stats/
    """
    queryset = StoreStock.objects.select_related("product", "product__category").all()
    serializer_class = StoreStockSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "patch", "head", "options"]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["product__name", "product__item_number"]
    ordering_fields = ["quantity", "product__name", "updated_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("low_stock", "").lower() in ("1", "true", "yes"):
            qs = qs.filter(quantity__lte=F("reorder_level"))
        if p.get("in_stock", "").lower() in ("1", "true", "yes"):
            qs = qs.filter(quantity__gt=0)
        if p.get("category"):
            qs = qs.filter(product__category_id=p["category"])
        return qs

    # ---------- helpers ----------
    @staticmethod
    def _user(request):
        return request.user if request.user.is_authenticated else None

    @staticmethod
    def _qty(value):
        try:
            qty = int(value)
        except (TypeError, ValueError):
            raise ValueError("Quantity must be a whole number.")
        if qty <= 0:
            raise ValueError("Quantity must be greater than zero.")
        return qty

    @staticmethod
    def _log(product, movement_type, change, balance, note, user):
        return StoreMovement.objects.create(
            product=product, movement_type=movement_type, quantity_change=change,
            balance_after=balance, note=note, created_by=user,
        )

    # ---------- actions ----------
    @action(detail=False, methods=["post"])
    def receive(self, request):
        """Add stock into the store (e.g. a delivery from a supplier)."""
        try:
            qty = self._qty(request.data.get("quantity"))
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        product = get_object_or_404(Product, pk=request.data.get("product"))
        note = (request.data.get("note") or "").strip()

        with transaction.atomic():
            row, _ = StoreStock.objects.select_for_update().get_or_create(
                product=product, defaults={"quantity": 0}
            )
            row.quantity += qty
            row.save(update_fields=["quantity", "updated_at"])
            self._log(product, StoreMovement.MovementType.RECEIVED, qty, row.quantity,
                      note or "Received into store", self._user(request))
        return Response(self.get_serializer(row).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"])
    def move_to_head_office(self, request):
        """
        Move one product, or several at once, from the store to the Head Office branch.
        Everything happens in one transaction: if any line fails, nothing is moved.
        """
        items = request.data.get("items")
        if not items:
            items = [{"product": request.data.get("product"), "quantity": request.data.get("quantity")}]
        if not isinstance(items, list):
            return Response({"error": "items must be a list."}, status=status.HTTP_400_BAD_REQUEST)

        note = (request.data.get("note") or "").strip()
        head_office = get_head_office_branch()
        user = self._user(request)
        moved = []

        try:
            with transaction.atomic():
                for line in items:
                    qty = self._qty(line.get("quantity"))
                    product = Product.objects.filter(pk=line.get("product")).first()
                    if not product:
                        raise ValueError("One of the selected products was not found.")

                    row = StoreStock.objects.select_for_update().filter(product=product).first()
                    available = row.quantity if row else 0
                    if available < qty:
                        raise ValueError(
                            f'Not enough stock in the store for "{product.name}". '
                            f"Available: {available}, requested: {qty}."
                        )

                    # Store side
                    row.quantity -= qty
                    row.save(update_fields=["quantity", "updated_at"])
                    self._log(product, StoreMovement.MovementType.TO_HEAD_OFFICE, -qty, row.quantity,
                              note or f"Moved to {head_office.name}", user)

                    # Head Office side
                    hq, _ = BranchStock.objects.select_for_update().get_or_create(
                        branch=head_office, product=product, defaults={"stock_quantity": 0}
                    )
                    hq.stock_quantity += qty
                    hq.save(update_fields=["stock_quantity"])
                    StockMovement.objects.create(
                        product=product, branch=head_office,
                        movement_type=StockMovement.MovementType.RESTOCK,
                        quantity_change=qty,
                        note=f"Received from Store" + (f" | {note}" if note else ""),
                        created_by=user,
                    )
                    moved.append({"product": product.name, "quantity": qty,
                                  "store_balance": row.quantity, "head_office_balance": hq.stock_quantity})
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"moved_to": head_office.name, "lines": len(moved), "items": moved},
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def write_off(self, request, pk=None):
        """Remove damaged or expired units from the store."""
        reason = request.data.get("reason")
        if reason not in (StoreMovement.MovementType.DAMAGED, StoreMovement.MovementType.EXPIRED):
            return Response({"error": "reason must be 'damaged' or 'expired'."},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            qty = self._qty(request.data.get("quantity"))
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            row = StoreStock.objects.select_for_update().select_related("product").get(pk=self.get_object().pk)
            if row.quantity < qty:
                return Response({"error": f"Only {row.quantity} in the store."},
                                status=status.HTTP_400_BAD_REQUEST)
            row.quantity -= qty
            row.save(update_fields=["quantity", "updated_at"])
            self._log(row.product, reason, -qty, row.quantity,
                      (request.data.get("note") or "").strip(), self._user(request))
        return Response(self.get_serializer(row).data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        qs = self.get_queryset()
        value = qs.aggregate(
            t=Coalesce(Sum(ExpressionWrapper(
                F("quantity") * F("product__cost_price"),
                output_field=DecimalField(max_digits=14, decimal_places=2))), Decimal("0.00"))
        )["t"]
        return Response({
            "products": qs.count(),
            "units_in_store": qs.aggregate(t=Coalesce(Sum("quantity"), 0))["t"],
            "stock_value": value,
            "low_stock": qs.filter(quantity__gt=0, quantity__lte=F("reorder_level")).count(),
            "out_of_stock": qs.filter(quantity__lte=0).count(),
        })


class StoreMovementViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /api/pos/store-movements/ — history of the store (?product=, ?movement_type=, ?date_from=, ?date_to=)"""
    queryset = StoreMovement.objects.select_related("product", "created_by").all()
    serializer_class = StoreMovementSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["product__name", "product__item_number", "note"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("product"):
            qs = qs.filter(product_id=p["product"])
        if p.get("movement_type"):
            qs = qs.filter(movement_type=p["movement_type"])
        if p.get("date_from"):
            qs = qs.filter(created_at__date__gte=p["date_from"])
        if p.get("date_to"):
            qs = qs.filter(created_at__date__lte=p["date_to"])
        return qs