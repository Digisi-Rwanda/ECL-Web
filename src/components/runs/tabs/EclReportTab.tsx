"use client";

import { useEffect, useState } from "react";
import { ReconciliationList, SummaryTable } from "@/components/ecl/EclSummaryTables";
import { fmtInt, fmtMoney, fmtPct } from "@/components/ecl/format";
import { isSpecV1Engine } from "@/components/runs/RunDetailHeader";
import { useApiSession } from "@/hooks/use-api-session";
import { getEclReport, getRunExceptions } from "@/lib/api/ecl-validation";
import type { EclReport, ExceptionsPage } from "@/lib/new-run-types";
import type { RunDetail } from "@/lib/runs-types";

const CATEGORIES = ["Input Validation", "PD Match", "ECL Cap", "Reconciliation"];
const PER_PAGE = 50;

function Exceptions({ runId, counts }: { runId: string; counts: Record<string, number> }) {
  const { token, tenantId } = useApiSession();
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ExceptionsPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !tenantId) return;
    let cancelled = false;
    getRunExceptions(token, tenantId, runId, { page, perPage: PER_PAGE, category: category ?? undefined })
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError("Could not load the Exception Report."));
    return () => {
      cancelled = true;
    };
  }, [token, tenantId, runId, page, category]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="pdts-muted">No exceptions.</p>;
  const pages = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1;
  return (
    <div>
      <div className="pdts-chips" role="group" aria-label="Exception category">
        {[null, ...CATEGORIES].map((c) => (
          <button
            key={String(c)}
            type="button"
            className="pdts-chip"
            aria-pressed={category === c}
            onClick={() => {
              setCategory(c);
              setPage(1);
            }}
          >
            {c ?? "All"} ({fmtInt(c ? (counts[c] ?? 0) : total)})
          </button>
        ))}
      </div>
      {error && <p className="pdts-error" role="alert">{error}</p>}
      <div className="tbl-wrap">
        <table className="tbl pdts-table" aria-label="Exception Report">
          <thead>
            <tr>
              {["Category", "Dataset", "Loan ID", "Customer ID", "Field", "Value", "Issue", "Action taken"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((e, i) => (
              <tr key={i}>
                <td>{e.category}</td>
                <td>{e.dataset}</td>
                <td className="mono">{e.loanId || "—"}</td>
                <td>{e.customerId || "—"}</td>
                <td>{e.field}</td>
                <td className="mono">{e.value || "—"}</td>
                <td>{e.issue}</td>
                <td><b>{e.action}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tbl-foot">
        <span>{data ? `${fmtInt(data.total)} lines` : "Loading…"}</span>
        {pages > 1 && (
          <span className="pdts-pager">
            <button type="button" className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</button>
            <span>Page {page} of {pages}</span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={page === pages} onClick={() => setPage(page + 1)}>Next</button>
          </span>
        )}
      </div>
    </div>
  );
}

/** Spec Step 11 portfolio view, 12.1 reconciliation and 12.2 Exception Report for one run. */
export function EclReportTab({ run }: { run: RunDetail }) {
  const { token, tenantId } = useApiSession();
  const [report, setReport] = useState<EclReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const spec = isSpecV1Engine(run.engineInfo.version);

  useEffect(() => {
    if (!token || !tenantId || !spec) return;
    let cancelled = false;
    getEclReport(token, tenantId, run.fullId)
      .then((r) => !cancelled && setReport(r))
      .catch(() => !cancelled && setError("Could not load the ECL report."));
    return () => {
      cancelled = true;
    };
  }, [token, tenantId, run.fullId, spec]);

  if (!spec) {
    return (
      <div className="callout callout-info">
        <span>
          This run used engine {run.engineInfo.version}, before the ECL Calculation Specification v1.0. Re-run it to get the
          Exception Report, reconciliation and capped portfolio summaries.
        </span>
      </div>
    );
  }
  if (error) return <p className="pdts-error" role="alert">{error}</p>;
  if (!report) return <p className="pdts-muted">Loading the ECL report…</p>;
  const t = report.totals;
  return (
    <div>
      <div className="kpi-strip ecl-kpis">
        <div className="kpi">
          <span className="kpi-label">Total ECL (after cap)</span>
          <span className="kpi-value">{fmtMoney(t.ecl)}</span>
          <span className="kpi-subnote">Before cap {fmtMoney(t.eclBeforeCap)} · {fmtInt(t.cappedLoans)} capped</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Outstanding · {report.reportingDate ?? "—"}</span>
          <span className="kpi-value">{fmtMoney(t.outstanding)}</span>
          <span className="kpi-subnote">{fmtInt(t.loans)} loans · {fmtInt(t.excludedRows)} rows excluded</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Coverage ratio</span>
          <span className="kpi-value">{fmtPct(t.coverage)}</span>
          <span className="kpi-subnote">ECL / Outstanding</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Reconciliation</span>
          <span className="kpi-value">
            {report.reconciliation.filter((c) => c.passed).length}/{report.reconciliation.length}
          </span>
          <span className="kpi-subnote">Spec v{report.specVersion} · engine {report.engineVersion}</span>
        </div>
      </div>
      <h3 className="ecl-h3">Portfolio summary</h3>
      <div className="ecl-two">
        <SummaryTable title="Stage summary" keyLabel="Stage" rows={report.stageSummary} />
        <SummaryTable title="Segment summary" keyLabel="Segment" rows={report.segmentSummary} />
      </div>
      <h3 className="ecl-h3">Reconciliation checks</h3>
      <ReconciliationList checks={report.reconciliation} />
      <h3 className="ecl-h3">Exception Report</h3>
      <Exceptions runId={run.fullId} counts={report.exceptionCounts} />
    </div>
  );
}
