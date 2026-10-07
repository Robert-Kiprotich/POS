from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone
import uuid
from django.core.validators import FileExtensionValidator
from decimal import Decimal
from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.db.models import OuterRef, Subquery

def compliance_upload_path(instance, filename):
    return f"compliance/{instance.document_type}/{uuid.uuid4().hex[:8]}_{filename}"


class Branch(models.Model):
    name = models.CharField(max_length=150, unique=True)
    code = models.CharField(max_length=16, unique=True, help_text="Short code, e.g. 'NRB01'")
    location = models.CharField(max_length=255, blank=True, default="")
    phone = models.CharField(max_length=32, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Product(models.Model):
    name = models.CharField(max_length=200)
    item_number = models.CharField(
        max_length=64, unique=True,
        help_text="Unique item number used to search for/check out this product.",
    )
    category = models.ForeignKey(
        Category, related_name="products", null=True, blank=True, on_delete=models.SET_NULL
    )
    description = models.TextField(blank=True, default="")
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    retail_price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    wholesale_price = models.DecimalField(
        max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)]
    )
    tax_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        help_text="Percentage, e.g. 16.00 for 16% VAT",
    )
    expiry_date = models.DateField(
        null=True, blank=True,
        help_text="Leave blank for non-perishable products.",
    )
    image = models.ImageField(upload_to="products/", blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["item_number"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.item_number})"
class BranchStock(models.Model):
    """Per-branch stock level for a product. A product has one row per branch it's stocked in."""

    branch = models.ForeignKey(Branch, related_name="stock_levels", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, related_name="branch_stocks", on_delete=models.CASCADE)
    stock_quantity = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    reorder_level = models.IntegerField(default=5, help_text="Trigger a low-stock flag at/below this quantity")
    retail_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    wholesale_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    @property
    def effective_retail_price(self):
        return self.retail_price if self.retail_price is not None else self.product.retail_price

    @property
    def effective_wholesale_price(self):
        return self.wholesale_price if self.wholesale_price is not None else self.product.wholesale_price

    class Meta:
        ordering = ["branch", "product"]
        constraints = [
            models.UniqueConstraint(fields=["branch", "product"], name="unique_stock_per_branch_product"),
        ]

    def __str__(self):
        return f"{self.product.name} @ {self.branch.code}: {self.stock_quantity}"

    @property
    def is_low_stock(self):
        return self.stock_quantity <= self.reorder_level


class Customer(models.Model):
    name = models.CharField(max_length=150)
    business_name = models.CharField(max_length=150, blank=True, default="")
    phone = models.CharField(max_length=32, blank=True, default="")
    alt_phone = models.CharField("Alternative phone", max_length=32, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    address = models.CharField(max_length=255, blank=True, default="")
    loyalty_points = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.business_name})" if self.business_name else self.name

class Sale(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"

    order_number = models.CharField(max_length=32, unique=True, editable=False, blank=True)
    branch = models.ForeignKey(Branch, related_name="sales", null=True, on_delete=models.SET_NULL)
    customer = models.ForeignKey(
        Customer, related_name="sales", null=True, blank=True, on_delete=models.SET_NULL
    )
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="sales", null=True, on_delete=models.SET_NULL
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sale_type = models.CharField(max_length=20, default="Retail")
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.order_number:
            self.order_number = f"SO-{timezone.now().strftime('%y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.order_number

    @property
    def balance_due(self):
        return self.total_amount - self.amount_paid

    def recalculate_totals(self, save=True):
        items = self.items.all()
        subtotal = sum((item.line_subtotal for item in items), start=0)
        tax = sum((item.line_tax for item in items), start=0)
        self.subtotal = subtotal
        self.tax_amount = tax
        self.total_amount = subtotal + tax - self.discount_amount
        if save:
            self.save(update_fields=["subtotal", "tax_amount", "total_amount", "updated_at"])


class SaleItem(models.Model):
    sale = models.ForeignKey(Sale, related_name="items", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, related_name="sale_items", on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["sale", "product"], name="unique_product_per_sale"),
        ]

    def __str__(self):
        return f"{self.quantity} x {self.product.name}"

    @property
    def line_subtotal(self):
        return (self.unit_price * self.quantity) - self.discount_amount

    @property
    def line_tax(self):
        return self.line_subtotal * (self.tax_rate / 100)

    @property
    def line_total(self):
        return self.line_subtotal + self.line_tax


