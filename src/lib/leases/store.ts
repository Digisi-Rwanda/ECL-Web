/**
 * Leases data layer — demo adapter.
 * shortcut: state lives in this browser (localStorage per tenant); replace with an HTTP adapter for
 * /api/v1/leases/* when the backend exists. Every rule here (validation, approvals, locking, catch-ups)
 * is real and is what the server must enforce.
 */
import { D } from "./engine";
import { addDays, isISODate, monthEnd, monthKey, nextMonthKey, type ISODate } from "./dates";
import {
  approvedChain, computeLease, computeWithPending, cumulativeByAccount, curveOf, glOf, isExempt,
  isLockedDate, leaseJournals, leaseStatus, lastLocked, pendingVersion, persona, policyOf, todayISO,
} from "./model";
import type {
  ActualPayment, CloseRun, CloseStep, CloseStepId, ImportBatch, JournalBatch, Lease, LeaseVersion,
  LeasesState, PostedLine, Versioned,
} from "./types";
import type { AccountKey, JournalKind } from "./engine";

const KEY = (tenant: string) => `ledgerline.leases.v1.${tenant}`;
type Listener = () => void;
const listeners = new Set<Listener>();
let state: LeasesState | null = null;

export class LeaseError extends Error {
  constructor(message: string, public code: "conflict" | "forbidden" | "invalid" | "not_found" = "invalid") {
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

export async function load(tenantId: string, seed: (tenantId: string, mode: "sample" | "empty") => LeasesState): Promise<LeasesState> {
  if (state?.tenantId === tenantId) return state;
  let s: LeasesState | null = null;
  try {
    const raw = localStorage.getItem(KEY(tenantId));
    if (raw) s = JSON.parse(raw) as LeasesState;
  } catch {
    s = null; // corrupted or blocked storage → reseed below
  }
  if (!s || s.schema !== 1) s = seed(tenantId, "sample");
  state = s;
  persist();
  return s;
}

function persist() {
  if (!state) return;
  // new top-level reference so useSyncExternalStore subscribers re-render (writes mutate nested objects)
  state = { ...state };
  try {
    localStorage.setItem(KEY(state.tenantId), JSON.stringify(state));
  } catch {
    // quota / private mode: keep working in memory
  }
  listeners.forEach((l) => l());
}

const now = () => new Date().toISOString();
const latency = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 180));

function s(): LeasesState {
  if (!state) throw new LeaseError("Workspace not loaded", "not_found");
  return state;
}
export function nextId(prefix: string): string {
  const st = s();
  st.seq.id += 1;
  return `${prefix}_${st.seq.id.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
function me() {
  return persona(s());
}
function audit(action: string, target: string, detail?: string) {
  s().audit.unshift({ id: nextId("au"), at: now(), by: me().id, action, target, detail });
  if (s().audit.length > 2000) s().audit.length = 2000;
}
function notify(to: string, title: string, body: string, href: string) {
  s().notifications.unshift({ id: nextId("nt"), at: now(), to, title, body, href, read: false });
}
function requireRole(...roles: Array<"administrator" | "analyst" | "reviewer">) {
  if (!roles.includes(me().role)) throw new LeaseError(`Your role (${me().role}) can't do this.`, "forbidden");
}
function lease(id: string): Lease {
  const l = s().leases.find((x) => x.id === id);
  if (!l) throw new LeaseError("Lease not found", "not_found");
  return l;
}
function touch(l: Lease, rev?: number) {
  if (rev !== undefined && rev !== l.rev) {
    throw new LeaseError("Someone else changed this lease while you were editing. Reload to see their changes.", "conflict");
  }
  l.rev += 1;
  l.updatedAt = now();
}

async function mutate<T>(fn: () => T): Promise<T> {
  await latency();
  const before = JSON.stringify(state);
  try {
    const out = fn();
    persist();
    return out;
  } catch (e) {
    state = JSON.parse(before); // all-or-nothing
    throw e;
  }
}

// ─── Demo controls ─────────────────────────────────────────────────────────

export function setPersona(id: string) {
  s().personaId = id;
  persist();
}

export function reset(seed: (tenantId: string, mode: "sample" | "empty") => LeasesState, mode: "sample" | "empty") {
  const t = s().tenantId;
  state = seed(t, mode);
  persist();
}

export function markNotificationsRead(ids?: string[]) {
  for (const n of s().notifications) if (!ids || ids.includes(n.id)) n.read = true;
  persist();
}

// ─── Setup ─────────────────────────────────────────────────────────────────

export function setupStatus(st: LeasesState) {
  return {
    entity: !!st.entity && !!st.book,
    periods: st.periods.length > 0,
    policy: !!policyOf(st),
    rates: !!curveOf(st),
    gl: !!glOf(st),
  };
}

export const saveEntity = (entity: NonNullable<LeasesState["entity"]>, bookName: string) =>
  mutate(() => {
    requireRole("administrator");
    s().entity = entity;
    s().book = { id: s().book?.id ?? nextId("bk"), entityId: entity.id, name: bookName, framework: "IFRS16", standardVersion: "IFRS 16 (2016, as amended)" };
    audit("setup.entity", entity.name);
  });

export const openFirstPeriod = (key: string) =>
  mutate(() => {
    requireRole("administrator");
    if (s().periods.length) throw new LeaseError("Periods already exist.");
    if (!/^\d{4}-\d{2}$/.test(key)) throw new LeaseError("Pick a valid month.");
    s().periods.push({ key, status: "open", reopenLog: [] });
    audit("setup.period", key);
  });

type VersionedKey = "policies" | "curves" | "gl";

/** Saves a new version (never edits an approved one). Admin submits; a different person approves. */
export const submitVersioned = <K extends VersionedKey>(key: K, data: Omit<LeasesState[K][number], keyof Versioned>, effectiveFrom: ISODate, reason: string) =>
  mutate(() => {
    requireRole("administrator");
    if (!isISODate(effectiveFrom)) throw new LeaseError("Effective date is required.");
    const list = s()[key] as unknown as Versioned[];
    if (list.length && !reason.trim()) throw new LeaseError("Give a reason for the change.");
    if (list.some((v) => v.status === "in_review")) throw new LeaseError("Another change is waiting for approval. Approve or withdraw it first.");
    const version = list.reduce((m, v) => Math.max(m, v.version), 0) + 1;
    // first-time setup is approved straight away (nothing depends on it yet)
    const first = list.length === 0;
    const v = { ...data, version, effectiveFrom, reason: reason || "Initial setup", status: first ? "approved" : "in_review", createdBy: me().id, createdAt: now(), ...(first ? { approvedBy: me().id, approvedAt: now() } : {}) };
    list.push(v as Versioned);
    audit(`setup.${key}.submit`, `v${version}`, reason);
    if (!first) notify("*reviewer", `${key === "gl" ? "GL mapping" : key === "curves" ? "Discount-rate curve" : "Policy"} v${version} needs approval`, reason, "/leases/inbox");
    return version;
  });

