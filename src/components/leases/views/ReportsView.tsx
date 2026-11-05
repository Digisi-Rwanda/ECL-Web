"use client";
import Link from "next/link";
import { Fragment, useMemo } from "react";
import { PieChart, Download, Scale, CalendarClock, Layers, TrendingUp, Banknote, PlusSquare, FileText, ChevronRight } from "lucide-react";
import { D } from "@/lib/leases/engine";
import { monthEnd } from "@/lib/leases/dates";
import { approvedChain, balancesAt, computeLease, currentPeriod, fmtDate, isExempt, leaseJournals, periodLabel, maturityAt } from "@/lib/leases/model";
import { rollForward, totalsAt } from "@/lib/leases/portfolio";
import { toCsv, downloadText } from "@/lib/leases/csv";
import { ASSET_CLASSES, type AssetClass } from "@/lib/leases/types";
import { PageHeader, Card, Money, Btn, EmptyState, BtnLink, Banner } from "@/components/ll/Kit";
import { useLeasesState, useQueryParam } from "../use-leases";
import { RequireSetup } from "../common";

const REPORTS = [
  { key: "rollforward", icon: Scale, title: "Liability & ROU roll-forward", desc: "Opening to closing, by movement — the note auditors tie out first." },
  { key: "maturity", icon: CalendarClock, title: "Maturity analysis", desc: "Undiscounted remaining payments by time band (IFRS 7)." },
  { key: "current", icon: Layers, title: "Current / non-current", desc: "Balance-sheet split of the lease liability, by lease." },
  { key: "expense", icon: TrendingUp, title: "Expense analysis", desc: "Depreciation by class, interest, exempt-lease expense." },
  { key: "cashflow", icon: Banknote, title: "Cash-flow split", desc: "Principal (financing), interest, and operating outflows." },
  { key: "additions", icon: PlusSquare, title: "Additions & changes", desc: "New leases, remeasurements and terminations in the period." },
  { key: "disclosure", icon: FileText, title: "Disclosure pack", desc: "Everything above in one export for the financial statements." },
] as const;
type Key = (typeof REPORTS)[number]["key"];

export function ReportsView() {
  return (
    <RequireSetup>
      <PageHeader title="Reports & disclosures" sub="Built from approved versions only. Pick a period on each report; exports carry the period and generation time." />
      <div className="ll-grid ll-grid-3">
        {REPORTS.map((r) => (
          <Link key={r.key} href={`/leases/reports/${r.key}`} className="ll-card ll-card-pad ll-stack" style={{ textDecoration: "none", color: "inherit" }}>
            <r.icon size={18} style={{ color: "var(--module-leases)" }} />
            <strong>{r.title}</strong>
            <span className="ll-muted" style={{ fontSize: 13 }}>{r.desc}</span>
            <span className="ll-link" style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 13 }}>Open <ChevronRight size={13} /></span>
          </Link>
        ))}
      </div>
    </RequireSetup>
  );
}

