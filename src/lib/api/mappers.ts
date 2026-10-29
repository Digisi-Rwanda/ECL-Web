import type { Member, AdminSegment, CollateralType, TenantProfile } from "@/lib/admin-types";
import type { NotifPrefs, Session, UserProfile } from "@/lib/settings-types";
import type {
  AuditEntry,
  EngineVersion,
  HealthService,
  PlatformUser,
  TenantRecord,
  TenantStatus,
} from "@/lib/superadmin-types";
import type {
  DashboardData,
  DashboardState,
  KpiData,
  SegmentBar,
  StageSlice,
  TrendPoint,
  Run,
  Tenant,
  AppShellUser,
  BannerProps,
} from "@/lib/dashboard-types";
import type {
  RunListItem,
  RunDetail,
  RunDetailStatus,
  RunInputFile,
  AuditEvent,
  EngineInfo,
} from "@/lib/runs-types";
import type { ComputeStage } from "@/lib/new-run-types";
import type {
  SegmentData,
  LoanRow,
  LoanDetail,
  MonthlyRundown,
  RunContext,
  PDMatrix,
} from "@/lib/results-types";
import type {
  DashboardRaw,
  DashboardKpiRaw,
  DashboardRunRaw,
} from "@/lib/api/dashboard";
import type {
  RunListItemRaw,
  RunDetailRaw,
  RunInputFileRaw,
  AuditEventRaw,
  EngineProgressRaw,
} from "@/lib/api/runs";
import type {
  SegmentDataRaw,
  LoanRowRaw,
  LoanDetailRaw,
  MonthlyRundownRaw,
  PortfolioRaw,
} from "@/lib/api/results";

import { formatRole } from "@/lib/format-role";
import type { Notification } from "@/lib/dashboard-types";

export { formatRole };

export interface NotificationRaw {
  id: string;
  kind: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const dt = new Date(iso);
  const seconds = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 172800) return "Yesterday";
  return `${Math.floor(seconds / 86400)} days ago`;
}

export function mapNotification(raw: NotificationRaw): Notification {
  const kindMap: Record<string, Notification["kind"]> = {
    run_completed: "ok",
    run_failed: "warn",
    member_joined: "info",
    weekly_summary: "info",
  };
  return {
    id: raw.id,
    kind: kindMap[raw.kind] ?? "info",
    title: raw.title,
    description: raw.body,
    timeAgo: formatRelativeTime(raw.created_at),
    read: raw.is_read,
  };
}

export function mapUserProfile(data: {
  user: {
    name: string;
    title?: string | null;
    email: string;
    role: string;
    initials: string;
  };
}): UserProfile {
  return {
    name: data.user.name,
    title: data.user.title ?? "",
    email: data.user.email,
    role: formatRole(data.user.role),
    initials: data.user.initials,
  };
}

export function mapNotifPrefs(data: {
  run_completed: boolean;
  run_failed: boolean;
  weekly_summary: boolean;
  member_joined: boolean;
  product_updates: boolean;
}): NotifPrefs {
  return {
    runCompleted: data.run_completed,
    runFailed: data.run_failed,
    weeklySummary: data.weekly_summary,
    memberJoined: data.member_joined,
    productUpdates: data.product_updates,
  };
}

export function mapSession(s: {
  id: string;
  title: string;
  description: string;
  device: string;
  current: boolean;
}): Session {
  return {
    id: s.id,
    icon: s.device === "phone" ? "phone" : "laptop",
    title: s.title,
    description: s.description,
    current: s.current,
  };
}

export function mapMember(m: {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: string;
  status: string;
  last_active_at?: string | null;
  is_you: boolean;
}): Member {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    initials: m.initials,
    role: formatRole(m.role) as Member["role"],
    status: m.status as Member["status"],
    lastActive: formatRelativeTime(m.last_active_at),
    isYou: m.is_you,
  };
}

export function mapSegment(s: {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  runs_count: number;
}): AdminSegment {
  return {
    id: s.id,
    name: s.name,
    code: s.code ?? "",
    runsCount: s.runs_count,
    disabled: !s.is_active,
  };
}

