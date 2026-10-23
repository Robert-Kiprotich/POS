from django.db import transaction
from rest_framework import serializers
from users.models import User, Roles
from .utils import get_head_office_branch
import datetime
import pytz
from decimal import *
from datetime import timedelta as _td

from .models import *
def _is_sales_clerk_user(user):
    if _is_admin_user(user):
        return False
    name = (getattr(getattr(user, "role", None), "role_name", "") or "").lower()
    return ("sales clerk" in name or "cashier" in name) and "manager" not in name
class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ["id", "name", "code", "location", "phone", "is_active", "created_at"]


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(source="products.count", read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "description", "is_active", "product_count", "created_at"]


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    image_url = serializers.SerializerMethodField()
    total_stock = serializers.IntegerField(read_only=True, default=0)

    # write-only: only used when creating a product (goes to Head Office)
    initial_quantity = serializers.IntegerField(write_only=True, required=False, min_value=0, default=0)
    reorder_level = serializers.IntegerField(write_only=True, required=False, min_value=0, default=5)

    class Meta:
        model = Product
        fields = [
            "id", "name", "item_number", "category", "category_name",
            "description", "cost_price", "retail_price", "wholesale_price",
            "tax_rate", "expiry_date",
            "image", "image_url", "manufacturer", "pack_size", "is_active", "total_stock",
            "initial_quantity", "reorder_level",
            "created_at", "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]
        extra_kwargs = {"image": {"write_only": True}}

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.image.url) if request else obj.image.url

    def validate_retail_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Retail price cannot be negative.")
        return value

    def validate_wholesale_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Wholesale price cannot be negative.")
        return value

    def validate_cost_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Cost price cannot be negative.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        qty = validated_data.pop("initial_quantity", 0)
        reorder = validated_data.pop("reorder_level", 5)

        product = super().create(validated_data)

        # update_or_create works whether or not the post_save signal already made the row
        BranchStock.objects.update_or_create(
            branch=get_head_office_branch(),
            product=product,
            defaults={"stock_quantity": qty, "reorder_level": reorder},
        )
        product.total_stock = qty  # the annotation only exists on queryset results
        return product

    def update(self, instance, validated_data):
        # Stock is never changed via product edit; use the Branches page instead
        validated_data.pop("initial_quantity", None)
        validated_data.pop("reorder_level", None)
        return super().update(instance, validated_data)
class ProductMiniSerializer(serializers.ModelSerializer):
    """Lightweight product representation for embedding in sale items / stock rows."""

    class Meta:
        model = Product
        fields = ["id", "name", "item_number", "retail_price","wholesale_price", "tax_rate"]


class BranchStockSerializer(serializers.ModelSerializer):
    product_detail = ProductMiniSerializer(source="product", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    effective_retail_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    effective_wholesale_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)


    class Meta:
        model = BranchStock
        fields = [
            "id", "branch", "branch_name", "product", "product_detail",
            "stock_quantity", "reorder_level", "is_low_stock","retail_price", "wholesale_price",
                  "effective_retail_price", "effective_wholesale_price",
        ]
class CustomerSaleSerializer(serializers.ModelSerializer):
    balance_due = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            "id",
            "order_number",
            "status",
            "sale_type",
            "subtotal",
            "discount_amount",
            "tax_amount",
            "total_amount",
            "amount_paid",
            "balance_due",
            "created_at",
        ]

    def get_balance_due(self, obj):
        return obj.total_amount - obj.amount_paid,
           
        



class CustomerSerializer(serializers.ModelSerializer):
    sales = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = ["id", "name", "business_name", "phone", "alt_phone", "email", "address",
                  "loyalty_points", "created_at", "sales"]

    def get_sales(self, obj):
        from .branch_scope import scope_by_branch
        qs = obj.sales.all()
        request = self.context.get("request")
        if request:
            qs = scope_by_branch(qs, request, "branch_id")
            if _is_sales_clerk_user(request.user):
                qs = qs.filter(cashier=request.user)
        return CustomerSaleSerializer(qs, many=True).data

class PaymentSerializer(serializers.ModelSerializer):
    method_display = serializers.CharField(source="get_method_display", read_only=True)

    class Meta:
        model = Payment
        fields = ["id", "sale", "method", "method_display", "amount", "reference", "received_by", "paid_at"]
        read_only_fields = ["paid_at"]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Payment amount must be greater than zero.")
        return value

from rest_framework import serializers

class SaleReceiptSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    sale_type = serializers.CharField(read_only=True)
    grand_total = serializers.DecimalField(
        source="total_amount",
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )
    items = serializers.SerializerMethodField()
    cashier_name = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            "id",
            "order_number",
            "customer_name",
            "sale_type",
            "grand_total",
            "created_at",
            "items",
            "amount_paid",
            "balance_due",
            "cashier_name",
        ]

    def get_customer_name(self, obj):
        return obj.customer.name if obj.customer else "Walk-in Customer"

    def get_cashier_name(self, obj):
        # Adjust "cashier" to your actual Sale model field.
        cashier = getattr(obj, "cashier", None)
        if cashier:
            return cashier.get_full_name() or cashier.get_username()
        return "-"

    def get_items(self, obj):
        return [
            {
                "product_name": item.product.name,
                "quantity": item.quantity,
                "unit_price": str(item.unit_price),
                "line_total": str(item.line_total),
            }
            for item in obj.items.select_related("product").all()
        ]

class SaleItemSerializer(serializers.ModelSerializer):
    product_detail = ProductMiniSerializer(source="product", read_only=True)
    line_subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    line_tax = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = SaleItem
        fields = [
            "id", "product", "product_detail", "quantity", "unit_price", "tax_rate",
            "discount_amount", "line_subtotal", "line_tax", "line_total",
        ]

    def validate_quantity(self, value):
        if value < 1:
            raise serializers.ValidationError("Quantity must be at least 1.")
        return value


class SaleItemWriteSerializer(serializers.Serializer):
    """Used only for the nested `items` payload when creating/checking out a sale.
    Accepts either a `product` id or a typed/scanned `item_number` — exactly one is required.
    """

    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), required=False)
    item_number = serializers.CharField(required=False, allow_blank=False)
    quantity = serializers.IntegerField(min_value=1)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)

    def validate(self, attrs):
        product = attrs.get("product")
        code = attrs.get("item_number")
        if not product and not code:
            raise serializers.ValidationError("Provide either 'product' (id) or 'item_number'.")
        if not product:
            try:
                attrs["product"] = Product.objects.get(item_number=code)
            except Product.DoesNotExist:
                raise serializers.ValidationError(f"No product found for item number '{code}'.")
        return attrs


class SaleSerializer(serializers.ModelSerializer):
    """Read-oriented serializer: shows full nested items and payments."""

    items = SaleItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)
    customer_name = serializers.CharField(source="customer.name", read_only=True, default=None)
    cashier_name = serializers.CharField(source="cashier.get_full_name", read_only=True, default=None)
    balance_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    balance = serializers.SerializerMethodField()
    profit = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            "id", "order_number", "branch", "branch_name", "customer", "customer_name",
            "cashier", "cashier_name", "status", "subtotal", "discount_amount", "tax_amount",
            "total_amount", "amount_paid", "balance_due", "notes", "items", "payments", "balance", "profit","sale_type",
            "created_at", "updated_at",
        ]
        extra_kwargs = {"sale": {"required": False, "allow_null": True}}

        read_only_fields = ["order_number", "subtotal", "tax_amount", "total_amount", "created_at", "updated_at"]
    def get_balance(self, obj):
        return obj.total_amount - obj.amount_paid

    def get_profit(self, obj):
        revenue = sum((i.unit_price * i.quantity for i in obj.items.all()), Decimal("0.00"))
        cost = sum((i.product.cost_price * i.quantity for i in obj.items.all()), Decimal("0.00"))
        return revenue - cost - (obj.discount_amount or Decimal("0.00"))
    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if not (request and _is_admin_user(request.user)):
            data.pop("profit", None)      # non-admins never receive profit
        return data