export const decideVersioned = (key: VersionedKey, version: number, approve: boolean, comment = "") =>
  mutate(() => {
    requireRole("reviewer", "administrator");
    const list = s()[key] as unknown as Versioned[];
    const v = list.find((x) => x.version === version);
    if (!v || v.status !== "in_review") throw new LeaseError("This change is no longer waiting for approval.");
    if (v.createdBy === me().id) throw new LeaseError("You can't approve your own change.", "forbidden");
    if (approve) {
      v.status = "approved";
      v.approvedBy = me().id;
      v.approvedAt = now();
    } else {
      list.splice(list.indexOf(v), 1);
    }
    audit(`setup.${key}.${approve ? "approve" : "reject"}`, `v${version}`, comment);
    notify(v.createdBy, `${approve ? "Approved" : "Rejected"}: ${key} v${version}`, comment || "", "/leases/setup");
  });

// ─── Leases: drafts ────────────────────────────────────────────────────────

export const createDraft = (base: Pick<Lease, "name" | "assetClass" | "counterpartyId" | "location">) =>
  mutate(() => {
    requireRole("administrator", "analyst");
    const st = s();
    if (!st.entity) throw new LeaseError("Finish setup before adding leases.");
    st.seq.lease += 1;
    const t = now();
    const v: LeaseVersion = {
      n: 1, status: "draft", event: "initial", effectiveDate: "", reason: "New lease",
      terms: {
        commencementDate: "", endDate: "", manualLines: [], nonLeasePerPayment: "0", separateNonLease: true,
        prepaidBeforeCommencement: "0", initialDirectCosts: "0", incentivesReceived: "0", restorationEstimate: "0",
        paymentRule: { amount: "", frequency: "monthly", timing: "arrears", escalation: { type: "none" }, rentFreeMonths: 0 },
      },
      assessment: {
        identifiedAsset: null, rightToControl: null, exemption: null, exemptionRationale: "", options: [],
        purchaseOption: { exists: false, reasonablyCertain: null, rationale: "" }, termRationale: "",
      },
      rate: { value: "", source: "curve" },
      createdBy: me().id, createdAt: t, comments: [],
    };
    const l: Lease = {
      id: nextId("ls"), code: `L-${String(st.seq.lease).padStart(4, "0")}`, ...base, entityId: st.entity.id,
      currency: st.entity.currency, ownerId: me().id, costCentre: "", versions: [v], docs: [], wizardStep: 0,
      createdAt: t, updatedAt: t, rev: 1,
    };
    st.leases.unshift(l);
    audit("lease.create", l.code);
    return { id: l.id, rev: l.rev };
  });

export type DraftPatch = {
  lease?: Partial<Pick<Lease, "name" | "assetClass" | "counterpartyId" | "location" | "currency" | "ownerId" | "costCentre" | "contractTotal" | "signatureDate" | "wizardStep" | "contractEndDate">>;
  version?: Partial<Pick<LeaseVersion, "terms" | "assessment" | "rate" | "reason" | "effectiveDate" | "scopeDecrease" | "terminationPenalty">>;
};

/** Autosave for the pending version. Any input change clears the calculation. */
export const updateDraft = (id: string, rev: number, patch: DraftPatch) =>
  mutate(() => {
    const l = lease(id);
    const v = pendingVersion(l);
    if (!v || v.status === "in_review") throw new LeaseError("This version is in review and can't be edited. Withdraw it first.", "conflict");
    if (v.createdBy !== me().id && me().role !== "administrator") throw new LeaseError("Only the preparer can edit this draft.", "forbidden");
    touch(l, rev);
    if (patch.lease) Object.assign(l, patch.lease);
    if (patch.version) {
      const keys = ["terms", "assessment", "rate", "effectiveDate", "scopeDecrease", "terminationPenalty"] as const;
      const inputsChanged = keys.some((k) => k in patch.version! && JSON.stringify(patch.version![k]) !== JSON.stringify(v[k]));
      Object.assign(v, patch.version);
      if (inputsChanged) v.calculated = undefined;
    }
    if (v.event === "initial" && v.terms.commencementDate) v.effectiveDate = v.terms.commencementDate;
    if (v.status === "returned") v.status = "draft";
    return l.rev;
  });

/** Validates inputs before calculation; returns human messages keyed by field. */
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

export const calculate = (id: string, rev: number) =>
  mutate(() => {
    const l = lease(id);
    const v = pendingVersion(l);
    if (!v) throw new LeaseError("Nothing to calculate.");
    const errs = validateVersion(s(), l, v);
    if (Object.keys(errs).length) throw new LeaseError(Object.values(errs)[0]);
    touch(l, rev);
    if (isExempt(v)) {
      v.calculated = { at: now(), liability: "0.00", rou: "0.00", checksOk: true };
      return l.rev;
    }
    const c = computeWithPending(s(), l);
    if (!c) throw new LeaseError("Calculation failed. Check the dates and payments.");
    const seg = c.segments[c.segments.length - 1];
    v.calculated = { at: now(), liability: seg.L0.toFixed(2), rou: seg.R0.toFixed(2), checksOk: c.checks.every((k) => k.ok) };
    return l.rev;
  });

export const submitForReview = (id: string, rev: number, approverId: string, note = "") =>
  mutate(() => {
    requireRole("administrator", "analyst");
    const l = lease(id);
    const v = pendingVersion(l);
    if (!v || (v.status !== "draft" && v.status !== "returned")) throw new LeaseError("There's no draft to submit.");
    if (!v.calculated) throw new LeaseError("Calculate before submitting.");
    if (!v.calculated.checksOk) throw new LeaseError("Integrity checks must pass before submitting.");
    if (approverId === me().id) throw new LeaseError("You can't approve your own lease. Choose someone else.", "forbidden");
    const approver = s().personas.find((p) => p.id === approverId);
    if (!approver || approver.role === "analyst") throw new LeaseError("Choose a reviewer or administrator.");
    touch(l, rev);
    v.status = "in_review";
    v.submittedBy = me().id;
    v.submittedAt = now();
    v.approverId = approverId;
    v.comments.push({ id: nextId("cm"), by: me().id, at: now(), text: note || "Submitted for review", kind: "submit" });
    audit("lease.submit", `${l.code} v${v.n}`);
    notify(approverId, `${l.code} needs your review`, `${l.name} · v${v.n} ${v.event === "initial" ? "new lease" : v.event}`, `/leases/${l.id}`);
    return l.rev;
  });

