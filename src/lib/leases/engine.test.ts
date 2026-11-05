/* Golden cases. Run: npx tsx src/lib/leases/engine.test.ts
   Figures are the worked examples from 02_Developer_Blueprint.docx / 03_IFRS16_Prototype.xlsx and the
   event examples in the process analysis. Illustrative until signed off by the accounting lead. */
import assert from "node:assert/strict";
import { compute, buildCashFlows, currentSplit, maturity, D, type LeaseTerms, type PaymentRule } from "./engine";
import { addMonths, monthsBetween } from "./dates";

const P = { dayCount: "periodic" as const };
const rule = (o: Partial<PaymentRule>): PaymentRule => ({
  amount: "10000", frequency: "annual", timing: "arrears", escalation: { type: "none" }, rentFreeMonths: 0, ...o,
});
const terms = (o: Partial<LeaseTerms> = {}): LeaseTerms => ({
  commencementDate: "2027-01-01", endDate: "2029-12-31", paymentRule: rule({}), manualLines: [],
  nonLeasePerPayment: "0", separateNonLease: true, prepaidBeforeCommencement: "0", initialDirectCosts: "0",
  incentivesReceived: "0", restorationEstimate: "0", ...o,
});
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };
const sumBy = (rows: { month: string }[], k: string, year: string) =>
  rows.filter((r) => r.month.startsWith(year)).reduce((a, r) => a.plus((r as never)[k]), D(0)).toFixed(2);

t("dates: end-of-month and fractional months", () => {
  assert.equal(addMonths("2027-01-31", 1), "2027-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2027-01-31", 2, 31), "2027-03-31");
  assert.equal(monthsBetween("2027-01-01", "2028-01-01"), 12);
  assert.equal(monthsBetween("2027-01-01", "2027-01-16"), 15 / 31);
});

t("T01 3-year annual arrears @10% (blueprint example)", () => {
  const c = compute([{ start: "2027-01-01", terms: terms(), rate: "0.10", event: "initial" }], P);
  assert.equal(c.segments[0].L0.toFixed(2), "24868.52");
  assert.equal(c.rows[0].additions, "24868.52");
  assert.equal(sumBy(c.rows, "interest", "2027"), "2486.85");
  assert.equal(sumBy(c.rows, "interest", "2028"), "1735.54");
  assert.equal(sumBy(c.rows, "interest", "2029"), "909.09");
  assert.equal(c.rows.find((r) => r.month === "2027-12")!.liabClosing, "17355.37");
  assert.equal(c.rows.find((r) => r.month === "2028-12")!.liabClosing, "9090.91");
  assert.equal(sumBy(c.rows, "depreciation", "2027"), "8289.51");
  assert.ok(c.checks.every((k) => k.ok), JSON.stringify(c.checks.filter((k) => !k.ok)));
});

t("monthly 1,000 × 12 arrears at 1%/month equivalent", () => {
  const rate = D(1.01).pow(12).minus(1).toString();
  const c = compute([{ start: "2027-01-01", terms: terms({ endDate: "2027-12-31", paymentRule: rule({ amount: "1000", frequency: "monthly" }) }), rate, event: "initial" }], P);
  assert.equal(c.segments[0].L0.toFixed(2), "11255.08");
  assert.equal(c.rows[0].interest, "112.55");
  assert.ok(c.checks.every((k) => k.ok));
});

t("advance payments: first payment goes to ROU, not the liability", () => {
  const rate = D(1.01).pow(12).minus(1).toString();
  const c = compute([{ start: "2027-01-01", terms: terms({ endDate: "2027-12-31", paymentRule: rule({ amount: "1000", frequency: "monthly", timing: "advance" }) }), rate, event: "initial" }], P);
  assert.equal(c.segments[0].L0.toFixed(2), "10367.63");
  assert.equal(c.segments[0].R0.toFixed(2), "11367.63");
  assert.ok(c.checks.every((k) => k.ok), JSON.stringify(c.checks));
});