class Payment(models.Model):
    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        MPESA = "mpesa", "M-Pesa"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        OTHER = "other", "Other"

    sale = models.ForeignKey(Sale, related_name="payments", on_delete=models.CASCADE)
    method = models.CharField(max_length=20, choices=Method.choices, default=Method.CASH)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    reference = models.CharField(max_length=100, blank=True, default="")
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="payments_received", null=True, on_delete=models.SET_NULL
    )
    paid_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-paid_at"]

    def __str__(self):
        return f"{self.get_method_display()} - {self.amount} ({self.sale.order_number})"


class StockMovement(models.Model):
    class MovementType(models.TextChoices):
        RESTOCK = "restock", "Restock"
        SALE = "sale", "Sale"
        ADJUSTMENT = "adjustment", "Adjustment"
        RETURN = "return", "Returned"
        DAMAGED = "damaged", "Damaged"
        EXPIRED = "expired", "Expired"
        TRANSFER = "transfer", "Moved to Branch"

    product = models.ForeignKey(Product, related_name="stock_movements", on_delete=models.CASCADE)
    branch = models.ForeignKey(Branch, related_name="stock_movements", null=True, on_delete=models.SET_NULL)
    destination_branch = models.ForeignKey(
        Branch, related_name="incoming_stock_movements", null=True, blank=True, on_delete=models.SET_NULL,
        help_text="Only set for MovementType.TRANSFER — the branch stock was moved to.",
    )
    movement_type = models.CharField(max_length=16, choices=MovementType.choices)
    quantity_change = models.IntegerField(help_text="Positive to add stock, negative to remove")
    note = models.CharField(max_length=255, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="stock_movements", null=True, on_delete=models.SET_NULL
    )
    movement_fee = models.DecimalField(
        max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)],
        help_text="Fee per unit charged on a branch transfer (multiplied by quantity).",
    )
    fee_branch = models.ForeignKey(
        Branch, related_name="movement_fees", null=True, blank=True, on_delete=models.SET_NULL,
        help_text="Branch the movement fee belongs to (always Head Office).",
    )

    @property
    def total_fee(self):
        return (self.movement_fee or 0) * abs(self.quantity_change)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.product.name}: {self.quantity_change:+d} ({self.movement_type})"

