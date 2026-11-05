/**
 * Leases data layer — API adapter for /api/v1/tenants/{id}/leases/*.
 *
 * The server is authoritative (validation, approvals, locking, catch-ups, posting). This module keeps
 * one snapshot of GET /state in the same LeasesState shape the screens already render, and every
 * mutation calls the API and then refreshes that snapshot. Pure helpers below mirror server rules so
 * the UI can explain problems before a request is sent.
 */
import { apiFetch, ApiError } from "@/lib/api/client";
import { buildApiPath } from "@/lib/env";
import { D } from "./engine";
import { isISODate, type ISODate } from "./dates";
import { approvedChain, curveOf, glOf, isExempt, pendingVersion, policyOf } from "./model";
import type { ActualPayment, CloseStepId, ImportBatch, JournalBatch, Lease, LeaseVersion, LeasesState } from "./types";

type Listener = () => void;
const listeners = new Set<Listener>();
let state: LeasesState | null = null;
let auth: { tenantId: string; token: string } | null = null;

export class LeaseError extends Error {
  constructor(message: string, public code: "conflict" | "forbidden" | "invalid" | "not_found" = "invalid", public field?: string) {
    super(message);
  }
}

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getState(): LeasesState | null {
  return state;
}
function emit() {
  if (state) state = { ...state }; // new reference so useSyncExternalStore re-renders
  listeners.forEach((l) => l());
}

const CODE: Record<number, LeaseError["code"]> = { 403: "forbidden", 404: "not_found", 409: "conflict" };

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!auth) throw new LeaseError("Workspace not loaded", "not_found");
  try {
    return await apiFetch<T>(`/tenants/${auth.tenantId}/leases${path}`, {
      method, token: auth.token, timeoutMs: 60_000,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof ApiError) throw new LeaseError(e.message, CODE[e.status] ?? "invalid");
    throw e;
  }
}

/** Download a server-generated file (CSV) with the bearer token. */
async function fetchText(path: string): Promise<string> {
  const res = await fetch(buildApiPath(`/tenants/${auth!.tenantId}/leases${path}`), { headers: { Authorization: `Bearer ${auth!.token}` }, credentials: "include" });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new LeaseError(b.detail ?? "Download failed.", CODE[res.status] ?? "invalid");
  }
  return (await res.text()).replace(/^﻿/, "");
}

export function configure(tenantId: string, token: string) {
  const changed = auth?.tenantId !== tenantId;
  auth = { tenantId, token };
  if (changed) state = null;
}

export async function refresh(): Promise<LeasesState> {
  const s = await api<LeasesState>("GET", "/state");
  // server-computed close issues + reconciliations for every non-locked close
  const issues: NonNullable<LeasesState["closeIssues"]> = {};
  for (const c of s.closes) {
    if (s.periods.find((p) => p.key === c.period)?.status === "locked") continue;
    try { issues[c.period] = await api("GET", `/close/${c.period}/issues`); } catch { /* close vanished between calls */ }
  }
  s.closeIssues = issues;
  // keep any import rows already fetched for the detail screen
  if (state) for (const b of s.imports) {
    const prev = state.imports.find((x) => x.id === b.id);
    if (prev?.rows?.length && b.status === prev.status) b.rows = prev.rows;
  }
  state = s;
  emit();
  return s;
}

export async function load(tenantId: string, token: string): Promise<LeasesState> {
  configure(tenantId, token);
  if (state?.tenantId === tenantId) return state;
  return refresh();
}

async function mutate<T>(method: string, path: string, body?: unknown): Promise<T> {
  const out = await api<T>(method, path, body);
  await refresh();
  return out;
}

// ─── Setup ─────────────────────────────────────────────────────────────────

export const saveEntity = (entity: NonNullable<LeasesState["entity"]>, bookName: string) =>
  mutate("PUT", "/entity", { ...entity, bookName });
export const openFirstPeriod = (key: string) => mutate("POST", "/periods", { key });
export const submitVersioned = async (key: "policies" | "curves" | "gl", data: unknown, effectiveFrom: ISODate, reason: string) =>
  (await mutate<{ version: number }>("POST", `/setup/${key}`, { data, effectiveFrom, reason })).version;
export const decideVersioned = (key: "policies" | "curves" | "gl", version: number, approve: boolean, comment = "") =>
  mutate("POST", `/setup/${key}/${version}/decision`, { approve, comment });

// ─── Leases ────────────────────────────────────────────────────────────────

export const createDraft = (base: Pick<Lease, "name" | "assetClass" | "counterpartyId" | "location">) =>
  mutate<{ id: string; rev: number }>("POST", "", base);

