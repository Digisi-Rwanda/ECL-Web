"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, Info, AlertTriangle, CheckCircle } from "lucide-react";
import { PlanTag } from "./atoms/PlanTag";
import { StatusPill } from "./atoms/StatusPill";
import type { TenantRecord, SuperAdminModalKind } from "@/lib/superadmin-types";

interface TenantDrawerProps {
  open: boolean;
  tenantIdx: number | null;
  tenants: TenantRecord[];
  onClose: () => void;
  onOpenModal: (m: SuperAdminModalKind) => void;
  onReactivate?: () => void | Promise<void>;
  onExtendTrial?: () => void | Promise<void>;
}

export function TenantDrawer({
  open,
  tenantIdx,
  tenants,
  onClose,
  onOpenModal,
  onReactivate,
  onExtendTrial,
}: TenantDrawerProps) {
  const tenant = tenantIdx !== null ? tenants[tenantIdx] : null;

  return (
    <AnimatePresence>
      {open && tenant && (
        <>
          {/* scrim */}
          <motion.div
            style={{
              position: "fixed", inset: 0,
              background: "var(--scrim)", zIndex: 80,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
          />

          {/* drawer panel */}
          <motion.aside
            className="super-drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            aria-label={`Tenant details: ${tenant.name}`}
            role="dialog"
            aria-modal="true"
          >
            {/* head */}
            <div className="super-drawer-head">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  className="tn-mark"
                  style={{
                    width: 36, height: 36, borderRadius: 9, fontSize: 13,
                    background: `color-mix(in srgb, ${tenant.color} 16%, transparent)`,
                    color: tenant.color,
                  }}
                >
                  {tenant.mark}
                </span>
                <div>
                  <div style={{ fontWeight: "var(--fw-semibold)" as string, fontSize: "var(--fs-h3)" }}>
                    {tenant.name}
                  </div>
                  <div style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)", marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
                    <PlanTag plan={tenant.plan} />
                    <span>· created {tenant.created}</span>
                  </div>
                </div>
              </div>
              <button
                className="btn btn-icon"
                onClick={onClose}
                aria-label="Close tenant drawer"
              >
                <X size={16} aria-hidden />
              </button>
            </div>

            {/* body */}
            <div className="super-drawer-body">
              <div style={{ marginBottom: 16 }}>
                <StatusPill status={tenant.status} />
              </div>

              {/* stats grid */}
              <div className="drawer-stat">
                <div className="ds">
                  <div className="k">Users</div>
                  <div className="v">{tenant.users}</div>
                </div>
                <div className="ds">
                  <div className="k">Runs this month</div>
                  <div className="v">{tenant.runs}</div>
                </div>
                <div className="ds">
                  <div className="k">MRR</div>
                  <div className="v">{tenant.mrr ? `$${tenant.mrr.toLocaleString("en-US")}` : "—"}</div>
                </div>
                <div className="ds">
                  <div className="k">Engine pin</div>
                  <div className="v" style={{ fontSize: "0.9rem" }}>
                    Latest <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>(default)</span>
                  </div>
                </div>
              </div>

              {/* tenant admins */}
              <div style={{ fontSize: "var(--fs-caption)", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-mono)", marginBottom: 8 }}>
                Tenant admins
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                {[
                  { initials: "TM", name: "Tendai Mwangi",  email: `t.mwangi@${tenant.name.split(" ")[0].toLowerCase()}.co.ke`  },
                  { initials: "AK", name: "A. Karanja",     email: `a.karanja@${tenant.name.split(" ")[0].toLowerCase()}.co.ke` },
                ].map((admin) => (
                  <div key={admin.initials} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="avatar avatar-sm">{admin.initials}</span>
                    <div>
                      <div style={{ fontWeight: "var(--fw-medium)" as string, fontSize: "var(--fs-body)" }}>{admin.name}</div>
                      <div style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>{admin.email}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* status callout */}
              {tenant.status === "trial" && (
                <div className="callout callout-info" style={{ display: "flex", gap: 10 }}>
                  <Info size={16} style={{ flex: "none", marginTop: 1 }} aria-hidden />
                  <span>Trial ends in 9 days. Extend or convert to a paid plan.</span>
                </div>
              )}
              {tenant.status === "suspended" && (
                <div className="callout callout-warning" style={{ display: "flex", gap: 10 }}>
                  <AlertTriangle size={16} style={{ flex: "none", marginTop: 1 }} aria-hidden />
                  <span>Suspended for non-payment on 12 May. Data retained per policy.</span>
                </div>
              )}
              {tenant.status === "active" && (
                <div className="callout callout-success" style={{ display: "flex", gap: 10 }}>
                  <CheckCircle size={16} style={{ flex: "none", marginTop: 1 }} aria-hidden />
                  <span>Healthy. Last run 30 May 2026.</span>
                </div>
              )}
            </div>

            {/* footer actions */}
            <div className="super-drawer-foot">
              <button
                className="btn btn-secondary"
                onClick={() => onOpenModal({ type: "impersonate", tenantIdx: tenantIdx! })}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                Impersonate
              </button>

              {tenant.status === "trial" && onExtendTrial && (
                <button className="btn btn-secondary" onClick={() => void onExtendTrial()}>
                  Extend trial
                </button>
              )}

              {tenant.status === "suspended" && onReactivate && (
                <button
                  className="btn btn-primary"
                  onClick={() => void onReactivate()}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <CheckCircle size={14} aria-hidden />
                  Reactivate
                </button>
              )}

              {tenant.status === "active" && (
                <button
                  className="btn btn-danger"
                  onClick={() => onOpenModal({ type: "suspend", tenantIdx: tenantIdx! })}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  Suspend
                </button>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