class VeterinaryEPrescription(models.Model):
    # --- Choice constants from handwritten record ---
    DRUG_CATEGORIES = [
        ('I', 'I'),
        ('II', 'II'),
    ]

    PRESCRIPTION_TARGETS = [
        ('vet_surgeon', 'Vet Surgeon'),
        ('para_professional', 'Para-Professional'),
    ]
    # Core Prescription Information
    date_of_prescription = models.DateField()
    drug_category = models.CharField(max_length=3, choices=DRUG_CATEGORIES)
    prescription_target = models.CharField(max_length=30, choices=PRESCRIPTION_TARGETS)
    
    # Animal Details
    animal_species = models.CharField(max_length=100, help_text="e.g., Cattle, Goat, Sheep")
    breed = models.CharField(max_length=100, blank=True)
    age = models.CharField(max_length=50, blank=True)
    
    # Medication Details
    drug_trade_name = models.CharField(max_length=150)
    manufacturer = models.CharField(max_length=150, blank=True)
    batch_no = models.CharField(max_length=100, blank=True)
    quantity_purchased = models.CharField(max_length=100, blank=True)
    drug_volume = models.CharField(max_length=50, blank=True)
    dosage = models.CharField(max_length=150, blank=True)
    
    # Treatment Metrics
    clinical_use = models.CharField(max_length=250, blank=True)
    duration_of_treatment = models.CharField(max_length=100, blank=True)
    withdrawal_period = models.CharField(max_length=100, blank=True)
    storage_condition = models.CharField(max_length=150, blank=True)
    side_effect = models.CharField(max_length=250, blank=True)
    expiry_date = models.DateField(blank=True, null=True)
    
    # Buyer Credentials
    name_of_the_buyer = models.CharField(max_length=150)
    buyer_kvb_no = models.CharField("K.V.B No.", max_length=100, blank=True)
    buyer_licence_no = models.CharField("Licence No.", max_length=100, blank=True)
    buyer_contact = models.CharField("Contact", max_length=100, blank=True)
    
    # Comments & Verification
    vet_pharmacist_comment = models.TextField(blank=True)
    signature_and_stamp = models.CharField(max_length=200, blank=True, help_text="Verification string or signature link")
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date_of_prescription", "-id"]
        verbose_name = "Veterinary e-Prescription"
        verbose_name_plural = "Veterinary e-Prescriptions"

    def __str__(self):
        return f"{self.drug_trade_name} for {self.animal_species} on {self.date_of_prescription:%Y-%m-%d}" 

class SalesInvoice(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ISSUED = "issued", "Issued"
        PAID = "paid", "Paid"
        PARTIAL = "partial", "Partially Paid"
        OVERDUE = "overdue", "Overdue"
        CANCELLED = "cancelled", "Cancelled"
    class InvoiceType(models.TextChoices):
        SUPPLY = "supply", "Supply Invoice"
        CREDIT = "credit", "Credit Invoice"
        PURCHASE = "purchase", "Purchase Invoice"
    # --- Core invoice info ---
    invoice_number = models.CharField(max_length=30, unique=True, editable=False)
    invoice_type = models.CharField(
    max_length=15, choices=InvoiceType.choices, default=InvoiceType.SUPPLY
)
    sale = models.OneToOneField(
        Sale, on_delete=models.CASCADE, related_name="invoice",null=True, blank=True,
    )
    supplier = models.ForeignKey(
        "Supplier", related_name="purchase_invoices", null=True, blank=True,
        on_delete=models.PROTECT, help_text="Set on purchase invoices (bills from a supplier).",
    )
    extra_data = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=15, choices=Status.choices, default=Status.DRAFT
    )

    # --- Dates ---
    issue_date = models.DateField()
    due_date = models.DateField(blank=True, null=True)

    # --- Billed-to snapshot (denormalised so the invoice stays accurate
    #     even if the customer record changes later) ---
    billed_to_name = models.CharField(max_length=150, blank=True)
    billed_to_phone = models.CharField(max_length=50, blank=True)
    billed_to_email = models.EmailField(blank=True)
    billed_to_address = models.CharField(max_length=255, blank=True)

    # --- Money snapshot (copied from the sale at issue time) ---
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    balance_due = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # --- Notes ---
    notes = models.TextField(blank=True)
    terms = models.TextField(blank=True)

    # --- Timestamps ---
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-issue_date", "-id"]
        verbose_name = "Sales Invoice"
        verbose_name_plural = "Sales Invoices"

    def __str__(self):
        return f"{self.invoice_number} ({self.get_status_display()})"

    def save(self, *args, **kwargs):
        # Auto-generate the invoice number on first save.
        if not self.invoice_number:
            last = SalesInvoice.objects.order_by("-id").first()
            next_id = (last.id + 1) if last else 1
            self.invoice_number = f"INV-{next_id:06d}"

        if self.sale_id is None:
            self.total_amount = (self.subtotal or 0) - (self.discount_amount or 0) + (self.tax_amount or 0)
            self.balance_due = self.total_amount - (self.amount_paid or 0)
        super().save(*args, **kwargs)
    @property
    def payment_status(self):
        total, paid = self.total_amount or 0, self.amount_paid or 0
        if paid <= 0:
            return "not_paid"
        return "paid" if paid >= total else "partial"

    def sync_from_payments(self):
        """Recalculate amount paid and status from linked, non-cancelled business payments."""
        paid = self.payments_made.filter(status="paid").aggregate(
            t=Coalesce(Sum("amount"), Decimal("0.00")))["t"]
        total = (self.subtotal or 0) - (self.discount_amount or 0) + (self.tax_amount or 0)
        self.amount_paid = paid
        if self.status != self.Status.CANCELLED:
            if paid <= 0 and self.status in (self.Status.PAID, self.Status.PARTIAL):
                self.status = self.Status.ISSUED
            elif paid > 0:
                self.status = self.Status.PAID if paid >= total else self.Status.PARTIAL
        self.save()
