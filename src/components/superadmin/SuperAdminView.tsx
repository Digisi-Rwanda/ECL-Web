"use client";

import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { SuperAdminSubNav } from "./SuperAdminSubNav";
import { TenantDrawer } from "./TenantDrawer";
import { ProvisionModal } from "./ProvisionModal";
import { OverviewSection } from "./sections/OverviewSection";
import { TenantsSection } from "./sections/TenantsSection";
import { UsersSection } from "./sections/UsersSection";
import { HealthSection } from "./sections/HealthSection";
import { EngineSection } from "./sections/EngineSection";
import { AuditSection } from "./sections/AuditSection";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { ToastStack, makeToastId } from "@/components/shared/ToastStack";
import { SkeletonBlock } from "@/components/dashboard/shared/SkeletonBlock";
import { useApiSession } from "@/hooks/use-api-session";
import {
  fetchPlatformTenants,
  fetchPlatformUsers,
  fetchPlatformHealth,
  fetchEngineVersions,
  fetchPlatformOverview,
  fetchAuditLogs,
  provisionTenant,
  suspendTenant,
  reactivateTenant,
  extendTrial,
  impersonateTenant,
  promoteEngine,
  downloadAuditCsv,
} from "@/lib/api/platform";
import { mapAuditLog } from "@/lib/api/mappers";
import type {
  SuperAdminSection, TenantRecord, EngineVersion, PlatformUser,
  TenantStatus, SuperAdminModalKind, AuditEntry,
} from "@/lib/superadmin-types";
import type { PlatformHealth } from "@/lib/api/platform";
import type { ToastItem } from "@/lib/admin-types";

const FADE = {
  hidden:  { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0 },
  exit:    { opacity: 0 },
};