t("rent-free months and fixed escalation", () => {
  const f = buildCashFlows(terms({ endDate: "2028-12-31", paymentRule: rule({ amount: "1000", frequency: "monthly", rentFreeMonths: 3, escalation: { type: "fixed_pct", pct: "0.05", everyMonths: 12 } }) }));
  assert.equal(f.length, 21);
  assert.equal(f[0].date, "2027-04-30");
  assert.equal(f[f.length - 1].amount.toFixed(2), "1050.00");
});

t("T03 initial direct costs, incentives, restoration", () => {
  const c = compute([{ start: "2027-01-01", terms: terms({ initialDirectCosts: "500", incentivesReceived: "1000", restorationEstimate: "1331" }), rate: "0.10", event: "initial" }], P);
  // restoration PV = 1331 / 1.1^3 = 1000
  assert.equal(c.segments[0].R0.toFixed(2), "25368.52"); // 24,868.52 + 500 − 1,000 + 1,000 (1,331 / 1.1³)
  assert.equal(c.rows[c.rows.length - 1].rouClosing, "0.00");
  assert.ok(c.checks.every((k) => k.ok), JSON.stringify(c.checks));
});

const base = { start: "2027-01-01", terms: terms(), rate: "0.10", event: "initial" as const };

t("T05 CPI +5% from year 2, unchanged rate → +867.77", () => {
  const cpi = terms({ paymentRule: rule({ amountSteps: [{ from: "2028-01-01", amount: "10500" }] }) });
  const c = compute([base, { start: "2028-01-01", terms: cpi, rate: "0.10", event: "index" }], P);
  assert.equal(c.segments[1].liabAdj.toFixed(2), "867.77");
  assert.equal(c.segments[1].R0.toFixed(2), "17446.78");
  assert.ok(c.checks.every((k) => k.ok), JSON.stringify(c.checks));
});

t("T06 rent cut to 8,000 at revised 12% → −3,834.96 to ROU, no gain", () => {
  const mod = terms({ paymentRule: rule({ amountSteps: [{ from: "2028-01-01", amount: "8000" }] }) });
  const c = compute([base, { start: "2028-01-01", terms: mod, rate: "0.12", event: "modification" }], P);
  assert.equal(c.segments[1].liabAdj.toFixed(2), "-3834.96");
  assert.equal(c.segments[1].gainLoss.toFixed(2), "0.00");
  assert.ok(c.checks.every((k) => k.ok), JSON.stringify(c.checks));
});

t("T06 50% scope decrease → gain 388.18", () => {
  const mod = terms({ paymentRule: rule({ amountSteps: [{ from: "2028-01-01", amount: "5000" }] }) });
  const c = compute([base, { start: "2028-01-01", terms: mod, rate: "0.10", event: "modification", scopeDecrease: "0.5" }], P);
  assert.equal(c.segments[1].gainLoss.toFixed(2), "388.18");
  assert.equal(c.segments[1].liabAdj.toFixed(2), "0.00");
  assert.ok(c.checks.every((k) => k.ok), JSON.stringify(c.checks));
});

t("termination with penalty", () => {
  const c = compute([base, { start: "2028-01-01", terms: terms(), rate: "0.10", event: "termination", terminationPenalty: "1000" }], P);
  assert.equal(c.segments[1].gainLoss.toFixed(2), "-223.64"); // 17355.37 − 16579.01 − 1000
  assert.equal(c.rows[c.rows.length - 1].liabClosing, "0.00");
  assert.ok(c.checks.every((k) => k.ok), JSON.stringify(c.checks));
});

t("current / non-current and maturity", () => {
  const c = compute([base], P);
  const s = currentSplit(c.segments, "2027-12-31", P);
  assert.equal(s.current, "8264.46");
  assert.equal(s.nonCurrent, "9090.91");
  assert.deepEqual(maturity(c.segments, "2027-12-31"), ["10000.00", "10000.00", "0.00", "0.00"]);
});

