/** Demo data: a realistic sample portfolio, built through the same rules as real data. */
import { D } from "./engine";
import { addDays, addMonths, monthKey, nextMonthKey } from "./dates";
import { approvedChain, computeWithPending, todayISO } from "./model";
import { buildBatchLines } from "./store";
import type { AssetClass, LeasesState, Lease, LeaseVersion, Persona } from "./types";
import type { AccountKey } from "./engine";

export interface SeedContext {
  currency: string;
  userName: string;
  tenantName: string;
}

const ACCOUNTS: Record<AccountKey, string> = {
  rou_cost: "1610", rou_accdep: "1619", lease_liability: "2410", interest_expense: "7110",
  depreciation_expense: "6810", cash_payable: "2010", restoration_provision: "2450", idc_clearing: "2090",
  incentive_receivable: "1390", modification_gain_loss: "7990", lease_expense: "6110",
};

function initials(n: string) {
  return n.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "U";
}

export function personasFor(userName: string): Persona[] {
  return [
    { id: "p_me", name: userName || "You", initials: initials(userName || "You"), role: "administrator", title: "Finance administrator (you)" },
    { id: "p_grace", name: "Grace Uwase", initials: "GU", role: "reviewer", title: "Financial controller" },
    { id: "p_eric", name: "Eric Mugisha", initials: "EM", role: "analyst", title: "Lease accountant" },
  ];
}

function base(tenantId: string, ctx: SeedContext): LeasesState {
  return {
    schema: 1, tenantId, seededAs: "empty", personaId: "p_me", personas: personasFor(ctx.userName),
    periods: [], policies: [], curves: [], gl: [], counterparties: [], leases: [], batches: [], closes: [], imports: [],
    notifications: [], audit: [], posted: {}, savedViews: [], seq: { lease: 0, batch: 0, import: 0, id: 0 },
  };
}

// deterministic PRNG so every reset gives the same portfolio
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LESSORS = [
  "Vision City Estates", "Kigali Heights Ltd", "Rwanda Motor Leasing", "Akagera Properties", "Nyarutarama Holdings",
  "Musanze Commercial Plaza", "Huye Real Estate Co", "TechServe Data Centres", "Equip Rwanda Ltd", "Rubavu Lakeside Properties",
  "Prime Fleet Solutions", "City Tower Kigali",
];

type Spec = {
  name: string; cls: AssetClass; lessor: number; loc: string; start: string; years: number; amount: number;
  freq?: "monthly" | "quarterly" | "annual"; timing?: "advance" | "arrears"; esc?: number; rentFree?: number;
  idc?: number; restoration?: number; exempt?: "short_term" | "low_value"; option?: { months: number; certain: boolean; notice?: string };
};