export function ReportView({ report }: { report: string }) {
  const st = useLeasesState()!;
  const meta = REPORTS.find((r) => r.key === report);
  const cur = currentPeriod(st)?.key ?? new Date().toISOString().slice(0, 7);
  const fyStart = st.entity?.fyStartMonth ?? 1;
  const defFrom = `${Number(cur.slice(5)) >= fyStart ? cur.slice(0, 4) : Number(cur.slice(0, 4)) - 1}-${String(fyStart).padStart(2, "0")}`;
  const [from, setFrom] = useQueryParam("from", defFrom);
  const [to, setTo] = useQueryParam("to", cur);
  const ccy = st.entity?.currency ?? "";
  const data = useMemo(() => (meta ? build(st, meta.key, from, to) : null), [st, meta, from, to]);
  if (!meta) return <div className="ll-card"><EmptyState icon={PieChart} title="Report not found" actions={<BtnLink href="/leases/reports">All reports</BtnLink>} /></div>;
  const stamp = `Generated ${new Date().toLocaleString("en-GB")} · ${periodLabel(from)} – ${periodLabel(to)} · approved versions only`;
  const exportCsv = () => downloadText(`${meta.key}_${from}_${to}.csv`, toCsv([[meta.title], [stamp], [`Currency ${ccy}`], [], ...data!.csv]));

  return (
    <RequireSetup>
      <PageHeader
        back={{ href: "/leases/reports", label: "Reports" }}
        title={meta.title}
        sub={meta.desc}
        actions={<Btn onClick={exportCsv}><Download size={14} /> Export CSV</Btn>}
      />
      <div className="ll-toolbar">
        <label className="ll-row" style={{ gap: 6 }}><span className="ll-muted" style={{ fontSize: 13 }}>From</span><input type="month" className="input" style={{ width: 170 }} value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
        <label className="ll-row" style={{ gap: 6 }}><span className="ll-muted" style={{ fontSize: 13 }}>To</span><input type="month" className="input" style={{ width: 170 }} value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        <span className="ll-subtle" style={{ fontSize: 12 }}>{ccy} · {stamp}</span>
      </div>
      {to > cur && <Banner tone="info">The period runs past the open month — later months are projections from current schedules.</Banner>}
      {data!.node}
    </RequireSetup>
  );
}

type Built = { node: React.ReactNode; csv: unknown[][] };

function Table({ head, rows, foot }: { head: string[]; rows: React.ReactNode[][]; foot?: React.ReactNode[] }) {
  return (
    <Card pad={false}>
      <div className="ll-table-wrap">
        <table className="ll-table">
          <thead><tr>{head.map((h, i) => <th key={h} className={i ? "num" : undefined}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? "num" : undefined}>{c}</td>)}</tr>)}</tbody>
          {foot && <tfoot><tr>{foot.map((c, j) => <td key={j} className={j ? "num" : undefined}>{c}</td>)}</tr></tfoot>}
        </table>
      </div>
    </Card>
  );
}

