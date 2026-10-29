"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Checklist } from "./Checklist";
import { ReconciliationList, SummaryTable } from "./EclSummaryTables";
import { ExceptionsTable } from "./ExceptionsTable";
import { PagedTable } from "./PagedTable";
import { fmtInt, fmtMoney, fmtNum, fmtPct } from "./format";
import type { EadLoan, EadValidationResult } from "@/lib/new-run-types";

type Row = Record<string, number | string | null>;

const LOAN_STEPS = [
  { id: "snapshots", label: "3–4 · Snapshots" },
  { id: "instalment", label: "5 · Instalment" },
  { id: "balances", label: "6–7 · Balance & EAD" },
  { id: "pd", label: "8 · PD join" },
  { id: "loss", label: "9–10 · LGD, loss, discount" },
] as const;
type LoanStep = (typeof LOAN_STEPS)[number]["id"];

const VIEWS = [
  { id: "portfolio", label: "Portfolio" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "exceptions", label: "Exception Report" },
  { id: "excluded", label: "Excluded loans" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const TREATMENT_RULE: Record<string, string> = {
  "Stage 1 · 12 months": "Stage 1: the Reporting Date row plus 12 monthly rows (stopping at the Adjusted Maturity Date). The Reporting Date row carries no PD, so exactly 12 months of default risk.",
  "Stage 2 · lifetime": "Stage 2: the Reporting Date row plus one row a month until the Adjusted Maturity Date (lifetime ECL).",
  "Stage 3 · single row": "Stage 3: a single row on the Reporting Date. The loan is in default, so Marginal PD = 100%.",
  "Matured · single row": "Matured (Adjusted Maturity on or before the Reporting Date's month): a single row on the Outstanding Amount, keeping its own stage for the PD lookup.",
  "Zero rate · single row": "Zero-rate loan (EIR = 0): a single row on the Outstanding Amount, keeping its own stage for the PD lookup.",
};

const n = (v: number | string | null) => (typeof v === "number" ? v : 0);

function LoanSteps({ loan, rows }: { loan: EadLoan; rows: Row[] }) {
  const [step, setStep] = useState<LoanStep>("snapshots");
  const first = rows[0];
  const eir = n(first?.EIR ?? 0);
  return (
    <div className="rx-panel pdts" style={{ marginTop: "var(--sp-4)" }}>
      <div className="rx-panel-head">
        <h3>Exposure and loss · {loan.loanId}</h3>
        <span className="pdts-muted">
          {loan.segment} · {loan.stage} · {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="tabs pdts-steps" role="tablist" aria-label="EAD and ECL calculation step">
        {LOAN_STEPS.map((s) => (
          <button key={s.id} type="button" role="tab" className="tab" aria-selected={step === s.id} onClick={() => setStep(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ padding: "var(--sp-4)" }} role="tabpanel">
        {step === "snapshots" && (
          <>
            <p className="pdts-lead">
              <b>{loan.treatment}.</b> {TREATMENT_RULE[loan.treatment] ?? ""} Adjusted Maturity Date = last day of the Maturity
              month ({String(first?.["Adjusted Maturity Date"] ?? "—")}). <b>Period Since Origination</b> = calendar months from
              the First Payment Date ({String(first?.["First Payment Date"] ?? "—")}) to each Snapshot Date.
            </p>
            <PagedTable
              label="Snapshot rows"
              rows={rows}
              rowKey={(r) => String(r["Period to Be Discounted"])}
              columns={[
                { key: "t", label: "t", num: true, render: (r) => r["Period to Be Discounted"] },
                { key: "d", label: "Snapshot Date", render: (r) => r["Snapshot Date"] },
                { key: "pso", label: "Period Since Origination", num: true, render: (r) => r["Period Since Origination"] },
              ]}
            />
          </>
        )}
        {step === "instalment" && (
          <div className="pdts-formula">
            <span className="pdts-muted">
              Calculated once, as at the Reporting Date: Instalment = Outstanding × r / (1 − (1 + r)^−n), r = EIR / 12, n =
              months from the Reporting Date to the Adjusted Maturity Date. 0 for Stage 3, matured and zero-rate loans.
            </span>
            <code>
              Outstanding {fmtMoney(loan.outstanding)} · r = {fmtPct(eir)} / 12 = {fmtNum(eir / 12)} · Instalment ={" "}
              {fmtMoney(n(first?.["Monthly Instalment"] ?? 0))}
            </code>
          </div>
        )}
        {step === "balances" && (
          <>
            <p className="pdts-lead">
              <b>Balance After Repayment</b>: first row = Outstanding, then max(0, previous × (1 + EIR/12) − Instalment).{" "}
              <b>EAD (Balance After Missed Payment)</b> = Balance After Repayment[t − k] × (1 + EIR/12)^k with k = min(t, 3): the
              exposure if the borrower stops paying for up to 3 months.
            </p>
            <PagedTable
              label="Balances"
              rows={rows}
              rowKey={(r) => String(r["Period to Be Discounted"])}
              columns={[
                { key: "t", label: "t", num: true, render: (r) => r["Period to Be Discounted"] },
                { key: "d", label: "Snapshot", render: (r) => r["Snapshot Date"] },
                { key: "bar", label: "Balance After Repayment", num: true, render: (r) => fmtMoney(n(r["Balance After Repayment"])) },
                { key: "k", label: "k", num: true, render: (r) => Math.min(n(r["Period to Be Discounted"]), 3) },
                { key: "ead", label: "EAD", num: true, render: (r) => <b>{fmtMoney(n(r["Balance After Missed Payment"]))}</b> },
              ]}
            />
          </>
        )}
        {step === "pd" && (
          <>
            <p className="pdts-lead">
              Joined on (SEGMENT, Month = Period Since Origination, Transition = Stage). Beyond the end of the curve the last
              available Month is used. Stage 3 rows are always 100%; the Reporting Date row of a Stage 1/2 loan carries no PD.
            </p>
            <PagedTable
              label="PD join"
              rows={rows}
              rowKey={(r) => String(r["Period to Be Discounted"])}
              columns={[
                { key: "t", label: "t", num: true, render: (r) => r["Period to Be Discounted"] },
                { key: "pso", label: "Month", num: true, render: (r) => r["Period Since Origination"] },
                { key: "rule", label: "Rule", render: (r) => r["PD Rule"] },
                { key: "pd", label: "Marginal PD", num: true, render: (r) => (r["Marginal PD"] == null ? "—" : fmtPct(n(r["Marginal PD"]), 4)) },
                { key: "cure", label: "Cure Rate", num: true, render: (r) => fmtPct(n(r["Cure Rate"]), 2) },
              ]}
            />
          </>
        )}
        {step === "loss" && (
          <>
            <p className="pdts-lead">
              <b>LGW</b> = max(0, 1 − Discounted Collateral ({fmtMoney(loan.discountedCollateral)}) / EAD); <b>LGD</b> = LGW × (1 −
              Cure Rate); <b>Credit Loss</b> = EAD × Marginal PD × LGD; <b>Discounted ECL</b> = Credit Loss × (1 + EIR/12)^−t.
            </p>
            <PagedTable
              label="Loss rows"
              rows={rows}
              rowKey={(r) => String(r["Period to Be Discounted"])}
              columns={[
                { key: "t", label: "t", num: true, render: (r) => r["Period to Be Discounted"] },
                { key: "ead", label: "EAD", num: true, render: (r) => fmtMoney(n(r["Balance After Missed Payment"])) },
                { key: "pd", label: "PD", num: true, render: (r) => fmtPct(n(r["Marginal PD"]), 4) },
                { key: "lgw", label: "LGW", num: true, render: (r) => fmtPct(n(r.LGW)) },
                { key: "lgd", label: "LGD", num: true, render: (r) => fmtPct(n(r.LGD)) },
                { key: "cl", label: "Credit Loss", num: true, render: (r) => fmtMoney(n(r["Credit Loss"])) },
                { key: "de", label: "Discounted ECL", num: true, render: (r) => <b>{fmtMoney(n(r["Discounted ECL"]))}</b> },
              ]}
            />
            <div className="pdts-formula">
              <code>ECL Before Cap = Σ Discounted ECL = {fmtMoney(loan.eclBeforeCap)}</code>
              <code>
                Total ECL = min(ECL Before Cap, Outstanding {fmtMoney(loan.outstanding)}) = {fmtMoney(loan.totalEcl)}
                {loan.capped ? " · capped" : ""}
              </code>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function EadValidationPanel({ result, onDownload }: { result: EadValidationResult; onDownload?: () => Promise<void> }) {
  const preview = result.preview;
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>("portfolio");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const rowsByLoan = useMemo(() => {
    const map = new Map<string, Row[]>();
    if (!preview) return map;
    const cols = preview.rows.columns;
    for (const values of preview.rows.data) {
      const row: Row = {};
      cols.forEach((c, i) => (row[c] = values[i]));
      const id = String(row["Loan ID"]);
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(row);
    }
    return map;
  }, [preview]);

  if (!preview) return <Checklist criteria={result.criteria} businessSubtitle="Spec 1.5 and 12.1" />;
  const loan = preview.loans.find((l) => l.loanId === selected) ?? preview.loans[0];
  const loanRows = loan ? rowsByLoan.get(loan.loanId) : undefined;
  const t = preview.totals;

  async function download() {
    if (!onDownload) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await onDownload();
    } catch {
      setDownloadError("Download failed. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <Checklist criteria={result.criteria} businessSubtitle="Spec 1.5 and 12.1 · EA-11–EA-18, R-1–R-7" />

      <div className="between ecl-preview-head">
        <h3 className="ecl-h3" style={{ margin: 0 }}>
          ECL preview · Reporting Date {preview.reportingDate ?? "—"}
        </h3>
        {onDownload && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void download()} disabled={downloading}>
            <Download className="ic" aria-hidden="true" />
            {downloading ? "Preparing…" : "Download Loan Detail (preview)"}
          </button>
        )}
      </div>
      {downloadError && <p className="pdts-error" role="alert">{downloadError}</p>}
      <div className="kpi-strip ecl-kpis">
        <div className="kpi">
          <span className="kpi-label">Total ECL (after cap)</span>
          <span className="kpi-value">{fmtMoney(t.ecl)}</span>
          <span className="kpi-subnote">Before cap {fmtMoney(t.eclBeforeCap)} · {fmtInt(t.cappedLoans)} capped</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Outstanding (Reporting Date)</span>
          <span className="kpi-value">{fmtMoney(t.outstanding)}</span>
          <span className="kpi-subnote">{fmtInt(t.loans)} loans</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Coverage ratio</span>
          <span className="kpi-value">{fmtPct(t.coverage)}</span>
          <span className="kpi-subnote">ECL / Outstanding</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Excluded rows</span>
          <span className="kpi-value">{fmtInt(t.excludedRows)}</span>
          <span className="kpi-subnote">Listed in the Exception Report</span>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="ECL preview view">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" className="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}>
            {v.label}
            {v.id === "exceptions" ? ` (${Object.values(preview.exceptionCounts).reduce((a, b) => a + b, 0)})` : ""}
            {v.id === "reconciliation" ? ` (${preview.reconciliation.filter((c) => c.passed).length}/${preview.reconciliation.length})` : ""}
          </button>
        ))}
      </div>
      <div style={{ paddingTop: "var(--sp-4)" }} role="tabpanel">
        {view === "portfolio" && (
          <div className="ecl-two">
            <SummaryTable title="Stage summary" keyLabel="Stage" rows={preview.stageSummary} />
            <SummaryTable title="Segment summary" keyLabel="Segment" rows={preview.segmentSummary} />
          </div>
        )}
        {view === "reconciliation" && <ReconciliationList checks={preview.reconciliation} />}
        {view === "exceptions" && (
          <ExceptionsTable
            items={preview.exceptions}
            total={Object.values(preview.exceptionCounts).reduce((a, b) => a + b, 0)}
          />
        )}
        {view === "excluded" && (
          <PagedTable
            label="Excluded loans"
            rows={preview.excluded}
            rowKey={(_, i) => String(i)}
            columns={[
              { key: "l", label: "Loan ID", render: (e) => <span className="mono">{e.loanId || "—"}</span> },
              { key: "c", label: "Customer ID", render: (e) => e.customerId || "—" },
              { key: "o", label: "Outstanding", num: true, render: (e) => fmtMoney(e.outstanding) },
              { key: "r", label: "Reason", render: (e) => e.reason },
            ]}
          />
        )}
      </div>

      <h3 className="ecl-h3">Loans · select one to walk through Steps 3–10</h3>
      <PagedTable
        label="EAD loans"
        rows={preview.loans}
        rowKey={(l) => l.loanId}
        selectedKey={loan?.loanId}
        onRowClick={(l) => setSelected(l.loanId)}
        footnote={preview.loanCount > preview.loans.length ? `${preview.loans.length.toLocaleString()} of ${preview.loanCount.toLocaleString()} loans shown` : undefined}
        columns={[
          { key: "loan", label: "Loan ID", render: (l) => <span className="mono">{l.loanId}</span> },
          { key: "seg", label: "Segment", render: (l) => l.segment },
          { key: "treat", label: "Treatment", render: (l) => l.treatment },
          { key: "out", label: "Outstanding", num: true, render: (l) => fmtMoney(l.outstanding) },
          { key: "dc", label: "Collateral", num: true, render: (l) => fmtMoney(l.discountedCollateral) },
          { key: "rows", label: "Rows", num: true, render: (l) => l.rows },
          {
            key: "ecl",
            label: "Total ECL",
            num: true,
            render: (l) => (
              <>
                {fmtMoney(l.totalEcl)}
                {l.capped && <span className="pill pill-warning" style={{ marginLeft: 6 }}>capped</span>}
              </>
            ),
          },
        ]}
      />
      {loan && loanRows ? (
        <LoanSteps key={loan.loanId} loan={loan} rows={loanRows} />
      ) : loan ? (
        <p className="pdts-muted" style={{ marginTop: "var(--sp-3)" }}>
          Row detail for {loan.loanId} is not in the preview (row budget reached); download the Loan Detail preview to see it.
        </p>
      ) : null}
    </div>
  );
}
