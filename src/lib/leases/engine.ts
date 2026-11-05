/**
 * IFRS 16 lessee engine. Pure, deterministic, Decimal end to end (no binary floats on money).
 *
 * Model: a lease is a chain of segments. Segment 0 starts at commencement; every approved event
 * (index change, term reassessment, modification, termination) starts a new segment at its
 * effective date. Within a segment the liability at any instant s is the present value of the
 * segment's remaining cash flows, so interest for any interval is L(b) − L(a) + payments in (a, b]
 * (effective-interest method, telescoping exactly to Σpayments − L0).
 *
 * Instants are ISO dates meaning "start of that day". An arrears payment shown on 31 Dec happens
 * at the 1 Jan instant; an advance payment shown on 1 Jan happens at the 1 Jan instant. With the
 * periodic convention this puts the k-th payment exactly k periods from commencement.
 */
import Decimal from "decimal.js";
import {
  addDays, addMonths, daysBetween, monthsBetween, monthKey, nextMonthKey, maxDate, minDate,
  type ISODate,
} from "./dates";

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN });
export const D = (v: Decimal.Value) => new Decimal(v);
const ZERO = D(0);
export const r2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

// ─── Inputs ────────────────────────────────────────────────────────────────

export type Frequency = "monthly" | "quarterly" | "semiannual" | "annual";
export type Timing = "advance" | "arrears";
export type DayCount = "periodic" | "act365";
export const FREQ_MONTHS: Record<Frequency, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

export interface Escalation {
  type: "none" | "fixed_pct" | "cpi";
  /** fixed_pct: decimal per step, e.g. "0.05" */
  pct?: string;
  everyMonths?: number;
}

export interface PaymentRule {
  amount: string;
  frequency: Frequency;
  timing: Timing;
  escalation: Escalation;
  rentFreeMonths: number;
  /** step changes from events (CPI uplift, renegotiated rent), applied to payments dated >= from */
  amountSteps?: Array<{ from: ISODate; amount: string }>;
}

export type FlowKind = "fixed" | "rvg" | "purchase_option" | "termination_penalty" | "other";

export interface ManualLine {
  date: ISODate;
  amount: string;
  kind: FlowKind;
  /** payment happens at end of the shown day (arrears-style). Default true. */
  endOfDay?: boolean;
  note?: string;
}

export interface LeaseTerms {
  commencementDate: ISODate;
  /** last day of the lease term (inclusive) */
  endDate: ISODate;
  paymentRule?: PaymentRule;
  manualLines: ManualLine[];
  /** non-lease (service) amount inside each rule payment; included in the liability when not separated */
  nonLeasePerPayment: string;
  separateNonLease: boolean;
  prepaidBeforeCommencement: string;
  initialDirectCosts: string;
  incentivesReceived: string;
  /** undiscounted restoration cost expected at lease end */
  restorationEstimate: string;
  /** set when ownership transfers / purchase option reasonably certain: depreciate to this date */
  usefulLifeEnd?: ISODate;
}

export interface Flow {
  /** date shown to users */
  date: ISODate;
  /** instant used for maths (see header) */
  at: ISODate;
  amount: Decimal;
  kind: FlowKind;
  manual: boolean;
}

// ─── Cash flows ────────────────────────────────────────────────────────────