export const withdraw = (id: string, rev: number) =>
  mutate(() => {
    const l = lease(id);
    const v = pendingVersion(l);
    if (!v || v.status !== "in_review") throw new LeaseError("Nothing in review to withdraw.");
    if (v.submittedBy !== me().id && me().role !== "administrator") throw new LeaseError("Only the submitter can withdraw.", "forbidden");
    touch(l, rev);
    v.status = "draft";
    v.comments.push({ id: nextId("cm"), by: me().id, at: now(), text: "Withdrawn from review", kind: "withdraw" });
    audit("lease.withdraw", `${l.code} v${v.n}`);
    return l.rev;
  });

export const decide = (id: string, rev: number, approve: boolean, text: string, field?: string) =>
  mutate(() => {
    requireRole("administrator", "reviewer");
    const l = lease(id);
    const v = pendingVersion(l);
    if (!v || v.status !== "in_review") throw new LeaseError("This version is no longer in review.", "conflict");
    if (v.submittedBy === me().id || v.createdBy === me().id) throw new LeaseError("You prepared this version, so you can't approve or return it.", "forbidden");
    if (!approve && !text.trim()) throw new LeaseError("Say what needs to change.");
    touch(l, rev);
    v.decidedBy = me().id;
    v.decidedAt = now();
    v.comments.push({ id: nextId("cm"), by: me().id, at: now(), text: text || "Approved", field, kind: approve ? "approve" : "return" });
    if (approve) {
      v.status = "approved";
      if (v.event === "initial") v.effectiveDate = v.terms.commencementDate;
    } else v.status = "returned";
    audit(approve ? "lease.approve" : "lease.return", `${l.code} v${v.n}`, text);
    notify(v.submittedBy ?? v.createdBy, `${l.code} ${approve ? "approved" : "returned"}`, approve ? `v${v.n} is now on the books.` : text, `/leases/${l.id}`);
    return l.rev;
  });

export const discardDraft = (id: string) =>
  mutate(() => {
    const l = lease(id);
    const v = pendingVersion(l);
    if (!v || v.status === "in_review") throw new LeaseError("Only drafts can be discarded.");
    if (approvedChain(l).length) {
      l.versions = l.versions.filter((x) => x !== v);
      touch(l);
      audit("lease.discard_change", `${l.code} v${v.n}`);
    } else {
      s().leases = s().leases.filter((x) => x.id !== id);
      audit("lease.discard", l.code);
    }
  });

export type EventDraft = {
  event: "index" | "term" | "modification" | "termination";
  effectiveDate: ISODate;
  reason: string;
  newAmount?: string;
  newEndDate?: ISODate;
  scopeDecrease?: string;
  terminationPenalty?: string;
  rate: LeaseVersion["rate"];
};

export const startEvent = (id: string, rev: number, ev: EventDraft) =>
  mutate(() => {
    requireRole("administrator", "analyst");
    const l = lease(id);
    if (pendingVersion(l)) throw new LeaseError("A change is already pending on this lease. Approve or withdraw it first.", "conflict");
    const chain = approvedChain(l);
    const last = chain[chain.length - 1];
    if (!last || isExempt(chain[0])) throw new LeaseError("Events apply to capitalised leases only.");
    touch(l, rev);
    const terms = structuredClone(last.terms);
    if (ev.newAmount && terms.paymentRule) {
      terms.paymentRule.amountSteps = [...(terms.paymentRule.amountSteps ?? []).filter((x) => x.from < ev.effectiveDate), { from: ev.effectiveDate, amount: ev.newAmount }];
    }
    if (ev.newEndDate) terms.endDate = ev.newEndDate;
    const v: LeaseVersion = {
      n: l.versions.length + 1, status: "draft", event: ev.event, effectiveDate: ev.effectiveDate, reason: ev.reason,
      terms, assessment: structuredClone(last.assessment), rate: ev.rate, scopeDecrease: ev.scopeDecrease,
      terminationPenalty: ev.terminationPenalty, createdBy: me().id, createdAt: now(), comments: [],
    };
    l.versions.push(v);
    const errs = validateVersion(s(), l, v);
    if (Object.keys(errs).length) throw new LeaseError(Object.values(errs)[0]);
    const c = computeWithPending(s(), l);
    if (!c) throw new LeaseError("Couldn't calculate the change.");
    const seg = c.segments[c.segments.length - 1];
    v.calculated = { at: now(), liability: seg.L0.toFixed(2), rou: seg.R0.toFixed(2), checksOk: c.checks.every((k) => k.ok) };
    audit("lease.event", `${l.code} v${v.n}`, ev.event);
    return l.rev;
  });

export const addDoc = (id: string, doc: { name: string; size: number; sha256: string; kind: "contract" | "amendment" | "evidence" }) =>
  mutate(() => {
    const st = s();
    const dup = st.leases.find((x) => x.docs.some((d) => d.sha256 === doc.sha256));
    if (dup) throw new LeaseError(`This exact file is already attached to ${dup.code}${dup.id === id ? "" : ` (${dup.name})`}.`, "conflict");
    const l = lease(id);
    touch(l);
    l.docs.push({ id: nextId("dc"), ...doc, uploadedBy: me().id, uploadedAt: now(), versionN: l.versions.length });
    audit("lease.doc", l.code, doc.name);
  });

export const removeDoc = (id: string, docId: string) =>
  mutate(() => {
    const l = lease(id);
    const d = l.docs.find((x) => x.id === docId);
    if (!d) return;
    if (approvedChain(l).some((v) => v.n === d.versionN)) throw new LeaseError("Documents on approved versions can't be removed.");
    touch(l);
    l.docs = l.docs.filter((x) => x.id !== docId);
  });

export const addCounterparty = (name: string) =>
  mutate(() => {
    const n = name.trim();
    if (!n) throw new LeaseError("Name is required.");
    const ex = s().counterparties.find((c) => c.name.toLowerCase() === n.toLowerCase());
    if (ex) return ex.id;
    const c = { id: nextId("cp"), name: n };
    s().counterparties.push(c);
    return c.id;
  });

/** Possible duplicates: same lessor with overlapping dates. */
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

