import { Navigate } from "react-router";
import { all_routes } from "./all_routes";



interface ProtectedRouteProps {
  roles?: string[];
  children: React.ReactNode;
}
const route = all_routes;
const ProtectedRoute = ({ roles, children }: ProtectedRouteProps) => {
  // No roles specified on the route = open to any logged-in user
  if (!roles || roles.length === 0) return <>{children}</>;

  let userRole = "";
  try {
    const stored = sessionStorage.getItem("user");
    const user = stored ? JSON.parse(stored) : null;
    // NOTE: confirm this matches the real shape once Header/Sidebar
    // are reconciled — currently assuming Header's flat `role` field.
    userRole = (user?.role || "").toLowerCase();
  } catch {
    userRole = "";
  }

  const allowed = roles.map((r) => r.toLowerCase()).includes(userRole);

  if (!allowed) return <Navigate to={route.dashboard} replace />;

  return <>{children}</>;
};

export default ProtectedRoute;