def _is_admin_user(user):
    if getattr(user, "is_admin", False):
        return True
    try:
        return "admin" in (user.role.role_name or "").lower()
    except Exception:
        return False
class SaleCreateSerializer(serializers.ModelSerializer):
    """
    Write serializer for checkout: accepts a nested list of items, creates the
    Sale + SaleItems atomically, decrements the branch's stock, logs StockMovements,
    and recomputes totals from the items actually saved.
    """

    items = SaleItemWriteSerializer(many=True, write_only=True)

    class Meta:
        model = Sale
        fields = ["id", "order_number", "branch", "customer", "notes", "discount_amount","sale_type", "items"]
        read_only_fields = ["id", "order_number"]

    def validate(self, attrs):
        if not attrs.get("branch"):
            raise serializers.ValidationError({"branch": "Branch is required for checkout."})
        if attrs.get("sale_type") in ("Wholesale", "Credit") and not attrs.get("customer"):
            raise serializers.ValidationError(
                {"customer": "A customer is required for wholesale and credit sales."}
            )
        return attrs

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("A sale must contain at least one item.")
        return items
    def validate_sale_type(self, value):
        if value not in ("Retail", "Wholesale", "Credit"):
            raise serializers.ValidationError("sale_type must be Retail, Wholesale or Credit.")
        return value
    
    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop("items")
        branch = validated_data["branch"]
        sale_type = validated_data.get("sale_type", "Retail")
        request = self.context.get("request")
        cashier = getattr(request, "user", None) if request else None

        # Offline sales carry a client_uuid (added by the POS app)
        is_offline = bool(self.initial_data.get("was_offline"))

        # If someone else syncs the sale (e.g. an admin logs in on the till),
        # credit the original cashier. Only admins may do this.
        if is_offline and cashier and cashier.is_authenticated:
            wanted = self.initial_data.get("cashier")
            if wanted and str(wanted) != str(cashier.pk) and _is_admin_user(cashier):
                cashier = User.objects.filter(pk=wanted, is_active=True).first() or cashier

        sale = Sale.objects.create(
            cashier=cashier if cashier and cashier.is_authenticated else None,
            **validated_data,
        )

        for item in items_data:
            product = item["product"]
            # Lock this branch's stock row so two concurrent checkouts can't both
            # pass the stock check and oversell the same product.
            branch_stock, _ = BranchStock.objects.select_for_update().get_or_create(
                branch=branch, product=product, defaults={"stock_quantity": 0}
            )

            if not is_offline and item["quantity"] > branch_stock.stock_quantity:
                raise serializers.ValidationError(
                    f"Not enough stock for '{product.name}' at {branch.name}: "
                    f"requested {item['quantity']}, available {branch_stock.stock_quantity}."
                )

            unit_price = item.get("unit_price")
            if not unit_price:
                if sale_type == "Wholesale":
                    # Product.wholesale_price defaults to 0, so fall back to retail if it was never set
                    unit_price = branch_stock.effective_wholesale_price or branch_stock.effective_retail_price
                else:  # Retail and Credit
                    unit_price = branch_stock.effective_retail_price
            SaleItem.objects.create(
                sale=sale,
                product=product,
                quantity=item["quantity"],
                unit_price=unit_price,
                tax_rate=product.tax_rate,
                discount_amount=item.get("discount_amount") or 0,
            )

            branch_stock.stock_quantity -= item["quantity"]
            branch_stock.save(update_fields=["stock_quantity"])

            StockMovement.objects.create(
                product=product,
                branch=branch,
                movement_type=StockMovement.MovementType.SALE,
                quantity_change=-item["quantity"],
                note=f"Sold via {sale.order_number}",
                created_by=cashier if cashier and cashier.is_authenticated else None,
            )

        sale.recalculate_totals()
        if sale.status == Sale.Status.PENDING:
            sale.status = Sale.Status.COMPLETED
            sale.save(update_fields=["status", "updated_at"])
        return sale

    def to_representation(self, instance):
        return SaleSerializer(instance, context=self.context).data


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)
    destination_branch_name = serializers.CharField(source="destination_branch.name", read_only=True, default=None)
    created_by_name = serializers.SerializerMethodField()
    fee_branch_name = serializers.CharField(source="fee_branch.name", read_only=True, default=None)
    total_fee = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)


    class Meta:
        model = StockMovement
        fields = [
            "id", "product", "product_name", "branch", "branch_name",
            "destination_branch", "destination_branch_name",
            "movement_type", "quantity_change", "note",
            "note",
            "movement_fee", "total_fee", "fee_branch", "fee_branch_name",
            "created_by", "created_by_name", "created_at",
        ]
        read_only_fields = ["created_at", "created_by", "movement_fee", "fee_branch", "total_fee"]

    def get_created_by_name(self, obj):
        u = obj.created_by
        if not u:
            return "System"
        return f"{u.firstname} {u.lastname}".strip() or u.username

    def validate(self, attrs):
        if not attrs.get("branch"):
            raise serializers.ValidationError({"branch": "Branch is required for a stock movement."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        validated_data["created_by"] = user if user and user.is_authenticated else None

        branch_stock, _ = BranchStock.objects.select_for_update().get_or_create(
            branch=validated_data["branch"], product=validated_data["product"],
            defaults={"stock_quantity": 0},
        )
        new_qty = branch_stock.stock_quantity + validated_data["quantity_change"]
        if new_qty < 0:
            raise serializers.ValidationError({
                "quantity_change": f"Only {branch_stock.stock_quantity} in stock at "
                                   f"{branch_stock.branch.name}; cannot remove "
                                   f"{abs(validated_data['quantity_change'])}."
            })
        branch_stock.stock_quantity = new_qty
        branch_stock.save(update_fields=["stock_quantity"])
        return super().create(validated_data)
class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Roles
        fields = ['id', 'role_name', 'role_description']


class UserBasicSerializer(serializers.ModelSerializer):
    role = RoleSerializer(many=False, read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)

    class Meta:
        model = User
        fields = ['id', 'username', 'firstname', 'lastname', 'email', 'phone', 'role', 'date_joined', 'is_active', 'is_admin',"branch", "branch_name",]


class VeterinaryEPrescriptionSerializer(serializers.ModelSerializer):
    drug_category_display = serializers.CharField(
        source="get_drug_category_display", read_only=True
    )
    prescription_target_display = serializers.CharField(
        source="get_prescription_target_display", read_only=True
    )

    # Explicit date fields so DRF validates format and we can coerce "" -> None
    # in to_internal_value() before DRF sees them.
    date_of_prescription = serializers.DateField(required=True)
    expiry_date = serializers.DateField(required=False, allow_null=True)

    class Meta:
        model = VeterinaryEPrescription
        fields = [
            "id",
            # Core
            "date_of_prescription",
            "drug_category",
            "drug_category_display",
            "prescription_target",
            "practitioner_name",
            "practitioner_contact",
            "practitioner_kvb_no",
            "prescription_target_display",
            # Animal
            "animal_species",
            "breed",
            "age",
            # Medication
            "drug_trade_name",
            "manufacturer",
            "batch_no",
            "quantity_purchased",
            "drug_volume",
            "dosage",
            # Treatment
            "clinical_use",
            "duration_of_treatment",
            "withdrawal_period",
            "storage_condition",
            "side_effect",
            "expiry_date",
            # Buyer
            "name_of_the_buyer",
            "buyer_kvb_no",
            "buyer_licence_no",
            "buyer_contact",
            # Comments
            "vet_pharmacist_comment",
            "signature_and_stamp",
            # Timestamps
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def to_internal_value(self, data):
        # The frontend sends "" for optional dates. Convert to None before
        # DRF's DateField runs so we get a clean 400 instead of a TypeError.
        mutable = data.copy() if hasattr(data, "copy") else dict(data)
        for key in ("expiry_date", "date_of_prescription"):
            if mutable.get(key) == "":
                mutable[key] = None
        return super().to_internal_value(mutable)

    def validate_date_of_prescription(self, value):
        if value is None:
            raise serializers.ValidationError("Date of prescription is required.")
        return value

    def validate_drug_trade_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Drug trade name is required.")
        return value.strip()

    def validate_animal_species(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Animal species is required.")
        return value.strip()

    def validate_name_of_the_buyer(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Buyer name is required.")
        return value.strip()
class SalesInvoiceSerializer(serializers.ModelSerializer):
    # --- Read-only conveniences ---
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    invoice_type_display = serializers.SerializerMethodField()
    sale_order_number = serializers.CharField(source="sale.order_number", read_only=True, default=None)
    branch_name = serializers.CharField(source="sale.branch.name", read_only=True, default=None)
    customer_name = serializers.CharField(source="sale.customer.name", read_only=True, default=None)

    # --- Explicit date fields so "" from the frontend is coerced safely ---
    issue_date = serializers.DateField(required=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True, default=None)
    payment_status = serializers.CharField(read_only=True)
    supply = serializers.PrimaryKeyRelatedField(
        queryset=Supply.objects.all(), write_only=True, required=False, allow_null=True)
    previous_balance = serializers.SerializerMethodField()  
    previous_invoices = serializers.SerializerMethodField() # <- add
    items = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)

    class Meta:
        model = SalesInvoice
        fields = [
            "id",
            # Core
            "invoice_number",
            "invoice_type",
            "invoice_type_display",
            "sale",
            "sale_order_number",
            "status",
            "status_display",
            # Dates
            "issue_date",
            "due_date",
            # Billed-to snapshot
            "billed_to_name",
            "billed_to_phone",
            "billed_to_email",
            "billed_to_address",
            # Money (editable when there is no sale; total/balance are calculated)
            "subtotal",
            "discount_amount",
            "tax_amount",
            "total_amount",
            "amount_paid",
            "balance_due",
            # Type-specific values
            "extra_data",
            # Notes
            "notes",
            "terms",
            # Context (read-only, from the sale)
            "branch_name",
            "customer_name",
            "supplier", 
            "supplier_name", 
            "payment_status",
            "items",
            "previous_balance",
            "previous_invoices",
            "supply",
            # Timestamps
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "invoice_number",
            "total_amount",
            "balance_due",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {"sale": {"required": False, "allow_null": True},
                        "supplier": {"required": False, "allow_null": True}}
    def get_loss_value(self, obj):
        return round(abs(obj.quantity_change) * (obj.unit_cost or 0), 2)
    def to_internal_value(self, data):
        mutable = data.copy() if hasattr(data, "copy") else dict(data)
        for key in ("due_date", "issue_date","supplier"):
            if mutable.get(key) == "":
                mutable[key] = None
        return super().to_internal_value(mutable)
    def get_invoice_type_display(self, obj):
         return "Purchase Invoice" if obj.invoice_type == "purchase" else "Sales Invoice"
    def get_previous_balance(self, obj):
        """Unpaid balance on this supplier's EARLIER purchase bills (excludes this one)."""
        if obj.invoice_type != "purchase" or not obj.supplier_id:
            return Decimal("0.00")
        from django.db.models import Q
        earlier = (
            SalesInvoice.objects
            .filter(supplier_id=obj.supplier_id, invoice_type="purchase")
            .exclude(balance_due=0)
            .exclude(status="cancelled")
            .exclude(pk=obj.pk)
            .filter(Q(issue_date__lt=obj.issue_date) |
                    Q(issue_date=obj.issue_date, id__lt=obj.id))
        )
        return earlier.aggregate(t=Coalesce(Sum("balance_due"), Decimal("0.00")))["t"]
    def get_previous_invoices(self, obj):
        from django.db.models import Q
        if not obj.pk:
            return []

        base = (SalesInvoice.objects
                .exclude(status="cancelled")
                .exclude(balance_due=0)
                .exclude(pk=obj.pk))

        if obj.invoice_type == "purchase":
            if not obj.supplier_id:
                return []
            qs = base.filter(invoice_type="purchase", supplier_id=obj.supplier_id)
        else:
            qs = base.exclude(invoice_type="purchase")
            customer_id = obj.sale.customer_id if obj.sale_id else None
            if customer_id:
                qs = qs.filter(sale__customer_id=customer_id)
            elif (obj.billed_to_name or "").strip():
                qs = qs.filter(sale__isnull=True, billed_to_name__iexact=obj.billed_to_name.strip())
            else:
                return []

        qs = qs.filter(Q(issue_date__lt=obj.issue_date) |
                    Q(issue_date=obj.issue_date, id__lt=obj.id)).order_by("issue_date", "id")

        return [{"invoice_number": i.invoice_number, "issue_date": i.issue_date,
                "total_amount": i.total_amount, "balance_due": i.balance_due} for i in qs]
    def validate_issue_date(self, value):
        if value is None:
            raise serializers.ValidationError("Issue date is required.")
        return value

    def validate(self, attrs):
        issue = attrs.get("issue_date") or getattr(self.instance, "issue_date", None)
        due = attrs.get("due_date") or getattr(self.instance, "due_date", None)
        if issue and due and due < issue:
            raise serializers.ValidationError(
                {"due_date": "Due date cannot be earlier than the issue date."}
            )
        inv_type = attrs.get("invoice_type") or getattr(self.instance, "invoice_type", None)
        supplier = attrs["supplier"] if "supplier" in attrs else getattr(self.instance, "supplier", None)
        supply = attrs.get("supply")

        if supply:
            if inv_type != SalesInvoice.InvoiceType.PURCHASE:
                raise serializers.ValidationError({"supply": "Only purchase invoices can be linked to a supply."})
            if supply.status != Supply.Status.RECEIVED:
                raise serializers.ValidationError({"supply": "This supply is cancelled."})
            if supplier and supply.supplier_id != supplier.id:
                raise serializers.ValidationError({"supply": "This supply belongs to a different supplier."})
            bill = supply.purchase_invoice
            if bill and bill.status != SalesInvoice.Status.CANCELLED:
                raise serializers.ValidationError({"supply": f"This supply is already invoiced ({bill.invoice_number})."})
            if not supplier:
                attrs["supplier"] = supplier = supply.supplier

        if inv_type == SalesInvoice.InvoiceType.PURCHASE and not supplier:
            raise serializers.ValidationError({"supplier": "Select the supplier for a purchase invoice."})
        return attrs

    @staticmethod
    def _clean_items(items):
        out = []
        for n, row in enumerate(items or [], 1):
            desc = str(row.get("description") or "").strip()
            if not desc:
                continue
            try:
                qty = Decimal(str(row.get("quantity") or 0))
                price = Decimal(str(row.get("unit_price") or 0))
                rate = Decimal(str(row.get("tax_rate") or 0))
            except InvalidOperation:
                raise serializers.ValidationError({"items": f"Line {n}: quantity, price and tax must be numbers."})
            if qty <= 0 or price < 0 or rate < 0:
                raise serializers.ValidationError(
                    {"items": f"Line {n}: quantity must be above zero and price/tax cannot be negative."})
            pid = row.get("product") or None
            if pid and not Product.objects.filter(pk=pid).exists():
                pid = None
            out.append({"product_id": pid, "description": desc[:255],
                        "category": str(row.get("category") or "")[:100],
                        "quantity": qty, "unit_price": price, "tax_rate": rate})
        return out

    @staticmethod
    def _totals(items):
        cent = Decimal("0.01")
        sub = sum((i["quantity"] * i["unit_price"] for i in items), Decimal("0"))
        tax = sum((i["quantity"] * i["unit_price"] * i["tax_rate"] / 100 for i in items), Decimal("0"))
        return sub.quantize(cent), tax.quantize(cent)

    def _items_out(self, inv):
        if inv.sale_id:
            return [{
                "id": i.id, "description": i.product.name,
                "category": i.product.category.name if i.product.category else "",
                "quantity": i.quantity, "unit_price": i.unit_price, "tax_rate": i.tax_rate,
                "tax_amount": round(i.line_tax, 2), "line_total": round(i.line_total, 2),
            } for i in inv.sale.items.all()]
        rows = []
        for i in inv.line_items.all():
            net = i.quantity * i.unit_price
            tax = net * i.tax_rate / 100
            rows.append({
                "id": i.id, "product": i.product_id, "description": i.description, "category": i.category,
                "quantity": i.quantity, "unit_price": i.unit_price, "tax_rate": i.tax_rate,
                "tax_amount": round(tax, 2), "line_total": round(net + tax, 2),
            })
        return rows

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["items"] = self._items_out(instance)
        return data

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop("items", None)
        supply = validated_data.pop("supply", None)
        sale = validated_data.get("sale")

        if sale:
            customer = getattr(sale, "customer", None)
            if customer:
                validated_data.setdefault("billed_to_name", customer.name or "")
                validated_data.setdefault("billed_to_phone", customer.phone or "")
                validated_data.setdefault("billed_to_email", customer.email or "")
                validated_data.setdefault("billed_to_address", customer.address or "")
            validated_data["subtotal"] = sale.subtotal
            validated_data["discount_amount"] = sale.discount_amount
            validated_data["tax_amount"] = sale.tax_amount
            validated_data["total_amount"] = sale.total_amount
            validated_data["amount_paid"] = sale.amount_paid
            validated_data["balance_due"] = sale.balance_due
            return super().create(validated_data)

        clean = self._clean_items(items)
        if clean:
            validated_data["subtotal"], validated_data["tax_amount"] = self._totals(clean)
        inv = super().create(validated_data)
        InvoiceItem.objects.bulk_create([InvoiceItem(invoice=inv, **i) for i in clean])
        if supply:                                        # <- add
            supply.purchase_invoice = inv
            supply.save(update_fields=["purchase_invoice", "updated_at"])
        return inv
       

    @transaction.atomic
    def update(self, instance, validated_data):
        items = validated_data.pop("items", None)
        clean = None
        if items is not None and not instance.sale_id:
            clean = self._clean_items(items)
            if clean:
                validated_data["subtotal"], validated_data["tax_amount"] = self._totals(clean)
        inv = super().update(instance, validated_data)
        if clean is not None:
            inv.line_items.all().delete()
            InvoiceItem.objects.bulk_create([InvoiceItem(invoice=inv, **i) for i in clean])
        return inv
class EmployeeSerializer(serializers.ModelSerializer):
    # --- Read-only conveniences ---
    full_name = serializers.CharField(read_only=True)
    role_name = serializers.CharField(source="role.role_name", read_only=True, default=None)
    role_requires_login = serializers.BooleanField(source="role.requires_login", read_only=True, default=False)
    user_username = serializers.CharField(source="user.username", read_only=True, default=None)
    manager_name = serializers.SerializerMethodField()
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)
    employment_type_display = serializers.CharField(source="get_employment_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    gender_display = serializers.CharField(source="get_gender_display", read_only=True)

    # --- Derived state ---
    has_login = serializers.BooleanField(read_only=True)
    requires_login = serializers.BooleanField(read_only=True)
    system_access_state = serializers.CharField(read_only=True)

    date_of_birth = serializers.DateField(required=False, allow_null=True)
    hire_date = serializers.DateField(required=True)
    end_date = serializers.DateField(required=False, allow_null=True)

    class Meta:
        model = Employee
        fields = [
            "id",
            # Role + login
            "role", "role_name", "role_requires_login",
            "user", "user_username",
            "requires_login_override",
            "requires_login",
            "has_login",
            "system_access_state",
            # Identity
            "employee_number",
            "first_name", "middle_name", "last_name", "full_name",
            "gender", "gender_display", "date_of_birth", "national_id",
            # Contact
            "personal_email", "work_email", "phone", "alt_phone", "address",
            # Employment
            "position", "department",
            "employment_type", "employment_type_display",
            "status", "status_display",
            "hire_date", "end_date",
            "manager", "manager_name",
            "branch", "branch_name",
            # Compensation
            "basic_salary", "bank_name", "bank_account",
            # Statutory
            "nssf_number", "nhif_number", "kra_pin",
            # Emergency
            "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
            # Notes
            "notes",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "employee_number", "created_at", "updated_at"]

    def get_manager_name(self, obj):
        return obj.manager.full_name if obj.manager else None

    def to_internal_value(self, data):
        mutable = data.copy() if hasattr(data, "copy") else dict(data)
        for key in ("date_of_birth", "hire_date", "end_date"):
            if key in mutable and mutable.get(key) == "":
                mutable[key] = None
        for key in ("manager", "branch", "role", "user"):
            if key in mutable and mutable.get(key) in ("", None):
                mutable[key] = None
        if "basic_salary" in mutable and mutable.get("basic_salary") == "":
            mutable["basic_salary"] = None
        return super().to_internal_value(mutable)
    def validate_hire_date(self, value):
        if value is None:
            raise serializers.ValidationError("Hire date is required.")
        return value

    def validate_first_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("First name is required.")
        return value.strip()

    def validate_last_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Last name is required.")
        return value.strip()

    def validate_position(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Position is required.")
        return value.strip()

    def validate_user(self, value):
        if value is None:
            return value
        qs = Employee.objects.filter(user=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                "This user is already linked to another employee record."
            )
        return value

    def validate(self, attrs):
        hire = attrs.get("hire_date") or getattr(self.instance, "hire_date", None)
        end = attrs.get("end_date") or getattr(self.instance, "end_date", None)
        if hire and end and end < hire:
            raise serializers.ValidationError(
                {"end_date": "End date cannot be earlier than the hire date."}
            )

        # Consistency: if a user is being linked, the role must match.
        user = attrs.get("user") or getattr(self.instance, "user", None)
        role = attrs.get("role") or getattr(self.instance, "role", None)
        if user and role and user.role_id and user.role_id != role.id:
            raise serializers.ValidationError({
                "role": (
                    f"Linked user '{user.username}' has role "
                    f"'{user.role.role_name}', which doesn't match "
                    f"the employee role '{role.role_name}'."
                )
            })

        # Cannot link a user for an HR-only employee.
        override = attrs.get("requires_login_override", getattr(self.instance, "requires_login_override", None))
        if user and override is False:
            raise serializers.ValidationError({
                "user": "This employee is marked HR-only (requires_login_override=False). "
                        "Clear the override before linking a user account."
            })

        # Self-management guard.
        manager = attrs.get("manager")
        if manager and self.instance and manager.pk == self.instance.pk:
            raise serializers.ValidationError(
                {"manager": "An employee cannot be their own manager."}
            )

        return attrs
class ComplianceRecordSerializer(serializers.ModelSerializer):
    document_type_display = serializers.CharField(source="get_document_type_display", read_only=True)
    application_status_display = serializers.CharField(source="get_application_status_display", read_only=True)
    file_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    MAX_UPLOAD_MB = 10

    class Meta:
        model = ComplianceRecord
        fields = [
            "id", "document_type", "document_type_display",
            "application_status", "application_status_display",
            "title", "file", "file_url", "expiry_date", "next_renewal_date", "notes",
            "uploaded_by", "uploaded_by_name", "created_at", "updated_at",
        ]
        read_only_fields = ["uploaded_by", "created_at", "updated_at"]
        extra_kwargs = {"file": {"write_only": True}}

    def get_file_url(self, obj):
        if not obj.file:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.file.url) if request else obj.file.url

    def get_uploaded_by_name(self, obj):
        u = obj.uploaded_by
        if not u:
            return "—"
        return f"{u.firstname} {u.lastname}".strip() or u.username

    def validate_file(self, value):
        if value.size > self.MAX_UPLOAD_MB * 1024 * 1024:
            raise serializers.ValidationError(f"File is too large (max {self.MAX_UPLOAD_MB} MB).")
        return value

    def validate_title(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Title is required.")
        return value.strip()
class SalaryPaymentSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    employee_number = serializers.CharField(source="employee.employee_number", read_only=True)
    position = serializers.CharField(source="employee.position", read_only=True)
    branch_name = serializers.CharField(source="employee.branch.name", read_only=True, default=None)
    bank_name = serializers.CharField(source="employee.bank_name", read_only=True)
    bank_account = serializers.CharField(source="employee.bank_account", read_only=True)
    period_label = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    payment_method_display = serializers.CharField(source="get_payment_method_display", read_only=True)
    paid_by_name = serializers.SerializerMethodField()

    MONEY_FIELDS = [
        "basic_salary", "allowances", "overtime", "bonus",
        "paye", "nssf", "health_insurance", "housing_levy", "advance_recovery", "other_deductions",
    ]

    class Meta:
        model = SalaryPayment
        fields = [
            "id", "employee", "employee_name", "employee_number", "position", "branch_name",
            "bank_name", "bank_account",
            "period", "period_label",
            "basic_salary", "allowances", "overtime", "bonus",
            "paye", "nssf", "health_insurance", "housing_levy", "advance_recovery", "other_deductions",
            "gross_pay", "total_deductions", "net_pay",
            "status", "status_display",
            "payment_method", "payment_method_display", "reference", "paid_on",
            "paid_by", "paid_by_name",
            "notes", "created_by", "created_at", "updated_at",
        ]
        read_only_fields = [
            "gross_pay", "total_deductions", "net_pay",
            "status", "payment_method", "reference", "paid_on", "paid_by",
            "created_by", "created_at", "updated_at",
        ]
        # If omitted on create, defaults to the employee's basic_salary
        extra_kwargs = {"basic_salary": {"required": False}}

    def get_period_label(self, obj):
        return obj.period.strftime("%B %Y")

    def get_paid_by_name(self, obj):
        u = obj.paid_by
        if not u:
            return None
        return f"{u.firstname} {u.lastname}".strip() or u.username

    def validate_period(self, value):
        return value.replace(day=1)

    def validate(self, attrs):
        inst = self.instance

        if inst and inst.status != SalaryPayment.Status.DRAFT:
            raise serializers.ValidationError(
                f"A {inst.get_status_display().lower()} salary record can't be edited."
            )

        employee = attrs.get("employee") or (inst.employee if inst else None)
        if inst and "employee" in attrs and attrs["employee"].pk != inst.employee_id:
            raise serializers.ValidationError({"employee": "The employee can't be changed. Delete and recreate instead."})

        period = attrs.get("period") or (inst.period if inst else None)

        # Default basic salary from the employee record
        if "basic_salary" not in attrs and not inst:
            if employee.basic_salary is None:
                raise serializers.ValidationError(
                    {"basic_salary": "This employee has no basic salary on file. Enter one."}
                )
            attrs["basic_salary"] = employee.basic_salary

        # One live payslip per employee per month
        dup = SalaryPayment.objects.filter(employee=employee, period=period).exclude(
            status=SalaryPayment.Status.CANCELLED
        )
        if inst:
            dup = dup.exclude(pk=inst.pk)
        if dup.exists():
            raise serializers.ValidationError(
                f"{employee.full_name} already has a salary record for {period:%B %Y}."
            )

        # Net pay can't go negative
        def val(name):
            if name in attrs:
                return attrs[name]
            return getattr(inst, name) if inst else Decimal("0")

        gross = sum(val(n) for n in ["basic_salary", "allowances", "overtime", "bonus"])
        deductions = sum(val(n) for n in [
            "paye", "nssf", "health_insurance", "housing_levy", "advance_recovery", "other_deductions",
        ])
        if deductions > gross:
            raise serializers.ValidationError(
                f"Deductions ({deductions}) exceed gross pay ({gross}). Net pay would be negative."
            )
        return attrs

class ChequeDepositSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True, default=None)
    sale_order_number = serializers.CharField(source="sale.order_number", read_only=True, default=None)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)
    deposited_by_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    is_post_dated = serializers.BooleanField(read_only=True)
    is_stale = serializers.BooleanField(read_only=True)

    cheque_date = serializers.DateField(required=True)
    received_on = serializers.DateField(required=False)

    class Meta:
        model = ChequeDeposit
        fields = [
            "id", "cheque_number", "drawer_name", "drawer_bank", "amount",
            "cheque_date", "received_on", "is_post_dated", "is_stale",
            "customer", "customer_name", "sale", "sale_order_number", "branch", "branch_name",
            "status", "status_display",
            "deposit_bank", "deposit_account", "deposit_slip_no", "deposited_on",
            "deposited_by", "deposited_by_name",
            "cleared_on", "bounced_on", "bounce_reason", "payment",
            "notes", "created_by", "created_by_name", "created_at", "updated_at",
        ]
        read_only_fields = [
            "status", "deposit_bank", "deposit_account", "deposit_slip_no", "deposited_on",
            "deposited_by", "cleared_on", "bounced_on", "bounce_reason", "payment",
            "created_by", "created_at", "updated_at",
        ]
        extra_kwargs = {
            "customer": {"required": False, "allow_null": True},
            "sale": {"required": False, "allow_null": True},
            "branch": {"required": False, "allow_null": True},
        }

    def _user_name(self, u):
        if not u:
            return None
        return f"{u.firstname} {u.lastname}".strip() or u.username

    def get_deposited_by_name(self, obj):
        return self._user_name(obj.deposited_by)

    def get_created_by_name(self, obj):
        return self._user_name(obj.created_by)

    def to_internal_value(self, data):
        mutable = data.copy() if hasattr(data, "copy") else dict(data)
        for key in ("customer", "sale", "branch"):
            if mutable.get(key) == "":
                mutable[key] = None
        if mutable.get("received_on") == "":
            mutable.pop("received_on")
        return super().to_internal_value(mutable)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate_cheque_number(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Cheque number is required.")
        return value.strip()

    def validate_drawer_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Drawer name is required.")
        return value.strip()

    def validate_drawer_bank(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Drawer bank is required.")
        return value.strip()

    def validate(self, attrs):
        inst = self.instance
        if inst and inst.status != ChequeDeposit.Status.RECEIVED:
            raise serializers.ValidationError(
                f"A {inst.get_status_display().lower()} cheque can't be edited."
            )

        def pick(name):
            return attrs[name] if name in attrs else getattr(inst, name, None)

        sale, customer = pick("sale"), pick("customer")
        if sale and not customer and sale.customer_id:
            attrs["customer"] = customer = sale.customer
        if sale and customer and sale.customer_id and sale.customer_id != customer.id:
            raise serializers.ValidationError({"sale": "This sale belongs to a different customer."})

        number, bank = pick("cheque_number"), pick("drawer_bank")
        dup = ChequeDeposit.objects.filter(cheque_number=number, drawer_bank__iexact=bank).exclude(
            status__in=[ChequeDeposit.Status.CANCELLED, ChequeDeposit.Status.BOUNCED]
        )
        if inst:
            dup = dup.exclude(pk=inst.pk)
        if dup.exists():
            raise serializers.ValidationError(
                {"cheque_number": f"Cheque {number} from {bank} is already recorded."}
            )
        return attrs


class SupplierSerializer(serializers.ModelSerializer):
    payment_terms_display = serializers.CharField(source="get_payment_terms_display", read_only=True)
    payment_method_display = serializers.CharField(source="get_payment_method_display", read_only=True)
    total_billed = serializers.SerializerMethodField()
    total_paid = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = [
            "id", "name", "contact_person", "head_office_contact", "phone", "alt_phone", "email",
            "address", "location", "kra_pin",
            "payment_method", "payment_method_display", "account_name",
            "bank_name", "bank_account", "mpesa_paybill", "mpesa_account",
            "payment_terms", "payment_terms_display",
            "notes", "total_billed", "total_paid", "balance", "payment_status",
            "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def _money(self, obj):
        if hasattr(obj, "total_billed"):          # annotated by the viewset
            return float(obj.total_billed), float(obj.total_paid)
        billed = obj.purchase_invoices.exclude(status="cancelled").filter(invoice_type="purchase") \
            .aggregate(t=Sum("total_amount"))["t"] or 0
        paid = obj.business_payments.filter(status="paid").aggregate(t=Sum("amount"))["t"] or 0
        return float(billed), float(paid)

    def get_total_billed(self, obj):
        return self._money(obj)[0]

    def get_total_paid(self, obj):
        return self._money(obj)[1]

    def get_balance(self, obj):
        billed, paid = self._money(obj)
        return round(billed - paid, 2)

    def get_payment_status(self, obj):
        billed, paid = self._money(obj)
        if paid <= 0:
            return "not_paid" if billed > 0 else None
        return "paid" if paid >= billed else "partial"
    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Supplier name is required.")
        qs = Supplier.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A supplier with this name already exists.")
        return value

    def validate_kra_pin(self, value):
        return value.strip().upper()
    def validate(self, attrs):
        def pick(name):
            return attrs[name] if name in attrs else getattr(self.instance, name, "")

        method = pick("payment_method")
        errors = {}
        if method == "bank":
            if not (pick("bank_name") or "").strip():
                errors["bank_name"] = "Enter the bank name."
            if not (pick("bank_account") or "").strip():
                errors["bank_account"] = "Enter the account number."
        elif method == "mpesa":
            if not (pick("mpesa_paybill") or "").strip():
                errors["mpesa_paybill"] = "Enter the paybill number."
            if not (pick("mpesa_account") or "").strip():
                errors["mpesa_account"] = "Enter the M-Pesa account number."
        if errors:
            raise serializers.ValidationError(errors)

        # Only tidy up when the method is being set, so old records keep their bank details
        if "payment_method" in attrs:
            if method == "bank":
                attrs.update(mpesa_paybill="", mpesa_account="")
            elif method == "mpesa":
                attrs.update(bank_name="", bank_account="")
            else:
                attrs.update(bank_name="", bank_account="", mpesa_paybill="", mpesa_account="", account_name="")
        return attrs

class PettyCashExpenseSerializer(serializers.ModelSerializer):
    cashier_name = serializers.SerializerMethodField()
    branch_name = serializers.CharField(source="branch.name", read_only=True, default="")
    reviewed_by_name = serializers.SerializerMethodField()
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = PettyCashExpense
        fields = [
            "id", "branch", "branch_name", "cashier", "cashier_name",
            "category", "category_display", "description", "amount", "expense_date",
            "receipt_number", "receipt_image",
            "status", "status_display", "reviewed_by", "reviewed_by_name", "reviewed_at", "review_note",
            "created_at", "updated_at",
        ]
        # The cashier is always the logged-in user; status only changes via approve/reject.
        read_only_fields = ["cashier", "status", "reviewed_by", "reviewed_at", "review_note",
                            "created_at", "updated_at"]

    @staticmethod
    def _name(u):
        if not u:
            return ""
        return f"{u.firstname} {u.lastname}".strip() or u.username

    def get_cashier_name(self, obj):
        return self._name(obj.cashier) or "—"

    def get_reviewed_by_name(self, obj):
        return self._name(obj.reviewed_by)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate_expense_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Expense date cannot be in the future.")
        return value

    def validate_description(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Describe what the money was spent on.")
        return value

class BusinessPaymentSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    method_display = serializers.CharField(source="get_method_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True, default=None)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)
    purchase_invoice_number = serializers.CharField(source="purchase_invoice.invoice_number", read_only=True, default=None)
    invoice_balance = serializers.DecimalField(source="purchase_invoice.balance_due", max_digits=12,
                                               decimal_places=2, read_only=True, default=None)
    invoice_payment_status = serializers.CharField(source="purchase_invoice.payment_status", read_only=True, default=None)
    created_by_name = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = BusinessPayment
        fields = [
            "id", "category", "category_display", "supplier", "supplier_name", "payee",
            "branch", "branch_name", "description", "amount", "payment_date", "period",
            "method", "method_display", "reference", "invoice_number",
            "attachment", "attachment_url",
            "status", "status_display", "cancel_reason","invoice_balance", "invoice_payment_status","purchase_invoice", "purchase_invoice_number",
            "created_by", "created_by_name", "created_at", "updated_at",
        ]
        read_only_fields = ["status", "cancel_reason", "created_by", "created_at", "updated_at"]
        extra_kwargs = {
            "attachment": {"write_only": True, "required": False},
            "supplier": {"required": False, "allow_null": True},
            "branch": {"required": False, "allow_null": True},
            "period": {"required": False, "allow_null": True},
        }

    def get_created_by_name(self, obj):
        u = obj.created_by
        if not u:
            return "—"
        return f"{u.firstname} {u.lastname}".strip() or u.username

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.attachment.url) if request else obj.attachment.url

    def to_internal_value(self, data):
        mutable = data.copy() if hasattr(data, "copy") else dict(data)
        for key in ("supplier", "branch", "period"):
            if mutable.get(key) == "":
                mutable[key] = None
        # A blank or non-file attachment means "no file", not an error
        att = mutable.get("attachment")
        if att in ("", None) or isinstance(att, (str, dict)):
            mutable.pop("attachment", None)
        return super().to_internal_value(mutable)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate_payment_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Payment date cannot be in the future.")
        return value

    def validate_period(self, value):
        return value.replace(day=1) if value else value

    def validate(self, attrs):
        inst = self.instance
        if inst and inst.status == BusinessPayment.Status.CANCELLED:
            raise serializers.ValidationError("A cancelled payment can't be edited.")

        def pick(name):
            return attrs[name] if name in attrs else getattr(inst, name, None)

        C = BusinessPayment.Category
        category, supplier = pick("category"), pick("supplier")
        payee, invoice, amount = (pick("payee") or "").strip(), pick("purchase_invoice"), pick("amount")

        if category not in (C.SUPPLIER, C.INVOICE):
            attrs["supplier"] = None
            attrs["purchase_invoice"] = None
            if not payee:
                raise serializers.ValidationError({"payee": "Enter who was paid."})
            return attrs

        if invoice:
            if invoice.invoice_type != SalesInvoice.InvoiceType.PURCHASE or not invoice.supplier_id:
                raise serializers.ValidationError({"purchase_invoice": "Choose a supplier bill."})
            if invoice.status == SalesInvoice.Status.CANCELLED:
                raise serializers.ValidationError({"purchase_invoice": "This bill is cancelled."})
            attrs["supplier"] = supplier = invoice.supplier
            others = invoice.payments_made.filter(status="paid")
            if inst:
                others = others.exclude(pk=inst.pk)
            already = others.aggregate(t=Sum("amount"))["t"] or Decimal("0.00")
           

        if category == C.SUPPLIER and not supplier:
            raise serializers.ValidationError({"supplier": "Select the supplier you are paying."})
        if category == C.INVOICE and not supplier and not payee:
            raise serializers.ValidationError({"payee": "Select a supplier or enter who was paid."})
        return attrs

class StoreStockSerializer(serializers.ModelSerializer):
    product_detail = ProductMiniSerializer(source="product", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    item_number = serializers.CharField(source="product.item_number", read_only=True)
    category_name = serializers.CharField(source="product.category.name", read_only=True, default=None)
    is_low_stock = serializers.BooleanField(read_only=True)
    cost_price = serializers.DecimalField(source="product.cost_price", max_digits=12,
                                          decimal_places=2, read_only=True)
    issue_units = serializers.SerializerMethodField()
    total_value = serializers.SerializerMethodField()
    damaged_value = serializers.SerializerMethodField()
    expired_value = serializers.SerializerMethodField()
    returned_value = serializers.SerializerMethodField()
    issue_value = serializers.SerializerMethodField()
    manufacturer = serializers.CharField(source="product.manufacturer", read_only=True, default="")
    supplier_name = serializers.SerializerMethodField()

    class Meta:
        model = StoreStock
        fields = [
                "id", "product", "product_detail", "product_name", "item_number", "category_name",
                "quantity", "reorder_level", "cost_price", "total_value",
                "damaged_quantity", "expired_quantity","damaged_value","expired_value","manufacturer","supplier_name","returned_value","issue_value", "returned_quantity", "issue_units",
                "is_low_stock", "updated_at",
            ]
        read_only_fields = ["quantity", "damaged_quantity", "expired_quantity",
                                "returned_quantity", "updated_at"]
    def _val(self, obj, qty):
        return round(qty * obj.product.cost_price, 2)
    def get_damaged_value(self, obj):  return self._val(obj, obj.damaged_quantity)
    def get_expired_value(self, obj):  return self._val(obj, obj.expired_quantity)
    def get_returned_value(self, obj): return self._val(obj, obj.returned_quantity)
    def get_issue_value(self, obj):    return self._val(obj, obj.issue_units_count())
    def get_issue_units(self,obj):
        return obj.damaged_quantity + obj.expired_quantity + obj.returned_quantity
    def get_supplier_name(self, obj):
         return getattr(obj, "last_supplier", None) or ""
    def get_issue_value(self, obj):
        return self._val(obj, obj.damaged_quantity + obj.expired_quantity + obj.returned_quantity)
    def validate_reorder_level(self, value):
        if value < 0:
            raise serializers.ValidationError("Reorder level cannot be negative.")
        return value
    def get_total_value(self, obj):
        return round(obj.quantity * obj.product.cost_price, 2)


class StoreMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    item_number = serializers.CharField(source="product.item_number", read_only=True)
    movement_type_display = serializers.CharField(source="get_movement_type_display", read_only=True)
    confirmed_by_name = serializers.SerializerMethodField()
    authorised_by_name = serializers.SerializerMethodField()
    loss_value = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StoreMovement
        fields = [
            "id", "product", "product_name", "item_number",
            "movement_type", "movement_type_display", "quantity_change", "balance_after",
            "note","confirmed_by","authorised_by","confirmed_by_name","unit_cost", "loss_value", "authorised_by_name","created_by", "created_by_name", "created_at",
        ]
        read_only_fields = fields
    def _name(self, u):
        return (f"{u.firstname} {u.lastname}".strip() or u.username) if u else ""
    def get_loss_value(self, obj):
        return round(abs(obj.quantity_change) * (obj.unit_cost or 0), 2)
    def get_confirmed_by_name(self, obj):
        return self._name(obj.confirmed_by)

    def get_authorised_by_name(self, obj):
        return self._name(obj.authorised_by)
    def get_created_by_name(self, obj):
        u = obj.created_by
        if not u:
            return "System"
        return f"{u.firstname} {u.lastname}".strip() or u.username
    

class DepositSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    deposited_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Deposit
        fields = ["id", "branch", "branch_name", "deposited_by", "deposited_by_name",
                  "amount", "deposit_date", "created_at"]

    def get_deposited_by_name(self, obj):
        u = obj.deposited_by
        return f"{u.firstname} {u.lastname}".strip() or u.username

    def validate_amount(self, v):
        if v <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return v
TERMS_DAYS = {"cash": 0, "net_7": 7, "net_14": 14, "net_30": 30, "net_60": 60}


def build_supply_bill(supply, tax_rate=Decimal("0"), due_date=None):
    """Create a purchase invoice for a supply, with one line per supply item.
    VAT is taken from each line's own tax_rate (0 = not taxed)."""
    supplier = supply.supplier
    items = list(supply.items.select_related("product", "product__category"))
    cent = Decimal("0.01")
    subtotal = sum((i.unit_cost * i.quantity for i in items), Decimal("0"))
    tax = sum((i.unit_cost * i.quantity * i.tax_rate / 100 for i in items), Decimal("0"))
    if due_date is None:
        days = TERMS_DAYS.get(supplier.payment_terms, 0)
        due_date = supply.supply_date + _td(days=days) if days else None

    bill = SalesInvoice.objects.create(
        invoice_type=SalesInvoice.InvoiceType.PURCHASE,
        supplier=supplier,
        status=SalesInvoice.Status.ISSUED,
        issue_date=supply.supply_date,
        due_date=due_date,
        billed_to_name=supplier.name, billed_to_phone=supplier.phone,
        billed_to_email=supplier.email, billed_to_address=supplier.address,
        subtotal=subtotal.quantize(cent), tax_amount=tax.quantize(cent),
        notes=f"Supply {supply.reference}",
        extra_data={"supplier_ref": supply.supplier_ref, "supply": supply.reference},
    )
    InvoiceItem.objects.bulk_create([
        InvoiceItem(
            invoice=bill, product=i.product, description=i.product.name,
            category=i.product.category.name if i.product.category else "",
            quantity=i.quantity, unit_price=i.unit_cost, tax_rate=i.tax_rate,
        ) for i in items
    ])
    supply.purchase_invoice = bill
    supply.save(update_fields=["purchase_invoice", "updated_at"])
    return bill

def sync_supply_bill(supply):
    """After an edit, refresh the supply's invoice (supplier, dates, lines, totals)."""
    bill = supply.purchase_invoice
    if not bill or bill.status == SalesInvoice.Status.CANCELLED:
        return
    items = list(supply.items.select_related("product", "product__category"))
    cent = Decimal("0.01")
    subtotal = sum((i.unit_cost * i.quantity for i in items), Decimal("0"))
    tax = sum((i.unit_cost * i.quantity * i.tax_rate / 100 for i in items), Decimal("0"))
    supplier = supply.supplier
    days = TERMS_DAYS.get(supplier.payment_terms, 0)

    bill.supplier = supplier
    bill.issue_date = supply.supply_date
    bill.due_date = supply.supply_date + _td(days=days) if days else None
    bill.billed_to_name, bill.billed_to_phone = supplier.name, supplier.phone
    bill.billed_to_email, bill.billed_to_address = supplier.email, supplier.address
    bill.subtotal = subtotal.quantize(cent)
    bill.tax_amount = tax.quantize(cent)
    bill.extra_data = {**(bill.extra_data or {}), "supplier_ref": supply.supplier_ref}
    bill.save()
    bill.line_items.all().delete()
    InvoiceItem.objects.bulk_create([
        InvoiceItem(
            invoice=bill, product=i.product, description=i.product.name,
            category=i.product.category.name if i.product.category else "",
            quantity=i.quantity, unit_price=i.unit_cost, tax_rate=i.tax_rate,
        ) for i in items
    ])
# ---------- serializers ----------
class SupplyItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    item_number = serializers.CharField(source="product.item_number", read_only=True)
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = SupplyItem
        fields = ["id", "product", "product_name", "item_number", "quantity", "unit_cost", "tax_rate", "line_total"]


class SupplyItemWriteSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.IntegerField(min_value=1)
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0, min_value=0)
    tax_rate = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, default=0,
                                        min_value=0, max_value=100)


class SupplySerializer(serializers.ModelSerializer):
    """Read serializer (list + detail)."""
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    supplier_phone = serializers.CharField(source="supplier.phone", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    received_by_name = serializers.SerializerMethodField()
    purchase_invoice_number = serializers.CharField(source="purchase_invoice.invoice_number", read_only=True, default=None)
    items = SupplyItemSerializer(many=True, read_only=True)
    total_cost = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_units = serializers.SerializerMethodField()
    has_invoice = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    invoice_total = serializers.SerializerMethodField()
    amount_paid = serializers.SerializerMethodField()
    balance_due = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()

    class Meta:
        model = Supply
        fields = [
            "id", "reference", "supplier", "supplier_name", "supplier_phone",
            "supply_date", "supplier_ref", "status", "status_display", "notes",
            "purchase_invoice", "purchase_invoice_number", "has_invoice", "can_edit",
            "items", "total_units", "total_cost",            "items", "total_units", "total_cost",
            "invoice_total", "amount_paid", "balance_due", "payment_status", "payments",
            "received_by", "received_by_name", "created_at", "updated_at",
        ]

    def get_received_by_name(self, obj):
        u = obj.received_by
        return (f"{u.firstname} {u.lastname}".strip() or u.username) if u else "—"

    def get_total_units(self, obj):
        return sum(i.quantity for i in obj.items.all())

    def get_has_invoice(self, obj):
        b = obj.purchase_invoice
        return bool(b and b.status != SalesInvoice.Status.CANCELLED)

    def get_can_edit(self, obj):
        if obj.status != Supply.Status.RECEIVED:
            return False
        b = obj.purchase_invoice
        return not (b and b.payments_made.filter(status="paid").exists())
    def _live_payments(self, obj):
        b = obj.purchase_invoice
        if not b or b.status == SalesInvoice.Status.CANCELLED:
            return []
        # sorted in Python so a prefetch on payments_made is used
        return sorted(b.payments_made.all(), key=lambda p: (p.payment_date, p.id), reverse=True)

    def _paid(self, obj):
        return sum((p.amount for p in self._live_payments(obj) if p.status == "paid"), Decimal("0.00"))

    def get_invoice_total(self, obj):
        b = obj.purchase_invoice
        return b.total_amount if b and b.status != SalesInvoice.Status.CANCELLED else None

    def get_amount_paid(self, obj):
        return self._paid(obj)

    def get_balance_due(self, obj):
        total = self.get_invoice_total(obj)
        return None if total is None else total - self._paid(obj)

    def get_payment_status(self, obj):
        total = self.get_invoice_total(obj)
        if total is None:
            return None
        paid = self._paid(obj)
        if paid <= 0:
            return "not_paid"
        return "paid" if paid >= total else "partial"

    def get_payments(self, obj):
        return BusinessPaymentSerializer(self._live_payments(obj), many=True, context=self.context).data


class SupplyWriteSerializer(serializers.ModelSerializer):
    """
    Used for POST (create) and PUT (edit):
    {
      "supplier": 3, "supply_date": "2026-10-13", "supplier_ref": "DN-4471", "notes": "",
      "create_bill": true,        // create only: also generate the purchase invoice
      "tax_rate": 16,             // create only, optional: VAT % put on the invoice lines
      "update_cost_price": false, // set each product's cost_price to the unit_cost entered
      "items": [{"product": 12, "quantity": 50, "unit_cost": 120}, ...]
    }
    On PUT, `items` is the complete new list of lines.
    """
    items = SupplyItemWriteSerializer(many=True, write_only=True)
    create_bill = serializers.BooleanField(write_only=True, required=False, default=False)
    tax_rate = serializers.DecimalField(max_digits=5, decimal_places=2, write_only=True,
                                        required=False, default=0, min_value=0)
    update_cost_price = serializers.BooleanField(write_only=True, required=False, default=False)
    received_by = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), required=False, allow_null=True)


    class Meta:
        model = Supply
        fields = ["id", "reference", "supplier", "supply_date", "supplier_ref", "notes",
                "received_by", "items", "create_bill", "tax_rate", "update_cost_price"]
        read_only_fields = ["id", "reference"]

    def validate_supplier(self, value):
        unchanged = self.instance and value.pk == self.instance.supplier_id
        if not value.is_active and not unchanged:
            raise serializers.ValidationError("This supplier is inactive.")
        return value

    def validate_supply_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("Supply date cannot be in the future.")
        return value

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("Add at least one product.")
        seen = set()
        for it in items:
            pid = it["product"].pk
            if pid in seen:
                raise serializers.ValidationError(
                    f"'{it['product'].name}' is listed more than once. Combine it into one line.")
            seen.add(pid)
        return items

    def validate(self, attrs):
        if attrs.get("create_bill") and not self.instance:
            if sum(i["quantity"] * i["unit_cost"] for i in attrs["items"]) <= 0:
                raise serializers.ValidationError(
                    {"create_bill": "Enter unit costs before creating an invoice (total is zero)."})
        return attrs

    def _user(self):
        request = self.context.get("request")
        return request.user if request and request.user.is_authenticated else None

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop("items")
        create_bill = validated_data.pop("create_bill", False)
        tax_rate = validated_data.pop("tax_rate", Decimal("0"))
        update_cost = validated_data.pop("update_cost_price", False)
        user = self._user()
        received_by = validated_data.pop("received_by", None) or user
        supply = Supply.objects.create(received_by=received_by, **validated_data)

        for it in items:
            product, qty, cost = it["product"], it["quantity"], it["unit_cost"]
            SupplyItem.objects.create(supply=supply, product=product, quantity=qty,
                          unit_cost=cost, tax_rate=it["tax_rate"])
            row, _ = StoreStock.objects.select_for_update().get_or_create(
                product=product, defaults={"quantity": 0})
            row.quantity += qty
            row.save(update_fields=["quantity", "updated_at"])
            StoreMovement.objects.create(
                product=product, movement_type=StoreMovement.MovementType.RECEIVED,
                quantity_change=qty, balance_after=row.quantity,
                note=f"Supply {supply.reference} from {supply.supplier.name}", created_by=user,
            )
            if update_cost and cost > 0:
                product.cost_price = cost
                product.save(update_fields=["cost_price", "updated_at"])

        if create_bill:
            build_supply_bill(supply, tax_rate=tax_rate)
        return supply

    @transaction.atomic
    def update(self, instance, validated_data):
        items = validated_data.pop("items")
        validated_data.pop("create_bill", None)
        validated_data.pop("tax_rate", None)
        validated_data.pop("received_by", None)
        update_cost = validated_data.pop("update_cost_price", False)
        received_by = validated_data.pop("received_by", None)
        user = self._user()

        supply = Supply.objects.select_for_update().get(pk=instance.pk)
        

        if supply.status != Supply.Status.RECEIVED:
            raise serializers.ValidationError("A cancelled supply can't be edited.")
        if supply.purchase_invoice and supply.purchase_invoice.payments_made.filter(status="paid").exists():
            raise serializers.ValidationError(
                "The invoice for this supply has payments. Cancel those payments before editing.")

        old = {i.product_id: i.quantity for i in supply.items.all()}
        new = {it["product"].pk: it for it in items}
        products = Product.objects.in_bulk(set(old) | set(new))

        # 1) Work out the change per product and check the Store can take it
        deltas, rows = {}, {}
        for pid in set(old) | set(new):
            delta = (new[pid]["quantity"] if pid in new else 0) - old.get(pid, 0)
            if delta == 0:
                continue
            row, _ = StoreStock.objects.select_for_update().get_or_create(
                product_id=pid, defaults={"quantity": 0})
            if row.quantity + delta < 0:
                raise serializers.ValidationError(
                    f'Can\'t reduce "{products[pid].name}" by {abs(delta)}: only {row.quantity} '
                    f"left in the store. Some may already have been moved to Head Office.")
            deltas[pid], rows[pid] = delta, row

        # 2) Apply the stock changes
        for pid, delta in deltas.items():
            row = rows[pid]
            row.quantity += delta
            row.save(update_fields=["quantity", "updated_at"])
            StoreMovement.objects.create(
                product=products[pid], movement_type=StoreMovement.MovementType.ADJUSTMENT,
                quantity_change=delta, balance_after=row.quantity,
                note=f"Edited supply {supply.reference}", created_by=user,
            )

        # 3) Save the supply and replace its lines
        if received_by:
                    supply.received_by = received_by
        for field in ("supplier", "supply_date", "supplier_ref", "notes"):
            if field in validated_data:
                setattr(supply, field, validated_data[field])
        supply.save()
        supply.items.all().delete()
        SupplyItem.objects.bulk_create([
            SupplyItem(supply=supply, product=it["product"], quantity=it["quantity"],
                       unit_cost=it["unit_cost"], tax_rate=it["tax_rate"])
            for it in items
        ])
           
        if update_cost:
            for it in items:
                if it["unit_cost"] > 0:
                    it["product"].cost_price = it["unit_cost"]
                    it["product"].save(update_fields=["cost_price", "updated_at"])

        # 4) Keep the invoice in step with the new lines
        sync_supply_bill(supply)
        return supply

    def to_representation(self, instance):
        return SupplySerializer(instance, context=self.context).data