export function SuperAdminView() {
  const { token } = useApiSession();
  const [activeSection,     setActiveSection]     = useState<SuperAdminSection>("overview");
  const [tenants,           setTenants]           = useState<TenantRecord[]>([]);
  const [engines,           setEngines]           = useState<EngineVersion[]>([]);
  const [overview,          setOverview]          = useState<Awaited<ReturnType<typeof fetchPlatformOverview>> | null>(null);
  const [users,             setUsers]             = useState<PlatformUser[]>([]);
  const [health,            setHealth]            = useState<PlatformHealth | null>(null);
  const [audit,             setAudit]             = useState<AuditEntry[]>([]);
  const [tenantSearch,      setTenantSearch]      = useState("");
  const [tenantStatusFilter,setTenantStatusFilter]= useState<TenantStatus | "all">("all");
  const [usersLoading,      setUsersLoading]      = useState(false);
  const [healthLoading,     setHealthLoading]     = useState(false);
  const [auditLoading,      setAuditLoading]      = useState(false);
  const [drawerOpen,        setDrawerOpen]        = useState(false);
  const [drawerTenantIdx,   setDrawerTenantIdx]   = useState<number | null>(null);
  const [modal,             setModal]             = useState<SuperAdminModalKind>(null);
  const [toasts,            setToasts]            = useState<ToastItem[]>([]);
  const [isLoading,         setIsLoading]         = useState(true);

  const toast = useCallback((message: string, kind: ToastItem["kind"] = "success") => {
    const id = makeToastId();
    setToasts((prev) => [...prev, { id, message, kind }]);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const [t, e, o] = await Promise.all([
          fetchPlatformTenants(token),
          fetchEngineVersions(token),
          fetchPlatformOverview(token),
        ]);
        if (cancelled) return;
        setTenants(t);
        setEngines(e);
        setOverview(o);
      } catch {
        if (!cancelled) toast("Failed to load platform data.", "danger");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, toast]);

  useEffect(() => {
    if (!token) return;
    if (activeSection === "users" && users.length === 0) {
      setUsersLoading(true);
      fetchPlatformUsers(token)
        .then(setUsers)
        .catch(() => toast("Failed to load users.", "danger"))
        .finally(() => setUsersLoading(false));
    }
    if (activeSection === "health" && !health) {
      setHealthLoading(true);
      fetchPlatformHealth(token)
        .then(setHealth)
        .catch(() => toast("Failed to load health.", "danger"))
        .finally(() => setHealthLoading(false));
    }
    if (activeSection === "audit" && audit.length === 0) {
      setAuditLoading(true);
      fetchAuditLogs(token)
        .then(setAudit)
        .catch(() => toast("Failed to load audit log.", "danger"))
        .finally(() => setAuditLoading(false));
    }
  }, [token, activeSection, users.length, health, audit.length, toast]);

  const isDegraded = health?.overall_state === "degraded";
  const overviewAudit: AuditEntry[] = overview?.recent_audit?.map((e) =>
    mapAuditLog(e as Parameters<typeof mapAuditLog>[0]),
  ) ?? [];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (modal) { setModal(null); return; }
        if (drawerOpen) { setDrawerOpen(false); setDrawerTenantIdx(null); }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modal, drawerOpen]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  function handleSectionChange(section: SuperAdminSection) {
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openDrawer(idx: number) {
    setDrawerTenantIdx(idx);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDrawerTenantIdx(null);
  }

  async function reloadTenants() {
    if (!token) return;
    const t = await fetchPlatformTenants(token);
    setTenants(t);
  }

  async function handleSuspendConfirm(idx: number) {
    if (!token) return;
    const tenant = tenants[idx];
    try {
      await suspendTenant(token, tenant.id);
      await reloadTenants();
      setModal(null);
      closeDrawer();
      toast(`${tenant.name} suspended.`, "danger");
    } catch {
      toast("Failed to suspend tenant.", "danger");
    }
  }

  async function handleEnginePromote(idx: number) {
    if (!token) return;
    const version = engines[idx].version;
    try {
      await promoteEngine(token, version);
      const e = await fetchEngineVersions(token);
      setEngines(e);
      setModal(null);
      toast(`${version} promoted to default.`);
    } catch {
      toast("Failed to promote engine.", "danger");
    }
  }

  async function handleProvision(data: { name: string; plan: string; region: string; email: string; trial: boolean }) {
    if (!token) return;
    try {
      await provisionTenant(token, {
        name: data.name,
        admin_email: data.email,
        admin_name: data.email.split("@")[0],
        plan: data.plan.toLowerCase(),
        region: data.region.split(" ")[0],
        start_trial: data.trial,
      });
      await reloadTenants();
      handleSectionChange("tenants");
      toast(`${data.name} provisioned. Setup link emailed.`);
    } catch {
      toast("Failed to provision tenant.", "danger");
    }
  }

  async function handleReactivate(idx: number) {
    if (!token) return;
    const tenant = tenants[idx];
    try {
      await reactivateTenant(token, tenant.id);
      await reloadTenants();
      closeDrawer();
      toast(`${tenant.name} reactivated.`);
    } catch {
      toast("Failed to reactivate tenant.", "danger");
    }
  }

  async function handleExtendTrial(idx: number) {
    if (!token) return;
    const tenant = tenants[idx];
    try {
      await extendTrial(token, tenant.id, 14);
      closeDrawer();
      toast(`Trial for ${tenant.name} extended 14 days.`, "info");
    } catch {
      toast("Failed to extend trial.", "danger");
    }
  }

  async function handleImpersonate(idx: number) {
    if (!token) return;
    const tenant = tenants[idx];
    try {
      await impersonateTenant(token, tenant.id);
      setModal(null);
      closeDrawer();
      toast(`Impersonation session started for ${tenant.name}. Logged to audit.`, "info");
    } catch {
      toast("Failed to start impersonation.", "danger");
    }
  }

  async function handleExportCsv() {
    if (!token) return;
    try {
      await downloadAuditCsv(token);
      toast("CSV export downloaded.", "info");
    } catch {
      toast("Failed to export CSV.", "danger");
    }
  }

  // derived: filtered tenants
  const filteredTenants = tenants.filter((t) => {
    const matchSearch = !tenantSearch || t.name.toLowerCase().includes(tenantSearch.toLowerCase());
    const matchStatus = tenantStatusFilter === "all" || t.status === tenantStatusFilter;
    return matchSearch && matchStatus;
  });

  const modalTenant   = modal && "tenantIdx"  in modal ? tenants[modal.tenantIdx]  : null;
  const modalEngine   = modal && "engineIdx"  in modal ? engines[modal.engineIdx]  : null;

  if (isLoading) {
    return (
      <motion.div
        className="super"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <div className="super-stripe" aria-hidden />
        <div className="page-head">
          <div><SkeletonBlock height={28} width={180} /></div>
        </div>
        <div className="admin-wrap">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...Array(6)].map((_, i) => <SkeletonBlock key={i} height={38} />)}
          </div>
          <div>
            <div className="op-kpis" style={{ marginBottom: "var(--sp-5)" }}>
              {[...Array(4)].map((_, i) => <SkeletonBlock key={i} height={88} />)}
            </div>
            <div className="op-grid">
              <SkeletonBlock height={220} />
              <SkeletonBlock height={220} />
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="super"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Cyan operator stripe across top of viewport */}
      <div className="super-stripe" aria-hidden />

      {/* Degraded incident banner */}
      {isDegraded && (
        <div
          className="dash-banner failed"
          style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--sp-5)" }}
        >
          <AlertTriangle size={18} style={{ color: "var(--danger)", flex: "none" }} aria-hidden />
          <span style={{ flex: 1 }}>
            <strong>Platform incident:</strong> engine worker pool degraded. Runs are queuing across tenants. Auto-scaling in progress.
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleSectionChange("health")}
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            View health <ArrowRight size={12} aria-hidden />
          </button>
        </div>
      )}

      {/* Page header */}
      <div className="page-head" style={{ marginBottom: "var(--sp-4)" }}>
        <div>
          <h1>Platform console</h1>
          <div className="ph-sub">
            <span>Ledgerline</span>
            <span style={{ color: "var(--text-subtle)" }}>·</span>
            <span>Operator view · all tenants</span>
          </div>
        </div>
      </div>

      {/* Two-column admin layout */}
      <div className="admin-wrap">
        <SuperAdminSubNav
          activeSection={activeSection}
          tenantCount={tenants.length}
          onChange={handleSectionChange}
        />

        <div className="admin-content">
          <AnimatePresence mode="wait">
            {activeSection === "overview" && (
              <motion.div key="overview" variants={FADE} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.15 }}>
                <OverviewSection
                  tenants={tenants}
                  auditEntries={overviewAudit}
                  isLoading={false}
                  onNavigate={handleSectionChange}
                  uptime={overview?.uptime_30d}
                  trendPoints={overview?.trend_14d?.map((p) => p.runs)}
                  runsThisMonth={overview?.kpis?.runs_this_month}
                  runsToday={overview?.kpis?.runs_today}
                  mrrTotal={overview?.kpis?.mrr_total_usd}
                />
              </motion.div>
            )}

            {activeSection === "tenants" && (
              <motion.div key="tenants" variants={FADE} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.15 }}>
                <TenantsSection
                  tenants={tenants}
                  filteredTenants={filteredTenants}
                  search={tenantSearch}
                  statusFilter={tenantStatusFilter}
                  onSearchChange={setTenantSearch}
                  onStatusFilterChange={setTenantStatusFilter}
                  onRowClick={openDrawer}
                  onProvision={() => setModal({ type: "provision" })}
                  isLoading={false}
                />
              </motion.div>
            )}

            {activeSection === "users" && (
              <motion.div key="users" variants={FADE} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.15 }}>
                <UsersSection
                  users={users}
                  isLoading={usersLoading}
                  onToast={toast}
                />
              </motion.div>
            )}

            {activeSection === "health" && (
              <motion.div key="health" variants={FADE} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.15 }}>
                <HealthSection
                  isDegraded={isDegraded}
                  normalServices={health?.services ?? []}
                  normalErrors={health?.recentErrors ?? []}
                  degradedErrors={health?.recentErrors ?? []}
                  queueStats={health?.queue_stats}
                  isLoading={healthLoading}
                />
              </motion.div>
            )}

            {activeSection === "engine" && (
              <motion.div key="engine" variants={FADE} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.15 }}>
                <EngineSection
                  engines={engines}
                  onPromote={(idx) => setModal({ type: "engine-promote", engineIdx: idx })}
                  isLoading={false}
                />
              </motion.div>
            )}

            {activeSection === "audit" && (
              <motion.div key="audit" variants={FADE} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.15 }}>
                <AuditSection
                  auditEntries={audit}
                  isLoading={auditLoading}
                  onExportCsv={handleExportCsv}
                  onToast={toast}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Tenant drawer */}
      <TenantDrawer
        open={drawerOpen}
        tenantIdx={drawerTenantIdx}
        tenants={tenants}
        onClose={closeDrawer}
        onOpenModal={setModal}
        onReactivate={drawerTenantIdx !== null ? () => handleReactivate(drawerTenantIdx) : undefined}
        onExtendTrial={drawerTenantIdx !== null ? () => handleExtendTrial(drawerTenantIdx) : undefined}
      />

      {/* Impersonate modal */}
      {modal?.type === "impersonate" && modalTenant && (
        <ConfirmModal
          open
          title={`Impersonate ${modalTenant.name}?`}
          description={
            <>
              You&apos;ll see their workspace exactly as their admin does. This is <strong>logged to the platform audit trail</strong> with your operator ID, and a persistent banner will show you&apos;re impersonating. You can&apos;t start runs or change billing.
            </>
          }
          icon={
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--warning-subtle)", color: "var(--warning)", display: "grid", placeItems: "center" }}>
              <AlertTriangle size={20} aria-hidden />
            </div>
          }
          primaryLabel="Start session"
          onClose={() => setModal(null)}
          onConfirm={() => handleImpersonate(modal.tenantIdx)}
        />
      )}

      {/* Suspend modal */}
      {modal?.type === "suspend" && modalTenant && (
        <ConfirmModal
          open
          title={`Suspend ${modalTenant.name}?`}
          description={
            <>
              All <strong>{modalTenant.users} users</strong> lose access immediately. Runs and data are retained per the 7-year audit policy and can be restored on reactivation. Type <strong>SUSPEND</strong> to confirm.
            </>
          }
          primaryLabel="Suspend tenant"
          primaryVariant="danger"
          confirmInput="SUSPEND"
          onClose={() => setModal(null)}
          onConfirm={() => handleSuspendConfirm(modal.tenantIdx)}
        />
      )}

      {/* Engine promote modal */}
      {modal?.type === "engine-promote" && modalEngine && (
        <ConfirmModal
          open
          title={`Promote ${modalEngine.version} to default?`}
          description={
            <>
              New runs across all unpinned tenants will use <strong>{modalEngine.version}</strong>. <strong>Past runs are never altered</strong> — they keep the version they were computed with, so determinism holds.
            </>
          }
          primaryLabel="Promote"
          onClose={() => setModal(null)}
          onConfirm={() => handleEnginePromote(modal.engineIdx)}
        />
      )}

      {/* Provision modal */}
      {modal?.type === "provision" && (
        <ProvisionModal
          open
          onClose={() => setModal(null)}
          onProvision={(data) => {
            setModal(null);
            handleProvision(data);
          }}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </motion.div>
  );
}
