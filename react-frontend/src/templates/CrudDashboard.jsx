import * as React from "react";
import CssBaseline from "@mui/material/CssBaseline";
import { createHashRouter, RouterProvider } from "react-router";
import DashboardLayout from "../components/DashboardLayout";
import Dashboard from "../components/Dashboard";
import ProductList from "../components/ProductList";
import BrandList from "../components/BrandList";
import SupplierList from "../components/SupplierList";
import BrandTrialList from "../components/BrandTrialList";
import SettingsPage from "../components/SettingsPage";
import StockControlList from "../components/StockControlList";
import StockControlShow from "../components/StockControlShow";
import OrderList from "../components/OrderList";
import OrderShow from "../components/OrderShow";
import UsersList from "../components/UsersList";
import UserCreate from "../components/UserCreate";
import UserEdit from "../components/UserEdit";
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
    children: [
      {
        path: "/",
        Component: Dashboard,
      },
      // Stock Control routes
      {
        path: "/stock-control/:branchId",
        Component: StockControlList,
      },
      {
        path: "/stock-control/:branchId/control/:controlId",
        Component: StockControlShow,
      },
      // Products routes
      {
        path: "/products",
        Component: ProductList,
      },
      // Brands routes
      {
        path: "/brands",
        Component: BrandList,
      },
      // Suppliers routes
      {
        path: "/suppliers",
        Component: SupplierList,
      },
      // Settings (configuración global) — solo admin
      {
        path: "/settings",
        element: (
          <ProtectedRoute requiredRoles={["admin"]}>
            <SettingsPage />
          </ProtectedRoute>
        ),
      },
      // Users routes
      {
        path: "/users",
        Component: UsersList,
      },
      {
        path: "/users/new",
        Component: UserCreate,
      },
      {
        path: "/users/:userId/edit",
        Component: UserEdit,
      },
      // Marcas a prueba (admin/manager)
      {
        path: "/brand-trials",
        element: (
          <ProtectedRoute requiredRoles={["admin", "manager"]}>
            <BrandTrialList />
          </ProtectedRoute>
        ),
      },
      // Orders routes
      {
        path: "/orders",
        Component: OrderList,
      },
      {
        path: "/orders/:orderId",
        Component: OrderShow,
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