export function mapCollateral(c: {
  id: string;
  name: string;
  haircut: number | string;
  time_to_realize: number;
}): CollateralType {
  return {
    id: c.id,
    name: c.name,
    haircut: Number(c.haircut),
    timeToRealize: c.time_to_realize,
  };
}

export function mapTenantProfile(t: {
  name: string;
  reporting_cadence: string;
  currency: string;
  timezone: string;
}): TenantProfile {
  return {
    name: t.name,
    reportingCadence: t.reporting_cadence === "quarterly" ? "Quarterly" : "Monthly",
    currency: t.currency,
    timezone: t.timezone,
  };
}

export function mapTenantRecord(t: {
  id: string;
  name: string;
  plan: string;
  status: string;
  created_at: string;
  mrr?: number;
  runs_count?: number;
}): TenantRecord {
  const colors = ["#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444"];
  const idx = t.name.charCodeAt(0) % colors.length;
  return {
    id: t.id,
    name: t.name,
    mark: t.name[0]?.toUpperCase() ?? "?",
    color: colors[idx],
    plan: (t.plan.charAt(0).toUpperCase() + t.plan.slice(1)) as TenantRecord["plan"],
    status: t.status as TenantStatus,
    users: 0,
    runs: t.runs_count ?? 0,
    created: new Date(t.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
    mrr: t.mrr ?? 0,
  };
}

export function mapPlatformUser(u: {
  name: string;
  email: string;
  tenant_name?: string | null;
  role?: string | null;
  is_active: boolean;
  last_active_at?: string | null;
}): PlatformUser {
  return {
    name: u.name,
    email: u.email,
    tenant: u.tenant_name ?? "—",
    role: u.role ? (formatRole(u.role) as PlatformUser["role"]) : "Analyst",
    status: u.is_active ? "active" : "disabled",
    lastActive: formatRelativeTime(u.last_active_at),
  };
}

const AUDIT_EVENT_META: Record<string, { cls: string; icon: string; title: string }> = {
  TENANT_PROVISIONED: { cls: "accent", icon: "Rocket", title: "Tenant provisioned" },
  TENANT_SUSPENDED: { cls: "err", icon: "Ban", title: "Tenant suspended" },
  TENANT_REACTIVATED: { cls: "ok", icon: "Check", title: "Tenant reactivated" },
  IMPERSONATION_STARTED: { cls: "accent", icon: "Fingerprint", title: "Impersonation started" },
  IMPERSONATION_ENDED: { cls: "", icon: "Fingerprint", title: "Impersonation ended" },
  ENGINE_PROMOTED: { cls: "ok", icon: "Cpu", title: "Engine promoted to default" },
  USER_FORCE_RESET: { cls: "", icon: "Users", title: "User force-reset" },
};

export function mapAuditLog(entry: {
  event_type: string;
  user_id?: string | null;
  tenant_id?: string | null;
  created_at: string;
  details?: Record<string, unknown> | null;
  status?: string | null;
}): AuditEntry {
  const meta = AUDIT_EVENT_META[entry.event_type] ?? {
    cls: entry.status === "error" ? "err" : "",
    icon: entry.status === "error" ? "AlertTriangle" : "Check",
    title: entry.event_type.replace(/_/g, " ").toLowerCase(),
  };
  const details = entry.details ?? {};
  const description =
    typeof details.description === "string"
      ? details.description
      : Object.entries(details)
          .filter(([k]) => !["description"].includes(k))
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(" · ") || "—";
  const actor = entry.user_id ? `operator: ${entry.user_id.slice(0, 8)}` : "";
  const dt = new Date(entry.created_at);
  const timestamp = dt.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return {
    cls: meta.cls,
    icon: meta.icon,
    title: meta.title,
    description,
    actor,
    timestamp,
  };
}

const HEALTH_ICONS: Record<string, string> = {
  "API Gateway": "Globe",
  "Engine Workers": "Cpu",
  "Object Storage": "Server",
  "Email Delivery": "Mail",
};

export function mapHealthService(s: {
  name: string;
  state: string;
  value: string;
}): HealthService {
  return {
    name: s.name,
    icon: HEALTH_ICONS[s.name] ?? "Server",
    value: s.value,
    state: s.state as HealthService["state"],
  };
}

export function mapEngineVersion(v: {
  version: string;
  release_date: string;
  is_current: boolean;
  tenants_pinned: number;
  changelog: string[];
}): EngineVersion {
  return {
    version: v.version,
    releaseDate: v.release_date,
    isCurrent: v.is_current,
    tenantsPinned: v.tenants_pinned,
    changelog: v.changelog,
  };
}

// ── Dashboard mappers ─────────────────────────────────────────────────────

function mapDashboardKpi(raw: DashboardKpiRaw): KpiData {
  return {
    id: raw.id,
    label: raw.label,
    helpText: raw.helpText,
    currencyPrefix: raw.currencyPrefix,
    value: raw.value,
    delta: raw.delta,
    deltaDir: raw.deltaDir,
    subNote: raw.subNote,
    staleAsOf: raw.staleAsOf,
  };
}

function mapDashboardRun(raw: DashboardRunRaw): Run {
  const statusMap: Record<string, Run["status"]> = {
    complete: "success",
    success: "success",
    failed: "failed",
    running: "running",
    pd_running: "running",
    lgd_running: "running",
    ead_running: "running",
    queued: "queued",
  };
  return {
    id: raw.fullId ? raw.fullId.slice(0, 4) + "…" + raw.fullId.slice(-4) : raw.id,
    fullId: raw.fullId ?? raw.id,
    period: raw.period,
    byInitials: raw.byInitials,
    byName: raw.byName,
    status: statusMap[raw.status] ?? "queued",
    eclAmount: raw.eclAmount,
    currency: raw.currency,
  };
}

function deriveDashboardState(raw: DashboardRaw): DashboardState {
  if (raw.activeRun) return "running";
  if (!raw.runs || raw.runs.length === 0) return "empty";
  const hasComplete = raw.runs.some((r) =>
    ["complete", "success"].includes(r.status),
  );
  const latestFailed = raw.runs[0]?.status === "failed";
  if (!hasComplete && latestFailed) return "failed";
  if (!hasComplete) return "incomplete";
  return "healthy";
}

function deriveBannerProps(
  raw: DashboardRaw,
  state: DashboardState,
): BannerProps | undefined {
  if (state === "running" && raw.activeRun) {
    return {
      variant: "running",
      progress: raw.activeRun.progress ?? 0,
    };
  }
  if (state === "failed" && raw.runs[0]) {
    return {
      variant: "failed",
      failedAt: raw.runs[0].period,
      errorRef: raw.runs[0].fullId ?? raw.runs[0].id,
    };
  }
  if (state === "incomplete") {
    return { variant: "incomplete" };
  }
  return undefined;
}

export function mapDashboardToPageData(
  raw: DashboardRaw,
  tenant: Tenant,
  user: AppShellUser,
  allTenants: Tenant[] = [],
): DashboardData {
  const state = deriveDashboardState(raw);
  const bannerProps = deriveBannerProps(raw, state);

  const kpis: KpiData[] = (raw.kpis ?? []).map(mapDashboardKpi);

  const segments: SegmentBar[] = (raw.segments ?? []).map((s) => ({
    name: s.name,
    value: s.value,
  }));

  const stages: StageSlice[] = (raw.stages ?? []).map((s, i) => ({
    stage: s.stage,
    percent: s.percent,
    colorVar: (s.colorVar ?? (i + 1)) as StageSlice["colorVar"],
  }));

  const trend: TrendPoint[] = (raw.trend ?? []).map((t) => ({
    label: t.label,
    value: t.value,
  }));

  const runs: Run[] = (raw.runs ?? []).map(mapDashboardRun);

  return {
    state,
    tenant,
    allTenants: allTenants.length > 0 ? allTenants : [tenant],
    user,
    kpis,
    segments,
    stages,
    trend,
    runs,
    notifications: [],
    bannerProps,
  };
}

// ── Run mappers ────────────────────────────────────────────────────────────

const RUN_STATUS_MAP: Record<string, RunDetailStatus> = {
  draft: "draft",
  queued: "queued",
  pd_running: "running",
  lgd_running: "running",
  ead_running: "running",
  running: "running",
  complete: "success",
  success: "success",
  failed: "failed",
  deleted: "deleted",
};

function formatFileSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncateHash(hash?: string): string {
  if (!hash) return "—";
  if (hash.length <= 8) return hash;
  return hash.slice(0, 4) + "…" + hash.slice(-4);
}

function formatRunDate(iso: string): string {
  const dt = new Date(iso);
  return dt.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function mapRunListItem(raw: RunListItemRaw): RunListItem {
  const status: RunDetailStatus = RUN_STATUS_MAP[raw.status] ?? "draft";

  return {
    id: raw.id,
    fullId: raw.fullId,
    name: raw.name ?? "Unnamed Run",
    period: raw.period ?? "—",
    createdAt: raw.createdAt ?? "—",
    byInitials: raw.byInitials ?? "?",
    byName: raw.byName ?? "Unknown",
    status,
    eclAmount: raw.eclAmount ?? null,
    coverage: raw.coverage ?? null,
    currency: raw.currency ?? "USD",
  };
}

function mapInputFile(raw: RunInputFileRaw): RunInputFile {
  return {
    type: raw.type,
    name: raw.name,
    size: raw.size,
    sheets: raw.sheets,
    validationStatus: raw.validationStatus,
    warningCount: raw.warningCount ?? undefined,
    hash: raw.hash,
  };
}

const RUN_AUDIT_META: Record<string, { kind: AuditEvent["kind"]; icon: string }> = {
  RUN_CREATED: { kind: "default", icon: "Plus" },
  RUN_UPLOADED: { kind: "default", icon: "Upload" },
  RUN_VALIDATED: { kind: "ok", icon: "CheckCircle" },
  RUN_EXECUTED: { kind: "accent", icon: "Play" },
  RUN_COMPLETED: { kind: "ok", icon: "CheckCircle2" },
  RUN_FAILED: { kind: "err", icon: "XCircle" },
  RUN_DELETED: { kind: "err", icon: "Trash2" },
};

function mapAuditEvent(raw: AuditEventRaw): AuditEvent {
  return {
    id: raw.id,
    kind: raw.kind,
    iconName: raw.iconName,
    title: raw.title,
    description: raw.description,
    who: raw.who,
    time: raw.time,
  };
}

export function mapRunDetail(raw: RunDetailRaw): RunDetail {
  const listItem = mapRunListItem(raw);

  const kpis: KpiData[] = (raw.kpis ?? []).map((k) => ({
    id: k.id,
    label: k.label,
    helpText: k.helpText ?? undefined,
    currencyPrefix: k.currencyPrefix ?? undefined,
    value: k.value,
    delta: k.delta ?? undefined,
    deltaDir: k.deltaDir ?? undefined,
    subNote: k.subNote ?? undefined,
  }));

  const segments: SegmentBar[] = (raw.segments ?? []).map((s) => ({
    name: s.name,
    value: s.value,
  }));

  const inputFiles: RunInputFile[] = (raw.inputFiles ?? []).map(mapInputFile);
  const auditEvents: AuditEvent[] = (raw.auditEvents ?? []).map(mapAuditEvent);

  const engineInfo: EngineInfo = {
    version: raw.engineInfo?.version ?? "—",
    releasedDate: raw.engineInfo?.releasedDate ?? "—",
    pdMethod: raw.engineInfo?.pdMethod ?? "—",
    lgdMethod: raw.engineInfo?.lgdMethod ?? "—",
    eadMethod: raw.engineInfo?.eadMethod ?? "—",
    pdFilesCombined: raw.engineInfo?.pdFilesCombined ?? false,
    deterministic: raw.engineInfo?.deterministic ?? true,
  };

  const failureDetails = raw.failureDetails
    ? {
        stage: raw.failureDetails.stage,
        message: raw.failureDetails.message,
        ref: raw.failureDetails.ref,
      }
    : undefined;

  return {
    ...listItem,
    elapsed: raw.elapsed ?? undefined,
    kpis,
    segments,
    inputFiles,
    auditEvents,
    engineInfo,
    failureDetails,
    deletedBy: raw.deletedBy ?? undefined,
    deletedAt: raw.deletedAt ?? undefined,
    acceptedWarnings: raw.acceptedWarnings ?? undefined,
    workbooksStatus: raw.workbooksStatus ?? undefined,
  };
}

export function mapEngineProgress(raw: EngineProgressRaw | null | undefined): ComputeStage[] {
  if (!raw) {
    return [
      { id: "pd", title: "PD engine", description: "Transition matrices · 299 monthly powers", status: "pending", durationMs: 1600 },
      { id: "lgd", title: "LGD engine", description: "Discounting collateral · cure rates", status: "pending", durationMs: 2000 },
      { id: "ead", title: "EAD engine", description: "Forward rundown · expected balances", status: "pending", durationMs: 1600 },
      { id: "ecl", title: "ECL assembly", description: "PD × LGD × EAD · discounting to today", status: "pending", durationMs: 1200 },
    ];
  }

  const backendToFrontend: Record<string, "pending" | "active" | "done" | "error"> = {
    pending: "pending",
    queued: "pending",
    running: "active",
    complete: "done",
    failed: "error",
  };

  const stages = [
    { key: "pd" as const, id: "pd", title: "PD engine", description: "Transition matrices · 299 monthly powers", durationMs: 1600 },
    { key: "lgd" as const, id: "lgd", title: "LGD engine", description: "Discounting collateral · cure rates", durationMs: 2000 },
    { key: "ead" as const, id: "ead", title: "EAD engine", description: "Forward rundown · expected balances", durationMs: 1600 },
    { key: "ecl" as const, id: "ecl", title: "ECL assembly", description: "PD × LGD × EAD · discounting to today", durationMs: 1200 },
  ];

  return stages.map(({ key, id, title, description, durationMs }) => {
    const stageRaw = raw[key];
    const status = backendToFrontend[stageRaw.status] ?? "pending";

    let elapsed: string | undefined;
    if (status === "active" && stageRaw.started_at) {
      const ms = Date.now() - new Date(stageRaw.started_at).getTime();
      elapsed = `${(ms / 1000).toFixed(1)}s`;
    } else if (status === "done" && stageRaw.elapsed_ms != null) {
      elapsed = `${(stageRaw.elapsed_ms / 1000).toFixed(1)}s`;
    }

    return { id, title, description, status, elapsed, durationMs };
  });
}

export function mapSegmentData(raw: SegmentDataRaw): SegmentData {
  const mix = raw.mix ?? [raw.stage1_pct ?? 0, raw.stage2_pct ?? 0, raw.stage3_pct ?? 0];
  return {
    name: raw.name,
    mix,
    ecl: raw.ecl,
    outstanding: raw.outstanding,
    coverage: typeof raw.coverage === "number"
      ? `${Number(raw.coverage).toFixed(2)}%`
      : String(raw.coverage),
    loans: raw.loans,
    delta: raw.delta ?? 0,
  };
}

export function mapPortfolio(raw: PortfolioRaw): {
  segments: SegmentData[];
  context: Partial<RunContext>;
} {
  const ctx = raw.runContext;
  return {
    segments: (raw.segments ?? []).map(mapSegmentData),
    context: ctx
      ? {
          runId: ctx.runId,
          period: ctx.period,
          computedAt: ctx.computedAt,
          engineVersion: ctx.engineVersion,
          currency: ctx.currency,
        }
      : {},
  };
}

export function mapLoanRow(raw: LoanRowRaw): LoanRow {
  return {
    id: raw.id,
    customer: raw.customer,
    stage: raw.stage as 1 | 2 | 3,
    pd: raw.pd,
    lgd: raw.lgd,
    ead: raw.ead,
    ecl: raw.ecl,
  };
}

export function mapMonthlyRundown(raw: MonthlyRundownRaw): MonthlyRundown {
  return {
    month: raw.month,
    marginalPd: raw.marginal_pd ?? 0,
    cumulativePd: raw.cumulative_pd ?? 0,
    ead: raw.ead,
    ecl: raw.ecl,
  };
}

export function mapLoanDetail(raw: LoanDetailRaw): LoanDetail {
  return {
    ...mapLoanRow(raw),
    segment: raw.segment,
    outstanding: raw.outstanding,
    collateralValue: raw.collateral_value ?? 0,
    maturity: raw.maturity ?? "—",
    rundown: (raw.rundown ?? []).map(mapMonthlyRundown),
  };
}

export function mapPdMatrix(
  raw: [[number, number, number], [number, number, number], [number, number, number]] | undefined,
): PDMatrix {
  if (!raw) return [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  return raw;
}