// ─── Period close ──────────────────────────────────────────────────────────

const STEP_ORDER: CloseStepId[] = ["cutoff", "rates", "events", "generate", "matching", "reconcile", "approve", "post"];

export function closeOf(st: LeasesState, period: string) {
  return st.closes.find((c) => c.period === period);
}

export const startClose = (period: string) =>
  mutate(() => {
    requireRole("administrator", "analyst");
    const st = s();
    const p = st.periods.find((x) => x.key === period);
    if (!p || p.status === "locked") throw new LeaseError("This period is locked.");
    if (closeOf(st, period)) return;
    const prev = st.periods[st.periods.indexOf(p) - 1];
    if (prev && prev.status !== "locked") throw new LeaseError("Close the previous period first.");
    p.status = "closing";
    st.closes.push({
      period, startedBy: me().id, startedAt: now(), payments: seedPayments(st, period),
      steps: STEP_ORDER.map((id, i) => ({ id, status: i === 0 ? "todo" : "locked" })),
    });
    audit("close.start", period);
  });

function unlockNext(c: CloseRun, id: CloseStepId) {
  const i = STEP_ORDER.indexOf(id);
  const n = c.steps[i + 1];
  if (n && n.status === "locked") n.status = "todo";
}
function step(c: CloseRun, id: CloseStepId): CloseStep {
  return c.steps.find((x) => x.id === id)!;
}

export const completeStep = (period: string, id: CloseStepId, note = "", acceptWarning = false) =>
  mutate(() => {
    const c = closeOf(s(), period);
    if (!c) throw new LeaseError("Start the close first.");
    const st = step(c, id);
    if (st.status === "locked") throw new LeaseError("Finish the previous step first.");
    const issues = stepIssues(s(), c, id);
    if (issues.errors.length) throw new LeaseError(issues.errors[0]);
    if (issues.warnings.length && !acceptWarning) throw new LeaseError(issues.warnings[0]);
    if (issues.warnings.length && !note.trim()) throw new LeaseError("Give a reason for accepting the warning.");
    if (id === "approve") {
      requireRole("administrator", "reviewer");
      const b = s().batches.find((x) => x.id === c.batchId);
      if (!b) throw new LeaseError("Generate the journal batch first.");
      if (b.createdBy === me().id) throw new LeaseError("You generated this batch, so someone else must approve it.", "forbidden");
      b.status = "approved";
      b.approvedBy = me().id;
      b.approvedAt = now();
    }
    st.status = issues.warnings.length ? "warning" : "done";
    st.doneBy = me().id;
    st.doneAt = now();
    st.note = note;
    unlockNext(c, id);
    audit(`close.${id}`, period, note);
  });

/** What blocks or warns on a step, computed live. */
export function stepIssues(st: LeasesState, c: CloseRun, id: CloseStepId): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const end = monthEnd(c.period);
  if (id === "cutoff") {
    const drafts = st.leases.filter((l) => !approvedChain(l).length && (pendingVersion(l)?.terms.commencementDate ?? "9999") <= end);
    if (drafts.length) warnings.push(`${drafts.length} lease${drafts.length > 1 ? "s" : ""} commencing by ${end} ${drafts.length > 1 ? "are" : "is"} not approved and won't be included.`);
  }
  if (id === "rates") {
    if (!policyOf(st, end)) errors.push("No approved accounting policy is in force.");
    if (!curveOf(st, end)) errors.push("No approved discount-rate curve is in force.");
  }
  if (id === "events") {
    const pend = st.leases.filter((l) => {
      const v = pendingVersion(l);
      return v && v.event !== "initial" && v.effectiveDate && v.effectiveDate <= end;
    });
    if (pend.length) warnings.push(`${pend.length} change${pend.length > 1 ? "s" : ""} effective this period ${pend.length > 1 ? "are" : "is"} still pending and will post as catch-ups next period.`);
  }
  if (id === "generate") {
    const b = st.batches.find((x) => x.id === c.batchId);
    if (!b) errors.push("Generate the journal batch.");
    else if (batchStale(st, b)) errors.push("Leases changed after the batch was generated. Regenerate it.");
  }
  if (id === "matching") {
    const open = c.payments.filter((p) => p.match !== "matched" && !p.resolution);
    if (open.length) errors.push(`${open.length} payment${open.length > 1 ? "s" : ""} still need${open.length > 1 ? "" : "s"} a resolution.`);
  }
  if (id === "reconcile") {
    for (const r of reconciliations(st, c)) if (!r.ok) errors.push(`${r.label} doesn't reconcile (difference ${r.diff}).`);
    const unmapped = Object.entries(glOf(st)?.accounts ?? {}).filter(([, v]) => !v);
    if (unmapped.length) errors.push(`${unmapped.length} GL account${unmapped.length > 1 ? "s are" : " is"} not mapped.`);
  }
  if (id === "post") {
    const b = st.batches.find((x) => x.id === c.batchId);
    if (!b || b.status !== "posted") errors.push("Post the batch and record the ERP reference.");
  }
  return { errors, warnings };
}

function sourceRevs(st: LeasesState) {
  return st.leases.map((l) => `${l.id}:${l.versions.filter((v) => v.status === "approved").length}`).join("|");
}
export function batchStale(st: LeasesState, b: JournalBatch) {
  const k = (b as JournalBatch & { sourceRevs?: string }).sourceRevs;
  return !!k && k !== sourceRevs(st) && b.status === "draft";
}

/** Batch for period P = (books through P) − (posted through P−1), split into the month's normal lines and catch-ups. */
export function buildBatchLines(st: LeasesState, period: string): PostedLine[] {
  const out: PostedLine[] = [];
  for (const l of st.leases) {
    const lines = leaseJournals(st, l);
    if (!lines.length) continue;
    const through = cumulativeByAccount(lines, period);
    const posted = st.posted[l.id] ?? {};
    const normal = new Map<string, ReturnType<typeof D>>();
    for (const j of lines) {
      if (j.month !== period) continue;
      const k = `${j.account}|${j.kind}`;
      normal.set(k, (normal.get(k) ?? D(0)).plus(j.debit).minus(j.credit));
    }
    const normalByAcc: Record<string, ReturnType<typeof D>> = {};
    for (const [k, v] of normal) {
      const [account, kind] = k.split("|");
      normalByAcc[account] = (normalByAcc[account] ?? D(0)).plus(v);
      if (!v.isZero()) out.push({ leaseId: l.id, account: account as AccountKey, kind: kind as JournalKind, debit: v.gt(0) ? v.toFixed(2) : "0.00", credit: v.lt(0) ? v.abs().toFixed(2) : "0.00", catchUp: false });
    }
    // anything else needed to bring posted up to the books is a catch-up (back-dated change)
    const accounts = new Set([...Object.keys(through), ...Object.keys(posted)]);
    for (const a of accounts) {
      const due = D(through[a] ?? 0).minus(posted[a] ?? 0).minus(normalByAcc[a] ?? 0);
      if (due.abs().lt(0.005)) continue;
      out.push({ leaseId: l.id, account: a as AccountKey, kind: "remeasurement", debit: due.gt(0) ? due.toFixed(2) : "0.00", credit: due.lt(0) ? due.abs().toFixed(2) : "0.00", catchUp: true });
    }
  }
  return out;
}