function build(st: NonNullable<ReturnType<typeof useLeasesState>>, key: Key, from: string, to: string): Built {
  const end = monthEnd(to);
  const capLeases = st.leases.filter((l) => approvedChain(l).length && !isExempt(approvedChain(l)[0]));
  if (key === "rollforward") {
    const rf = rollForward(st, from, to);
    const L: Array<[string, string]> = [["Opening balance", rf.opening], ["New leases", rf.additions], ["Interest expense", rf.interest], ["Lease payments", D(rf.payments).neg().toFixed(2)], ["Remeasurements & modifications", rf.remeasurement], ["Derecognised (terminations / scope decreases)", D(rf.derecognised).neg().toFixed(2)], ["Closing balance", rf.closing]];
    const R: Array<[string, string]> = [["Opening net book value", rf.rouOpening], ["Additions", rf.rouAdditions], ["Depreciation", D(rf.depreciation).neg().toFixed(2)], ["Remeasurement adjustments", rf.rouAdjustment], ["Derecognised", D(rf.rouDerecognised).neg().toFixed(2)], ["Closing net book value", rf.rouClosing]];
    const liabCheck = D(rf.opening).plus(rf.additions).plus(rf.interest).minus(rf.payments).plus(rf.remeasurement).minus(rf.derecognised).minus(rf.closing);
    return {
      node: (
        <div className="ll-grid ll-grid-2">
          <Card title="Lease liability"><dl className="ll-dl">{L.map(([k, v], i) => <Fragment key={k}><dt>{i === L.length - 1 ? <strong>{k}</strong> : k}</dt><dd>{i === L.length - 1 ? <strong><Money value={v} /></strong> : <Money value={v} />}</dd></Fragment>)}</dl>{!liabCheck.abs().lt(0.01) && <Banner tone="danger">Roll-forward doesn&apos;t close by {liabCheck.toFixed(2)}.</Banner>}</Card>
          <Card title="Right-of-use assets"><dl className="ll-dl">{R.map(([k, v], i) => <Fragment key={k}><dt>{i === R.length - 1 ? <strong>{k}</strong> : k}</dt><dd>{i === R.length - 1 ? <strong><Money value={v} /></strong> : <Money value={v} />}</dd></Fragment>)}</dl><p className="ll-muted" style={{ fontSize: 12, marginTop: 10 }}>Gain/(loss) on modifications in period: <Money value={rf.gainLoss} /> · provision unwinding: <Money value={rf.provisionUnwind} /></p></Card>
        </div>
      ),
      csv: [["Lease liability", ""], ...L, [], ["Right-of-use assets", ""], ...R],
    };
  }
  if (key === "maturity") {
    const t = totalsAt(st, to);
    const per = capLeases.map((l) => ({ l, m: maturityAt(st, l, end) })).filter((x) => x.m.some((v) => !D(v).isZero()));
    const total = t.maturity.reduce((a, m) => a.plus(m.value), D(0));
    return {
      node: (
        <>
          <Table head={["Time band", "Undiscounted payments"]} rows={t.maturity.map((m) => [m.label, <Money key="m" value={m.value} />])} foot={[<strong key="t">Total undiscounted</strong>, <Money key="v" value={total.toFixed(2)} />]} />
          <p className="ll-muted" style={{ fontSize: 13 }}>Discounted lease liability at {fmtDate(end)}: <Money value={t.liability} /> · difference (future interest): <Money value={total.minus(t.liability).toFixed(2)} /></p>
          <Table head={["Lease", "≤ 1 year", "1–2 years", "2–5 years", "> 5 years"]} rows={per.map(({ l, m }) => [<Link key="l" className="ll-link" href={`/leases/${l.id}`}>{l.code} · {l.name}</Link>, ...m.map((v, i) => <Money key={i} value={v} dash />)])} />
        </>
      ),
      csv: [["Band", "Amount"], ...t.maturity.map((m) => [m.label, m.value]), ["Total", total.toFixed(2)], [], ["Lease", "<=1y", "1-2y", "2-5y", ">5y"], ...per.map(({ l, m }) => [l.code, ...m])],
    };
  }
  if (key === "current") {
    const rows = capLeases.map((l) => ({ l, b: balancesAt(st, l, end) })).filter((x) => !D(x.b.liability).isZero());
    const sum = (k: "liability" | "current" | "nonCurrent") => rows.reduce((a, r) => a.plus(r.b[k]), D(0)).toFixed(2);
    return {
      node: <Table head={["Lease", "Current", "Non-current", "Total"]} rows={rows.map(({ l, b }) => [<Link key="l" className="ll-link" href={`/leases/${l.id}`}>{l.code} · {l.name}</Link>, <Money key="c" value={b.current} />, <Money key="n" value={b.nonCurrent} />, <Money key="t" value={b.liability} />])} foot={["Total", <Money key="c" value={sum("current")} />, <Money key="n" value={sum("nonCurrent")} />, <Money key="t" value={sum("liability")} />]} />,
      csv: [["Lease", "Current", "Non-current", "Total"], ...rows.map(({ l, b }) => [l.code, b.current, b.nonCurrent, b.liability]), ["Total", sum("current"), sum("nonCurrent"), sum("liability")]],
    };
  }
  if (key === "expense") {
    const byClass = new Map<AssetClass, ReturnType<typeof D>>();
    let interest = D(0), exempt = D(0), unwind = D(0);
    for (const l of st.leases) {
      const c = computeLease(st, l);
      if (c) for (const r of c.rows) if (r.month >= from && r.month <= to) {
        byClass.set(l.assetClass, (byClass.get(l.assetClass) ?? D(0)).plus(r.depreciation));
        interest = interest.plus(r.interest);
        unwind = unwind.plus(r.provisionUnwind);
      }
      const ch = approvedChain(l);
      if (ch.length && isExempt(ch[0])) for (const j of leaseJournals(st, l)) if (j.month >= from && j.month <= to) exempt = exempt.plus(j.debit);
    }
    const dep = [...byClass.values()].reduce((a, v) => a.plus(v), D(0));
    const rows: Array<[string, string]> = [...[...byClass.entries()].map(([k, v]) => [`Depreciation — ${ASSET_CLASSES[k]}`, v.toFixed(2)] as [string, string]), ["Interest on lease liabilities", interest.toFixed(2)], ["Unwinding of restoration provisions", unwind.toFixed(2)], ["Short-term & low-value lease expense", exempt.toFixed(2)]];
    return {
      node: <Table head={["Expense", "Amount"]} rows={rows.map(([k, v]) => [k, <Money key={k} value={v} />])} foot={["Total lease expense", <Money key="t" value={dep.plus(interest).plus(unwind).plus(exempt).toFixed(2)} />]} />,
      csv: [["Expense", "Amount"], ...rows],
    };
  }
  if (key === "cashflow") {
    const rf = rollForward(st, from, to);
    let exempt = D(0);
    for (const l of st.leases) {
      const ch = approvedChain(l);
      if (ch.length && isExempt(ch[0])) for (const j of leaseJournals(st, l)) if (j.month >= from && j.month <= to) exempt = exempt.plus(j.debit);
    }
    const principal = D(rf.payments).minus(rf.interest);
    const rows: Array<[string, string, string]> = [["Principal portion of lease payments", "Financing", principal.neg().toFixed(2)], ["Interest portion", "Per IAS 7 policy (financing)", D(rf.interest).neg().toFixed(2)], ["Short-term & low-value payments", "Operating", exempt.neg().toFixed(2)]];
    return {
      node: (
        <>
          <Table head={["Cash outflow", "Classification", "Amount"]} rows={rows.map(([a, b2, c]) => [a, b2, <Money key={a} value={c} />])} foot={["Total cash outflow for leases", "", <Money key="t" value={principal.plus(rf.interest).plus(exempt).neg().toFixed(2)} />]} />
          <Banner tone="info">Additions to right-of-use assets (<Money value={rf.rouAdditions} />) are non-cash and shown in the notes, not as investing outflows.</Banner>
        </>
      ),
      csv: [["Item", "Classification", "Amount"], ...rows, ["Non-cash ROU additions", "Note only", rf.rouAdditions]],
    };
  }
  if (key === "additions") {
    const items: Array<[string, string, string, string, string]> = [];
    for (const l of st.leases) for (const v of approvedChain(l)) {
      const d = v.event === "initial" ? v.terms.commencementDate : v.effectiveDate;
      if (d.slice(0, 7) < from || d.slice(0, 7) > to) continue;
      items.push([l.code, l.name, v.event === "initial" ? "New lease" : v.event, d, v.calculated?.liability || ""]);
    }
    items.sort((a, b) => (a[3] < b[3] ? -1 : 1));
    return {
      node: items.length ? <Table head={["Lease", "Change", "Effective", "Liability after"]} rows={items.map(([c, n, e, d, liab]) => [`${c} · ${n}`, e, fmtDate(d), liab ? <Money key="l" value={liab} /> : "—"])} /> : <Card><EmptyState icon={PlusSquare} title="No additions or changes in this period" /></Card>,
      csv: [["Lease", "Name", "Change", "Effective", "Liability after"], ...items],
    };
  }
  // disclosure pack
  const parts = (["rollforward", "maturity", "current", "expense", "cashflow", "additions"] as const).map((k) => ({ k, b: build(st, k, from, to) }));
  return {
    node: (
      <>
        <Banner tone="info" title="Disclosure pack">IFRS 16.53 items, maturity analysis, roll-forwards and cash-flow split for the period. Narrative notes (nature of leases, judgments, options not included) are added by your reporting team.</Banner>
        {parts.map(({ k, b }) => <section key={k} className="ll-stack"><h2 style={{ fontSize: "var(--fs-h3)", fontWeight: 600 }}>{REPORTS.find((r) => r.key === k)!.title}</h2>{b.node}</section>)}
      </>
    ),
    csv: parts.flatMap(({ k, b }) => [[REPORTS.find((r) => r.key === k)!.title], ...b.csv, []]),
  };
}
