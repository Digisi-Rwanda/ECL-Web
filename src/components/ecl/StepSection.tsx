"use client";

import { useState, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, Check, ChevronDown, RefreshCw } from "lucide-react";
import { countPdCriteria } from "@/lib/api/pd-validation";
import type { EclStepStatus, PdCriterion, UploadedFile } from "@/lib/new-run-types";

interface Props {
  file: UploadedFile;
  zone: "LGD" | "EAD";
  title: string;
  status: EclStepStatus;
  criteria: PdCriterion[] | undefined;
  accepted: boolean;
  error: string | null;
  loadingText: string;
  onRetry: () => void;
  onReupload: (file: File) => void;
  isReuploading: boolean;
  children: ReactNode;
}

/** File header + validation body for one lane step, same look as the PD card. */
export function StepSection(props: Props) {
  const { file, zone, title, status, criteria, accepted, error, loadingText, onRetry, onReupload, isReuploading, children } = props;
  const [open, setOpen] = useState(true);
  const counts = criteria ? countPdCriteria(criteria) : null;
  const tone =
    status === "blocked" || status === "error" ? "danger" : counts?.review && !accepted ? "warning" : status === "ready" ? "success" : "neutral";
  const pill =
    status === "loading" ? (
      <span className="pill pill-running"><span className="dot" />Validating…</span>
    ) : status === "error" ? (
      <span className="pill pill-danger"><AlertCircle size={11} />Could not run</span>
    ) : status === "blocked" ? (
      <span className="pill pill-danger"><AlertCircle size={11} />{counts?.blocked ?? 0} blocking</span>
    ) : counts?.review ? (
      <span className={`pill ${accepted ? "pill-success" : "pill-warning"}`}>
        <AlertTriangle size={11} />
        {counts.passed} passed · {counts.review} {accepted ? "accepted" : "to review"}
      </span>
    ) : status === "ready" ? (
      <span className="pill pill-success"><span className="dot" />Validated</span>
    ) : (
      <span className="pill pill-neutral"><span className="dot" />Waiting</span>
    );

  function pick() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = (e) => {
      const picked = (e.target as HTMLInputElement).files?.[0];
      if (picked) onReupload(picked);
    };
    input.click();
  }

  return (
    <div className={`val-file open pd-rich`} style={{ marginTop: "var(--sp-4)" }}>
      <div
        className="vf-head"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <span className="vf-ic" style={{ background: `var(--${tone === "neutral" ? "surface-sunken" : `${tone}-subtle`})`, color: `var(--${tone === "neutral" ? "text-muted" : tone})` }}>
          {tone === "danger" ? <AlertCircle size={13} /> : <Check size={13} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="vf-name">{zone} · {file.name}</div>
          <div className="pdts-muted">{title} · {file.size} · {file.sheets} sheet{file.sheets !== 1 ? "s" : ""}</div>
        </div>
        <div className="vf-status">
          {pill}
          <ChevronDown size={15} className="vf-chev" />
        </div>
      </div>
      {open && (
        <div className="vf-body">
          {status === "loading" && (
            <div>
              <div className="pdts-muted">{loadingText}</div>
              <div className="progress indeterminate" style={{ marginTop: 12 }}><div className="bar" /></div>
            </div>
          )}
          {status === "error" && (
            <div className="val-summary err">
              <span className="vs-ic" aria-hidden="true"><RefreshCw size={20} /></span>
              <div className="val-summary-body">
                <div className="vs-t">{zone} validation could not run</div>
                <div className="vs-d">{error}</div>
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={onRetry}>
                  <RefreshCw size={13} aria-hidden="true" /> Retry {zone} validation
                </button>
              </div>
            </div>
          )}
          {(status === "ready" || status === "blocked") && children}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={isReuploading} onClick={pick}>
              <RefreshCw size={12} aria-hidden="true" />
              {isReuploading ? "Uploading…" : `Re-upload ${zone}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