class Employee(models.Model):
    class EmploymentType(models.TextChoices):
        FULL_TIME = "full_time", "Full-Time"
        PART_TIME = "part_time", "Part-Time"
        CONTRACT  = "contract",  "Contract"
        INTERN    = "intern",    "Intern"
        CASUAL    = "casual",    "Casual"

    class Status(models.TextChoices):
        ACTIVE     = "active",     "Active"
        ON_LEAVE   = "on_leave",   "On Leave"
        SUSPENDED  = "suspended",  "Suspended"
        TERMINATED = "terminated", "Terminated"
        RESIGNED   = "resigned",   "Resigned"

    class Gender(models.TextChoices):
        MALE   = "male",   "Male"
        FEMALE = "female", "Female"
        OTHER  = "other",  "Other"

    # --- Role (drives employment category + default login policy) ---
    role = models.ForeignKey(
        "users.Roles",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employees",
    )

    # --- Optional link to a system User account.
    #     Cleaners/groundsmen/etc. will leave this NULL. ---
    user = models.OneToOneField(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee",
    )

    # --- System access policy ------------------------------------------------
    # NULL  = inherit from role.requires_login
    # True  = this employee *should* have a login (grant it via the action)
    # False = explicit override: HR-only, do not grant login
    requires_login_override = models.BooleanField(
        null=True,
        blank=True,
        help_text="Leave blank to inherit from the role. Set False to force HR-only.",
    )

    # --- Identity ---
    employee_number = models.CharField(max_length=30, unique=True, editable=False)
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100)
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True)
    date_of_birth = models.DateField(blank=True, null=True)
    national_id = models.CharField(max_length=30, blank=True)

    # --- Contact ---
    personal_email = models.EmailField(blank=True)
    work_email = models.EmailField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    alt_phone = models.CharField(max_length=50, blank=True)
    address = models.CharField(max_length=255, blank=True)

    # --- Employment ---
    position = models.CharField(max_length=100)
    department = models.CharField(max_length=100, blank=True)
    employment_type = models.CharField(
        max_length=20, choices=EmploymentType.choices, default=EmploymentType.FULL_TIME
    )
    status = models.CharField(
        max_length=15, choices=Status.choices, default=Status.ACTIVE
    )
    hire_date = models.DateField()
    end_date = models.DateField(blank=True, null=True)
    manager = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="reports"
    )
    branch = models.ForeignKey(
        "Branch", on_delete=models.SET_NULL, null=True, blank=True, related_name="employees"
    )

    # --- Compensation / statutory / emergency (unchanged) ---
    basic_salary = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    bank_name = models.CharField(max_length=100, blank=True)
    bank_account = models.CharField(max_length=50, blank=True)
    nssf_number = models.CharField("NSSF No.", max_length=50, blank=True)
    nhif_number = models.CharField("NHIF No.", max_length=50, blank=True)
    kra_pin = models.CharField("KRA PIN", max_length=50, blank=True)

    emergency_contact_name = models.CharField(max_length=150, blank=True)
    emergency_contact_phone = models.CharField(max_length=50, blank=True)
    emergency_contact_relation = models.CharField(max_length=50, blank=True)

    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "Employee"
        verbose_name_plural = "Employees"

    def __str__(self):
        return f"{self.employee_number} — {self.full_name}"

    # --- Derived helpers ---
    @property
    def full_name(self):
        parts = [self.first_name, self.middle_name, self.last_name]
        return " ".join(p for p in parts if p).strip()

    @property
    def requires_login(self) -> bool:
        """True if this employee is expected to have a system login."""
        if self.requires_login_override is not None:
            return self.requires_login_override
        if self.role_id:
            return bool(self.role.requires_login)
        # No role set → default to False (HR-only until a role is assigned).
        return False

    @property
    def has_login(self) -> bool:
        return self.user_id is not None

    @property
    def system_access_state(self) -> str:
        """
        Derived state used by the UI:
          'hr_only'      → not expected to log in (cleaner, groundsman)
          'pending'      → expected to log in, but no user account yet
          'active'       → user account linked and enabled
          'disabled'     → user account linked but is_active=False
        """
        if not self.requires_login:
            return "hr_only"
        if not self.has_login:
            return "pending"
        return "active" if self.user.is_active else "disabled"

    def save(self, *args, **kwargs):
        if not self.employee_number:
            last = Employee.objects.order_by("-id").first()
            next_id = (last.id + 1) if last else 1
            self.employee_number = f"EMP-{next_id:05d}"
        super().save(*args, **kwargs)



