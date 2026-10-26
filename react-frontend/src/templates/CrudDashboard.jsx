import * as React from "react";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { createHashRouter, RouterProvider } from "react-router";
import DashboardLayout from "../components/DashboardLayout";
import Dashboard from "../components/Dashboard";
import Login from "./Login";
import Unauthorized from "./Unauthorized";
import ProtectedRoute from "../components/ProtectedRoute";
import NotificationsProvider from "../hooks/useNotifications/NotificationsProvider";
import DialogsProvider from "../hooks/useDialogs/DialogsProvider";
import { AuthProvider } from "../context/AuthContext";
import AppTheme from "../shared-theme/AppTheme";
import {
  dataGridCustomizations,
  datePickersCustomizations,
  sidebarCustomizations,
  formInputCustomizations,
} from "../theme/customizations";

// Code splitting por ruta: cada pantalla se descarga recién al navegar a ella,
// así la carga inicial no trae el código de todas. Login, layout y Dashboard
// quedan en el bundle principal porque son la entrada de la app.
// `requiredRoles` envuelve la pantalla en ProtectedRoute (el control real de
// permisos está en el backend; esto solo evita mostrarla a quien no corresponde).
const lazyPage = (load, requiredRoles) => async () => {
  const { default: Page } = await load();
  if (!requiredRoles) return { Component: Page };
  return {
    Component: function RoleProtectedPage() {
      return (
        <ProtectedRoute requiredRoles={requiredRoles}>
          <Page />
        </ProtectedRoute>
      );
    },
  };
};

// Mientras se descarga la pantalla de la primera carga (entrar directo a una URL).
function PageLoader() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
      <CircularProgress />
    </Box>
  );
}

const router = createHashRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/unauthorized",
    Component: Unauthorized,
  },
  {
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    HydrateFallback: PageLoader,
    children: [
      {
        path: "/",
        Component: Dashboard,
      },
      // Buscador rapido: productos por proveedor/nombre agrupados por sucursal
      {
        path: "/search",
        lazy: lazyPage(() => import("../components/QuickSearch")),
      },
      // Stock Control routes
      {
        path: "/stock-control/:branchId",
        lazy: lazyPage(() => import("../components/StockControlList")),
      },
      {
        path: "/stock-control/:branchId/control/:controlId",
        lazy: lazyPage(() => import("../components/StockControlShow")),
      },
      // Products routes
      {
        path: "/products",
        lazy: lazyPage(() => import("../components/ProductList")),
      },
      // Brands routes
      {
        path: "/brands",
        lazy: lazyPage(() => import("../components/BrandList")),
      },
      // Suppliers routes
      {
        path: "/suppliers",
        lazy: lazyPage(() => import("../components/SupplierList")),
      },
      // Sucursales: desactivar/reactivar — solo admin
      {
        path: "/branches",
        lazy: lazyPage(() => import("../components/BranchList"), ["admin"]),
      },
      // Settings (configuración global) — solo admin
      {
        path: "/settings",
        lazy: lazyPage(() => import("../components/SettingsPage"), ["admin"]),
      },
      // Importacion manual de stock por CSV (contingencia) — solo admin
      {
        path: "/import-stock",
        lazy: lazyPage(() => import("../components/StockImportPage"), ["admin"]),
      },
      // Users routes
      {
        path: "/users",
        lazy: lazyPage(() => import("../components/UsersList")),
      },
      {
        path: "/users/new",
        lazy: lazyPage(() => import("../components/UserCreate")),
      },
      {
        path: "/users/:userId/edit",
        lazy: lazyPage(() => import("../components/UserEdit")),
      },
      // Marcas a prueba (admin/manager)
      {
        path: "/brand-trials",
        lazy: lazyPage(() => import("../components/BrandTrialList"), ["admin", "manager"]),
      },
      // Orders routes
      {
        path: "/orders",
        lazy: lazyPage(() => import("../components/OrderList")),
      },
      {
        path: "/orders/:orderId",
        lazy: lazyPage(() => import("../components/OrderShow")),
      },
      // Fallback route - redirect to dashboard
      {
        path: "*",
        element: <Dashboard />,
      },
    ],
  },
]);

const themeComponents = {
  ...dataGridCustomizations,
  ...datePickersCustomizations,
  ...sidebarCustomizations,
  ...formInputCustomizations,
};

export default function CrudDashboard(props) {
  return (
    <AppTheme {...props} themeComponents={themeComponents}>
      <CssBaseline enableColorScheme />
      <AuthProvider>
        <NotificationsProvider>
          <DialogsProvider>
            <RouterProvider router={router} />
          </DialogsProvider>
        </NotificationsProvider>
      </AuthProvider>
    </AppTheme>
  );
}