/** Dated cash flows, sorted ascending by instant (ties keep generation order). */
export function buildCashFlows(t: LeaseTerms): Flow[] {
  const flows: Flow[] = [];
  const endInstant = addDays(t.endDate, 1);
  const rule = t.paymentRule;
  if (rule && D(rule.amount || 0).gt(0)) {
    const pm = FREQ_MONTHS[rule.frequency];
    const day = Number(t.commencementDate.slice(8));
    const freeUntil = addMonths(t.commencementDate, rule.rentFreeMonths || 0, day);
    const steps = [...(rule.amountSteps ?? [])].sort((a, b) => (a.from < b.from ? -1 : 1));
    for (let k = 1; ; k++) {
      const start = addMonths(t.commencementDate, (k - 1) * pm, day);
      if (start >= endInstant) break;
      const next = minDate(addMonths(t.commencementDate, k * pm, day), endInstant);
      const date = rule.timing === "advance" ? start : addDays(next, -1);
      const at = rule.timing === "advance" ? start : next;
      if (start < freeUntil) continue;
      const esc = rule.escalation;
      const escSteps = (d: ISODate) =>
        esc.type === "fixed_pct" && esc.everyMonths && esc.pct ? Math.floor(monthsBetween(t.commencementDate, d) / esc.everyMonths + 1e-9) : 0;
      // CPI: initial measurement uses the index at commencement; later uplifts arrive as amountSteps,
      // which reset the base — fixed escalation then continues from the new amount.
      let baseAmount = D(rule.amount);
      let baseSteps = 0;
      for (const s of steps) if (date >= s.from) { baseAmount = D(s.amount); baseSteps = escSteps(s.from); }
      let amount = baseAmount;
      if (esc.type === "fixed_pct" && esc.pct) amount = amount.mul(D(1).plus(esc.pct).pow(escSteps(start) - baseSteps));
      // stub final period pays pro-rata
      const full = addMonths(t.commencementDate, k * pm, day);
      if (next < full) amount = amount.mul(daysBetween(start, next)).div(daysBetween(start, full));
      if (!t.separateNonLease) amount = amount.plus(D(t.nonLeasePerPayment || 0));
      flows.push({ date, at, amount: r2(amount), kind: "fixed", manual: false });
    }
  }
  for (const m of t.manualLines) {
    flows.push({
      date: m.date,
      at: m.endOfDay === false ? m.date : addDays(m.date, 1),
      amount: D(m.amount),
      kind: m.kind,
      manual: true,
    });
  }
  return flows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

// ─── Time & discounting ────────────────────────────────────────────────────

export function tau(commencement: ISODate, at: ISODate, dc: DayCount): Decimal {
  return dc === "periodic"
    ? D(monthsBetween(commencement, at)).div(12)
    : D(daysBetween(commencement, at)).div(365);
}

function df(rate: Decimal, years: Decimal): Decimal {
  return D(1).plus(rate).pow(years.neg());
}

/** PV at instant s of flows strictly after s. */
export function pvAt(flows: Flow[], s: ISODate, rate: Decimal, comm: ISODate, dc: DayCount): Decimal {
  const ts = tau(comm, s, dc);
  return flows.reduce((acc, f) => (f.at > s ? acc.plus(f.amount.mul(df(rate, tau(comm, f.at, dc).minus(ts)))) : acc), ZERO);
}

// ─── Segments ──────────────────────────────────────────────────────────────

export type EventType = "initial" | "index" | "term" | "modification" | "termination";

export interface SegmentInput {
  /** effective instant of the segment (commencement for the first) */
  start: ISODate;
  terms: LeaseTerms;
  rate: string;
  event: EventType;
  /** modification: fraction of scope given back, e.g. "0.5" */
  scopeDecrease?: string;
  terminationPenalty?: string;
}

export interface SegmentResult {
  start: ISODate;
  end: ISODate; // instant (exclusive)
  depEnd: ISODate;
  rate: Decimal;
  flows: Flow[];
  terms: LeaseTerms;
  event: EventType;
  L0: Decimal;
  R0: Decimal;
  // event effects (zero for initial)
  liabBefore: Decimal;
  rouBefore: Decimal;
  derecLiab: Decimal;
  derecRou: Decimal;
  liabAdj: Decimal; // remeasurement of liability (after derecognition)
  rouAdj: Decimal; // amount taken to ROU
  gainLoss: Decimal; // + gain / − loss to P&L
  penalty: Decimal;
  // initial recognition detail
  prepaid: Decimal;
  idc: Decimal;
  incentives: Decimal;
  restorationPV: Decimal;
}

export interface Policy {
  dayCount: DayCount;
}

// L(s) = (1+r)^τ(s) · Σ_{at_i > s} CF_i·(1+r)^−τ(at_i): one power per call instead of one per flow.
const pvIndex = new WeakMap<SegmentResult, { at: ISODate[]; suffix: Decimal[] }>();
function liabilityAt(seg: SegmentResult, s: ISODate, comm: ISODate, dc: DayCount) {
  let idx = pvIndex.get(seg);
  if (!idx) {
    const w = seg.flows.map((f) => f.amount.mul(df(seg.rate, tau(comm, f.at, dc))));
    const suffix = new Array<Decimal>(w.length + 1);
    suffix[w.length] = ZERO;
    for (let i = w.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1].plus(w[i]);
    idx = { at: seg.flows.map((f) => f.at), suffix };
    pvIndex.set(seg, idx);
  }
  const at = maxDate(s, seg.start);
  let lo = 0;
  let hi = idx.at.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (idx.at[mid] > at) hi = mid;
    else lo = mid + 1;
  }
  return idx.suffix[lo].mul(D(1).plus(seg.rate).pow(tau(comm, at, dc)));
}
function rouAt(seg: SegmentResult, s: ISODate, comm: ISODate, dc: DayCount) {
  const t0 = tau(comm, seg.start, dc);
  const t1 = tau(comm, seg.depEnd, dc);
  if (t1.lte(t0)) return ZERO;
  const ts = Decimal.max(t0, Decimal.min(t1, tau(comm, s, dc)));
  return seg.R0.mul(D(1).minus(ts.minus(t0).div(t1.minus(t0))));
}

