"use client";

import { CheckCircle2, FileSpreadsheet, Lock } from "lucide-react";
import { useRunWizard } from "../RunWizardContext";
import { useApiSession } from "@/hooks/use-api-session";
import { updateRun } from "@/lib/api/runs";
import { fmtInt, fmtMoney, fmtPct } from "@/components/ecl/format";
import { CURRENCIES } from "@/lib/currencies";
import type { UploadedFile } from "@/lib/new-run-types";

function FileRow({ kind, files }: { kind: string; files: UploadedFile[] }) {
  return (
    <li className="review-file">
      <CheckCircle2 size={16} className="ok" aria-hidden />
      <span className="review-kind">{kind}</span>
      <span className="review-names">
        {files.map((f) => (
          <span key={f.id}>
            <FileSpreadsheet size={13} aria-hidden /> {f.name} <span className="mono pdts-muted">{f.hash}</span>
          </span>
        ))}
      </span>
    </li>
  );
}

/** Everything that defines the run, on one calm screen, before computing. */
export function ReviewStep() {
  const { state, dispatch } = useRunWizard();
  const { token, tenantId } = useApiSession();
  const preview = state.eadValidation?.preview;
  const t = preview?.totals;
  const recon = preview?.reconciliation ?? [];
  const currency = state.currency ?? "USD";

  return (
    <div className="run-card review">
      <h2>Review and start</h2>
      <p className="rc-sub">These inputs and settings are recorded with the run. The same inputs always give the same result.</p>

      <div className="review-grid">
        <label className="field">
          <span className="review-label">Run name</span>
          <input className="input" value={state.runName} maxLength={200} onChange={(e) => dispatch({ type: "SET_RUN_NAME", name: e.target.value })} />
        </label>
        <label className="field">
          <span className="review-label">Currency of the figures</span>
          <select className="select" value={currency} onChange={(e) => dispatch({ type: "SET_RUN_CURRENCY", currency: e.target.value })}>
            {(CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <span className="pdts-muted">The currency your files are in. Locked once computed.</span>
        </label>
        <div className="field">
          <span className="review-label">Reporting Date</span>
          <span className="review-value">
            {preview?.reportingDate ?? "—"}{" "}
            <span className="pdts-muted">{preview?.reportingDateSource === "run" ? "(set on the run)" : "(most common date in the EAD file)"}</span>
          </span>
        </div>
        <div className="field">
          <span className="review-label">Engine</span>
          <span className="review-value">
            <Lock size={12} aria-hidden /> {state.engineVersion ?? state.eadValidation?.engineVersion ?? "—"} · ECL Calculation Specification v1.0
          </span>
        </div>
      </div>

      <ul className="review-files">
        <FileRow kind="PD" files={state.pdFiles} />
        {state.lgdFile && <FileRow kind="LGD" files={[state.lgdFile]} />}
        {state.eadFile && <FileRow kind="EAD" files={[state.eadFile]} />}
      </ul>

      {state.pdFiles.length > 1 && (
        <label className="ecl-accept" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={state.combinePdFiles} onChange={async (e) => {
            const value = e.target.checked;
            dispatch({ type: "SET_COMBINE_PD", value });
            if (token && tenantId && state.runId) await updateRun(token, tenantId, state.runId, { combine_pd_files: value }).catch(() => {});
            // The PD curve feeds LGD and EAD, so both are checked again.
            dispatch({ type: "RESET_VALIDATION_FROM", kind: "LGD" });
            dispatch({ type: "SET_DATA_FILE", kind: "LGD" });
          }} />
          Combine the {state.pdFiles.length} PD files into one history (changing this re-checks LGD and EAD)
        </label>
      )}

      {t && (
        <div className="kpi-strip ecl-kpis" style={{ marginTop: "var(--sp-5)" }}>
          <div className="kpi">
            <span className="kpi-label">Expected ECL</span>
            <span className="kpi-value">{fmtMoney(t.ecl)} <span className="kpi-cur">{currency}</span></span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Coverage</span>
            <span className="kpi-value">{fmtPct(t.coverage)}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Loans</span>
            <span className="kpi-value">{fmtInt(t.loans)}</span>
            <span className="kpi-subnote">{fmtInt(t.excludedRows)} excluded · {fmtInt(t.cappedLoans)} capped</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Reconciliation</span>
            <span className="kpi-value">{recon.filter((c) => c.passed).length}/{recon.length}</span>
            <span className="kpi-subnote">checks pass</span>
          </div>
        </div>
      )}
    </div>
  );
}
