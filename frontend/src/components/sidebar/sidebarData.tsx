import { all_routes } from "../../routes/all_routes";

const route = all_routes;

const ADMIN = "administrator";
const MANAGER = "branch manager";
const CLERK = "sales clerk";
const KEEPER = "store keeper";


export const SidebarData = [
  {
    tittle: "",
    icon: "airplay",
    showAsTab: true,
    separateRoute: false,
    submenuItems: [
      {
        label: "Dashboard", link: route.dashboard, submenu: false, showSubRoute: false,
        icon: "dashboard", base: "dashboard", materialicons: "start", dot: false,
        roles: [CLERK, KEEPER], submenuItems: [],
      },
      {
        label: "Dashboard", link: route.supervisorDashboard, submenu: false, showSubRoute: false,
        icon: "dashboard", base: "supervisor-dashboard", materialicons: "start", dot: false,
        roles: [MANAGER], submenuItems: [],
      },
      {
        label: "Dashboard", link: route.adminDashboard, submenu: false, showSubRoute: false,
        icon: "dashboard", base: "admin-dashboard", materialicons: "start", dot: false,
        roles: [ADMIN], submenuItems: [],
      },
      {
        label: "POS", link: route.pos, submenu: false, showSubRoute: false,
        icon: "phone", base: "calls", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER, CLERK], submenuItems: [],
      },
       {
        label: "Cashier Records", link: "", submenu: false, showSubRoute: false,
        icon: "phone", base: "calls", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER, CLERK], submenuItems: [],
      },
      {
        label: "Products", link: route.products, submenu: false, showSubRoute: false,
        icon: "briefcase", base: "cases", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER, KEEPER], submenuItems: [],
      },
      {
        label: "Categories", link: route.categories, submenu: false, showSubRoute: false,
        icon: "brand-stackshare", base: "sources", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER, KEEPER], submenuItems: [],
      },
      {
        label: "Customers", link: route.customers, submenu: false, showSubRoute: false,
        icon: "report", base: "quality-analysis", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER, CLERK], submenuItems: [],
      },
      {
        label: "Prescriptions", link: route.prescriptions, submenu: false, showSubRoute: false,
        icon: "report", base: "quality-analysis", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER, CLERK], submenuItems: [],
      },
      {
        label: "Sales", link: route.sales, submenu: false, showSubRoute: false,
        icon: "category", base: "sales", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER, CLERK], submenuItems: [],
      },
      {
        label: "Stock", submenu: true, showSubRoute: false,
        icon: "category", base: "sales", materialicons: "start", dot: false,
        submenuItems: [
          {
            label: "Stock Management", link: route.stock, submenu: false, showSubRoute: false,
            icon: "clipboard-list", base: "system-logs", materialicons: "start", dot: false,
            roles: [ADMIN, MANAGER, KEEPER], submenuItems: [],
          },
        ],
      },
      {
        label: "Invoices", link: route.invoices, submenu: false, showSubRoute: false,
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
            label: "Branches", link: route.branches, submenu: false, showSubRoute: false,
            icon: "users", base: "users", materialicons: "start", dot: false,
            roles: [ADMIN], submenuItems: [],
          },
          {
            label: "Staff", link: route.employees, submenu: false, showSubRoute: false,
            icon: "clipboard-list", base: "system-logs", materialicons: "start", dot: false,
            roles: [ADMIN], submenuItems: [],
          },
          {
            label: "Users", link: route.users, submenu: false, showSubRoute: false,
            icon: "clipboard-list", base: "system-logs", materialicons: "start", dot: false,
            roles: [ADMIN], submenuItems: [],
          },
        ],
      },
      {
        label: "Salaries", link: route.salaries, submenu: false, showSubRoute: false,
        icon: "users", base: "users", materialicons: "start", dot: false,
        roles: [ADMIN], submenuItems: [],
      },
      {
        label: "Compliance Records", link: route.compliance, submenu: false, showSubRoute: false,
        icon: "users", base: "users", materialicons: "start", dot: false,
        roles: [ADMIN], submenuItems: [],
      },
      {
        label: "Cheque Deposits", link: route.cheques, submenu: false, showSubRoute: false,
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
        label: "Sales Reports", link: route.caseReports, submenu: false, showSubRoute: false,
        icon: "chart-histogram", base: "case-reports", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER], submenuItems: [],
      },
      {
        label: "Payment Reports", link: route.callsReports, submenu: false, showSubRoute: false,
        icon: "headset", base: "call-reports", materialicons: "start", dot: false,
        roles: [ADMIN, MANAGER], submenuItems: [],
      },
    ],
  },
];