export const generateBatch = (period: string) =>
  mutate(() => {
    requireRole("administrator", "analyst");
    const st = s();
    const c = closeOf(st, period);
    if (!c) throw new LeaseError("Start the close first.");
    if (step(c, "generate").status === "locked") throw new LeaseError("Finish the earlier steps first.");
    const existing = st.batches.find((b) => b.id === c.batchId);
    if (existing && existing.status !== "draft") throw new LeaseError("The batch is already approved. Reopen it to regenerate.");
    if (existing) st.batches = st.batches.filter((b) => b !== existing);
    st.seq.batch += 1;
    const b: JournalBatch & { sourceRevs: string } = {
      id: `JB-${period.replace("-", "")}-${String(st.seq.batch).padStart(3, "0")}`, period, type: "period", status: "draft",
      lines: buildBatchLines(st, period), createdAt: now(), createdBy: me().id,
      idempotencyKey: `${st.tenantId}:${period}:${st.seq.batch}`, sourceRevs: sourceRevs(st),
    };
    st.batches.unshift(b);
    c.batchId = b.id;
    const g = step(c, "generate");
    g.status = "done";
    g.doneBy = me().id;
    g.doneAt = now();
    unlockNext(c, "generate");
    // regenerating invalidates later steps
    for (const id of ["reconcile", "approve", "post"] as CloseStepId[]) {
      const x = step(c, id);
      if (x.status !== "locked") x.status = id === "reconcile" && step(c, "matching").status !== "todo" && step(c, "matching").status !== "locked" ? "todo" : "locked";
    }
    audit("close.generate", period, b.id);
    return b.id;
  });

export function batchTotals(b: JournalBatch) {
  const dr = b.lines.reduce((a, l) => a.plus(l.debit), D(0));
  const cr = b.lines.reduce((a, l) => a.plus(l.credit), D(0));
  return { dr: dr.toFixed(2), cr: cr.toFixed(2), balanced: dr.eq(cr) };
}

export function reconciliations(st: LeasesState, c: CloseRun) {
  const b = st.batches.find((x) => x.id === c.batchId);
  const end = monthEnd(c.period);
  let liabBooks = D(0);
  let rouBooks = D(0);
  for (const l of st.leases) {
    const comp = computeLease(st, l);
    if (!comp) continue;
    let row;
    for (const r of comp.rows) if (r.periodEnd <= end) row = r;
    if (row) {
      liabBooks = liabBooks.plus(row.liabClosing);
      rouBooks = rouBooks.plus(row.rouClosing);
    }
  }
  const gl = (accs: string[]) => {
    let v = D(0);
    for (const per of Object.values(st.posted)) for (const a of accs) v = v.plus(per[a] ?? 0);
    for (const ln of b?.lines ?? []) if (accs.includes(ln.account)) v = v.plus(ln.debit).minus(ln.credit);
    return v;
  };
  const liabGl = gl(["lease_liability"]).neg();
  const rouGl = gl(["rou_cost", "rou_accdep"]);
  const t = b ? batchTotals(b) : { dr: "0", cr: "0", balanced: false };
  return [
    { id: "liab", label: "Lease liability: subledger vs GL", books: liabBooks.toFixed(2), gl: liabGl.toFixed(2), ok: liabBooks.minus(liabGl).abs().lt(0.01), diff: liabBooks.minus(liabGl).toFixed(2) },
    { id: "rou", label: "ROU asset (net): subledger vs GL", books: rouBooks.toFixed(2), gl: rouGl.toFixed(2), ok: rouBooks.minus(rouGl).abs().lt(0.01), diff: rouBooks.minus(rouGl).toFixed(2) },
    { id: "bal", label: "Batch debits = credits", books: t.dr, gl: t.cr, ok: !!b && t.balanced, diff: D(t.dr).minus(t.cr).toFixed(2) },
  ];
}

export const resolvePayment = (period: string, paymentId: string, resolution: NonNullable<ActualPayment["resolution"]>, note: string) =>
  mutate(() => {
    const c = closeOf(s(), period);
    const p = c?.payments.find((x) => x.id === paymentId);
    if (!c || !p) throw new LeaseError("Payment not found.");
    if (!note.trim() && resolution !== "accepted") throw new LeaseError("Add a short note.");
    p.resolution = resolution;
    p.resolutionNote = note;
    p.resolvedBy = me().id;
    audit("close.payment", period, `${p.reference} → ${resolution}`);
  });

export const exportBatch = (batchId: string) =>
  mutate(() => {
    const b = s().batches.find((x) => x.id === batchId);
    if (!b) throw new LeaseError("Batch not found.");
    if (b.status === "draft") throw new LeaseError("Approve the batch before exporting.");
    if (b.status === "approved") b.status = "exported";
    b.exportedAt = now();
    audit("journal.export", b.id);
  });

export const markPosted = (batchId: string, erpRef: string) =>
  mutate(() => {
    requireRole("administrator");
    const b = s().batches.find((x) => x.id === batchId);
    if (!b) throw new LeaseError("Batch not found.");
    if (!erpRef.trim()) throw new LeaseError("Enter the ERP document reference.");
    if (b.status === "posted") throw new LeaseError(`Already posted as ${b.erpRef}. It won't be posted twice.`, "conflict");
    if (b.status !== "exported" && b.status !== "approved") throw new LeaseError("Approve and export the batch first.");
    if (s().batches.some((x) => x.erpRef === erpRef.trim())) throw new LeaseError("That ERP reference is already used by another batch.");
    b.status = "posted";
    b.erpRef = erpRef.trim();
    b.postedAt = now();
    b.postedBy = me().id;
    audit("journal.post", b.id, erpRef);
  });