export type DraftPatch = {
  lease?: Partial<Pick<Lease, "name" | "assetClass" | "counterpartyId" | "location" | "currency" | "ownerId" | "costCentre" | "contractTotal" | "signatureDate" | "wizardStep" | "contractEndDate">>;
  version?: Partial<Pick<LeaseVersion, "terms" | "assessment" | "rate" | "reason" | "effectiveDate" | "scopeDecrease" | "terminationPenalty">>;
};

/** Autosave: no full refresh (it runs every few seconds); the local snapshot is patched instead. */
export async function updateDraft(id: string, rev: number, patch: DraftPatch): Promise<number> {
  const out = await api<{ rev: number }>("PATCH", `/${id}`, { rev, ...patch });
  const l = state?.leases.find((x) => x.id === id);
  const v = l && pendingVersion(l);
  if (l && v) {
    Object.assign(l, patch.lease ?? {}, { rev: out.rev });
    const before = JSON.stringify([v.terms, v.assessment, v.rate]);
    Object.assign(v, patch.version ?? {});
    if (JSON.stringify([v.terms, v.assessment, v.rate]) !== before) v.calculated = undefined;
    if (v.status === "returned") v.status = "draft";
    emit();
  }
  return out.rev;
}

export const calculate = async (id: string, rev: number) => (await mutate<{ rev: number }>("POST", `/${id}/calculate`, { rev })).rev;
export const submitForReview = async (id: string, rev: number, approverId: string, note = "") =>
  (await mutate<{ rev: number }>("POST", `/${id}/submit`, { rev, approverId, note })).rev;
export const withdraw = async (id: string, rev: number) => (await mutate<{ rev: number }>("POST", `/${id}/withdraw`, { rev })).rev;
export const decide = async (id: string, rev: number, approve: boolean, text: string, field?: string) =>
  (await mutate<{ rev: number }>("POST", `/${id}/decision`, { rev, approve, text, field })).rev;
export const discardDraft = (id: string) => mutate("DELETE", `/${id}/draft`);

export type EventDraft = {
  event: "index" | "term" | "modification" | "termination";
  effectiveDate: ISODate;
  reason: string;
  newAmount?: string;
  newEndDate?: ISODate;
  scopeDecrease?: string;
  terminationPenalty?: string;
  rate: LeaseVersion["rate"];
  approverId?: string;
};
/** Creates the event version and submits it to the reviewer in one server transaction. */
export const startEvent = async (id: string, rev: number, ev: EventDraft) => (await mutate<{ rev: number }>("POST", `/${id}/events`, { ...ev, rev })).rev;

export async function addDoc(id: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return mutate<{ id: string; sha256: string; rev: number }>("POST", `/${id}/documents`, form);
}
export const removeDoc = (id: string, docId: string) => mutate("DELETE", `/${id}/documents/${docId}`);
export const documentUrl = async (id: string, docId: string) => (await api<{ url: string }>("GET", `/${id}/documents/${docId}/url`)).url;
export const addCounterparty = async (name: string) => (await mutate<{ id: string }>("POST", "/counterparties", { name })).id;

// ─── Close ─────────────────────────────────────────────────────────────────

export const startClose = (period: string) => mutate("POST", `/close/${period}/start`);
export const completeStep = (period: string, id: CloseStepId, note = "", acceptWarning = false) =>
  mutate("POST", `/close/${period}/steps/${id}/complete`, { note, acceptWarning });
export const generateBatch = async (period: string) => (await mutate<{ id: string }>("POST", `/close/${period}/generate`)).id;
export const resolvePayment = (period: string, paymentId: string, resolution: NonNullable<ActualPayment["resolution"]>, note: string) =>
  mutate("PATCH", `/close/${period}/payments/${paymentId}`, { resolution, note });
export const confirmScheduledPayments = async (period: string) =>
  (await mutate<{ confirmed: number }>("POST", `/close/${period}/payments/confirm-scheduled`, {})).confirmed;
export async function uploadPayments(period: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return mutate<{ matched: number; unmatched: number }>("POST", `/close/${period}/payments`, form);
}
/** Server builds the ERP file (and marks the batch exported). Returns CSV text. */
export async function exportBatch(code: string): Promise<string> {
  const text = await fetchText(`/batches/${code}/export`);
  await refresh();
  return text;
}
export const markPosted = (code: string, erpRef: string) => mutate("POST", `/batches/${code}/post`, { erpRef });
export const lockPeriod = (period: string) => mutate("POST", `/periods/${period}/lock`);
export const reopenPeriod = (period: string, reason: string) => mutate("POST", `/periods/${period}/reopen`, { reason });

