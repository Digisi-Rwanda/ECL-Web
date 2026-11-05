"use client";

import { useEffect } from "react";
import { DashboardProvider } from "./DashboardContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileDrawer } from "./MobileDrawer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDashboard } from "./DashboardContext";
import type { AppShellUser, Tenant } from "@/lib/dashboard-types";

// ── Inner shell (needs context) ────────────────────────────────────────────

interface ShellInnerProps {
  user: AppShellUser;
  tenant: Tenant;
  allTenants: Tenant[];
  children: React.ReactNode;
}

function ShellInner({
  user,
  tenant,
  allTenants,
  children,
}: ShellInnerProps) {
  const { state, dispatch } = useDashboard();
  const { isCollapsed, isMobileDrawerOpen } = state;

  // Auto-collapse sidebar on tablet
  useEffect(() => {
    function handleResize() {
      const w = window.innerWidth;
      if (w < 1024 && w >= 768) {
        dispatch({ type: "SET_COLLAPSED", value: true });
      } else if (w >= 1024) {
        dispatch({ type: "SET_COLLAPSED", value: false });
      }
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [dispatch]);

  return (
    <div
      className="app-shell"
      data-collapsed={isCollapsed ? "true" : undefined}
    >
      {/* Sidebar — CSS hides it on mobile, shows on md+ */}
      <div className="app-shell-sidebar">
        <Sidebar isCollapsed={isCollapsed} />
      </div>

      {/* Topbar */}
      <div className="app-shell-topbar">
        <Topbar
          user={user}
          tenant={tenant}
          allTenants={allTenants}
          onOpenMobileDrawer={() => dispatch({ type: "OPEN_MOBILE_DRAWER" })}
          onToggleCollapse={() => dispatch({ type: "TOGGLE_COLLAPSE" })}
        />
      </div>

      {/* Main content — CSS adds bottom padding on mobile to clear BottomNav */}
      <main className="app-shell-main">
        {/* Blueprint grid motif */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 220,
            zIndex: 0,
            pointerEvents: "none",
            backgroundImage:
              "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            maskImage: "linear-gradient(#000, transparent)",
            WebkitMaskImage: "linear-gradient(#000, transparent)",
            opacity: 0.7,
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 1180,
            margin: "0 auto",
            padding: "var(--sp-6) var(--gutter) var(--sp-16)",
          }}
        >
          {children}
        </div>
      </main>

      {/* Mobile: slide-in drawer */}
      <MobileDrawer
        open={isMobileDrawerOpen}
        onClose={() => dispatch({ type: "CLOSE_MOBILE_DRAWER" })}
      />

    </div>
  );
}

// ── Public shell (mounts provider) ────────────────────────────────────────

interface AppShellProps {
  user: AppShellUser;
  tenant: Tenant;
  allTenants: Tenant[];
  children: React.ReactNode;
}

export function AppShell({
  user,
  tenant,
  allTenants,
  children,
}: AppShellProps) {
  return (
    <DashboardProvider defaultTenant={tenant}>
      <TooltipProvider delayDuration={300}>
      <ShellInner
        user={user}
        tenant={tenant}
        allTenants={allTenants}
      >
        {children}
      </ShellInner>
      </TooltipProvider>
    </DashboardProvider>
  );
}
