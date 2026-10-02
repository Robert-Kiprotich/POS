from django.contrib import admin
from django.db.models import Sum

from .models import Branch, BranchStock, Category, Customer, Payment, Product, Sale, SaleItem, StockMovement


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "location", "phone", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "code", "location")


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_at")
    search_fields = ("name",)


class BranchStockInline(admin.TabularInline):
    model = BranchStock
    extra = 0
    fields = ("branch", "stock_quantity", "reorder_level")


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name",  "item_number", "category", "retail_price","wholesale_price", "total_stock", "is_active")
    list_filter = ("category", "is_active")
    search_fields = ("name",  "item_number")
    inlines = [BranchStockInline]

    def total_stock(self, obj):
        return obj.branch_stocks.aggregate(total=Sum("stock_quantity"))["total"] or 0
    total_stock.short_description = "Total Stock"


@admin.register(BranchStock)
class BranchStockAdmin(admin.ModelAdmin):
    list_display = ("product", "branch", "stock_quantity", "reorder_level", "is_low_stock")
    list_filter = ("branch",)
    search_fields = ("product__name", "product__sku", "product__item_number")

    def is_low_stock(self, obj):
        return obj.is_low_stock
    is_low_stock.boolean = True


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "email", "loyalty_points")
    search_fields = ("name", "phone", "email")


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    readonly_fields = ("paid_at",)


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ("order_number", "branch", "customer", "status", "total_amount", "amount_paid", "created_at")
    list_filter = ("status", "branch", "created_at")
    search_fields = ("order_number", "customer__name")
    inlines = [SaleItemInline, PaymentInline]
    readonly_fields = ("order_number",)


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ("product", "branch", "movement_type", "quantity_change", "created_at", "created_by")
    list_filter = ("movement_type", "branch")
    search_fields = ("product__name",)