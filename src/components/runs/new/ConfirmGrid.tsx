import { Lock } from "lucide-react";
import { FileHashPill } from "./shared/FileHashPill";
import { fmtInt, fmtMoney, fmtPct } from "@/components/ecl/format";
import { SegmentTag } from "./shared/SegmentTag";
import type { NewRunState } from "@/lib/new-run-types";

interface ConfirmGridProps {
  state: NewRunState;
  tenantName?: string;
  currency?: string;
  onToggleCombine: (v: boolean) => void;
}

export function ConfirmGrid({ state, tenantName = "Workspace", currency = "USD", onToggleCombine }: ConfirmGridProps) {
  const showCombine = state.pdFiles.length > 1;
  const preview = state.eadValidation?.preview;
  const segments = preview?.segmentSummary.map((s) => s.key).filter((k) => k !== "Total") ?? [];
  const recon = preview?.reconciliation ?? [];

  return (
    <div>
      <div className="confirm-grid">
        <div className="confirm-row">
          <span className="cr-k">Run name</span>
          <span className="cr-v">{state.runName}</span>
        </div>
        <div className="confirm-row">
          <span className="cr-k">Tenant · currency</span>
          <span className="cr-v">{tenantName} · {currency}</span>
        </div>
        <div className="confirm-row">
          <span className="cr-k">PD inputs</span>
          <span className="cr-v">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {state.pdFiles.map((f) => (
                <FileHashPill key={f.id} name={f.name} hash={f.hash} />
              ))}
            </div>
          </span>
        </div>
        {state.lgdFile && (
          <div className="confirm-row">
            <span className="cr-k">LGD input</span>
            <span className="cr-v">
              <FileHashPill name={state.lgdFile.name} hash={state.lgdFile.hash} />
            </span>
          </div>
        )}
        {state.eadFile && (
          <div className="confirm-row">
            <span className="cr-k">EAD input</span>
            <span className="cr-v">
              <FileHashPill name={state.eadFile.name} hash={state.eadFile.hash} />
            </span>
          </div>
        )}
        <div className="confirm-row">
          <span className="cr-k">Segments detected</span>
          <span className="cr-v">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {segments.map((s) => <SegmentTag key={s} label={s} />)}
            </div>
          </span>
        </div>
        {preview && (
          <>
            <div className="confirm-row">
              <span className="cr-k">Reporting Date</span>
              <span className="cr-v">
                {preview.reportingDate ?? "—"} {preview.reportingDateSource === "file" ? "(most common date in the EAD file)" : "(set on the run)"}
              </span>
            </div>
            <div className="confirm-row">
              <span className="cr-k">Validated ECL</span>
              <span className="cr-v">
                <b>{fmtMoney(preview.totals.ecl)}</b> on {fmtMoney(preview.totals.outstanding)} outstanding (
                {fmtPct(preview.totals.coverage)}) · {fmtInt(preview.totals.loans)} loans ·{" "}
                {fmtInt(preview.totals.excludedRows)} excluded · {fmtInt(preview.totals.cappedLoans)} capped
              </span>
            </div>
            <div className="confirm-row">
              <span className="cr-k">Reconciliation</span>
              <span className="cr-v">
                {recon.filter((c) => c.passed).length} of {recon.length} checks pass
              </span>
            </div>
          </>
        )}
        <div className="confirm-row">
          <span className="cr-k">Engine version</span>
          <span className="cr-v">
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"] }}>
              {state.eadValidation?.engineVersion ?? "—"}
            </span>
            {" · "}ECL Calculation Specification v1.0
          </span>
        </div>
      </div>

      {/* Combine PD checkbox */}
      {showCombine && (
        <label
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, marginTop: 20,
            cursor: "pointer", fontSize: "var(--fs-body)", color: "var(--text)",
          }}
        >
          <input
            type="checkbox"
            checked={state.combinePdFiles}
            onChange={(e) => onToggleCombine(e.target.checked)}
            style={{ accentColor: "var(--accent)", width: 16, height: 16 }}
          />
          Combine the {state.pdFiles.length} PD files into one listing before computing
        </label>
      )}

      {/* Audit callout */}
      <div className="callout callout-success" style={{ marginTop: 16 }}>
        <Lock size={15} className="ic" aria-hidden="true" />
        <span style={{ fontSize: "var(--fs-body)", color: "var(--text)" }}>
          Input hashes are recorded so any auditor can reproduce this exact run later.
        </span>
      </div>
    </div>
  );
}
