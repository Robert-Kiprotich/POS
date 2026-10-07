// frontend/src/routes/DynamicDashboardWrapper.tsx
import React, { useEffect } from "react";
import { useNavigate } from "react-router";
import ClerkDashboard from "../pages/users/cashier/dashboard/dashboard";
import MainDashboard from "../pages/users/admin/dashboard/dashboard";
import { all_routes } from "./all_routes";

const ROLES = {
  ADMINISTRATOR: "administrator",
  BRANCH_MANAGER: "branch manager",
  SALES_CLERK: "sales clerk",
  STORE_KEEPER: "store keeper",
  CASHIER: "cashier",
} as const;

const DynamicDashboardWrapper = () => {
  const navigate = useNavigate();

  const getSessionRole = (): string => {
    try {
      const stored = sessionStorage.getItem("user");
      if (!stored) return "";

      const sessionUser = JSON.parse(stored);

      if (typeof sessionUser.role === "string") {
        return sessionUser.role.trim().toLowerCase();
      }
      return (sessionUser.role?.role_name || "").trim().toLowerCase();
    } catch (error) {
      console.error("Error reading session role:", error);
      return "";
    }
  };

  const userRole = getSessionRole();

  useEffect(() => {
    if (userRole === ROLES.BRANCH_MANAGER) {
      navigate(all_routes.adminDashboard, { replace: true });
    } else if (userRole === ROLES.CASHIER) {
      navigate(all_routes.pos, { replace: true });
    }
  }, [userRole, navigate]);

  // Render nothing while redirecting
  if (userRole === ROLES.BRANCH_MANAGER || userRole === ROLES.CASHIER) {
    return null;
  }

  switch (userRole) {
    case ROLES.ADMINISTRATOR:
      return <MainDashboard />;
    case ROLES.SALES_CLERK:
    case ROLES.STORE_KEEPER:
    default:
      return <MainDashboard />;
  }
};

export default DynamicDashboardWrapper;