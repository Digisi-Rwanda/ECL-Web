"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { moduleForPath } from "@/components/shell/modules";
import { Menu, Plus } from "lucide-react";
import { useSession } from "next-auth/react";
import { useApiSession } from "@/hooks/use-api-session";
import { TenantMenu } from "./TenantMenu";
import { NotificationsDropdown } from "./NotificationsDropdown";
import { UserMenu } from "./UserMenu";
import { switchTenant } from "@/lib/api/auth-api";
import { formatRole } from "@/lib/format-role";
import type { AppShellUser, Tenant } from "@/lib/dashboard-types";

interface TopbarProps {
  user: AppShellUser;
  tenant: Tenant;
  allTenants: Tenant[];
  onOpenMobileDrawer: () => void;
  onToggleCollapse: () => void;
}

export function Topbar({
  user,
  tenant,
  allTenants,
  onOpenMobileDrawer,
  onToggleCollapse,
}: TopbarProps) {
  const [activeTenant, setActiveTenant] = useState<Tenant>(tenant);
  const [switching, setSwitching] = useState(false);
  const { role, token } = useApiSession();
  const { update } = useSession();
  const router = useRouter();
  const mod = moduleForPath(usePathname());
  const create =
    role === "reviewer" ? null
    : mod.id === "leases" ? { href: "/leases/new", label: "New lease" }
    : { href: "/ecl/runs/new", label: "New run" };

  useEffect(() => {
    setActiveTenant(tenant);
  }, [tenant]);

  function handleMenuPress() {
    if (window.innerWidth < 768) onOpenMobileDrawer();
    else onToggleCollapse();
  }

  async function handleSwitch(t: Tenant) {
    if (t.id === activeTenant.id || switching || !token) return;
    setSwitching(true);
    try {
      const data = await switchTenant(token, t.id);
      await update({
        accessToken: data.access_token,
        tenantId: data.tenant_id,
        tenantName: data.tenant_name,
        role: data.role,
        currency: data.currency,
      });
      setActiveTenant({
        ...t,
        currency: data.currency,
        role: formatRole(data.role) as Tenant["role"],
      });
      router.refresh();
    } catch {
      /* keep current tenant on failure */
    } finally {
      setSwitching(false);
    }
  }

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--sp-4)",
        padding: "0 var(--gutter)",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        zIndex: 35,
        height: "var(--topbar-h)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", minWidth: 0 }}>
        <button
          className="topbar-icon-btn"
          onClick={handleMenuPress}
          aria-label="Toggle navigation"
        >
          <Menu size={18} />
        </button>

        <TenantMenu
          activeTenant={activeTenant}
          allTenants={allTenants}
          onSwitch={handleSwitch}
          switching={switching}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {create && (
          <Link
            href={create.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: "var(--control-h)",
              padding: "0 14px",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--r-sm)",
              fontFamily: "var(--font-ui)",
              fontSize: "var(--fs-body)",
              fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "background var(--t-micro)",
              textDecoration: "none",
            }}
          >
            <Plus size={16} />
            <span className="hidden sm:inline">{create.label}</span>
          </Link>
        )}

        <NotificationsDropdown />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
