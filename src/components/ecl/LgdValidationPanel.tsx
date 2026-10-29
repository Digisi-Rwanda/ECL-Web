"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { Checklist } from "./Checklist";
import { ExceptionsTable } from "./ExceptionsTable";
import { PagedTable } from "./PagedTable";
import { fmtMoney, fmtNum, fmtPct } from "./format";
import type { LgdLoan, LgdValidationResult } from "@/lib/new-run-types";

const STEPS = [
  { id: "exposure", label: "1 · Customer exposure" },
  { id: "proportion", label: "2 · Loan proportion" },
  { id: "allocated", label: "3 · Allocated collateral" },
  { id: "discount", label: "4 · Haircut & discount" },
  { id: "final", label: "Discounted collateral" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

function LgdSteps({ loan, loans, result }: { loan: LgdLoan; loans: LgdLoan[]; result: LgdValidationResult }) {
  const [step, setStep] = useState<StepId>("exposure");
  const preview = result.preview!;
  const customerLoans = loans.filter((l) => l.customerId === loan.customerId);
  const params = new Map(preview.parameters.map((p) => [p.name, p]));
  return (
    <div className="rx-panel pdts" style={{ marginTop: "var(--sp-4)" }}>
      <div className="rx-panel-head">
        <h3>Discounted collateral · {loan.loanId}</h3>
        <span className="pdts-muted">Customer {loan.customerId} · Spec Step 1</span>
      </div>
      <div className="tabs pdts-steps" role="tablist" aria-label="LGD calculation step">
        {STEPS.map((s) => (
          <button key={s.id} type="button" role="tab" className="tab" aria-selected={step === s.id} onClick={() => setStep(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ padding: "var(--sp-4)" }} role="tabpanel">
        {step === "exposure" && (
          <>
            <p className="pdts-lead">
              <b>Total Customer Exposure</b> = Σ Outstanding Amount of every loan of customer {loan.customerId}
              {preview.provisional ? " (provisional: from this collateral file until EAD is validated)." : " (from the Exposure file)."}
            </p>
            <PagedTable
              label="Customer loans"
              rows={customerLoans}
              rowKey={(l) => l.loanId}
              columns={[
                { key: "loan", label: "Loan ID", render: (l) => <span className="mono">{l.loanId}</span> },
                { key: "out", label: "Outstanding Amount", num: true, render: (l) => fmtMoney(l.outstanding) },
              ]}
            />
            <div className="pdts-formula">
              <code>Total Customer Exposure = {fmtMoney(loan.totalCustomerExposure)}</code>
            </div>
          </>
        )}
        {step === "proportion" && (
          <div className="pdts-formula">
            <span className="pdts-muted">Loan Proportion = Outstanding Amount / Total Customer Exposure (0 when the total is 0)</span>
            <code>
              {fmtMoney(loan.outstanding)} / {fmtMoney(loan.totalCustomerExposure)} = {fmtNum(loan.proportion)}
            </code>
          </div>
        )}
        {step === "allocated" && (
          <>
            <p className="pdts-lead">
              Collateral is held per customer and repeated on each of the customer&apos;s rows; where rows differ the lowest value is
              used. <b>Allocated[type] = Loan Proportion × Collateral[type]</b>.
            </p>
            <PagedTable
              label="Allocated collateral"
              rows={Object.entries(loan.collateral)}
              rowKey={([t]) => t}
              columns={[
                { key: "t", label: "Collateral type", render: ([t]) => t },
                { key: "v", label: "Customer collateral", num: true, render: ([, v]) => fmtMoney(v[0]) },
                { key: "p", label: "× Proportion", num: true, render: () => fmtNum(loan.proportion) },
                { key: "a", label: "= Allocated", num: true, render: ([, v]) => <b>{fmtMoney(v[1])}</b> },
              ]}
            />
          </>
        )}
        {step === "discount" && (
          <>
            <p className="pdts-lead">
              <b>Discounted[type] = Allocated × (1 − Haircut) × (1 + EIR)^−years</b>: a forced-sale haircut, then the present value
              over the time it takes to realise, at this loan&apos;s EIR ({fmtPct(loan.collateralEir)}). A type without valid
              parameters counts as 0.
            </p>
            <PagedTable
              label="Discounted collateral by type"
              rows={Object.entries(loan.collateral)}
              rowKey={([t]) => t}
              columns={[
                { key: "t", label: "Collateral type", render: ([t]) => t },
                { key: "a", label: "Allocated", num: true, render: ([, v]) => fmtMoney(v[1]) },
                {
                  key: "h",
                  label: "Haircut",
                  num: true,
                  render: ([t]) => (params.get(t)?.valid ? fmtPct(params.get(t)!.haircut, 1) : "no parameters"),
                },
                {
                  key: "y",
                  label: "Years",
                  num: true,
                  render: ([t]) => (params.get(t)?.valid ? params.get(t)!.years!.toFixed(2) : "—"),
                },
                { key: "d", label: "= Discounted", num: true, render: ([, v]) => <b>{fmtMoney(v[2])}</b> },
              ]}
            />
          </>
        )}
        {step === "final" && (
          <div className="pdts-formula">
            <span className="pdts-muted">Discounted Collateral = Σ Discounted[type]. It enters ECL as LGW = max(0, 1 − Discounted Collateral / EAD).</span>
            <code>Discounted Collateral = {fmtMoney(loan.discountedCollateral)}</code>
            <span className="pdts-muted">
              Covers {fmtPct(loan.outstanding ? loan.discountedCollateral / loan.outstanding : 0)} of the outstanding amount today.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function LgdValidationPanel({ result }: { result: LgdValidationResult }) {
  const preview = result.preview;
  const [selected, setSelected] = useState<string | null>(null);
  const loans = useMemo(() => preview?.loans ?? [], [preview]);
  const loan = loans.find((l) => l.loanId === selected) ?? loans[0];
  return (
    <div>
      <Checklist criteria={result.criteria} businessSubtitle="Spec 1.5 · LG-11–LG-16" />
      {preview && (
        <>
          {preview.provisional && (
            <div className="callout callout-info" style={{ marginTop: "var(--sp-3)" }}>
              <Info size={15} className="ic" aria-hidden="true" />
              <span>
                Provisional: Total Customer Exposure uses this file&apos;s Outstanding Amount until the Exposure (EAD) file is
                validated. The EAD step recomputes it from the Exposure file, which is what compute uses.
              </span>
            </div>
          )}
          <h3 className="ecl-h3">Collateral parameters</h3>
          <PagedTable
            label="Collateral parameters"
            rows={preview.parameters}
            rowKey={(p) => p.name}
            columns={[
              { key: "n", label: "Collateral type", render: (p) => p.name },
              { key: "h", label: "Haircut", num: true, render: (p) => (p.haircut == null ? "—" : fmtPct(p.haircut, 1)) },
              { key: "y", label: "Time to realize (years)", num: true, render: (p) => (p.years == null ? "—" : p.years.toFixed(2)) },
              {
                key: "s",
                label: "Status",
                render: (p) => (
                  <span className={`pill ${p.valid ? "pill-success" : "pill-warning"}`}>{p.valid ? "Used" : "Counts as 0"}</span>
                ),
              },
            ]}
          />
          <h3 className="ecl-h3">Loans · select one to walk through Step 1</h3>
          <PagedTable
            label="LGD loans"
            rows={loans}
            rowKey={(l) => l.loanId}
            selectedKey={loan?.loanId}
            onRowClick={(l) => setSelected(l.loanId)}
            footnote={preview.loanCount > loans.length ? `${loans.length.toLocaleString()} of ${preview.loanCount.toLocaleString()} loans shown` : undefined}
            columns={[
              { key: "loan", label: "Loan ID", render: (l) => <span className="mono">{l.loanId}</span> },
              { key: "cust", label: "Customer", render: (l) => l.customerId },
              { key: "out", label: "Outstanding", num: true, render: (l) => fmtMoney(l.outstanding) },
              { key: "prop", label: "Proportion", num: true, render: (l) => fmtNum(l.proportion, 4) },
              { key: "dc", label: "Discounted collateral", num: true, render: (l) => fmtMoney(l.discountedCollateral) },
              { key: "cov", label: "Coverage", num: true, render: (l) => fmtPct(l.outstanding ? l.discountedCollateral / l.outstanding : 0, 1) },
            ]}
          />
          {loan && <LgdSteps key={loan.loanId} loan={loan} loans={loans} result={result} />}
          <h3 className="ecl-h3">Collateral exceptions</h3>
          <ExceptionsTable items={preview.exceptions} total={preview.exceptionCount} />
        </>
      )}
    </div>
  );
}