export function seedLeases(tenantId: string, mode: "sample" | "empty", ctx: SeedContext): LeasesState {
  const st = base(tenantId, ctx);
  st.seededAs = mode;
  if (mode === "empty") return st;

  const today = todayISO();
  const cur = monthKey(today);
  const t0 = "2026-01-05T08:00:00.000Z";
  const scale = ctx.currency === "USD" || ctx.currency === "EUR" || ctx.currency === "GBP" ? 1 : ctx.currency === "KES" ? 130 : 1300;
  const amt = (n: number) => String(Math.round(n * scale));

  st.entity = { id: "en_1", name: ctx.tenantName || "Head office", currency: ctx.currency, country: "Rwanda", fyStartMonth: 1 };
  st.book = { id: "bk_1", entityId: "en_1", name: "IFRS group book", framework: "IFRS16", standardVersion: "IFRS 16 (2016, as amended)" };
  st.policies.push({
    version: 1, effectiveFrom: "2023-01-01", status: "approved", reason: "Initial policy", createdBy: "p_me", createdAt: t0,
    approvedBy: "p_grace", approvedAt: t0, dayCount: "periodic", shortTermClasses: ["vehicles", "equipment", "it"],
    lowValueElection: true, lowValueThreshold: amt(5000), separateNonLeaseClasses: ["property"], capitalisationThreshold: amt(2000),
  });
  const curve = (v: number, from: string, shift: number) => ({
    version: v, effectiveFrom: from, status: "approved" as const, reason: v === 1 ? "Initial curve" : "Quarterly refresh", createdBy: "p_me",
    createdAt: t0, approvedBy: "p_grace", approvedAt: t0, source: "Bank quotes + sovereign curve, Treasury",
    points: [1, 3, 5, 10].map((y, i) => ({ currency: ctx.currency, termYears: y, rate: D([0.0825, 0.0875, 0.0925, 0.1].at(i)!).plus(shift).toString() })),
  });
  st.curves.push(curve(1, "2023-01-01", 0), curve(2, "2026-01-01", 0.005));
  st.gl.push({ version: 1, effectiveFrom: "2023-01-01", status: "approved", reason: "Initial mapping", createdBy: "p_me", createdAt: t0, approvedBy: "p_grace", approvedAt: t0, accounts: { ...ACCOUNTS } });
  st.counterparties = LESSORS.map((name, i) => ({ id: `cp_${i + 1}`, name, vendorRef: `V${1000 + i}` }));

  const specs: Spec[] = [
    { name: "Head office — Kigali Heights floors 4–6", cls: "property", lessor: 1, loc: "Kigali", start: "2023-01-01", years: 10, amount: 18500, freq: "monthly", timing: "advance", esc: 0.05, idc: 12000, restoration: 60000, option: { months: 60, certain: false, notice: addMonths(today, 2) } },
    { name: "Branch — Nyarutarama", cls: "property", lessor: 4, loc: "Kigali", start: "2023-04-01", years: 6, amount: 4200, timing: "advance", esc: 0.04 },
    { name: "Branch — Remera", cls: "property", lessor: 0, loc: "Kigali", start: "2023-07-01", years: 5, amount: 3600, timing: "advance", rentFree: 3 },
    { name: "Branch — Musanze", cls: "property", lessor: 5, loc: "Musanze", start: "2024-01-01", years: 5, amount: 2100, freq: "quarterly", timing: "advance", esc: 0.03 },
    { name: "Branch — Huye", cls: "property", lessor: 6, loc: "Huye", start: "2024-03-01", years: 5, amount: 1900, timing: "arrears" },
    { name: "Branch — Rubavu lakeside", cls: "property", lessor: 9, loc: "Rubavu", start: "2024-06-01", years: 7, amount: 2400, timing: "advance", esc: 0.05 },
    { name: "Disaster recovery site", cls: "it", lessor: 7, loc: "Kigali", start: "2023-09-01", years: 5, amount: 6800, freq: "quarterly", timing: "advance" },
    { name: "Core banking servers (rack B)", cls: "it", lessor: 7, loc: "Kigali", start: "2024-02-01", years: 4, amount: 3100, timing: "arrears" },
    { name: "Fleet — Toyota Hilux ×6", cls: "vehicles", lessor: 2, loc: "Kigali", start: "2024-01-01", years: 4, amount: 2750, timing: "arrears" },
    { name: "Fleet — executive sedans ×3", cls: "vehicles", lessor: 10, loc: "Kigali", start: "2024-09-01", years: 3, amount: 1650, timing: "arrears" },
    { name: "Cash-in-transit vans ×4", cls: "vehicles", lessor: 10, loc: "Kigali", start: "2025-02-01", years: 4, amount: 2300, timing: "arrears" },
    { name: "ATM kiosks — Kigali CBD", cls: "property", lessor: 11, loc: "Kigali", start: "2025-01-01", years: 5, amount: 900, freq: "annual", timing: "advance" },
    { name: "Generator sets (branch network)", cls: "equipment", lessor: 8, loc: "Rwanda", start: "2025-04-01", years: 5, amount: 1200, timing: "arrears" },
    { name: "Archive warehouse — Masoro", cls: "property", lessor: 3, loc: "Kigali", start: "2025-06-01", years: 8, amount: 2900, timing: "advance", esc: 0.04, restoration: 15000 },
    { name: "Training centre — Kicukiro", cls: "property", lessor: 0, loc: "Kigali", start: "2025-09-01", years: 5, amount: 3300, timing: "advance" },
    { name: "Land — Bugesera branch plot", cls: "land", lessor: 3, loc: "Bugesera", start: "2024-01-01", years: 20, amount: 6000, freq: "annual", timing: "advance" },
    { name: "Branch — Rwamagana", cls: "property", lessor: 5, loc: "Rwamagana", start: "2026-02-01", years: 5, amount: 1700, timing: "advance" },
    { name: "Branch — Nyagatare", cls: "property", lessor: 6, loc: "Nyagatare", start: "2026-05-01", years: 5, amount: 1500, timing: "advance", rentFree: 2 },
    { name: "Printers & copiers", cls: "equipment", lessor: 8, loc: "Kigali", start: "2025-01-01", years: 3, amount: 180, timing: "arrears", exempt: "low_value" },
    { name: "Pop-up branch — Kigali Expo", cls: "property", lessor: 11, loc: "Kigali", start: "2026-07-01", years: 1, amount: 1100, timing: "advance", exempt: "short_term" },
    { name: "Branch — Muhanga (closed)", cls: "property", lessor: 4, loc: "Muhanga", start: "2023-03-01", years: 5, amount: 1400, timing: "advance" },
    { name: "Branch — Gisenyi market", cls: "property", lessor: 9, loc: "Rubavu", start: "2022-12-01", years: 4, amount: 1250, timing: "advance" },
    { name: "Call centre — Gikondo", cls: "property", lessor: 1, loc: "Kigali", start: "2027-01-01", years: 5, amount: 4100, timing: "advance", esc: 0.05 },
    { name: "Mobile banking vans ×2", cls: "vehicles", lessor: 2, loc: "Kigali", start: addMonths(`${cur}-01`, 1), years: 3, amount: 1450, timing: "arrears" },
  ];

  const r = rng(42);
  const mkVersion = (sp: Spec, cv: number): LeaseVersion => {
    const end = addDays(addMonths(sp.start, sp.years * 12), -1);
    const term = sp.years;
    const pts = st.curves[cv - 1].points;
    const near = pts.reduce((a, b) => (Math.abs(b.termYears - term) < Math.abs(a.termYears - term) ? b : a));
    return {
      n: 1, status: "approved", event: "initial", effectiveDate: sp.start, reason: "New lease",
      terms: {
        commencementDate: sp.start, endDate: end, manualLines: [], nonLeasePerPayment: "0", separateNonLease: true,
        prepaidBeforeCommencement: "0", initialDirectCosts: amt(sp.idc ?? 0), incentivesReceived: "0", restorationEstimate: amt(sp.restoration ?? 0),
        paymentRule: {
          amount: amt(sp.amount), frequency: sp.freq ?? "monthly", timing: sp.timing ?? "advance", rentFreeMonths: sp.rentFree ?? 0,
          escalation: sp.esc ? { type: "fixed_pct", pct: String(sp.esc), everyMonths: 12 } : { type: "none" },
        },
      },
      assessment: {
        identifiedAsset: true, rightToControl: true, exemption: sp.exempt ?? "none",
        exemptionRationale: sp.exempt === "low_value" ? "Each copier is below the low-value threshold when new." : sp.exempt === "short_term" ? "12-month term, no purchase option, no renewal expected." : "",
        options: sp.option ? [{ id: "op1", type: "renewal", months: sp.option.months, noticeDate: sp.option.notice, reasonablyCertain: sp.option.certain, rationale: "Relocation planned within the strategy horizon; renewal not reasonably certain." }] : [],
        purchaseOption: { exists: false, reasonablyCertain: null, rationale: "" },
        termRationale: "Non-cancellable period per signed contract; no penalties beyond insignificant amounts.",
      },
      rate: sp.exempt ? { value: "", source: "curve" } : { value: near.rate, source: "curve", curveVersion: cv, termYears: term },
      createdBy: r() > 0.5 ? "p_eric" : "p_me", createdAt: `${sp.start}T09:00:00.000Z`, submittedBy: "p_eric", submittedAt: `${sp.start}T10:00:00.000Z`,
      approverId: "p_grace", decidedBy: "p_grace", decidedAt: `${sp.start}T15:00:00.000Z`,
      comments: [{ id: `cm_${sp.start}`, by: "p_grace", at: `${sp.start}T15:00:00.000Z`, text: "Approved — term and rate agree to contract and curve.", kind: "approve" }],
    };
  };

  for (const sp of specs) {
    st.seq.lease += 1;
    const v = mkVersion(sp, sp.start >= "2026-01-01" ? 2 : 1);
    const l: Lease = {
      id: `ls_${st.seq.lease}`, code: `L-${String(st.seq.lease).padStart(4, "0")}`, name: sp.name, assetClass: sp.cls,
      counterpartyId: `cp_${sp.lessor + 1}`, entityId: "en_1", location: sp.loc, currency: ctx.currency, ownerId: r() > 0.4 ? "p_eric" : "p_me",
      costCentre: sp.cls === "property" ? "CC-110 Branch network" : sp.cls === "vehicles" ? "CC-220 Logistics" : "CC-310 IT",
      versions: [v], docs: [{ id: `dc_${st.seq.lease}`, name: `${sp.name.split(" — ")[0].replace(/\W+/g, "_")}_signed.pdf`, size: 240_000 + Math.round(r() * 900_000), sha256: Math.round(r() * 1e16).toString(16).padStart(16, "0") + st.seq.lease.toString(16).padStart(48, "0"), kind: "contract", uploadedBy: "p_eric", uploadedAt: v.createdAt, versionN: 1 }],
      wizardStep: 4, createdAt: v.createdAt, updatedAt: v.createdAt, rev: 1,
    };
    st.leases.push(l);
  }
  const byName = (n: string) => st.leases.find((l) => l.name.startsWith(n))!;

  // Lifecycle events already on the books
  const addEvent = (l: Lease, ev: Partial<LeaseVersion> & Pick<LeaseVersion, "event" | "effectiveDate" | "reason">, status: LeaseVersion["status"] = "approved") => {
    const prev = approvedChain(l).at(-1)!;
    const v: LeaseVersion = {
      ...structuredClone(prev), n: l.versions.length + 1, status, comments: [], calculated: undefined,
      createdBy: "p_eric", createdAt: `${ev.effectiveDate}T09:00:00.000Z`, submittedBy: "p_eric", submittedAt: `${ev.effectiveDate}T10:00:00.000Z`,
      approverId: "p_grace", decidedBy: status === "approved" ? "p_grace" : undefined, decidedAt: status === "approved" ? `${ev.effectiveDate}T16:00:00.000Z` : undefined,
      ...ev,
    };
    l.versions.push(v);
    l.rev += 1;
    return v;
  };
  const muhanga = byName("Branch — Muhanga");
  addEvent(muhanga, { event: "termination", effectiveDate: "2026-03-01", reason: "Branch consolidated into Nyarutarama; early exit agreed with landlord.", terminationPenalty: amt(2800) });
  const huye = byName("Branch — Huye");
  {
    const t = structuredClone(approvedChain(huye)[0].terms);
    t.paymentRule!.amountSteps = [{ from: "2025-03-01", amount: amt(1995) }];
    addEvent(huye, { event: "index", effectiveDate: "2025-03-01", reason: "Annual CPI review: +5.0% (NISR CPI Feb 2025).", terms: t });
  }

  // History: close every month from Jan 2026 to last month, exactly like a user would
  const late = byName("Branch — Musanze");
  const lateTerms = structuredClone(approvedChain(late)[0].terms);
  lateTerms.paymentRule!.amountSteps = [{ from: "2026-09-01", amount: amt(2310) }];
  for (let k = "2026-01"; k < cur; k = nextMonthKey(k)) st.periods.push({ key: k, status: "open", reopenLog: [] });
  st.periods.push({ key: cur, status: "open", reopenLog: [] });
  for (const p of st.periods.filter((x) => x.key < cur)) {
    const lines = buildBatchLines(st, p.key);
    st.seq.batch += 1;
    const id = `JB-${p.key.replace("-", "")}-${String(st.seq.batch).padStart(3, "0")}`;
    const at = `${nextMonthKey(p.key)}-05T14:00:00.000Z`;
    st.batches.unshift({
      id, period: p.key, type: "period", status: "posted", lines, createdAt: at, createdBy: "p_eric", approvedBy: "p_grace", approvedAt: at,
      exportedAt: at, erpRef: `SAP-JE-${p.key.replace("-", "")}-${4400 + st.seq.batch}`, postedAt: at, postedBy: "p_me", idempotencyKey: `${tenantId}:${p.key}:${st.seq.batch}`,
    });
    for (const ln of lines) {
      const per = (st.posted[ln.leaseId] ??= {});
      per[ln.account] = D(per[ln.account] ?? 0).plus(ln.debit).minus(ln.credit).toFixed(2);
    }
    p.status = "locked";
    p.lockedBy = "p_me";
    p.lockedAt = at;
    st.closes.push({
      period: p.key, startedBy: "p_eric", startedAt: at, batchId: id, payments: [],
      steps: (["cutoff", "rates", "events", "generate", "matching", "reconcile", "approve", "post"] as const).map((sid) => ({ id: sid, status: "done", doneBy: sid === "approve" ? "p_grace" : "p_eric", doneAt: at })),
    });
  }
  // Back-dated CPI approved after September closed → catch-up in the current close
  addEvent(late, { event: "index", effectiveDate: "2026-09-01", reason: "CPI uplift +10.0% effective Sep 2026, landlord notice received late.", terms: lateTerms });

  // Work in progress
  const hq = byName("Head office");
  {
    const t = structuredClone(approvedChain(hq).at(-1)!.terms);
    t.paymentRule!.amountSteps = [{ from: `${cur}-01`, amount: D(t.paymentRule!.amount).mul(1.05 ** 3).mul(1.03).toFixed(0) }];
    const v = addEvent(hq, { event: "index", effectiveDate: `${cur}-01`, reason: "CPI review: additional +3% on top of fixed escalation.", terms: t }, "in_review");
    v.comments = [{ id: "cm_hq", by: "p_eric", at: v.submittedAt!, text: "Landlord letter attached. Rate unchanged per IFRS 16.42(b).", kind: "submit" }];
  }
  const vans = byName("Mobile banking vans");
  {
    const v = vans.versions[0];
    v.status = "in_review";
    v.decidedBy = undefined;
    v.decidedAt = undefined;
    v.comments = [{ id: "cm_v", by: "p_eric", at: v.submittedAt!, text: "Submitted for review", kind: "submit" }];
    vans.rev += 1;
  }

  const draftSpecs: Array<[Spec, LeaseVersion["status"], number]> = [
    [{ name: "Branch — Karongi", cls: "property", lessor: 9, loc: "Karongi", start: "2027-03-01", years: 5, amount: 1350, timing: "advance" }, "draft", 2],
    [{ name: "Data centre cage expansion", cls: "it", lessor: 7, loc: "Kigali", start: "2027-01-01", years: 3, amount: 2200, timing: "arrears" }, "returned", 4],
    [{ name: "Staff housing — Rusizi", cls: "property", lessor: 3, loc: "Rusizi", start: "2027-02-01", years: 2, amount: 800, timing: "advance" }, "draft", 0],
  ];
  for (const [sp, status, step] of draftSpecs) {
    st.seq.lease += 1;
    const v = mkVersion(sp, 2);
    v.status = status;
    v.decidedBy = status === "returned" ? "p_grace" : undefined;
    v.decidedAt = undefined;
    v.submittedBy = status === "returned" ? "p_eric" : undefined;
    v.comments = status === "returned" ? [{ id: "cm_ret", by: "p_grace", at: new Date().toISOString(), text: "Renewal option: the contract has a 2-year renewal at market rent. Add it and assess it.", field: "options", kind: "return" }] : [];
    if (step < 2) v.terms.paymentRule!.amount = "";
    if (step < 3) v.assessment = { ...v.assessment, identifiedAsset: null, rightToControl: null, exemption: null };
    v.createdBy = "p_eric";
    st.leases.unshift({
      id: `ls_${st.seq.lease}`, code: `L-${String(st.seq.lease).padStart(4, "0")}`, name: sp.name, assetClass: sp.cls, counterpartyId: `cp_${sp.lessor + 1}`,
      entityId: "en_1", location: sp.loc, currency: ctx.currency, ownerId: "p_eric", costCentre: "CC-110 Branch network", versions: [v], docs: [],
      wizardStep: step, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), rev: 1,
    });
  }
  // calculated stamps for everything that is calculable
  for (const l of st.leases) {
    for (const v of l.versions) {
      if (v.status === "draft" && l.wizardStep < 3) continue;
      if (v.assessment.exemption && v.assessment.exemption !== "none") {
        v.calculated = { at: v.createdAt, liability: "0.00", rou: "0.00", checksOk: true };
        continue;
      }
      if (v.n === l.versions.length && v.status !== "approved") {
        const c = computeWithPending(st, l);
        const seg = c?.segments.at(-1);
        if (seg) v.calculated = { at: v.createdAt, liability: seg.L0.toFixed(2), rou: seg.R0.toFixed(2), checksOk: c!.checks.every((k) => k.ok) };
      } else v.calculated = { at: v.createdAt, liability: "", rou: "", checksOk: true };
    }
  }

  st.imports.push({
    id: "IMP-0001", fileName: "fleet_leases_2025.csv", sha256: "seeded-import-0001", size: 4123, status: "committed", progress: 100,
    headers: [], mapping: {}, rows: [], warningsAccepted: true, createdBy: "p_eric", createdAt: "2025-02-03T09:00:00.000Z",
    committedBy: "p_me", committedAt: "2025-02-03T09:20:00.000Z", templateVersion: "LL-LEASES-1.0",
  });
  st.seq.import = 1;
  const nowIso = new Date().toISOString();
  st.notifications.push(
    { id: "nt_1", at: nowIso, to: "p_grace", title: "L-0001 needs your review", body: "Head office · CPI change", href: `/leases/${hq.id}`, read: false },
    { id: "nt_2", at: nowIso, to: "p_eric", title: "Data centre cage expansion returned", body: "Renewal option needs assessing", href: "/leases/drafts", read: false },
    { id: "nt_3", at: nowIso, to: "*", title: `Renewal notice due ${addMonths(today, 2)}`, body: "Head office — decide on the 5-year renewal", href: `/leases/${hq.id}`, read: false },
  );
  return st;
}
