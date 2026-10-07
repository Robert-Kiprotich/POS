from django.db import transaction
from rest_framework import serializers
from users.models import User, Roles
from .utils import get_head_office_branch
import datetime
import pytz
from decimal import *

from .models import *

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
            "image", "image_url", "is_active", "total_stock",
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
        return max(
            obj.total_amount - obj.amount_paid,
            Decimal("0.00")
        )



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
class SaleReceiptSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    sale_type = serializers.SerializerMethodField()
    grand_total = serializers.DecimalField(source="total_amount", max_digits=12, decimal_places=2, read_only=True)
    receipt_text = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = ["id", "order_number", "customer_name", "sale_type", "grand_total", "created_at", "receipt_text"]

    def get_customer_name(self, obj):
        return obj.customer.name if obj.customer else "Walk-in Customer"

    def get_sale_type(self, obj):
        return obj.sale_type
    def get_receipt_text(self, obj):
        lines = [
            f"Receipt: {obj.order_number}",
            f"Date: {obj.created_at:%d %b %Y %H:%M}",
            f"Customer: {self.get_customer_name(obj)}",
            "-" * 30,
        ]
        for i in obj.items.all():
            lines.append(f"{i.quantity} x {i.product.name} @ {i.unit_price} = {i.line_total:.2f}")
        lines += [
            "-" * 30,
            f"Total: {obj.total_amount}",
            f"Paid:  {obj.amount_paid}",
            f"Balance: {obj.balance_due}",
        ]
        return "\n".join(lines)

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
        return max(obj.total_amount - obj.amount_paid, Decimal("0.00"))

    def get_profit(self, obj):
        revenue = sum((i.unit_price * i.quantity for i in obj.items.all()), Decimal("0.00"))
        cost = sum((i.product.cost_price * i.quantity for i in obj.items.all()), Decimal("0.00"))
        return revenue - cost - (obj.discount_amount or Decimal("0.00"))

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

            if item["quantity"] > branch_stock.stock_quantity:
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
    invoice_type_display = serializers.CharField(source="get_invoice_type_display", read_only=True)
    sale_order_number = serializers.CharField(source="sale.order_number", read_only=True, default=None)
    branch_name = serializers.CharField(source="sale.branch.name", read_only=True, default=None)
    customer_name = serializers.CharField(source="sale.customer.name", read_only=True, default=None)

    # --- Explicit date fields so "" from the frontend is coerced safely ---
    issue_date = serializers.DateField(required=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True, default=None)
    payment_status = serializers.CharField(read_only=True)

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

    def to_internal_value(self, data):
        mutable = data.copy() if hasattr(data, "copy") else dict(data)
        for key in ("due_date", "issue_date","supplier"):
            if mutable.get(key) == "":
                mutable[key] = None
        return super().to_internal_value(mutable)

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
        return attrs

    def create(self, validated_data):
        """
        With a sale: snapshot money + billed-to info from it.
        Without a sale: use the amounts entered on the form; the model's
        save() calculates total_amount and balance_due.
        """
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
    file_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    MAX_UPLOAD_MB = 10

    class Meta:
        model = ComplianceRecord
        fields = [
            "id", "document_type", "document_type_display", "title",
            "file", "file_url", "expiry_date", "notes",
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
    total_billed = serializers.SerializerMethodField()
    total_paid = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = [
            "id", "name", "contact_person", "phone", "alt_phone", "email", "address",
            "kra_pin", "bank_name", "bank_account", "payment_terms", "payment_terms_display",
            "notes","total_billed", "total_paid", "balance", "payment_status", "is_active", "created_at", "updated_at",
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
            remaining = invoice.total_amount - already
            if amount is not None and amount > remaining:
                raise serializers.ValidationError(
                    {"amount": f"This bill only has {remaining} left to pay."})

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

    class Meta:
        model = StoreStock
        fields = [
            "id", "product", "product_detail", "product_name", "item_number", "category_name",
            "quantity", "reorder_level", "is_low_stock", "updated_at",
        ]
        # Quantity only changes through receive / move_to_head_office, never by direct edit.
        read_only_fields = ["quantity", "updated_at"]

    def validate_reorder_level(self, value):
        if value < 0:
            raise serializers.ValidationError("Reorder level cannot be negative.")
        return value


class StoreMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    item_number = serializers.CharField(source="product.item_number", read_only=True)
    movement_type_display = serializers.CharField(source="get_movement_type_display", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StoreMovement
        fields = [
            "id", "product", "product_name", "item_number",
            "movement_type", "movement_type_display", "quantity_change", "balance_after",
            "note", "created_by", "created_by_name", "created_at",
        ]
        read_only_fields = fields

    def get_created_by_name(self, obj):
        u = obj.created_by
        if not u:
            return "System"
        return f"{u.firstname} {u.lastname}".strip() or u.username