export function buildSegments(inputs: SegmentInput[], policy: Policy): SegmentResult[] {
  if (!inputs.length) return [];
  const comm = inputs[0].terms.commencementDate;
  const dc = policy.dayCount;
  const out: SegmentResult[] = [];
  for (const [i, inp] of inputs.entries()) {
    const t = inp.terms;
    const rate = D(inp.rate);
    const flows = inp.event === "termination" ? [] : buildCashFlows(t).filter((f) => i === 0 || f.at > inp.start);
    const end = addDays(t.endDate, 1);
    const depEnd = t.usefulLifeEnd ? addDays(t.usefulLifeEnd, 1) : end;
    const base = {
      start: inp.start, end: inp.event === "termination" ? inp.start : end, depEnd, rate, flows, terms: t,
      event: inp.event, liabBefore: ZERO, rouBefore: ZERO, derecLiab: ZERO, derecRou: ZERO,
      liabAdj: ZERO, rouAdj: ZERO, gainLoss: ZERO, penalty: ZERO,
      prepaid: ZERO, idc: ZERO, incentives: ZERO, restorationPV: ZERO,
    };
    if (i === 0) {
      const L0 = pvAt(flows, comm, rate, comm, dc);
      const prepaid = flows.filter((f) => f.at <= comm).reduce((a, f) => a.plus(f.amount), ZERO)
        .plus(D(t.prepaidBeforeCommencement || 0));
      const restorationPV = D(t.restorationEstimate || 0).mul(df(rate, tau(comm, end, dc)));
      const idc = D(t.initialDirectCosts || 0);
      const incentives = D(t.incentivesReceived || 0);
      const R0 = L0.plus(prepaid).minus(incentives).plus(idc).plus(restorationPV);
      out.push({ ...base, L0, R0, prepaid, idc, incentives, restorationPV });
      continue;
    }
    const prev = out[i - 1];
    const liabBefore = liabilityAt(prev, inp.start, comm, dc);
    const rouBefore = rouAt(prev, inp.start, comm, dc);
    const f = inp.event === "termination" ? D(1) : D(inp.scopeDecrease || 0);
    const derecLiab = liabBefore.mul(f);
    const derecRou = rouBefore.mul(f);
    const penalty = D(inp.terminationPenalty || 0);
    let gainLoss = derecLiab.minus(derecRou).minus(penalty);
    const L0 = inp.event === "termination" ? ZERO : pvAt(flows, inp.start, rate, comm, dc);
    const liabAdj = inp.event === "termination" ? ZERO : L0.minus(liabBefore.minus(derecLiab));
    let rouAdj = liabAdj;
    const rouMid = rouBefore.minus(derecRou);
    // ROU cannot go below zero: any further reduction goes to profit or loss.
    if (rouMid.plus(rouAdj).lt(0)) {
      gainLoss = gainLoss.plus(rouMid.plus(rouAdj).neg());
      rouAdj = rouMid.neg();
    }
    const R0 = inp.event === "termination" ? ZERO : rouMid.plus(rouAdj);
    out.push({ ...base, L0, R0, liabBefore, rouBefore, derecLiab, derecRou, liabAdj, rouAdj, gainLoss, penalty });
  }
  return out;
}

