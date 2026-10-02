import { Route, Routes } from "react-router";
import { publicRoutes, authRoutes } from "./router.link";
import Feature from "./feature";
import AuthFeature from "./authFeature";
import ProtectedRoute from "./ProtectedRoute";

const ALLRoutes: React.FC = () => {
  return (
    <>
      <Routes>
        <Route element={<Feature />}>
          {publicRoutes.map((route, idx) => (
            <Route
              path={route.path}
              element={
                <ProtectedRoute roles={(route as any).roles}>
                  {route.element}
                </ProtectedRoute>
              }
              key={idx}
            />
          ))}
        </Route>

        <Route element={<AuthFeature />}>
          {authRoutes.map((route, idx) => (
            <Route path={route.path} element={route.element} key={idx} />
          ))}
        </Route>
      </Routes>
    </>
  );
};

export default ALLRoutes;