export const lockPeriod = (period: string) =>
  mutate(() => {
    requireRole("administrator");
    const st = s();
    const c = closeOf(st, period);
    if (!c) throw new LeaseError("Start the close first.");
    const pending = c.steps.filter((x) => x.id !== "post" && x.status !== "done" && x.status !== "warning");
    if (pending.length) throw new LeaseError("Finish every close step first.");
    const b = st.batches.find((x) => x.id === c.batchId);
    if (!b || b.status !== "posted") throw new LeaseError("Post the batch first.");
    for (const ln of b.lines) {
      const per = (st.posted[ln.leaseId] ??= {});
      per[ln.account] = D(per[ln.account] ?? 0).plus(ln.debit).minus(ln.credit).toFixed(2);
    }
    const post = step(c, "post");
    post.status = "done";
    post.doneBy = me().id;
    post.doneAt = now();
    const p = st.periods.find((x) => x.key === period)!;
    p.status = "locked";
    p.lockedBy = me().id;
    p.lockedAt = now();
    const next = nextMonthKey(period);
    if (!st.periods.some((x) => x.key === next)) st.periods.push({ key: next, status: "open", reopenLog: [] });
    audit("period.lock", period);
    notify("*", `${period} is locked`, "Changes dated in this period now post as catch-ups.", "/leases/close");
  });

export const reopenPeriod = (period: string, reason: string) =>
  mutate(() => {
    requireRole("administrator");
    const st = s();
    if (!reason.trim()) throw new LeaseError("A reason is required to reopen a period.");
    const p = st.periods.find((x) => x.key === period);
    if (!p || p.status !== "locked") throw new LeaseError("Only locked periods can be reopened.");
    if (lastLocked(st)?.key !== period) throw new LeaseError("Only the most recently locked period can be reopened.");
    const after = st.periods.find((x) => x.key === nextMonthKey(period));
    if (after && closeOf(st, after.key)) throw new LeaseError(`${after.key} close has started. Cancel it first.`);
    const c = closeOf(st, period);
    const b = st.batches.find((x) => x.id === c?.batchId);
    // reverse the posted batch so the GL and the subledger stay in step
    if (b) {
      for (const ln of b.lines) {
        const per = st.posted[ln.leaseId];
        if (per) per[ln.account] = D(per[ln.account] ?? 0).minus(ln.debit).plus(ln.credit).toFixed(2);
      }
      st.seq.batch += 1;
      st.batches.unshift({
        id: `JB-${period.replace("-", "")}-R${st.seq.batch}`, period, type: "reversal", status: "posted", reversalOf: b.id,
        lines: b.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })), createdAt: now(), createdBy: me().id,
        postedAt: now(), postedBy: me().id, erpRef: `REV-${b.erpRef ?? b.id}`, idempotencyKey: `${b.idempotencyKey}:rev`,
      });
      b.status = "reversed";
      b.reversedBy = me().id;
      st.closes = st.closes.filter((x) => x !== c);
    }
    if (after && after.status === "open") st.periods = st.periods.filter((x) => x !== after);
    p.status = "open";
    p.reopenLog.push({ by: me().id, at: now(), reason });
    audit("period.reopen", period, reason);
    notify("*", `${period} was reopened`, reason, "/leases/close");
  });

function seedPayments(st: LeasesState, period: string): ActualPayment[] {
  const out: ActualPayment[] = [];
  const start = `${period}-01`;
  const end = monthEnd(period);
  let i = 0;
  for (const l of st.leases) {
    const chain = approvedChain(l);
    if (!chain.length) continue;
    const comp = computeLease(st, l);
    const flows = comp ? comp.flows : [];
    const cp = st.counterparties.find((c) => c.id === l.counterpartyId)?.name ?? "Unknown";
    for (const f of flows) {
      if (f.date < start || f.date > end || f.amount.isZero()) continue;
      i++;
      const amt = f.amount.toFixed(2);
      const kind = i % 11 === 3 ? "late" : i % 13 === 5 ? "different" : "matched";
      out.push({
        id: `ap_${period}_${i}`, date: kind === "late" ? addDays(end, 4) : f.date, vendor: cp,
        amount: kind === "different" ? D(amt).mul(0.98).toFixed(2) : kind === "late" ? "0.00" : amt,
        reference: `AP-${period.replace("-", "")}-${String(i).padStart(4, "0")}`, leaseId: l.id, expected: amt, match: kind,
      });
    }
  }
  out.push({ id: `ap_${period}_x`, date: addDays(start, 9), vendor: "Kigali Office Supplies Ltd", amount: "1450.00", reference: `AP-${period.replace("-", "")}-9001`, match: "unmatched" });
  return out;
}

// ─── Imports ───────────────────────────────────────────────────────────────

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

export const createImport = (fileName: string, sha256: string, size: number, rows: string[][]) =>
  mutate(() => {
    requireRole("administrator", "analyst");
    const st = s();
    const dup = st.imports.find((b) => b.sha256 === sha256 && b.status === "committed");
    if (dup) throw new LeaseError(`This exact file was already imported on ${dup.committedAt?.slice(0, 10)} (batch ${dup.id}).`, "conflict");
    if (rows.length < 2) throw new LeaseError("The file has no data rows.");
    if (rows.length > 10_001) throw new LeaseError("Up to 10,000 leases per file.");
    const headers = rows[0].map((h) => h.trim());
    const mapping: Record<string, string> = { ...(st.importMapping ?? {}) };
    for (const c of IMPORT_COLUMNS) {
      const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
      const hit = headers.find((h) => norm(h) === norm(c.key) || norm(h) === norm(c.label));
      if (hit) mapping[c.key] = hit;
      else if (mapping[c.key] && !headers.includes(mapping[c.key])) delete mapping[c.key];
    }
    st.seq.import += 1;
    const b: ImportBatch = {
      id: `IMP-${String(st.seq.import).padStart(4, "0")}`, fileName, sha256, size, status: "mapping", progress: 0, headers, mapping,
      rows: rows.slice(1).map((r, i) => ({ row: i + 2, ref: "", name: "", values: Object.fromEntries(headers.map((h, j) => [h, (r[j] ?? "").trim()])), issues: [], action: "create" })),
      warningsAccepted: false, createdBy: me().id, createdAt: now(), templateVersion: IMPORT_TEMPLATE_VERSION,
    };
    st.imports.unshift(b);
    audit("import.upload", b.id, fileName);
    return b.id;
  });

function imp(id: string) {
  const b = s().imports.find((x) => x.id === id);
  if (!b) throw new LeaseError("Import not found.", "not_found");
  return b;
}