// ─── Monthly schedule ──────────────────────────────────────────────────────

export interface ScheduleRow {
  month: string; // YYYY-MM
  periodEnd: ISODate;
  liabOpening: string;
  additions: string;
  interest: string;
  payments: string;
  remeasurement: string; // liabAdj
  derecognised: string; // −derecLiab
  liabClosing: string;
  rouOpening: string;
  rouAdditions: string;
  depreciation: string;
  rouAdjustment: string;
  rouDerecognised: string;
  rouClosing: string;
  provisionUnwind: string;
  gainLoss: string;
  penalty: string;
  segment: number;
  hasEvent: boolean;
}

interface ExactRow {
  month: string;
  periodEnd: ISODate;
  additions: Decimal;
  rouAdditions: Decimal;
  interest: Decimal;
  payments: Decimal;
  remeasurement: Decimal;
  derecognised: Decimal;
  depreciation: Decimal;
  rouAdjustment: Decimal;
  rouDerecognised: Decimal;
  provisionUnwind: Decimal;
  gainLoss: Decimal;
  penalty: Decimal;
  segment: number;
  hasEvent: boolean;
}

export function buildSchedule(segs: SegmentResult[], policy: Policy): ScheduleRow[] {
  if (!segs.length) return [];
  const dc = policy.dayCount;
  const s0 = segs[0];
  const comm = s0.start;
  const last = segs[segs.length - 1];
  const finalInstant = last.event === "termination" ? addDays(last.start, 1) : maxDate(last.end, last.depEnd);
  const provAt = (s: ISODate) =>
    s0.restorationPV.mul(D(1).plus(s0.rate).pow(tau(comm, minDate(s, s0.end), dc)));

  const exact: ExactRow[] = [];
  for (let mk = monthKey(comm); `${mk}-01` < finalInstant; mk = nextMonthKey(mk)) {
    const mStart = maxDate(`${mk}-01`, comm);
    const mEnd = minDate(`${nextMonthKey(mk)}-01`, finalInstant);
    const row: ExactRow = {
      month: mk, periodEnd: addDays(`${nextMonthKey(mk)}-01`, -1),
      additions: ZERO, rouAdditions: ZERO, interest: ZERO, payments: ZERO, remeasurement: ZERO,
      derecognised: ZERO, depreciation: ZERO, rouAdjustment: ZERO, rouDerecognised: ZERO,
      provisionUnwind: provAt(mEnd).minus(provAt(mStart)), gainLoss: ZERO, penalty: ZERO, segment: 0, hasEvent: false,
    };
    if (monthKey(comm) === mk) {
      row.additions = s0.L0;
      row.rouAdditions = s0.R0;
    }
    segs.forEach((seg, i) => {
      const segEnd = i + 1 < segs.length ? segs[i + 1].start : finalInstant;
      if (i > 0 && seg.start >= mStart && seg.start < mEnd) {
        row.hasEvent = true;
        row.remeasurement = row.remeasurement.plus(seg.liabAdj);
        row.derecognised = row.derecognised.plus(seg.derecLiab);
        row.rouAdjustment = row.rouAdjustment.plus(seg.rouAdj);
        row.rouDerecognised = row.rouDerecognised.plus(seg.derecRou);
        row.gainLoss = row.gainLoss.plus(seg.gainLoss);
        row.penalty = row.penalty.plus(seg.penalty);
      }
      const a = maxDate(mStart, seg.start);
      const b = minDate(mEnd, segEnd);
      if (a >= b) return;
      row.segment = i;
      const paid = seg.flows.filter((f) => f.at > a && f.at <= b).reduce((acc, f) => acc.plus(f.amount), ZERO);
      row.payments = row.payments.plus(paid);
      row.interest = row.interest.plus(liabilityAt(seg, b, comm, dc).minus(liabilityAt(seg, a, comm, dc)).plus(paid));
      row.depreciation = row.depreciation.plus(rouAt(seg, a, comm, dc).minus(rouAt(seg, b, comm, dc)));
    });
    exact.push(row);
  }

  // Cumulative rounding per column: posted totals always tie to the rounded cumulative amount.
  const cum: Record<string, Decimal> = {};
  const roundedDelta = (key: keyof ExactRow, v: Decimal) => {
    const prev = cum[key] ?? ZERO;
    cum[key] = prev.plus(v);
    return r2(cum[key]).minus(r2(prev));
  };
  let L = ZERO;
  let R = ZERO;
  return exact.map((e) => {
    const additions = roundedDelta("additions", e.additions);
    const interest = roundedDelta("interest", e.interest);
    const payments = roundedDelta("payments", e.payments);
    const remeasurement = roundedDelta("remeasurement", e.remeasurement);
    const derecognised = roundedDelta("derecognised", e.derecognised);
    const rouAdditions = roundedDelta("rouAdditions", e.rouAdditions);
    const depreciation = roundedDelta("depreciation", e.depreciation);
    const rouAdjustment = roundedDelta("rouAdjustment", e.rouAdjustment);
    const rouDerecognised = roundedDelta("rouDerecognised", e.rouDerecognised);
    const provisionUnwind = roundedDelta("provisionUnwind", e.provisionUnwind);
    const gainLoss = roundedDelta("gainLoss", e.gainLoss);
    const penalty = roundedDelta("penalty", e.penalty);
    const liabOpening = L;
    L = L.plus(additions).plus(interest).minus(payments).plus(remeasurement).minus(derecognised);
    const rouOpening = R;
    R = R.plus(rouAdditions).minus(depreciation).plus(rouAdjustment).minus(rouDerecognised);
    return {
      month: e.month, periodEnd: e.periodEnd, segment: e.segment, hasEvent: e.hasEvent,
      liabOpening: liabOpening.toFixed(2), additions: additions.toFixed(2), interest: interest.toFixed(2),
      payments: payments.toFixed(2), remeasurement: remeasurement.toFixed(2), derecognised: derecognised.toFixed(2),
      liabClosing: L.toFixed(2), rouOpening: rouOpening.toFixed(2), rouAdditions: rouAdditions.toFixed(2),
      depreciation: depreciation.toFixed(2), rouAdjustment: rouAdjustment.toFixed(2),
      rouDerecognised: rouDerecognised.toFixed(2), rouClosing: R.toFixed(2),
      provisionUnwind: provisionUnwind.toFixed(2), gainLoss: gainLoss.toFixed(2), penalty: penalty.toFixed(2),
    };
  });
}

