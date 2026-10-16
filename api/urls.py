from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .views import *

router = DefaultRouter()
router.register(r"branches", BranchViewSet, basename="branch")
router.register(r"branch-stocks", BranchStockViewSet, basename="branchstock")
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"products", ProductViewSet, basename="product")
router.register(r"customers", CustomerViewSet, basename="customer")
router.register(r"sales", SaleViewSet, basename="sale")
router.register(r"payments", PaymentViewSet, basename="payment")
router.register(r"stock-movements", StockMovementViewSet, basename="stockmovement")
router.register(r'users', UserViewSet, basename='users')
router.register(r"veterinary-eprescriptions",VeterinaryEPrescriptionViewSet,basename="veterinary-eprescription")
router.register(r"sales-invoices", SalesInvoiceViewSet, basename="salesinvoice")
router.register(r"employees", EmployeeViewSet, basename="employee")
router.register(r"compliance-records", ComplianceRecordViewSet, basename="compliance-record")
router.register(r"salary-payments", SalaryPaymentViewSet, basename="salary-payment")
router.register(r"cheque-deposits", ChequeDepositViewSet, basename="cheque-deposits")
router.register(r"suppliers", SupplierViewSet, basename="supplier")
router.register(r"business-payments", BusinessPaymentViewSet, basename="business-payment")
router.register(r"store", StoreViewSet, basename="store")
router.register(r"store-movements", StoreMovementViewSet, basename="store-movement")
router.register(r"deposits", DepositViewSet, basename="deposit")
router.register(r"petty-cash", PettyCashExpenseViewSet, basename="petty-cash")
router.register(r"supplies", SupplyViewSet, basename="supply") 

app_name = "api"

urlpatterns = [
     path("admin-dashboard/", admin_dashboard, name="admin-dashboard"),
     path("cashier-records/", cashier_records, name="cashier-records"),
    
     path("menu-permissions/", menu_permissions, name="menu-permissions"),
    path("menu-permissions/mine/", my_menu_access, name="my-menu-access"),
     path("reports/options/", report_options, name="report-options"),
  path("reports/", run_report, name="run-report"),
    path('', include(router.urls)),
    path("health/", health),
]


@api_view(['GET'])
def api_root_view(request, format=None):
    base_url = request.build_absolute_uri('/api/')
    return Response({
        'message': 'Agrovet POS',
        'version': '2.0',
        'documentation': base_url + 'docs/',

        'branches': base_url + 'branches/',
        'branch-stocks': base_url + 'branch-stocks/',
        'categories': base_url + 'categories/',
        'users': base_url + 'users/',
        'current_user': base_url + 'users/me/',
        'login': base_url + 'login/',
        'logout': base_url + 'logout/',
        'products': base_url + 'products/',
        'customers': base_url + 'customers/',
        'sales': base_url + 'sales/',
        'payments': base_url + 'payments/',
        'stock-movements': base_url + 'stock-movements/',
        'veterinary-eprescriptions': base_url + 'veterinary-eprescriptions/',
        'sales-invoices': base_url + 'sales-invoices/',
        'employees': base_url + 'employees/',
        'admin-dashboard': base_url + 'admin-dashboard/',
        'compliance-records': base_url + 'compliace-records',
        'salary-payments':base_url + 'salary-payments',
        'cheque-deposits':base_url + 'cheque-deposits',
        'suppliers': base_url + 'suppliers/',
        'cashier-records': base_url + 'cashier-records/',
        'menu-permissions': base_url + 'menu-permissions/',
        'menu-permissions/mine': base_url + 'my-menu-access/',
        'reports/options': base_url + 'reports/options/',
        'reports': base_url + 'reports/',
        'business-payments': base_url + 'business-payments/',
        'store': base_url + 'store/',
        'store-movements': base_url + 'store-movements/',
        'deposits': base_url + 'deposits/',
        'petty-cash': base_url + 'petty-cash/',
    })


urlpatterns.insert(0, path('', api_root_view, name='api-root'))