export const setImportMapping = (id: string, mapping: Record<string, string>) =>
  mutate(() => {
    const b = imp(id);
    const missing = IMPORT_COLUMNS.filter((c) => c.required && !mapping[c.key]);
    if (missing.length) throw new LeaseError(`Map the required column${missing.length > 1 ? "s" : ""}: ${missing.map((m) => m.label).join(", ")}.`);
    b.mapping = mapping;
    s().importMapping = mapping;
    b.status = "validating";
    b.progress = 0;
  });

/** Validate rows [from, to). Called in chunks by the job runner so big files keep the UI responsive. */
export function validateImportChunk(id: string, from: number, to: number) {
  const st = s();
  const b = imp(id);
  const v = (r: (typeof b.rows)[number], k: string) => r.values[b.mapping[k] ?? ""] ?? "";
  const refs = new Map<string, number>();
  for (const r of b.rows) refs.set(v(r, "lease_ref").toLowerCase(), (refs.get(v(r, "lease_ref").toLowerCase()) ?? 0) + 1);
  for (const r of b.rows.slice(from, to)) {
    const issues: typeof r.issues = [];
    const err = (column: string, message: string) => issues.push({ row: r.row, column, severity: "error", message });
    const warn = (column: string, message: string) => issues.push({ row: r.row, column, severity: "warning", message });
    r.ref = v(r, "lease_ref");
    r.name = v(r, "name");
    for (const c of IMPORT_COLUMNS) if (c.required && !v(r, c.key)) err(c.key, `${c.label} is required.`);
    if (r.ref && (refs.get(r.ref.toLowerCase()) ?? 0) > 1) err("lease_ref", "Duplicate reference in this file.");
    const cls = v(r, "asset_class").toLowerCase();
    if (cls && !["property", "vehicles", "equipment", "it", "land"].includes(cls)) err("asset_class", `Unknown asset class "${cls}". Use property, vehicles, equipment, it or land.`);
    const cur = v(r, "currency").toUpperCase();
    if (cur && cur !== st.entity?.currency) err("currency", `Only ${st.entity?.currency} leases are supported (got ${cur}).`);
    const cd = v(r, "commencement_date");
    const ed = v(r, "end_date");
    if (cd && !isISODate(cd)) err("commencement_date", /^\d+$/.test(cd) ? `Looks like an Excel date number (${cd}). Format the column as YYYY-MM-DD.` : `"${cd}" isn't a valid date. Use YYYY-MM-DD.`);
    if (ed && !isISODate(ed)) err("end_date", `"${ed}" isn't a valid date. Use YYYY-MM-DD.`);
    if (isISODate(cd) && isISODate(ed) && ed <= cd) err("end_date", "End date must be after commencement.");
    if (isISODate(cd) && isLockedDate(st, cd)) warn("commencement_date", "Commences in a locked period — entries will post as catch-ups.");
    const amt = v(r, "payment_amount").replace(/,/g, "");
    if (amt && (!/^-?\d+(\.\d+)?$/.test(amt) || D(amt).lte(0))) err("payment_amount", `"${v(r, "payment_amount")}" isn't a positive amount.`);
    const fq = v(r, "frequency").toLowerCase();
    if (fq && !["monthly", "quarterly", "semiannual", "annual"].includes(fq)) err("frequency", "Use monthly, quarterly, semiannual or annual.");
    const tm = v(r, "timing").toLowerCase();
    if (tm && !["advance", "arrears"].includes(tm)) err("timing", "Use advance or arrears.");
    const rate = v(r, "discount_rate_pct");
    if (rate) {
      if (!/^\d+(\.\d+)?$/.test(rate)) err("discount_rate_pct", `"${rate}" isn't a number.`);
      else if (D(rate).lt(1) && D(rate).gt(0)) warn("discount_rate_pct", `${rate} looks like a decimal. Rates are percentages, so it will be read as ${rate}% — did you mean ${D(rate).mul(100)}%?`);
      else if (D(rate).gt(40) || D(rate).lte(0)) err("discount_rate_pct", "Rate must be between 0% and 40%.");
    } else warn("discount_rate_pct", "No rate given — the discount-rate curve will be used.");
    const ex = v(r, "exemption").toLowerCase();
    if (ex && !["none", "short_term", "low_value"].includes(ex)) err("exemption", "Use none, short_term or low_value.");
    const existing = st.leases.find((l) => l.code.toLowerCase() === r.ref.toLowerCase() || l.name.toLowerCase() === r.name.toLowerCase());
    if (existing) {
      if (approvedChain(existing).length) {
        err("lease_ref", `Already on the books as ${existing.code}. Record changes as an event on the lease instead.`);
      } else {
        r.action = "update";
        r.leaseId = existing.id;
        warn("lease_ref", `Updates draft ${existing.code}.`);
      }
    }
    r.issues = issues;
    if (issues.some((i) => i.severity === "error")) r.action = "skip";
  }
  b.progress = Math.round((to / b.rows.length) * 100);
  if (to >= b.rows.length) {
    b.status = "validated";
    b.progress = 100;
    audit("import.validate", b.id);
  }
  persist();
}

export const acceptImportWarnings = (id: string) =>
  mutate(() => {
    imp(id).warningsAccepted = true;
  });

export const startCommit = (id: string) =>
  mutate(() => {
    requireRole("administrator");
    const b = imp(id);
    if (b.status !== "validated") throw new LeaseError("Validate the file first.");
    const hasWarn = b.rows.some((r) => r.action !== "skip" && r.issues.some((i) => i.severity === "warning"));
    if (hasWarn && !b.warningsAccepted) throw new LeaseError("Review and accept the warnings first.");
    if (!b.rows.some((r) => r.action !== "skip")) throw new LeaseError("No valid rows to import.");
    b.status = "committing";
    b.progress = 0;
  });