class ComplianceRecord(models.Model):
    class DocumentType(models.TextChoices):
        TAX = "tax", "Tax Compliance"
        COUNTY = "county", "County Government"
        BUSINESS_PERMIT = "business_permit", "Business Permit"
        PHARMACY_BOARD = "pharmacy_board", "Pharmacy & Poisons Board"
        VET_BOARD = "vet_board", "Kenya Veterinary Board"
        HEALTH = "health", "Public Health"
        INSURANCE = "insurance", "Insurance"
        OTHER = "other", "Other"

    document_type = models.CharField(max_length=20, choices=DocumentType.choices)
    title = models.CharField(max_length=200, help_text="e.g. KRA Tax Compliance Certificate 2026")
    file = models.FileField(
        upload_to=compliance_upload_path,
        validators=[FileExtensionValidator(["jpg", "jpeg", "png", "webp", "pdf"])],
    )
    expiry_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="compliance_records",
        null=True, blank=True, on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_document_type_display()}: {self.title}"

class SalaryPayment(models.Model):
    """One payslip / salary payment for one employee for one month."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"          # prepared, not yet paid; still editable
        PAID = "paid", "Paid"             # locked
        CANCELLED = "cancelled", "Cancelled"

    class Method(models.TextChoices):
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        MPESA = "mpesa", "M-Pesa"
        CASH = "cash", "Cash"
        CHEQUE = "cheque", "Cheque"
        OTHER = "other", "Other"

    employee = models.ForeignKey(Employee, related_name="salary_payments", on_delete=models.PROTECT)
    period = models.DateField(help_text="First day of the month this salary is for, e.g. 2026-09-01")

    # --- Earnings ---
    basic_salary = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    allowances = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    overtime = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    bonus = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])

    # --- Deductions (entered manually) ---
    paye = models.DecimalField("PAYE", max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    nssf = models.DecimalField("NSSF", max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    health_insurance = models.DecimalField(
        "SHIF / NHIF", max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)]
    )
    housing_levy = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    advance_recovery = models.DecimalField(
        max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)],
        help_text="Salary advance / loan being recovered this month",
    )
    other_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])

    # --- Calculated in save() ---
    gross_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0, editable=False)
    total_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0, editable=False)
    net_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0, editable=False)

    # --- Payment ---
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    payment_method = models.CharField(max_length=20, choices=Method.choices, blank=True, default="")
    reference = models.CharField(max_length=100, blank=True, default="", help_text="M-Pesa code, bank ref, cheque no.")
    paid_on = models.DateField(null=True, blank=True)
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="salary_payments_made",
        null=True, blank=True, on_delete=models.SET_NULL,
    )

    notes = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="salary_payments_created",
        null=True, blank=True, on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-period", "employee__first_name"]
        constraints = [
            # One live payslip per employee per month (cancelled ones don't count)
            models.UniqueConstraint(
                fields=["employee", "period"],
                condition=~models.Q(status="cancelled"),
                name="unique_active_salary_per_employee_period",
            ),
        ]

    def __str__(self):
        return f"{self.employee.full_name} - {self.period:%b %Y} ({self.get_status_display()})"

    def save(self, *args, **kwargs):
        self.period = self.period.replace(day=1)
        self.gross_pay = self.basic_salary + self.allowances + self.overtime + self.bonus
        self.total_deductions = (
            self.paye + self.nssf + self.health_insurance
            + self.housing_levy + self.advance_recovery + self.other_deductions
        )
        self.net_pay = self.gross_pay - self.total_deductions
        super().save(*args, **kwargs)

class ChequeDeposit(models.Model):
    """A cheque received from a customer, tracked until it is deposited and clears."""

    class Status(models.TextChoices):
        RECEIVED = "received", "In Hand"        # received, not yet banked; still editable
        DEPOSITED = "deposited", "Deposited"    # banked, awaiting clearance
        CLEARED = "cleared", "Cleared"          # money confirmed
        BOUNCED = "bounced", "Bounced"          # returned unpaid
        CANCELLED = "cancelled", "Cancelled"

    # --- Cheque details ---
    cheque_number = models.CharField(max_length=30)
    drawer_name = models.CharField(max_length=150, help_text="Person / company who wrote the cheque")
    drawer_bank = models.CharField(max_length=100, help_text="Bank the cheque is drawn on")
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    cheque_date = models.DateField(help_text="Date written on the cheque (may be post-dated)")
    received_on = models.DateField(default=timezone.localdate)

    # --- Links (all optional) ---
    customer = models.ForeignKey(Customer, related_name="cheques", null=True, blank=True, on_delete=models.SET_NULL)
    sale = models.ForeignKey(Sale, related_name="cheques", null=True, blank=True, on_delete=models.SET_NULL)
    branch = models.ForeignKey(Branch, related_name="cheques", null=True, blank=True, on_delete=models.SET_NULL)

    # --- Deposit ---
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.RECEIVED)
    deposit_bank = models.CharField(max_length=100, blank=True, default="")
    deposit_account = models.CharField(max_length=50, blank=True, default="")
    deposit_slip_no = models.CharField(max_length=50, blank=True, default="")
    deposited_on = models.DateField(null=True, blank=True)
    deposited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="cheques_deposited",
        null=True, blank=True, on_delete=models.SET_NULL,
    )

    # --- Outcome ---
    cleared_on = models.DateField(null=True, blank=True)
    bounced_on = models.DateField(null=True, blank=True)
    bounce_reason = models.CharField(max_length=255, blank=True, default="")
    payment = models.OneToOneField(
        Payment, related_name="cheque", null=True, blank=True, on_delete=models.SET_NULL,
        help_text="Payment created on the sale when the cheque cleared",
    )

    notes = models.TextField(blank=True, default="")
    cheque_image = models.ImageField(
        upload_to="cheques/%Y/%m/", null=True, blank=True,
        help_text="Optional photo of the cheque",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="cheques_created",
        null=True, blank=True, on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-received_on", "-id"]
        verbose_name = "Cheque Deposit"
        verbose_name_plural = "Cheque Deposits"
        constraints = [
            # The same physical cheque can't be live twice (bounced/cancelled ones don't count)
            models.UniqueConstraint(
                fields=["cheque_number", "drawer_bank"],
                condition=~models.Q(status__in=["cancelled", "bounced"]),
                name="unique_live_cheque_per_bank",
            ),
        ]

    def __str__(self):
        return f"Cheque {self.cheque_number} - {self.drawer_name} ({self.get_status_display()})"

    @property
    def is_post_dated(self):
        return self.status == self.Status.RECEIVED and self.cheque_date > timezone.localdate()

    @property
    def is_stale(self):
        """Cheques are generally valid for 6 months from the date written on them."""
        from datetime import timedelta
        limit = self.cheque_date + timedelta(days=183)
        return self.status in (self.Status.RECEIVED, self.Status.DEPOSITED) and limit < timezone.localdate()

class Supplier(models.Model):
    class PaymentTerms(models.TextChoices):
        CASH = "cash", "Cash on delivery"
        NET_7 = "net_7", "Next 7 days"
        NET_14 = "net_14", "Next 14 days"
        NET_30 = "net_30", "Next 30 days"
        NET_60 = "net_60", "Next 60 days"

    name = models.CharField(max_length=150, unique=True)
    contact_person = models.CharField(max_length=150, blank=True, default="")
    phone = models.CharField(max_length=32, blank=True, default="")
    alt_phone = models.CharField(max_length=32, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    address = models.CharField(max_length=255, blank=True, default="")
    kra_pin = models.CharField("KRA PIN", max_length=50, blank=True, default="")
    bank_name = models.CharField(max_length=100, blank=True, default="")
    bank_account = models.CharField(max_length=50, blank=True, default="")
    payment_terms = models.CharField(
        max_length=10, choices=PaymentTerms.choices, default=PaymentTerms.CASH
    )
    notes = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name
class PettyCashExpense(models.Model):
    """Small cash spent out of the till (transport, cleaning, airtime...)."""

    class Category(models.TextChoices):
        TRANSPORT = "transport", "Transport"
        MEALS = "meals", "Meals & Refreshments"
        CLEANING = "cleaning", "Cleaning Supplies"
        STATIONERY = "stationery", "Stationery & Packaging"
        UTILITIES = "utilities", "Airtime / Utilities"
        REPAIRS = "repairs", "Repairs & Maintenance"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"        # cashier recorded it; still editable
        APPROVED = "approved", "Approved"     # admin confirmed; locked
        REJECTED = "rejected", "Rejected"     # admin refused; doesn't count against the till

    branch = models.ForeignKey(Branch, related_name="petty_cash", null=True, blank=True, on_delete=models.SET_NULL)
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="petty_cash_expenses", null=True, on_delete=models.SET_NULL
    )
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    expense_date = models.DateField(default=timezone.localdate)
    receipt_number = models.CharField(max_length=50, blank=True, default="")
    receipt_image = models.ImageField(upload_to="petty_cash/%Y/%m/", null=True, blank=True)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="petty_cash_reviewed", null=True, blank=True, on_delete=models.SET_NULL
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.CharField(max_length=255, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-expense_date", "-id"]
        verbose_name = "Petty Cash Expense"
        verbose_name_plural = "Petty Cash Expenses"

    def __str__(self):
        return f"{self.get_category_display()} - {self.amount} ({self.expense_date})"
class RoleMenuPermission(models.Model):
    role = models.OneToOneField("users.Roles", related_name="menu_permission", on_delete=models.CASCADE)
    menu_keys = models.JSONField(default=list, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="+", null=True, blank=True, on_delete=models.SET_NULL
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.role} -> {len(self.menu_keys)} menu items"

class BusinessPayment(models.Model):
    """Money paid out by the business: suppliers, rent, utilities, salaries, taxes, etc."""

    class Category(models.TextChoices):
        SUPPLIER = "supplier", "Supplier"
        INVOICE = "invoice", "Invoice"
        RENT = "rent", "Rent"
        ELECTRICITY = "electricity", "Electricity"
        SALARIES = "salaries", "Salaries"
        CUSTOMS = "customs", "Customs"
        COUNTY = "county_government", "County Government"
        WATER = "water", "Water"
        OTHER = "other", "Other Payment"

    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        MPESA = "mpesa", "M-Pesa"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        CHEQUE = "cheque", "Cheque"
        CARD = "card", "Card"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        PAID = "paid", "Paid"
        CANCELLED = "cancelled", "Cancelled"

    category = models.CharField(max_length=20, choices=Category.choices)
    supplier = models.ForeignKey(
        Supplier, related_name="business_payments", null=True, blank=True, on_delete=models.PROTECT
    )
    purchase_invoice = models.ForeignKey(
        SalesInvoice, related_name="payments_made", null=True, blank=True, on_delete=models.PROTECT,
        help_text="The supplier bill this payment settles (optional).",
    )
    payee = models.CharField(max_length=150, blank=True, default="",
                             help_text="Who was paid (landlord, KPLC, KRA, county...). Optional for suppliers.")
    branch = models.ForeignKey(Branch, related_name="business_payments", null=True, blank=True,
                               on_delete=models.SET_NULL)
    description = models.CharField(max_length=255, blank=True, default="")
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    payment_date = models.DateField(default=timezone.localdate)
    period = models.DateField(null=True, blank=True,
                              help_text="First day of the month this payment covers (rent, utilities, salaries).")
    method = models.CharField(max_length=20, choices=Method.choices, default=Method.CASH)
    reference = models.CharField(max_length=100, blank=True, default="",
                                 help_text="M-Pesa code, bank ref, cheque no.")
    invoice_number = models.CharField(max_length=60, blank=True, default="",
                                      help_text="Supplier / customs / county invoice or bill number")
    attachment = models.FileField(upload_to="business_payments/%Y/%m/", null=True, blank=True)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PAID)
    cancel_reason = models.CharField(max_length=255, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="business_payments_created",
        null=True, blank=True, on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-payment_date", "-id"]
        verbose_name = "Business Payment"
        verbose_name_plural = "Business Payments"

    def __str__(self):
        return f"{self.get_category_display()} - {self.amount} ({self.payment_date})"


class StoreStock(models.Model):
    """Stock held in the central store (storeroom), before it is moved to Head Office."""
    product = models.OneToOneField(Product, related_name="store_stock", on_delete=models.CASCADE)
    quantity = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    reorder_level = models.IntegerField(default=5, help_text="Low-stock flag at/below this quantity")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["product__name"]
        verbose_name = "Store Stock"
        verbose_name_plural = "Store Stock"

    def __str__(self):
        return f"{self.product.name} @ Store: {self.quantity}"

    @property
    def is_low_stock(self):
        return self.quantity <= self.reorder_level


class StoreMovement(models.Model):
    """History of everything that goes in or out of the store."""

    class MovementType(models.TextChoices):
        RECEIVED = "received", "Received into Store"
        TO_HEAD_OFFICE = "to_head_office", "Moved to Head Office"
        ADJUSTMENT = "adjustment", "Adjustment"
        DAMAGED = "damaged", "Damaged"
        EXPIRED = "expired", "Expired"

    product = models.ForeignKey(Product, related_name="store_movements", on_delete=models.CASCADE)
    movement_type = models.CharField(max_length=20, choices=MovementType.choices)
    quantity_change = models.IntegerField(help_text="Positive adds to the store, negative removes")
    balance_after = models.IntegerField(default=0, help_text="Store quantity after this movement")
    note = models.CharField(max_length=255, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="store_movements", null=True, blank=True,
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.product.name}: {self.quantity_change:+d} ({self.movement_type})"