export function stepIssues(st: LeasesState, c: { period: string }, id: CloseStepId): { errors: string[]; warnings: string[] } {
  return st.closeIssues?.[c.period]?.steps?.[id] ?? { errors: [], warnings: [] };
}
export function reconciliations(st: LeasesState, c: { period: string }) {
  return st.closeIssues?.[c.period]?.reconciliations ?? [];
}
export function batchStale(st: LeasesState, b: JournalBatch) {
  const cur = st.closeIssues?.[b.period]?.sourceChecksum;
  return b.status === "draft" && !!cur && !!b.sourceRevs && cur !== b.sourceRevs;
}

// ─── Imports ───────────────────────────────────────────────────────────────

export async function createImport(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  return (await mutate<{ id: string }>("POST", "/imports", form)).id;
}
/** Fetch one import with its rows (the snapshot carries imports without rows). */
export async function refreshImport(code: string): Promise<ImportBatch> {
  const b = await api<ImportBatch>("GET", `/imports/${code}`);
  if (state) {
    const i = state.imports.findIndex((x) => x.id === code);
    if (i >= 0) state.imports[i] = b;
    else state.imports.unshift(b);
    emit();
  }
  return b;
}
const importAction = (code: string, action: string, body?: unknown) => mutate<Record<string, number>>("POST", `/imports/${code}/${action}`, body ?? {});
export const setImportMapping = async (code: string, mapping: Record<string, string>) => {
  await mutate("PUT", `/imports/${code}/mapping`, { mapping });
  await refreshImport(code);
};
export const acceptImportWarnings = async (code: string) => { await importAction(code, "accept-warnings"); await refreshImport(code); };
export const startCommit = async (code: string) => { await importAction(code, "commit"); await refreshImport(code); };
export const retryFailed = async (code: string) => { await importAction(code, "retry"); await refreshImport(code); };
export const cancelImport = (code: string) => importAction(code, "cancel");
export const submitImported = async (code: string, approverId: string) => (await importAction(code, "submit", { approverId })).submitted;
export const importErrorsCsv = (code: string) => fetchText(`/imports/${code}/errors.csv`);

// ─── Views & notifications ─────────────────────────────────────────────────

export const saveView = (name: string, query: string) => mutate("POST", "/views", { name, query });
export const deleteView = (id: string) => mutate("DELETE", `/views/${id}`);
export async function markNotificationsRead(ids?: string[]) {
  if (state) for (const n of state.notifications) if (!ids || ids.includes(n.id)) n.read = true;
  emit();
  await api("POST", "/notifications/read", { ids });
}

// ─── Pure helpers (same rules as the server; for instant UI feedback) ──────

export function setupStatus(st: LeasesState) {
  return {
    entity: !!st.entity && !!st.book,
    periods: st.periods.length > 0,
    policy: !!policyOf(st),
    rates: !!curveOf(st),
    gl: !!glOf(st),
  };
}

export function validateVersion(st: LeasesState, l: Lease, v: LeaseVersion): Record<string, string> {
  const e: Record<string, string> = {};
  const t = v.terms;
  if (!l.name.trim()) e.name = "Give the lease a name.";
  if (!l.counterpartyId) e.counterpartyId = "Choose the lessor.";
  if (!isISODate(t.commencementDate)) e.commencementDate = "Commencement date is required.";
  if (!isISODate(t.endDate)) e.endDate = "End date is required.";
  if (isISODate(t.commencementDate) && isISODate(t.endDate) && t.endDate <= t.commencementDate) e.endDate = "End date must be after commencement.";
  if (l.signatureDate && isISODate(t.commencementDate) && l.signatureDate > t.commencementDate) {
    // allowed (signed after access) but worth confirming → handled as a warning in the UI
  }
  if (l.currency !== st.entity?.currency) e.currency = `Foreign-currency leases aren't supported yet. Use ${st.entity?.currency}.`;
  const r = t.paymentRule;
  if ((!r || !r.amount) && !t.manualLines.length) e.amount = "Add the payment amount or at least one payment line.";
  if (r?.amount && D(r.amount).lte(0)) e.amount = "Payment must be more than zero.";
  if (r?.rentFreeMonths && r.rentFreeMonths < 0) e.rentFreeMonths = "Can't be negative.";
  for (const [i, m] of t.manualLines.entries()) {
    if (!isISODate(m.date)) e[`line${i}`] = `Line ${i + 1}: date is required.`;
    if (!m.amount || D(m.amount).isZero()) e[`line${i}`] = `Line ${i + 1}: amount is required.`;
  }
  const exempt = isExempt(v);
  if (!exempt) {
    if (!v.rate.value) e.rate = "Discount rate is required.";
    else if (D(v.rate.value).lte(0) || D(v.rate.value).gt(0.4)) e.rate = "Rate must be between 0% and 40%.";
    if (v.rate.source === "override" && !v.rate.reason?.trim()) e.rateReason = "Explain why the curve rate isn't used.";
  }
  const a = v.assessment;
  if (v.event === "initial") {
    if (a.identifiedAsset === null) e.identifiedAsset = "Answer this question.";
    if (a.rightToControl === null) e.rightToControl = "Answer this question.";
    if (a.identifiedAsset === false || a.rightToControl === false) e.notLease = "This contract doesn't contain a lease. Discard the draft or change the answers.";
    if (a.exemption === null) e.exemption = "Answer this question.";
    if (exempt && !a.exemptionRationale.trim()) e.exemptionRationale = "Explain why the exemption applies.";
    a.options.forEach((o, i) => {
      if (o.reasonablyCertain === null) e[`option${i}`] = "Say whether this option is reasonably certain.";
      else if (!o.rationale.trim()) e[`option${i}`] = "Give a rationale.";
    });
    if (a.purchaseOption.exists && a.purchaseOption.reasonablyCertain === null) e.purchaseOption = "Say whether the purchase option is reasonably certain.";
  }
  if (v.event !== "initial") {
    if (!isISODate(v.effectiveDate)) e.effectiveDate = "Effective date is required.";
    const chain = approvedChain(l);
    const prev = chain[chain.length - 1];
    if (prev && v.effectiveDate && v.effectiveDate <= (chain.length > 1 ? prev.effectiveDate : prev.terms.commencementDate)) e.effectiveDate = "Must be after the previous version's effective date.";
    if (prev && v.effectiveDate && v.effectiveDate > prev.terms.endDate) e.effectiveDate = "Must be within the lease term.";
    if (!v.reason.trim()) e.reason = "Describe the change.";
    if (v.scopeDecrease && (D(v.scopeDecrease).lte(0) || D(v.scopeDecrease).gte(1))) e.scopeDecrease = "Enter a share between 0% and 100%.";
  }
  return e;
}