/** Group monthly rows into quarters or years (sums flows, keeps first opening / last closing). */
export function groupSchedule(rows: ScheduleRow[], by: "month" | "quarter" | "year", fyStartMonth = 1): ScheduleRow[] {
  if (by === "month") return rows;
  const keyOf = (m: string) => {
    const [y, mo] = m.split("-").map(Number);
    const shifted = (mo - fyStartMonth + 12) % 12;
    const fy = mo >= fyStartMonth ? y : y - 1;
    return by === "year" ? `FY${fy + (fyStartMonth === 1 ? 0 : 1)}` : `FY${fy + (fyStartMonth === 1 ? 0 : 1)} Q${Math.floor(shifted / 3) + 1}`;
  };
  const sumKeys: Array<keyof ScheduleRow> = [
    "additions", "interest", "payments", "remeasurement", "derecognised", "rouAdditions", "depreciation",
    "rouAdjustment", "rouDerecognised", "provisionUnwind", "gainLoss", "penalty",
  ];
  const groups = new Map<string, ScheduleRow>();
  for (const r of rows) {
    const k = keyOf(r.month);
    const g = groups.get(k);
    if (!g) {
      groups.set(k, { ...r, month: k });
      continue;
    }
    for (const s of sumKeys) (g[s] as string) = D(g[s] as string).plus(r[s] as string).toFixed(2);
    g.liabClosing = r.liabClosing;
    g.rouClosing = r.rouClosing;
    g.periodEnd = r.periodEnd;
    g.hasEvent ||= r.hasEvent;
  }
  return [...groups.values()];
}

