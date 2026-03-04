"use client";

import { Header } from "@/components/refine-ui/layout/header";
import { ThemeProvider } from "@/components/refine-ui/theme/theme-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { Sidebar } from "./sidebar";

export function Layout({ children }: PropsWithChildren) {
  const location = useLocation();

  useEffect(() => {
    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    const lastVisitedPath = sessionStorage.getItem("lastVisitedPath");

    if (lastVisitedPath !== currentPath) {
      sessionStorage.setItem("previousPath", lastVisitedPath ?? "");
      sessionStorage.setItem("lastVisitedPath", currentPath);
    }
  }, [location.hash, location.pathname, location.search]);

  return (
    <ThemeProvider>
      <SidebarProvider>
        <Sidebar />
        <SidebarInset>
          <Header />
          <main
            className={cn(
              "@container/main",
              "container",
              "mx-auto",
              "relative",
              "w-full",
              "flex",
              "flex-col",
              "flex-1",
              "px-2",
              "pt-4",
              "md:p-4",
              "lg:px-6",
              "lg:pt-6"
            )}
          >
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </ThemeProvider>
  );
}

Layout.displayName = "Layout";
