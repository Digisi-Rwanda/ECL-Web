/** Portfolio aggregates for Overview and Reports. */
import { D, MATURITY_BUCKETS } from "./engine";
import { monthEnd } from "./dates";
import { approvedChain, balancesAt, computeLease, isExempt, leaseStatus, maturityAt, todayISO } from "./model";
import type { AssetClass, Lease, LeasesState } from "./types";

const z = () => D(0);

export interface RollForward {
  opening: string; additions: string; interest: string; payments: string; remeasurement: string; derecognised: string; closing: string;
  rouOpening: string; rouAdditions: string; depreciation: string; rouAdjustment: string; rouDerecognised: string; rouClosing: string;
  gainLoss: string; provisionUnwind: string;
}

/** Movements over (fromMonth, toMonth] inclusive of both months' activity. */
export function rollForward(st: LeasesState, fromMonth: string, toMonth: string, filter?: (l: Lease) => boolean): RollForward {
  const acc: Record<string, ReturnType<typeof D>> = {};
  const add = (k: string, v: string) => (acc[k] = (acc[k] ?? z()).plus(v));
  for (const l of st.leases) {
    if (filter && !filter(l)) continue;
    const c = computeLease(st, l);
    if (!c) continue;
    let opened = false;
    for (const r of c.rows) {
      if (r.month < fromMonth) continue;
      if (r.month > toMonth) break;
      if (!opened) { add("opening", r.liabOpening); add("rouOpening", r.rouOpening); opened = true; }
      for (const k of ["additions", "interest", "payments", "remeasurement", "derecognised", "rouAdditions", "depreciation", "rouAdjustment", "rouDerecognised", "gainLoss", "provisionUnwind"] as const) add(k, r[k]);
    }
    // closing = last row <= toMonth (also for leases ended before toMonth)
    let last;
    for (const r of c.rows) if (r.month <= toMonth) last = r;
    if (last && last.month >= fromMonth) { add("closing", last.liabClosing); add("rouClosing", last.rouClosing); }
    else if (last) { add("opening", last.liabClosing); add("closing", last.liabClosing); add("rouOpening", last.rouClosing); add("rouClosing", last.rouClosing); }
  }
  const g = (k: string) => (acc[k] ?? z()).toFixed(2);
  return {
    opening: g("opening"), additions: g("additions"), interest: g("interest"), payments: g("payments"), remeasurement: g("remeasurement"),
    derecognised: g("derecognised"), closing: g("closing"), rouOpening: g("rouOpening"), rouAdditions: g("rouAdditions"),
    depreciation: g("depreciation"), rouAdjustment: g("rouAdjustment"), rouDerecognised: g("rouDerecognised"), rouClosing: g("rouClosing"),
    gainLoss: g("gainLoss"), provisionUnwind: g("provisionUnwind"),
  };
}

export function totalsAt(st: LeasesState, periodKey: string) {
  const end = monthEnd(periodKey);
  let liability = z(), rou = z(), current = z(), nonCurrent = z();
  const maturity = [z(), z(), z(), z()];
  const byClass = new Map<AssetClass, { count: number; rou: ReturnType<typeof D>; liability: ReturnType<typeof D> }>();
  for (const l of st.leases) {
    const chain = approvedChain(l);
    if (!chain.length || isExempt(chain[0])) continue;
    const b = balancesAt(st, l, end);
    liability = liability.plus(b.liability);
    rou = rou.plus(b.rou);
    current = current.plus(b.current);
    nonCurrent = nonCurrent.plus(b.nonCurrent);
    maturityAt(st, l, end).forEach((v, i) => (maturity[i] = maturity[i].plus(v)));
    const k = byClass.get(l.assetClass) ?? { count: 0, rou: z(), liability: z() };
    if (!D(b.liability).isZero() || !D(b.rou).isZero()) k.count += 1;
    k.rou = k.rou.plus(b.rou);
    k.liability = k.liability.plus(b.liability);
    byClass.set(l.assetClass, k);
  }
  const month = periodActivity(st, periodKey);
  return {
    liability: liability.toFixed(2), rou: rou.toFixed(2), current: current.toFixed(2), nonCurrent: nonCurrent.toFixed(2),
    maturity: maturity.map((m, i) => ({ label: MATURITY_BUCKETS[i], value: m.toFixed(2) })),
    byClass: [...byClass.entries()].map(([cls, v]) => ({ cls, count: v.count, rou: v.rou.toFixed(2), liability: v.liability.toFixed(2) })),
    ...month,
  };
}

function periodActivity(st: LeasesState, periodKey: string) {
  let interest = z(), depreciation = z(), payments = z();
  for (const l of st.leases) {
    const c = computeLease(st, l);
    const r = c?.rows.find((x) => x.month === periodKey);
    if (!r) continue;
    interest = interest.plus(r.interest);
    depreciation = depreciation.plus(r.depreciation);
    payments = payments.plus(r.payments);
  }
  return { interest: interest.toFixed(2), depreciation: depreciation.toFixed(2), payments: payments.toFixed(2) };
}

export function statusCounts(st: LeasesState) {
  const today = todayISO();
  const out: Record<string, number> = {};
  for (const l of st.leases) {
    const s = leaseStatus(l, today);
    out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}

export function expiries(st: LeasesState, months = 24) {
  const today = todayISO();
  const limit = `${Number(today.slice(0, 4)) + Math.floor(months / 12)}${today.slice(4)}`;
  return st.leases
    .map((l) => ({ l, chain: approvedChain(l) }))
    .filter(({ l, chain }) => chain.length && ["active", "exempt"].includes(leaseStatus(l, today)))
    .map(({ l, chain }) => ({ lease: l, end: chain[chain.length - 1].terms.endDate }))
    .filter((x) => x.end <= limit)
    .sort((a, b) => (a.end < b.end ? -1 : 1));
}