// ─── Balances at a date ────────────────────────────────────────────────────

export function rowAt(rows: ScheduleRow[], periodEnd: ISODate): ScheduleRow | undefined {
  let found: ScheduleRow | undefined;
  for (const r of rows) if (r.periodEnd <= periodEnd) found = r;
  return found;
}

/** Current portion = L(d) − L(d + 12 months), assuming no future events. */
export function currentSplit(segs: SegmentResult[], asOf: ISODate, policy: Policy) {
  if (!segs.length) return { current: "0.00", nonCurrent: "0.00" };
  const comm = segs[0].start;
  const s = addDays(asOf, 1);
  const seg = [...segs].reverse().find((g) => g.start <= s) ?? segs[0];
  if (s < comm) return { current: "0.00", nonCurrent: "0.00" };
  const now = liabilityAt(seg, s, comm, policy.dayCount);
  const later = liabilityAt(seg, addMonths(s, 12), comm, policy.dayCount);
  return { current: r2(now.minus(later)).toFixed(2), nonCurrent: r2(later).toFixed(2) };
}

export const MATURITY_BUCKETS = ["≤ 1 year", "1–2 years", "2–5 years", "> 5 years"] as const;

/** Undiscounted remaining payments after asOf, by bucket (IFRS 7 maturity analysis). */
export function maturity(segs: SegmentResult[], asOf: ISODate): string[] {
  const out = [ZERO, ZERO, ZERO, ZERO];
  if (!segs.length) return out.map((d) => d.toFixed(2));
  const s = addDays(asOf, 1);
  const seg = [...segs].reverse().find((g) => g.start <= s) ?? segs[0];
  for (const f of seg.flows) {
    if (f.at <= s) continue;
    const m = monthsBetween(s, f.at);
    const i = m <= 12 ? 0 : m <= 24 ? 1 : m <= 60 ? 2 : 3;
    out[i] = out[i].plus(f.amount);
  }
  return out.map((d) => d.toFixed(2));
}

// ─── Journals ──────────────────────────────────────────────────────────────

export type AccountKey =
  | "rou_cost" | "rou_accdep" | "lease_liability" | "interest_expense" | "depreciation_expense"
  | "cash_payable" | "restoration_provision" | "idc_clearing" | "incentive_receivable"
  | "modification_gain_loss" | "lease_expense";

export const ACCOUNT_LABELS: Record<AccountKey, string> = {
  rou_cost: "Right-of-use asset — cost",
  rou_accdep: "Right-of-use asset — accumulated depreciation",
  lease_liability: "Lease liability",
  interest_expense: "Interest expense — leases",
  depreciation_expense: "Depreciation expense — ROU",
  cash_payable: "Cash / accounts payable",
  restoration_provision: "Restoration provision",
  idc_clearing: "Initial direct costs clearing",
  incentive_receivable: "Lease incentive received",
  modification_gain_loss: "Gain / loss on lease modification",
  lease_expense: "Lease expense (exempt leases)",
};

export type JournalKind = "initial" | "interest" | "payment" | "depreciation" | "unwind" | "remeasurement" | "derecognition" | "expense";

