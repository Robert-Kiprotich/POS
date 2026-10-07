import { Route } from "react-router";
import { all_routes } from "./all_routes";
import Login from "../pages/auth/login/login";

import ProductsList from "../pages/products/ProductsList";
import ProductDetail from "../pages/products/ProductDetail";

import CategoriesList from "../pages/categories/CategoriesList";
import SalesList from "../pages/sales/SalesList";
import CustomersList from "../pages/customers/CustomersList";
import StockMovementsList from "../pages/stock/StockMovementsList";
import POS from "../pages/pos/pos";


import ComingSoon from "../pages/settings/ComingSoon";

import Users from "../pages/users/manager/dashboards/users";
import { CallHistory } from "../pages/users/cashier/dashboard/dashboardcomponents/CallHistory";
//import managerDashboard from "../pages/manager/managerDashboard";
import AdminDashboard from "../pages/users/admin/dashboard/dashboard";

import SystemLogs from "../pages/admin/SystemLogs";
import DynamicDashboardWrapper from "./dynamicRoute";

import Calls from "../pages/users/manager/dashboards/calls";
import QualityAnalysis from "../pages/quality-analysis/QualityAnalysis";
import BranchesList from "../pages/branches/BranchesList";
import PrescriptionsList from "../pages/prescriptions/VeterinaryPrescription";
import SalesInvoicesList from "../pages/invoices/SalesInvoicesList";
import EmployeesList from "../pages/employees/EmployeesList";
import ComplianceList from "../pages/compliance/ComplianceList";
import SalariesList from "../pages/salaries/SalariesList";
import ChequesList from "../pages/cheques/ChequesList";
import SupplierList from "../pages/suppliers/SupplierList";
import CashierRecords from "../pages/cashier/Cashierrecords";
import MenuAccess from "../pages/acess/MenuAcceess";
import Reports from "../pages/reports/Reports";
import BusinessPayments from "../pages/payments/PaymentsList";
import Store from "../pages/stock/Store";


const route = all_routes;
export const publicRoutes = [
 
 {
    id: "198",
    path: route.users,
    element: <Users />,
    route: Route,
    meta_title: "Users",
    roles: ["administrator"],
  },
 {
    id: "198",
    path: route.categories,
    element: <CategoriesList />,
    route: Route,
    meta_title: "Categories",
    
  },
  
  {
    id: "198",
    path: route.payments,
    element: <BusinessPayments />,
    route: Route,
    meta_title: "Payments",
  },
  {
    id: "199",
    path: route.categories,
    element: <CategoriesList/>,
    route: Route,
    meta_title: "Branch Manager Dashboard",
   
  },
  {
    id: "155",
    path: route.sales,
    element: <SalesList />,
    route: Route,
    meta_title: "Platform Settings",
    
  },
  {
    id: "156",
    path: route.customers,
    element: <CustomersList/>,
    route: Route,
    meta_title: "Customers",
  },
  {
    id: "157",
    path: route.stock,
    element: <StockMovementsList/>,
    route: Route,
    meta_title: "Stock ",
  },
  {
    id: "157",
    path: route.store,
    element: <Store/>,
    route: Route,
    meta_title: "Stock ",
  },
   {
    id: "158",
    path: route.pos,
    element: <POS />,
    route: Route,
    meta_title: "POS",
  },
  
  {
    id: "200",
    path: route.dashboard,
   element: <DynamicDashboardWrapper />,
    route: Route,
    meta_title: "Dashboard",
   
  },
  
 
  
  {
    id: "203",
    path: route.products,
    element: <ProductsList />,
    route: Route,
    meta_title: "Products",
   
  },
  {
    id: "204",
    path: `${route.productDetail}/:id`,
    element: <ProductDetail />,
    route: Route,
    meta_title: "Product Detail",
   
  },
 
  
  {
    id: "208",
    path: route.systemLogs,
    element: <SystemLogs />,
    route: Route,
    meta_title: "System Logs",
    roles: ["administrator"],
  },

  {
    id: "211",
    path: route.adminDashboard,
    element: <AdminDashboard />,
    route: Route,
    meta_title: "Admin Dashboard",
    
  },
   {
    id: "212",
    path: route.branches,
    element: <BranchesList />,
    route: Route,
    meta_title: "Branches",
    
  },
  {
    id: "212",
    path: route.prescriptions,
    element: <PrescriptionsList />,
    route: Route,
    meta_title: "Prescriptions",
    
  },
  {
    id: "212",
    path: route.invoices,
    element: < SalesInvoicesList/>,
    route: Route,
    meta_title: "Invoices",
    
  },
   {
    id: "212",
    path: route.employees,
    element: <EmployeesList />,
    route: Route,
    meta_title: "Employees",
    
  },
  {
    id: "213",
    path: route.compliance,
    element: <ComplianceList />,
    route: Route,
    meta_title: "Compliance",
   
  },
  {
    id: "214",
    path: route.salaries,
    element: <SalariesList />,
    route: Route,
    meta_title: "Salaries",
   
  },
  {
    id: "215",
    path: route.cheques,
    element: <ChequesList />,
    route: Route,
    meta_title: "Cheques",
    
  },
  {
    id: "216",
    path: route.suppliers,
    element: <SupplierList />,
    route: Route,
    meta_title: "Suppliers",
    
  },
  {
    id: "217",
    path: route.cashier,
    element: <CashierRecords />,
    route: Route,
    meta_title: "Cashier Records",
    
  },
  {
    id: "218",
    path: route.permissions,
    element: <MenuAccess />,
    route: Route,
    meta_title: "Permissions",
    
  },
  {
    id: "218",
    path: route.reports,
    element: <Reports />,
    route: Route,
    meta_title: "Reports",
    
  },

];

export const authRoutes = [
  {
    id: "auth-1",
    path: route.login,
    element: <Login />,
    route: Route,
    meta_title: "Login",
  },
];