export function possibleDuplicates(st: LeasesState, l: Lease) {
  const v = pendingVersion(l) ?? l.versions[0];
  const a = v.terms.commencementDate;
  const b = v.terms.endDate;
  if (!a || !b) return [];
  return st.leases.filter((x) => {
    if (x.id === l.id || x.counterpartyId !== l.counterpartyId) return false;
    const xv = approvedChain(x)[0] ?? x.versions[0];
    return xv.terms.commencementDate <= b && xv.terms.endDate >= a && x.location === l.location;
  });
}



export function closeOf(st: LeasesState, period: string) {
  return st.closes.find((c) => c.period === period);
}

export function batchTotals(b: JournalBatch) {
  const dr = b.lines.reduce((a, l) => a.plus(l.debit), D(0));
  const cr = b.lines.reduce((a, l) => a.plus(l.credit), D(0));
  return { dr: dr.toFixed(2), cr: cr.toFixed(2), balanced: dr.eq(cr) };
}

export const IMPORT_TEMPLATE_VERSION = "LL-LEASES-1.0";

export const IMPORT_COLUMNS = [
  { key: "lease_ref", label: "Lease reference", required: true },
  { key: "name", label: "Lease name", required: true },
  { key: "asset_class", label: "Asset class", required: true },
  { key: "lessor", label: "Lessor", required: true },
  { key: "location", label: "Location", required: false },
  { key: "currency", label: "Currency", required: true },
  { key: "commencement_date", label: "Commencement date", required: true },
  { key: "end_date", label: "End date", required: true },
  { key: "payment_amount", label: "Payment amount", required: true },
  { key: "frequency", label: "Frequency", required: true },
  { key: "timing", label: "Timing", required: true },
  { key: "rent_free_months", label: "Rent-free months", required: false },
  { key: "escalation_pct", label: "Escalation %", required: false },
  { key: "escalation_every_months", label: "Escalation every (months)", required: false },
  { key: "discount_rate_pct", label: "Discount rate %", required: false },
  { key: "initial_direct_costs", label: "Initial direct costs", required: false },
  { key: "incentives", label: "Incentives received", required: false },
  { key: "restoration_estimate", label: "Restoration estimate", required: false },
  { key: "exemption", label: "Exemption", required: false },
] as const;

export function importTemplateRows(): string[][] {
  return [
    IMPORT_COLUMNS.map((c) => c.key),
    ["HQ-01", "Head office Kigali", "property", "Vision City Estates", "Kigali", "RWF", "2027-01-01", "2031-12-31", "4500000", "monthly", "advance", "2", "5", "12", "", "1200000", "0", "8000000", "none"],
    ["FLEET-07", "Toyota Hilux ×4", "vehicles", "Rwanda Motor Leasing", "Kigali", "RWF", "2027-02-01", "2030-01-31", "1850000", "monthly", "arrears", "0", "", "", "14.5", "0", "0", "0", "none"],
  ];
}
