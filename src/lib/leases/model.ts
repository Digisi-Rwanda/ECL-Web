/** Pure selectors over LeasesState (no storage, no React). */
import {
  compute, exemptExpense, currentSplit, maturity, D, r2, type Computation, type SegmentInput, type Policy,
  type JournalLine, type AccountKey,
} from "./engine";
import { addDays, monthEnd, monthKey, monthsBetween, nextMonthKey, type ISODate } from "./dates";
import type {
  Lease, LeaseStatus, LeasesState, LeaseVersion, IbrCurve, PolicyVersion, Period, Member, Assessment, Versioned,
} from "./types";

export function todayISO(): ISODate {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function member(s: LeasesState, id = s.meId): Member {
  return s.members.find((p) => p.id === id) ?? s.members[0];
}

/** The version in force at a date: latest approved with effectiveFrom <= date, else the first approved. */
export function inForce<T extends Versioned>(list: T[], date: ISODate = todayISO()): T | undefined {
  const ok = list.filter((v) => v.status === "approved").sort((a, b) => a.version - b.version);
  return [...ok].reverse().find((v) => v.effectiveFrom <= date) ?? ok[0];
}

export const policyOf = (s: LeasesState, date?: ISODate) => inForce(s.policies, date);
export const curveOf = (s: LeasesState, date?: ISODate) => inForce(s.curves, date);
export const glOf = (s: LeasesState, date?: ISODate) => inForce(s.gl, date);

export function enginePolicy(s: LeasesState): Policy {
  return { dayCount: policyOf(s)?.dayCount ?? "periodic" };
}

export function currentPeriod(s: LeasesState): Period | undefined {
  return s.periods.find((p) => p.status !== "locked");
}
export function lastLocked(s: LeasesState): Period | undefined {
  return [...s.periods].reverse().find((p) => p.status === "locked");
}
export function isLockedDate(s: LeasesState, d: ISODate): boolean {
  return s.periods.some((p) => p.status === "locked" && p.key === monthKey(d));
}

/** Linear interpolation on the curve for currency; flat beyond the ends. */
export function curveRate(curve: IbrCurve | undefined, currency: string, termYears: number): string | undefined {
  const pts = (curve?.points ?? []).filter((p) => p.currency === currency).sort((a, b) => a.termYears - b.termYears);
  if (!pts.length) return undefined;
  if (termYears <= pts[0].termYears) return pts[0].rate;
  const last = pts[pts.length - 1];
  if (termYears >= last.termYears) return last.rate;
  const i = pts.findIndex((p) => p.termYears >= termYears);
  const a = pts[i - 1];
  const b = pts[i];
  const w = (termYears - a.termYears) / (b.termYears - a.termYears);
  return D(a.rate).plus(D(b.rate).minus(a.rate).mul(w)).toDecimalPlaces(6).toString();
}

export function termYears(from: ISODate, endDate: ISODate): number {
  return Math.round((monthsBetween(from, addDays(endDate, 1)) / 12) * 100) / 100;
}

export const approvedChain = (l: Lease) => l.versions.filter((v) => v.status === "approved").sort((a, b) => a.n - b.n);
export const pendingVersion = (l: Lease) =>
  l.versions.find((v) => v.status === "draft" || v.status === "in_review" || v.status === "returned");
export const latestVersion = (l: Lease) => l.versions[l.versions.length - 1];

export function isExempt(v?: LeaseVersion): boolean {
  return !!v && !!v.assessment.exemption && v.assessment.exemption !== "none";
}

export function segmentInputs(versions: LeaseVersion[]): SegmentInput[] {
  return versions.map((v, i) => ({
    start: i === 0 ? v.terms.commencementDate : v.effectiveDate,
    terms: v.terms,
    rate: v.rate.value || "0",
    event: i === 0 ? "initial" : v.event,
    scopeDecrease: v.scopeDecrease,
    terminationPenalty: v.terminationPenalty,
  }));
}

const cache = new Map<string, Computation>();
export function computeVersions(key: string, versions: LeaseVersion[], policy: Policy): Computation {
  const k = `${key}|${policy.dayCount}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const c = compute(segmentInputs(versions), policy);
  if (cache.size > 500) cache.clear();
  cache.set(k, c);
  return c;
}

/** Approved chain computation (what is on the books). */
export function computeLease(s: LeasesState, l: Lease): Computation | undefined {
  const chain = approvedChain(l);
  if (!chain.length || isExempt(chain[0])) return undefined;
  return computeVersions(`${s.tenantId}:${l.id}:${l.rev}:approved`, chain, enginePolicy(s));
}

/** Chain including the pending version (preview / review). */
export function computeWithPending(s: LeasesState, l: Lease): Computation | undefined {
  const chain = approvedChain(l);
  const p = pendingVersion(l);
  const versions = p ? (p.event === "initial" ? [p] : [...chain, p]) : chain;
  if (!versions.length || isExempt(versions[0])) return undefined;
  if (!versions[0].terms.commencementDate || !versions[0].terms.endDate) return undefined;
  return computeVersions(`${s.tenantId}:${l.id}:${l.rev}:pending`, versions, enginePolicy(s));
}

export function leaseStatus(l: Lease, today: ISODate = todayISO()): LeaseStatus {
  const chain = approvedChain(l);
  if (!chain.length) {
    const v = latestVersion(l);
    return v?.status === "in_review" ? "in_review" : v?.status === "returned" ? "returned" : "draft";
  }
  const last = chain[chain.length - 1];
  if (last.event === "termination") return "terminated";
  if (isExempt(chain[0])) return last.terms.endDate < today ? "expired" : "exempt";
  if (chain[0].terms.commencementDate > today) return "not_commenced";
  if (last.terms.endDate < today) return "expired";
  return "active";
}

export const STATUS_META: Record<LeaseStatus, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" | "muted" }> = {
  draft: { label: "Draft", tone: "neutral" },
  in_review: { label: "In review", tone: "info" },
  returned: { label: "Returned", tone: "warning" },
  active: { label: "Active", tone: "success" },
  not_commenced: { label: "Not yet commenced", tone: "info" },
  exempt: { label: "Exempt", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
  terminated: { label: "Terminated", tone: "muted" },
};

/** Balances at a period end. */
export function balancesAt(s: LeasesState, l: Lease, periodEnd: ISODate) {
  const c = computeLease(s, l);
  if (!c) return { liability: "0.00", rou: "0.00", current: "0.00", nonCurrent: "0.00" };
  let row = c.rows[0];
  if (!row || row.periodEnd > periodEnd) return { liability: "0.00", rou: "0.00", current: "0.00", nonCurrent: "0.00" };
  for (const r of c.rows) if (r.periodEnd <= periodEnd) row = r;
  const split = currentSplit(c.segments, periodEnd, enginePolicy(s));
  return { liability: row.liabClosing, rou: row.rouClosing, ...split };
}

export function maturityAt(s: LeasesState, l: Lease, periodEnd: ISODate) {
  const c = computeLease(s, l);
  return c ? maturity(c.segments, periodEnd) : ["0.00", "0.00", "0.00", "0.00"];
}

/** Every journal line the approved books imply for a lease (incl. exempt straight-line expense). */
export function leaseJournals(s: LeasesState, l: Lease): JournalLine[] {
  const chain = approvedChain(l);
  if (!chain.length) return [];
  if (isExempt(chain[0])) return exemptExpense(chain[chain.length - 1].terms);
  return computeLease(s, l)?.journals ?? [];
}

/** Signed (Dr − Cr) cumulative per account through a month. */
export function cumulativeByAccount(lines: JournalLine[], throughMonth: string): Record<string, string> {
  const out: Record<string, ReturnType<typeof D>> = {};
  for (const j of lines) {
    if (j.month > throughMonth) continue;
    out[j.account] = (out[j.account] ?? D(0)).plus(j.debit).minus(j.credit);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.toFixed(2)]));
}

export function money(v: string | number | undefined, opts: { dp?: number; dash?: boolean } = {}): string {
  if (v === undefined || v === "") return "—";
  const d = D(v);
  if (opts.dash && d.isZero()) return "—";
  const s = d.abs().toFixed(opts.dp ?? 2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return d.lt(0) ? `(${s})` : s;
}

export function compactMoney(v: string): string {
  const d = D(v).abs();
  const sign = D(v).lt(0) ? "−" : "";
  if (d.gte(1e9)) return `${sign}${d.div(1e9).toFixed(2)}B`;
  if (d.gte(1e6)) return `${sign}${d.div(1e6).toFixed(2)}M`;
  if (d.gte(1e3)) return `${sign}${d.div(1e3).toFixed(1)}K`;
  return `${sign}${d.toFixed(0)}`;
}

export function pct(rate: string | undefined): string {
  if (!rate) return "—";
  return `${D(rate).mul(100).toDecimalPlaces(3).toString()}%`;
}

export function periodLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDate(d?: string): string {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function emptyAssessment(): Assessment {
  return {
    identifiedAsset: null, rightToControl: null, exemption: null, exemptionRationale: "", options: [],
    purchaseOption: { exists: false, reasonablyCertain: null, rationale: "" }, termRationale: "",
  };
}

/** Policy says this class/lease may be exempt (shown as a hint, the reviewer still decides). */
export function exemptionHint(p: PolicyVersion | undefined, cls: Lease["assetClass"], months: number, newValue?: string) {
  if (!p) return null;
  if (months <= 12 && p.shortTermClasses.includes(cls)) return "short_term" as const;
  if (p.lowValueElection && newValue && D(newValue).lte(p.lowValueThreshold)) return "low_value" as const;
  return null;
}

export { monthEnd, nextMonthKey, r2 };
export type { AccountKey };