export interface JournalLine {
  month: string;
  date: ISODate;
  kind: JournalKind;
  account: AccountKey;
  debit: string;
  credit: string;
  memo: string;
}

function pair(out: JournalLine[], base: Omit<JournalLine, "account" | "debit" | "credit">, dr: AccountKey, cr: AccountKey, amt: Decimal) {
  if (amt.isZero()) return;
  const [d, c] = amt.gt(0) ? [dr, cr] : [cr, dr];
  const v = amt.abs().toFixed(2);
  out.push({ ...base, account: d, debit: v, credit: "0.00" }, { ...base, account: c, debit: "0.00", credit: v });
}

export function buildJournals(rows: ScheduleRow[], segs: SegmentResult[]): JournalLine[] {
  const out: JournalLine[] = [];
  const s0 = segs[0];
  for (const r of rows) {
    const base = (kind: JournalKind, memo: string) => ({ month: r.month, date: r.periodEnd, kind, memo });
    if (D(r.additions).gt(0) || D(r.rouAdditions).gt(0)) {
      const b = base("initial", "Initial recognition");
      const lines: Array<[AccountKey, Decimal, Decimal]> = [
        ["rou_cost", D(r.rouAdditions), ZERO],
        ["incentive_receivable", r2(s0.incentives), ZERO],
        ["lease_liability", ZERO, D(r.additions)],
        ["cash_payable", ZERO, r2(s0.prepaid)],
        ["idc_clearing", ZERO, r2(s0.idc)],
        ["restoration_provision", ZERO, r2(s0.restorationPV)],
      ];
      // absorb any cent of rounding in the provision line so the entry always balances
      const diff = lines.reduce((a, [, dr, cr]) => a.plus(dr).minus(cr), ZERO);
      lines[5][2] = lines[5][2].plus(diff);
      for (const [acc, dr, cr] of lines) {
        if (dr.isZero() && cr.isZero()) continue;
        out.push({ ...b, account: acc, debit: dr.toFixed(2), credit: cr.toFixed(2) });
      }
    }
    pair(out, base("interest", "Interest accrual"), "interest_expense", "lease_liability", D(r.interest));
    pair(out, base("payment", "Lease payments"), "lease_liability", "cash_payable", D(r.payments));
    pair(out, base("depreciation", "ROU depreciation"), "depreciation_expense", "rou_accdep", D(r.depreciation));
    pair(out, base("unwind", "Restoration provision unwinding"), "interest_expense", "restoration_provision", D(r.provisionUnwind));
    if (r.hasEvent) {
      // shortcut: derecognises ROU net against cost (no split of accumulated depreciation); split it when the ERP needs gross cost/AD movements.
      const dl = D(r.derecognised);
      const dr = D(r.rouDerecognised);
      const pen = D(r.penalty);
      if (!dl.isZero() || !dr.isZero() || !pen.isZero()) {
        const b = base("derecognition", "Partial / full derecognition");
        const gain = dl.minus(dr).minus(pen);
        const lines: Array<[AccountKey, Decimal, Decimal]> = [
          ["lease_liability", dl, ZERO],
          ["rou_cost", ZERO, dr],
          ["cash_payable", ZERO, pen],
          ["modification_gain_loss", gain.lt(0) ? gain.abs() : ZERO, gain.gt(0) ? gain : ZERO],
        ];
        for (const [acc, x, y] of lines) if (!x.isZero() || !y.isZero()) out.push({ ...b, account: acc, debit: x.toFixed(2), credit: y.toFixed(2) });
      }
      const rb = base("remeasurement", "Remeasurement");
      const ra = D(r.rouAdjustment);
      pair(out, rb, "rou_cost", "lease_liability", ra);
      // liability reduced by more than the ROU could absorb → excess to profit or loss
      pair(out, rb, "modification_gain_loss", "lease_liability", D(r.remeasurement).minus(ra));
    }
  }
  return out;
}