/** Commit rows [from, to): each lease is its own transaction, so one bad lease never blocks the rest. */
export function commitImportChunk(id: string, from: number, to: number, retryOnly = false) {
  const st = s();
  const b = imp(id);
  const v = (r: (typeof b.rows)[number], k: string) => r.values[b.mapping[k] ?? ""] ?? "";
  const curve = curveOf(st);
  for (const r of b.rows.slice(from, to)) {
    if (r.action === "skip") {
      r.outcome = "skipped";
      continue;
    }
    if (retryOnly && r.outcome !== "failed") continue;
    if (r.outcome === "created" || r.outcome === "updated") continue; // idempotent re-run
    const snapshot = JSON.stringify(st.leases);
    try {
      const cpName = v(r, "lessor");
      let cp = st.counterparties.find((c) => c.name.toLowerCase() === cpName.toLowerCase());
      if (!cp) {
        cp = { id: nextId("cp"), name: cpName };
        st.counterparties.push(cp);
      }
      const cd = v(r, "commencement_date");
      const ed = v(r, "end_date");
      const years = Math.max(1, Math.round(((new Date(ed).getTime() - new Date(cd).getTime()) / 3.15576e10) * 100) / 100);
      const ratePct = v(r, "discount_rate_pct");
      const curveRate = curve?.points.filter((p) => p.currency === st.entity?.currency).sort((a, c) => Math.abs(a.termYears - years) - Math.abs(c.termYears - years))[0]?.rate;
      const ex = (v(r, "exemption").toLowerCase() || "none") as "none" | "short_term" | "low_value";
      const version: LeaseVersion = {
        n: 1, status: "draft", event: "initial", effectiveDate: cd, reason: `Imported from ${b.fileName}`,
        terms: {
          commencementDate: cd, endDate: ed, manualLines: [], nonLeasePerPayment: "0", separateNonLease: true,
          prepaidBeforeCommencement: "0", initialDirectCosts: v(r, "initial_direct_costs") || "0",
          incentivesReceived: v(r, "incentives") || "0", restorationEstimate: v(r, "restoration_estimate") || "0",
          paymentRule: {
            amount: v(r, "payment_amount").replace(/,/g, ""), frequency: v(r, "frequency").toLowerCase() as never,
            timing: v(r, "timing").toLowerCase() as never, rentFreeMonths: Number(v(r, "rent_free_months") || 0),
            escalation: v(r, "escalation_pct") ? { type: "fixed_pct", pct: D(v(r, "escalation_pct")).div(100).toString(), everyMonths: Number(v(r, "escalation_every_months") || 12) } : { type: "none" },
          },
        },
        assessment: {
          identifiedAsset: true, rightToControl: true, exemption: ex, exemptionRationale: ex === "none" ? "" : "Per import file — confirm in review",
          options: [], purchaseOption: { exists: false, reasonablyCertain: null, rationale: "" }, termRationale: "Non-cancellable term per contract (import).",
        },
        rate: ratePct ? { value: D(ratePct).div(100).toString(), source: "override", reason: "Rate supplied in import file" } : { value: curveRate ?? "", source: "curve", curveVersion: curve?.version, termYears: years },
        createdBy: me().id, createdAt: now(), comments: [],
      };
      let l: Lease;
      if (r.action === "update" && r.leaseId) {
        l = lease(r.leaseId);
        l.versions = [version];
        touch(l);
      } else {
        st.seq.lease += 1;
        l = {
          id: nextId("ls"), code: `L-${String(st.seq.lease).padStart(4, "0")}`, name: v(r, "name"), assetClass: v(r, "asset_class").toLowerCase() as never,
          counterpartyId: cp.id, entityId: st.entity!.id, location: v(r, "location"), currency: v(r, "currency").toUpperCase(),
          ownerId: me().id, costCentre: "", versions: [version], docs: [], wizardStep: 4, createdAt: now(), updatedAt: now(), rev: 1, importBatchId: b.id,
        };
        st.leases.unshift(l);
      }
      const errs = validateVersion(st, l, version);
      if (Object.keys(errs).length) throw new Error(Object.values(errs)[0]);
      const c = ex === "none" ? computeWithPending(st, l) : undefined;
      if (ex === "none") {
        if (!c || !c.checks.every((k) => k.ok)) throw new Error("Integrity checks failed for this lease.");
        const seg = c.segments[0];
        version.calculated = { at: now(), liability: seg.L0.toFixed(2), rou: seg.R0.toFixed(2), checksOk: true };
      } else version.calculated = { at: now(), liability: "0.00", rou: "0.00", checksOk: true };
      r.leaseId = l.id;
      r.outcome = r.action === "update" ? "updated" : "created";
      r.outcomeMessage = l.code;
    } catch (e) {
      st.leases = JSON.parse(snapshot);
      r.outcome = "failed";
      r.outcomeMessage = e instanceof Error ? e.message : "Failed";
    }
  }
  b.progress = Math.round((to / b.rows.length) * 100);
  if (to >= b.rows.length) {
    b.status = "committed";
    b.progress = 100;
    b.committedBy = me().id;
    b.committedAt = now();
    audit("import.commit", b.id, `${b.rows.filter((r) => r.outcome === "created" || r.outcome === "updated").length} leases`);
    notify(b.createdBy, `Import ${b.id} finished`, `${b.rows.filter((r) => r.outcome === "created").length} created · ${b.rows.filter((r) => r.outcome === "failed").length} failed`, `/leases/imports/${b.id}`);
  }
  persist();
}

export const retryFailed = (id: string) =>
  mutate(() => {
    const b = imp(id);
    if (!b.rows.some((r) => r.outcome === "failed")) throw new LeaseError("Nothing failed.");
    b.status = "committing";
    b.progress = 0;
    (b as ImportBatch & { retryOnly?: boolean }).retryOnly = true;
  });

export const cancelImport = (id: string) =>
  mutate(() => {
    const b = imp(id);
    if (b.status === "committed") throw new LeaseError("Committed imports can't be cancelled.");
    b.status = "cancelled";
  });

/** Submit every created draft from an import for review in one go. */
export const submitImported = (id: string, approverId: string) =>
  mutate(() => {
    const b = imp(id);
    let n = 0;
    for (const r of b.rows) {
      if (r.outcome !== "created" && r.outcome !== "updated") continue;
      const l = s().leases.find((x) => x.id === r.leaseId);
      const v = l && pendingVersion(l);
      if (!l || !v || v.status !== "draft" || !v.calculated?.checksOk) continue;
      if (approverId === me().id) throw new LeaseError("You can't approve your own leases.", "forbidden");
      v.status = "in_review";
      v.submittedBy = me().id;
      v.submittedAt = now();
      v.approverId = approverId;
      touch(l);
      n++;
    }
    notify(approverId, `${n} imported leases need review`, `From ${b.fileName}`, "/leases/inbox");
    return n;
  });

export const saveView = (name: string, query: string) =>
  mutate(() => {
    if (!name.trim()) throw new LeaseError("Name the view.");
    s().savedViews.push({ id: nextId("vw"), name: name.trim(), query });
  });
export const deleteView = (id: string) =>
  mutate(() => {
    s().savedViews = s().savedViews.filter((v) => v.id !== id);
  });

export { leaseStatus, todayISO, monthKey };
