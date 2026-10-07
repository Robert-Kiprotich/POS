import { all_routes } from "../../routes/all_routes";

const route = all_routes;

const ADMIN = "administrator";
const MANAGER = "Branch Manager";
const CLERK = "sales clerk";
const KEEPER = "store keeper";
const CASHIER = "cashier";
const VET = "veterinarian";


export const SidebarData = [
  {
    tittle: "",
    icon: "airplay",
    showAsTab: true,
    separateRoute: false,
    submenuItems: [
      {
        key: "dashboard", label: "Dashboard", link: route.dashboard, submenu: false, showSubRoute: false,
        icon: "dashboard", base: "dashboard", materialicons: "start", dot: false,
        roles: [CLERK, KEEPER], submenuItems: [],
      },
      {
        key: "admin_dashboard", label: "Dashboard", link: route.adminDashboard, submenu: false, showSubRoute: false,
        icon: "dashboard", base: "admin-dashboard", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER], submenuItems: [],
      },
      {
        key: "pos", label: "POS", link: route.pos, submenu: false, showSubRoute: false,
        icon: "phone", base: "calls", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER, CLERK, CASHIER], submenuItems: [],
      },
      {
        key: "cashier_records", label: "Cashier Records", link: route.cashier, submenu: false, showSubRoute: false,
        icon: "phone", base: "calls", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER, CLERK, CASHIER], submenuItems: [],
      },
      {
        key: "products", label: "Products", link: route.products, submenu: false, showSubRoute: false,
        icon: "briefcase", base: "cases", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER, KEEPER, VET], submenuItems: [],
      },
      {
        key: "categories", label: "Categories", link: route.categories, submenu: false, showSubRoute: false,
        icon: "brand-stackshare", base: "sources", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER, KEEPER, VET], submenuItems: [],
      },
      {
        key: "customers", label: "Customers", link: route.customers, submenu: false, showSubRoute: false,
        icon: "report", base: "quality-analysis", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER, CLERK], submenuItems: [],
      },
      {
        key: "prescriptions", label: "Prescriptions", link: route.prescriptions, submenu: false, showSubRoute: false,
        icon: "report", base: "quality-analysis", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER, CLERK,VET], submenuItems: [],
      },
      {
        key: "sales", label: "Sales", link: route.sales, submenu: false, showSubRoute: false,
        icon: "category", base: "sales", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER, CLERK], submenuItems: [],
      },
      {
        key: "suppliers", label: "Suppliers", link: route.suppliers, submenu: false, showSubRoute: false,
        icon: "category", base: "sales", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER, CLERK], submenuItems: [],
      },
      {
        key: "payments", label: "Payments", link: route.payments, submenu: false, showSubRoute: false,
        icon: "category", base: "sales", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER, CLERK], submenuItems: [],
      },
      {
        label: "Stock", submenu: true, showSubRoute: false,
        icon: "category", base: "sales", materialicons: "start", dot: false,
        submenuItems: [
          {
            key: "stock_management", label: "Stock Management", link: route.stock, submenu: false, showSubRoute: false,
            icon: "clipboard-list", base: "system-logs", materialicons: "start", dot: false,
            roles: [ADMIN, MANAGER, KEEPER], submenuItems: [],
          },
          {
            key: "store", label: "Store", link: route.store, submenu: false, showSubRoute: false,
            icon: "clipboard-list", base: "system-logs", materialicons: "start", dot: false,
            roles: [ADMIN, MANAGER, KEEPER], submenuItems: [],
          },


        ],
      },
      {
        key: "invoices", label: "Invoices", link: route.invoices, submenu: false, showSubRoute: false,
        icon: "users", base: "users", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER], submenuItems: [],
      },
    ],
  },

  {
    tittle: "Administration",
    icon: "airplay",
    showAsTab: true,
    separateRoute: false,
    submenuItems: [
      {
        label: "Management", submenu: true, showSubRoute: false,
        icon: "clipboard-list", base: "system-logs", materialicons: "start", dot: false,
        roles: [ADMIN],
        submenuItems: [
          {
            key: "branches", label: "Branches", link: route.branches, submenu: false, showSubRoute: false,
            icon: "users", base: "users", materialicons: "start", dot: false,
            roles: [ADMIN], submenuItems: [],
          },
          {
            key: "staff", label: "Staff", link: route.employees, submenu: false, showSubRoute: false,
            icon: "clipboard-list", base: "system-logs", materialicons: "start", dot: false,
            roles: [ADMIN], submenuItems: [],
          },
          {
            key: "users", label: "Users", link: route.users, submenu: false, showSubRoute: false,
            icon: "clipboard-list", base: "system-logs", materialicons: "start", dot: false,
            roles: [ADMIN], submenuItems: [],
          },
          {
            // Add `menuAccess: "/menu-access"` (or similar) to all_routes and register the page in your router.
            key: "access_control", label: "Access Control", link: route.permissions, submenu: false, showSubRoute: false,
            icon: "clipboard-list", base: "menu-access", materialicons: "start", dot: false,
            roles: [ADMIN], adminOnly: true, submenuItems: [],
          },
        ],
      },
      {
        key: "salaries", label: "Salaries", link: route.salaries, submenu: false, showSubRoute: false,
        icon: "users", base: "users", materialicons: "start", dot: false,
        roles: [ADMIN], submenuItems: [],
      },
      {
        key: "compliance", label: "Compliance Records", link: route.compliance, submenu: false, showSubRoute: false,
        icon: "users", base: "users", materialicons: "start", dot: false,
        roles: [ADMIN], submenuItems: [],
      },
      {
        key: "cheques", label: "Cheque Deposits", link: route.cheques, submenu: false, showSubRoute: false,
        icon: "users", base: "users", materialicons: "start", dot: false,
        roles: [ADMIN], submenuItems: [],
      },
    ],
  },

  {
    tittle: "Reports",
    icon: "airplay",
    showAsTab: true,
    separateRoute: false,
    submenuItems: [
      {
        key: "sales_reports", label: "Reports", link: route.reports, submenu: false, showSubRoute: false,
        icon: "chart-histogram", base: "case-reports", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER], submenuItems: [],
      },
      
    ],
  },
];