/** Exempt (short-term / low-value) leases: straight-line expense, no balance sheet. */
export function exemptExpense(t: LeaseTerms): JournalLine[] {
  const flows = buildCashFlows(t);
  const total = flows.reduce((a, f) => a.plus(f.amount), ZERO);
  const start = t.commencementDate;
  const end = addDays(t.endDate, 1);
  const days = daysBetween(start, end);
  const out: JournalLine[] = [];
  if (days <= 0 || total.isZero()) return out;
  let cum = ZERO;
  for (let mk = monthKey(start); `${mk}-01` < end; mk = nextMonthKey(mk)) {
    const a = maxDate(`${mk}-01`, start);
    const b = minDate(`${nextMonthKey(mk)}-01`, end);
    const prev = cum;
    cum = cum.plus(total.mul(daysBetween(a, b)).div(days));
    const amt = r2(cum).minus(r2(prev));
    pair(out, { month: mk, date: addDays(`${nextMonthKey(mk)}-01`, -1), kind: "expense", memo: "Straight-line lease expense" }, "lease_expense", "cash_payable", amt);
  }
  return out;
}

// ─── Integrity checks ──────────────────────────────────────────────────────

export interface Check {
  id: string;
  label: string;
  ok: boolean;
  expected: string;
  actual: string;
}

export function integrityChecks(rows: ScheduleRow[], journals: JournalLine[], segs: SegmentResult[]): Check[] {
  const last = rows[rows.length - 1];
  const sum = (k: keyof ScheduleRow) => rows.reduce((a, r) => a.plus(r[k] as string), ZERO);
  const dr = journals.reduce((a, j) => a.plus(j.debit), ZERO);
  const cr = journals.reduce((a, j) => a.plus(j.credit), ZERO);
  const terminated = segs[segs.length - 1]?.event === "termination";
  const liabIn = sum("additions").plus(sum("interest")).plus(sum("remeasurement"));
  const liabOut = sum("payments").plus(sum("derecognised"));
  const rouIn = sum("rouAdditions").plus(sum("rouAdjustment"));
  const rouOut = sum("depreciation").plus(sum("rouDerecognised"));
  return [
    {
      id: "liab-zero", label: terminated ? "Liability derecognised on termination" : "Liability runs off to zero at lease end",
      ok: !!last && D(last.liabClosing).isZero(), expected: "0.00", actual: last?.liabClosing ?? "—",
    },
    {
      id: "liab-roll", label: "Additions + interest + remeasurements = payments + derecognitions",
      ok: liabIn.minus(liabOut).abs().lte(0.005) || !D(last?.liabClosing ?? 0).isZero(),
      expected: liabOut.toFixed(2), actual: liabIn.toFixed(2),
    },
    {
      id: "rou-zero", label: "ROU asset fully depreciated / derecognised",
      ok: !!last && D(last.rouClosing).isZero(), expected: "0.00", actual: last?.rouClosing ?? "—",
    },
    {
      id: "rou-roll", label: "ROU additions + adjustments = depreciation + derecognitions",
      ok: rouIn.minus(rouOut).abs().lte(0.005), expected: rouOut.toFixed(2), actual: rouIn.toFixed(2),
    },
    {
      id: "balanced", label: "Journals balance (debits = credits)",
      ok: dr.eq(cr), expected: dr.toFixed(2), actual: cr.toFixed(2),
    },
  ];
}

// ─── One-call convenience ──────────────────────────────────────────────────

export interface Computation {
  segments: SegmentResult[];
  rows: ScheduleRow[];
  journals: JournalLine[];
  checks: Check[];
  flows: Flow[];
}

export function compute(inputs: SegmentInput[], policy: Policy): Computation {
  const segments = buildSegments(inputs, policy);
  const rows = buildSchedule(segments, policy);
  const journals = buildJournals(rows, segments);
  const checks = integrityChecks(rows, journals, segments);
  const lastSeg = segments[segments.length - 1];
  return { segments, rows, journals, checks, flows: lastSeg ? buildCashFlows(lastSeg.terms) : [] };
}
