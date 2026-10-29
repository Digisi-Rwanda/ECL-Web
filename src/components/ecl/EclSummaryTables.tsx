import { CheckCircle2, XCircle } from "lucide-react";
import { fmtMoney, fmtPct } from "./format";
import type { ReconciliationCheck, SummaryRow } from "@/lib/new-run-types";

/** Spec Step 11: Outstanding (as at Reporting Date), capped ECL and coverage, with a Total row. */
export function SummaryTable({ title, keyLabel, rows }: { title: string; keyLabel: string; rows: SummaryRow[] }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl pdts-table" aria-label={title}>
        <thead>
          <tr>
            <th>{keyLabel}</th>
            <th className="num">Outstanding Amount</th>
            <th className="num">ECL</th>
            <th className="num">ECL Coverage Ratio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={r.key === "Total" ? "ecl-total" : undefined}>
              <td>{r.key}</td>
              <td className="num">{fmtMoney(r.outstanding)}</td>
              <td className="num">{fmtMoney(r.ecl)}</td>
              <td className="num">{fmtPct(r.coverage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Spec 12.1: seven checks, a difference up to 0.01 passes. */
export function ReconciliationList({ checks }: { checks: ReconciliationCheck[] }) {
  if (!checks.length) return <p className="pdts-muted">No reconciliation recorded for this run.</p>;
  return (
    <ul className="ecl-recon">
      {checks.map((c) => (
        <li key={c.name} data-passed={c.passed}>
          {c.passed ? <CheckCircle2 size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
          <div>
            <div className="ecl-recon-name">
              {c.name} <span className={`pill ${c.passed ? "pill-success" : "pill-danger"}`}>{c.passed ? "Pass" : "Fail"}</span>
            </div>
            <div className="pdts-muted">{c.detail}</div>
            {!c.passed && (
              <div className="mono pdts-muted">
                Expected {fmtMoney(c.expected)} · Actual {fmtMoney(c.actual)} · Difference {fmtMoney(c.difference)}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