t("leap year, 31st-of-month, act/365 still runs off to zero", () => {
  const c = compute([{ start: "2028-01-31", terms: terms({ commencementDate: "2028-01-31", endDate: "2031-01-30", paymentRule: rule({ amount: "2500", frequency: "monthly" }) }), rate: "0.0875", event: "initial" }], { dayCount: "act365" });
  assert.ok(c.checks.every((k) => k.ok), JSON.stringify(c.checks));
});

console.log(`\n${n} golden cases passed`);

{
  const t0 = performance.now();
  const c = compute([{ start: "2026-01-01", terms: terms({ commencementDate: "2026-01-01", endDate: "2035-12-31", paymentRule: rule({ amount: "5000", frequency: "monthly", escalation: { type: "fixed_pct", pct: "0.03", everyMonths: 12 } }) }), rate: "0.09", event: "initial" }], P);
  const ms = performance.now() - t0;
  assert.ok(c.checks.every((k) => k.ok));
  assert.ok(ms < 1500, `10-year monthly lease took ${ms.toFixed(0)}ms`);
  console.log(`✓ perf: 10-year monthly lease in ${ms.toFixed(0)}ms`);
}

// Shared golden fixture (copy of ECL-Server tests/fixtures/leases_golden.json): both engines must agree.
import golden from "./golden.json";
import type { SegmentInput } from "./engine";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose fixture JSON
type GoldenExpect = Record<string, any>;
for (const gc of golden.cases as Array<{ name: string; dayCount: "periodic" | "act365"; inputs: SegmentInput[]; expect: GoldenExpect }>) {
  t(`golden: ${gc.name}`, () => {
    const c = compute(gc.inputs, { dayCount: gc.dayCount });
    const e = gc.expect;
    assert.ok(c.checks.every((k) => k.ok), JSON.stringify(c.checks.filter((k) => !k.ok)));
    if (e.L0) assert.equal(c.segments[0].L0.toFixed(2), e.L0);
    if (e.R0) assert.equal(c.segments[0].R0.toFixed(2), e.R0);
    for (const [col, years] of Object.entries((e.yearSums ?? {}) as Record<string, Record<string, string>>)) for (const [y, v] of Object.entries(years)) assert.equal(sumBy(c.rows, col, y), v);
    for (const [m, v] of Object.entries((e.closing ?? {}) as Record<string, string>)) assert.equal(c.rows.find((r) => r.month === m)!.liabClosing, v);
    if (e.firstRow) for (const [k, v] of Object.entries(e.firstRow)) assert.equal((c.rows[0] as never)[k], v);
    if (e.seg1) for (const [k, v] of Object.entries(e.seg1 as Record<string, string>)) assert.equal((c.segments[1] as unknown as Record<string, { toFixed(n: number): string }>)[k].toFixed(2), v);
    if (e.lastClosing) assert.equal(c.rows.at(-1)!.liabClosing, e.lastClosing);
    if (e.flowCount) { assert.equal(c.flows.length, e.flowCount); assert.equal(c.flows[0].date, e.firstFlowDate); assert.equal(c.flows.at(-1)!.amount.toFixed(2), e.lastFlowAmount); }
    if (e.flowAmounts) assert.deepEqual(c.flows.map((f) => f.amount.toFixed(2)), e.flowAmounts);
    if (e.currentSplit) assert.deepEqual(currentSplit(c.segments, e.currentSplit.asOf, { dayCount: gc.dayCount }), { current: e.currentSplit.current, nonCurrent: e.currentSplit.nonCurrent });
    if (e.maturity) assert.deepEqual(maturity(c.segments, e.maturity.asOf), e.maturity.buckets);
  });
}
console.log(`\n${n} cases passed incl. shared golden fixture`);
