import { Authenticated, Refine } from "@refinedev/core";
import { DevtoolsPanel, DevtoolsProvider } from "@refinedev/devtools";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import routerProvider, {
  NavigateToResource,
  DocumentTitleHandler,
  UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { liveProvider } from "@refinedev/supabase";
import { BrowserRouter, Outlet, Route, Routes } from "react-router";
import "./App.css";
import { Toaster } from "./components/refine-ui/notification/toaster";
import { useNotificationProvider } from "./components/refine-ui/notification/use-notification-provider";
import { ThemeProvider } from "./components/refine-ui/theme/theme-provider";
import { authProvider } from "./providers/auth";
import { dataProvider } from "./providers/data";
import { supabaseClient } from "./providers/supabase-client";
import { Home, Package, Users, FileText } from "lucide-react";
import Dashboard from "./pages/dashboard";
import { Layout } from "./components/refine-ui/layout/layout";
import ItemList from "./pages/items/list";
import ItemCreate from "./pages/items/create";
import LoginPage from "./pages/login";
import RegisterPage from "./pages/register";
import ForgotPasswordPage from "./pages/forgot-password";

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <ThemeProvider>
            <Refine
              dataProvider={dataProvider}
              liveProvider={liveProvider(supabaseClient)}
              authProvider={authProvider}
              routerProvider={routerProvider}
              notificationProvider={useNotificationProvider()}
              options={{
                syncWithLocation: true,
                warnWhenUnsavedChanges: true,
                projectId: "L6Lpfe-nuWoit-1MSid6",
                title: {
                  text: <h1 className="ml-2">ALECO WAREHOUSE</h1>,
                  icon: <img src="/aleco-icon.ico" alt="Logo" className="w-6 h-6" style={{ width: '24px', height: '24px' }} />
                }
              }}
              resources={[
                {
                  name: 'dashboard',
                  list: '/dashboard',
                  meta: {
                    label: 'Dashboard',
                    icon: <Home className="w-4 h-4" />
                  }
                },
                {
                  name: 'items',
                  list: '/items',
                  create: '/items/create',
                  meta: {
                    label: 'Inventory',
                    icon: <Package className="w-4 h-4" />
                  }
                },
                {
                  name: 'users',
                  list: '/users',
                  create: '/users/create',
                  meta: {
                    label: 'Users',
                    icon: <Users className="w-4 h-4" />
                  }
                },
                {
                  name: "reports",
                  list: "/reports",
                  meta: {
                    label: "Reports",
                    icon: <FileText className="w-4 h-4" />,
                  },
                },
              ]}
            >
              <Routes>
                {/* Auth routes */}

                <Route
                  element={
                    <Authenticated key="auth-pages" fallback={<Outlet />}>
                      <NavigateToResource resource="dashboard" />
                    </Authenticated>
                  }>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                </Route>

                <Route
                  element={
                    <Authenticated key="protected-routes">
                      <Layout>
                        <Outlet />
                      </Layout>
                    </Authenticated>
                  }>
                  <Route index element={<NavigateToResource resource="dashboard" />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="items">
                    <Route index element={<ItemList />} />
                    <Route path="create" element={<ItemCreate />} />
                  </Route>

                  {/* Resource routes will be handled by Refine */}
                </Route>
              </Routes>
              <Toaster />
              <RefineKbar />
              <UnsavedChangesNotifier />
              <DocumentTitleHandler />
            </Refine>

        </ThemeProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
