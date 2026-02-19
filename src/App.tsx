import { Refine, } from "@refinedev/core";
import { DevtoolsPanel, DevtoolsProvider } from "@refinedev/devtools";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import routerProvider, {
  DocumentTitleHandler,
  UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { liveProvider } from "@refinedev/supabase";
import { BrowserRouter, Outlet, Route, Routes } from "react-router";
import "./App.css";
import { Toaster } from "./components/refine-ui/notification/toaster";
import { useNotificationProvider } from "./components/refine-ui/notification/use-notification-provider";
import { ThemeProvider } from "./components/refine-ui/theme/theme-provider";
import authProvider from "./providers/auth";
import { dataProvider } from "./providers/data";
import { supabaseClient } from "./providers/supabase-client";
import { Home, Package, Users, FileText } from "lucide-react";
import Dashboard from "./pages/dashboard";
import { Layout } from "./components/refine-ui/layout/layout";
import ItemList from "./pages/items/list";
import ItemCreate from "./pages/items/create";

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <ThemeProvider>
          <DevtoolsProvider>
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
              }}
              resources={[
                {
                  name: 'dashboard',
                  list: '/',
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
                <Route element={
                  <Layout>
                    <Outlet />
                  </Layout>
                }>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="items">
                    <Route index element={<ItemList />} />
                    <Route path="create" element={<ItemCreate />} />
                  </Route>
                </Route>
              </Routes>
              <Toaster />
              <RefineKbar />
              <UnsavedChangesNotifier />
              <DocumentTitleHandler />
            </Refine>
            <DevtoolsPanel />
          </DevtoolsProvider>
        </ThemeProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
