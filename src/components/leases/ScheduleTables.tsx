"use client";
import { useState } from "react";
import { Lock } from "lucide-react";
import { ACCOUNT_LABELS, groupSchedule, type Computation, type JournalLine, type ScheduleRow } from "@/lib/leases/engine";
import { fmtDate, glOf, isLockedDate, periodLabel } from "@/lib/leases/model";
import { D } from "@/lib/leases/engine";
import { Money, Tabs, CheckRow } from "@/components/ll/Kit";
import { useLeasesState } from "./use-leases";

type Tab = "flows" | "liability" | "rou" | "journals" | "checks";

export function IntegrityChecks({ c }: { c: Computation }) {
  return (
    <div className="ll-card">
      {c.checks.map((k) => <CheckRow key={k.id} ok={k.ok} label={k.label} detail={`expected ${k.expected} · actual ${k.actual}`} />)}
    </div>
  );
}

export function ScheduleTables({ c, currency, initial = "liability", showChecks = true }: { c: Computation; currency: string; initial?: Tab; showChecks?: boolean }) {
  const st = useLeasesState()!;
  const [tab, setTab] = useState<Tab>(initial);
  const [by, setBy] = useState<"month" | "quarter" | "year">("year");
  const rows = groupSchedule(c.rows, by, st.entity?.fyStartMonth ?? 1);
  const locked = (r: ScheduleRow) => by === "month" && isLockedDate(st, r.periodEnd);
  const label = (r: ScheduleRow) => (by === "month" ? periodLabel(r.month) : r.month);
  const sum = (k: keyof ScheduleRow) => c.rows.reduce((a, r) => a.plus(r[k] as string), D(0)).toFixed(2);
  const gl = glOf(st)?.accounts;

  return (
    <div className="ll-stack">
      <div className="ll-row" style={{ justifyContent: "space-between" }}>
        <Tabs
          label="Schedule"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "flows", label: "Cash flows", count: c.flows.length },
            { id: "liability", label: "Liability" },
            { id: "rou", label: "Right-of-use" },
            { id: "journals", label: "Journals" },
            ...(showChecks ? [{ id: "checks" as const, label: "Checks", count: c.checks.filter((k) => !k.ok).length || undefined }] : []),
          ]}
        />
        {(tab === "liability" || tab === "rou") && (
          <div className="seg" role="group" aria-label="Group by">
            {(["month", "quarter", "year"] as const).map((g) => <button key={g} aria-pressed={by === g} onClick={() => setBy(g)}>{g[0].toUpperCase() + g.slice(1)}</button>)}
          </div>
        )}
      </div>

      {tab === "flows" && (
        <div className="ll-table-wrap" style={{ maxHeight: 460, overflowY: "auto" }}>
          <table className="ll-table">
            <thead><tr><th>#</th><th>Payment date</th><th>Type</th><th className="num">Amount ({currency})</th><th>In liability</th></tr></thead>
            <tbody>
              {c.flows.map((f, i) => (
                <tr key={i}>
                  <td className="ll-subtle">{i + 1}</td>
                  <td className="ll-mono" style={{ fontSize: 12 }}>{fmtDate(f.date)}</td>
                  <td>{f.manual ? `Manual · ${f.kind.replace("_", " ")}` : "Scheduled rent"}</td>
                  <td className="num"><Money value={f.amount.toFixed(2)} /></td>
                  <td className="ll-muted" style={{ fontSize: 12 }}>{f.at <= c.segments[0].start ? "No — paid at/before commencement (in ROU)" : "Yes"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td /><td>Total</td><td /><td className="num"><Money value={c.flows.reduce((a, f) => a.plus(f.amount), D(0)).toFixed(2)} /></td><td /></tr></tfoot>
          </table>
        </div>
      )}

      {tab === "liability" && (
        <div className="ll-table-wrap" style={{ maxHeight: 520, overflowY: "auto" }}>
          <table className="ll-table">
            <thead><tr><th className="ll-sticky-col">Period</th><th className="num">Opening</th><th className="num">Additions</th><th className="num">Interest</th><th className="num">Payments</th><th className="num">Remeasure</th><th className="num">Derecognised</th><th className="num">Closing</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} className={locked(r) ? "locked" : r.hasEvent ? "event" : undefined}>
                  <td className="ll-sticky-col" style={{ whiteSpace: "nowrap" }}>{locked(r) && <Lock size={11} aria-label="Locked period" style={{ marginRight: 4 }} />}{label(r)}</td>
                  <td className="num"><Money value={r.liabOpening} /></td>
                  <td className="num"><Money value={r.additions} dash /></td>
                  <td className="num"><Money value={r.interest} dash /></td>
                  <td className="num"><Money value={r.payments === "0.00" ? r.payments : `-${r.payments}`} dash /></td>
                  <td className="num"><Money value={r.remeasurement} dash /></td>
                  <td className="num"><Money value={r.derecognised === "0.00" ? r.derecognised : `-${r.derecognised}`} dash /></td>
                  <td className="num"><strong><Money value={r.liabClosing} /></strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td className="ll-sticky-col">Total</td><td /><td className="num"><Money value={sum("additions")} /></td><td className="num"><Money value={sum("interest")} /></td><td className="num"><Money value={`-${sum("payments")}`} /></td><td className="num"><Money value={sum("remeasurement")} /></td><td className="num"><Money value={`-${sum("derecognised")}`} /></td><td className="num"><Money value={c.rows.at(-1)?.liabClosing} /></td></tr></tfoot>
          </table>
        </div>
      )}

      {tab === "rou" && (
        <div className="ll-table-wrap" style={{ maxHeight: 520, overflowY: "auto" }}>
          <table className="ll-table">
            <thead><tr><th className="ll-sticky-col">Period</th><th className="num">Opening NBV</th><th className="num">Additions</th><th className="num">Depreciation</th><th className="num">Adjustment</th><th className="num">Derecognised</th><th className="num">Closing NBV</th><th className="num">Gain / (loss)</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} className={locked(r) ? "locked" : r.hasEvent ? "event" : undefined}>
                  <td className="ll-sticky-col" style={{ whiteSpace: "nowrap" }}>{locked(r) && <Lock size={11} aria-label="Locked period" style={{ marginRight: 4 }} />}{label(r)}</td>
                  <td className="num"><Money value={r.rouOpening} /></td>
                  <td className="num"><Money value={r.rouAdditions} dash /></td>
                  <td className="num"><Money value={r.depreciation === "0.00" ? r.depreciation : `-${r.depreciation}`} dash /></td>
                  <td className="num"><Money value={r.rouAdjustment} dash /></td>
                  <td className="num"><Money value={r.rouDerecognised === "0.00" ? r.rouDerecognised : `-${r.rouDerecognised}`} dash /></td>
                  <td className="num"><strong><Money value={r.rouClosing} /></strong></td>
                  <td className="num"><Money value={r.gainLoss} dash /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "journals" && <JournalList lines={c.journals} gl={gl} />}
      {tab === "checks" && <IntegrityChecks c={c} />}
    </div>
  );
}

export function JournalList({ lines, gl, limitMonths }: { lines: JournalLine[]; gl?: Record<string, string>; limitMonths?: number }) {
  const months = [...new Set(lines.map((l) => l.month))];
  const [all, setAll] = useState(false);
  const show = all || !limitMonths ? months : months.slice(0, limitMonths);
  return (
    <div className="ll-table-wrap" style={{ maxHeight: 520, overflowY: "auto" }}>
      <table className="ll-table">
        <thead><tr><th>Date</th><th>Entry</th><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
        <tbody>
          {lines.filter((l) => show.includes(l.month)).map((l, i) => (
            <tr key={i}>
              <td className="ll-mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(l.date)}</td>
              <td className="ll-muted" style={{ fontSize: 12 }}>{l.memo}</td>
              <td>{gl?.[l.account] && <span className="ll-code" style={{ marginRight: 6 }}>{gl[l.account]}</span>}{ACCOUNT_LABELS[l.account]}</td>
              <td className="num"><Money value={l.debit} dash /></td>
              <td className="num"><Money value={l.credit} dash /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!all && limitMonths && months.length > limitMonths && <div className="ll-table-foot"><button className="ll-link" onClick={() => setAll(true)}>Show all {months.length} months</button></div>}
    </div>
  );
}
