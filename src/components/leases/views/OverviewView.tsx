"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Building2, Scale, Landmark, TrendingUp, CalendarClock, ArrowRight, FileUp, Plus, CheckCircle2 } from "lucide-react";
import { D } from "@/lib/leases/engine";
import { compactMoney, currentPeriod, fmtDate, periodLabel, member, monthEnd } from "@/lib/leases/model";
import { setupStatus, closeOf } from "@/lib/leases/store";
import { totalsAt, statusCounts, expiries, rollForward } from "@/lib/leases/portfolio";
import { ASSET_CLASSES } from "@/lib/leases/types";
import { PageHeader, Kpi, Card, Money, BtnLink, EmptyState, StatusBadge } from "@/components/ll/Kit";
import { useLeasesState } from "../use-leases";
import { inboxFor } from "../badges";
import { PeriodChip } from "../common";
import { can } from "../use-leases";
import { SetupChecklist } from "./SetupView";

export function OverviewView() {
  const st = useLeasesState()!;
  const me = member(st);
  const setup = setupStatus(st);
  const ready = setup.entity && setup.periods && setup.policy && setup.rates;
  const period = currentPeriod(st);
  const data = useMemo(() => (ready && period ? {
    totals: totalsAt(st, period.key),
    counts: statusCounts(st),
    exp: expiries(st, 24).slice(0, 6),
    rf: rollForward(st, `${period.key.slice(0, 4)}-01`, period.key),
  } : null), [st, ready, period]);

  if (!ready) {
    return (
      <>
        <PageHeader title="Set up Leases" sub="IFRS 16 lease accounting. Six short steps and you can add your first lease." />
        <SetupChecklist />
      </>
    );
  }
  const cur = st.entity!.currency;
  const inbox = inboxFor(st).todo;
  const active = (data!.counts.active ?? 0) + (data!.counts.not_commenced ?? 0);
  const close = period && closeOf(st, period.key);
  const doneSteps = close?.steps.filter((x) => x.status === "done" || x.status === "warning").length ?? 0;

  if (st.leases.length === 0) {
    return (
      <>
        <PageHeader title="Leases" sub={<>{st.entity!.name} · {st.book?.name} <PeriodChip /></>} />
        <div className="ll-card">
          <EmptyState
            icon={Building2}
            title="No leases yet"
            body="Add your first lease by hand, or import a portfolio from a spreadsheet using the template."
            actions={can(me.role, "prepare") ? (
              <>
                <BtnLink href="/leases/new" variant="primary"><Plus size={14} /> Add a lease</BtnLink>
                <BtnLink href="/leases/imports"><FileUp size={14} /> Import from CSV</BtnLink>
              </>
            ) : undefined}
          />
        </div>
      </>
    );
  }

  const t = data!.totals;
  const maxM = t.maturity.reduce((m, x) => (D(x.value).gt(m) ? D(x.value) : m), D(1));
  return (
    <>
      <PageHeader
        title="Leases"
        sub={<>{st.entity!.name} · {st.book?.name} <PeriodChip /></>}
        actions={can(me.role, "prepare") ? (
          <>
            <BtnLink href="/leases/imports"><FileUp size={14} /> Import</BtnLink>
            <BtnLink href="/leases/new" variant="primary"><Plus size={14} /> New lease</BtnLink>
          </>
        ) : undefined}
      />
      <div className="ll-kpis">
        <Kpi icon={Building2} label="Leases on the books" value={active} sub={`${data!.counts.exempt ?? 0} exempt · ${data!.counts.in_review ?? 0} in review`} href="/leases/register" />
        <Kpi icon={Scale} label="Lease liability" value={<>{compactMoney(t.liability)} <span className="ll-subtle" style={{ fontSize: 12 }}>{cur}</span></>} sub={`${compactMoney(t.current)} current · at ${fmtDate(monthEnd(period!.key))}`} href="/leases/reports/rollforward" />
        <Kpi icon={Landmark} label="Right-of-use assets" value={<>{compactMoney(t.rou)} <span className="ll-subtle" style={{ fontSize: 12 }}>{cur}</span></>} sub="Net book value" href="/leases/reports/rollforward" />
        <Kpi icon={TrendingUp} label={`${periodLabel(period!.key)} P&L`} value={compactMoney(D(t.interest).plus(t.depreciation).toFixed(2))} sub={`${compactMoney(t.interest)} interest · ${compactMoney(t.depreciation)} depreciation`} />
        <Kpi icon={CalendarClock} label="Cash out, next 12 months" value={compactMoney(t.maturity[0].value)} sub="Undiscounted" href="/leases/reports/maturity" />
      </div>

      <div className="ll-split">
        <Card title="Needs attention" sub={`For ${me.name}`} actions={<Link href="/leases/inbox" className="ll-link">Open inbox</Link>} pad={false}>
          {inbox.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="You're all caught up" body="Nothing is waiting for you." />
          ) : (
            <ul>
              {inbox.slice(0, 6).map((i) => (
                <li key={i.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <Link href={i.href} className="ll-row" style={{ padding: "12px 16px", textDecoration: "none", color: "inherit", flexWrap: "nowrap" }}>
                    <StatusBadge tone={i.tone === "action" ? "info" : i.tone === "warning" ? "warning" : "neutral"} dot={false}>
                      {i.kind === "review" ? "Review" : i.kind === "returned" ? "Returned" : i.kind === "alert" ? "Alert" : i.kind === "close" ? "Close" : i.kind === "setup" ? "Setup" : "Import"}
                    </StatusBadge>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</span>
                      <span className="ll-muted" style={{ fontSize: "var(--fs-caption)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.detail}</span>
                    </span>
                    <ArrowRight size={14} className="ll-subtle" />
                  </Link>
                </li>
              ))}
              {inbox.length > 6 && <li style={{ padding: "10px 16px" }}><Link href="/leases/inbox" className="ll-link">{inbox.length - 6} more in your inbox</Link></li>}
            </ul>
          )}
        </Card>

        <Card title={`${periodLabel(period!.key)} close`} sub={close ? `${doneSteps} of 8 steps done` : "Not started"} actions={<Link href={`/leases/close/${period!.key}`} className="ll-link">{close ? "Continue" : "Open"}</Link>}>
          <div className="ll-stack">
            <div className="ll-progress"><span style={{ width: `${(doneSteps / 8) * 100}%` }} /></div>
            <p className="ll-muted" style={{ fontSize: "var(--fs-caption)" }}>
              {close ? "Generate entries, match payments, reconcile, approve, post and lock." : "Start the close after month-end to post this period's lease journals."}
            </p>
          </div>
        </Card>
      </div>

      <div className="ll-grid ll-grid-2">
        <Card title="Maturity of lease liabilities" sub="Undiscounted remaining payments" actions={<Link href="/leases/reports/maturity" className="ll-link">Report</Link>}>
          <div className="ll-bars">
            {t.maturity.map((m) => (
              <div key={m.label} className="ll-bar">
                <span className="ll-muted">{m.label}</span>
                <span className="track"><span style={{ width: `${D(m.value).div(maxM).mul(100).toNumber()}%` }} /></span>
                <span className="val">{compactMoney(m.value)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title={`Liability roll-forward ${period!.key.slice(0, 4)} YTD`} actions={<Link href="/leases/reports/rollforward" className="ll-link">Report</Link>}>
          <dl className="ll-dl">
            <dt>Opening 1 Jan</dt><dd><Money value={data!.rf.opening} /></dd>
            <dt>New leases</dt><dd><Money value={data!.rf.additions} /></dd>
            <dt>Interest</dt><dd><Money value={data!.rf.interest} /></dd>
            <dt>Payments</dt><dd><Money value={`-${data!.rf.payments}`} /></dd>
            <dt>Remeasurements</dt><dd><Money value={data!.rf.remeasurement} /></dd>
            <dt>Derecognised</dt><dd><Money value={D(data!.rf.derecognised).neg().toFixed(2)} /></dd>
            <dt><strong>Closing {periodLabel(period!.key)}</strong></dt><dd><strong><Money value={data!.rf.closing} /></strong></dd>
          </dl>
        </Card>
      </div>

      <div className="ll-grid ll-grid-2">
        <Card title="Upcoming expiries" sub="Next 24 months" pad={false}>
          {data!.exp.length === 0 ? <EmptyState icon={CalendarClock} title="No expiries in the next 24 months" /> : (
            <ul>
              {data!.exp.map(({ lease, end }) => (
                <li key={lease.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <Link href={`/leases/${lease.id}`} className="ll-row" style={{ padding: "10px 16px", textDecoration: "none", color: "inherit", flexWrap: "nowrap" }}>
                    <span className="ll-code">{lease.code}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lease.name}</span>
                    <span className="ll-muted ll-mono" style={{ fontSize: "var(--fs-caption)" }}>{fmtDate(end)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Right-of-use assets by class" pad={false}>
          <div className="ll-table-wrap">
            <table className="ll-table">
              <thead><tr><th>Class</th><th className="num">Leases</th><th className="num">ROU NBV</th><th className="num">Liability</th></tr></thead>
              <tbody>
                {t.byClass.map((c) => (
                  <tr key={c.cls}><td>{ASSET_CLASSES[c.cls]}</td><td className="num">{c.count}</td><td className="num"><Money value={c.rou} /></td><td className="num"><Money value={c.liability} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
