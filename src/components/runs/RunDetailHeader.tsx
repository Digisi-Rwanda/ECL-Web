"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Download, BarChart3, ChevronDown, Loader2, MoreVertical, RefreshCw, RotateCcw,
} from "lucide-react";
import { RunStatusPill } from "./shared/RunStatusPill";
import { HashPill } from "./shared/HashPill";
import { RunDetailBanner } from "./RunDetailBanner";
import type { ModalKind } from "./RunActionModal";
import type { RunDetail, RunDetailStatus } from "@/lib/runs-types";
import { useApiSession } from "@/hooks/use-api-session";
import {
  downloadRunArtifactFile,
  downloadRunWorkbooksBundle,
  type OutputArtifactKind,
} from "@/lib/api/runs";

interface RunDetailHeaderProps {
  run: RunDetail;
  onOpenModal: (kind: NonNullable<ModalKind>) => void;
}

const SPEC_DOWNLOADS: { kind: OutputArtifactKind; label: string }[] = [
  { kind: "PD_CALCS", label: "PD term structure (.xlsx)" },
  { kind: "LOAN_DETAIL", label: "Loan detail: rows, loans, exceptions (.xlsx)" },
  { kind: "PORTFOLIO_SUMMARY", label: "Portfolio summary: stage & segment (.xlsx)" },
];

// Runs computed before engine v1.3.0 (ECL Calculation Specification v1.0).
const LEGACY_DOWNLOADS: { kind: OutputArtifactKind; label: string }[] = [
  { kind: "PD_CALCS", label: "PD term structure (.xlsx)" },
  { kind: "LGD", label: "LGD workbook (.xlsx)" },
  { kind: "RUNDOWN", label: "Contractual rundown (.xlsx)" },
  { kind: "ECL_SUMMARY", label: "ECL summary (.xlsx)" },
];

export function isSpecV1Engine(version: string | undefined): boolean {
  const m = /^v?(\d+)\.(\d+)/.exec(version ?? "");
  return !!m && (Number(m[1]) > 1 || (Number(m[1]) === 1 && Number(m[2]) >= 3));
}

function DownloadMenu({ runFullId, engineVersion, workbooksStatus, style }: { runFullId: string; engineVersion: string; workbooksStatus?: string; style: React.CSSProperties }) {
  const DOWNLOADS = isSpecV1Engine(engineVersion) ? SPEC_DOWNLOADS : LEGACY_DOWNLOADS;
  const { token, tenantId } = useApiSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<OutputArtifactKind | "bundle" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function download(kind: OutputArtifactKind | "bundle") {
    if (!token || !tenantId) return;
    setOpen(false);
    setError(null);
    setBusy(kind);
    try {
      if (kind === "bundle") await downloadRunWorkbooksBundle(token, tenantId, runFullId);
      else await downloadRunArtifactFile(token, tenantId, runFullId, kind);
    } catch {
      setError(
        isSpecV1Engine(engineVersion) && workbooksStatus !== "complete"
          ? workbooksStatus === "error"
            ? "The workbooks could not be built. Re-run the computation to try again."
            : "The workbooks are still being prepared. Large portfolios take a few minutes — try again shortly."
          : "Download failed. Try again in a moment.",
      );
    } finally {
      setBusy(null);
    }
  }

  const icon = (kind: OutputArtifactKind | "bundle") =>
    busy === kind ? (
      <Loader2 size={14} className="mp-ic" aria-hidden style={{ animation: "spin 0.7s linear infinite" }} />
    ) : (
      <Download size={14} className="mp-ic" aria-hidden />
    );

  return (
    <div className="fdrop" ref={ref}>
      <button
        style={style}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy !== null}
      >
        {busy ? <Loader2 size={14} style={{ animation: "spin 0.7s linear infinite" }} /> : <Download size={14} />}
        Download
        <ChevronDown size={13} aria-hidden />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          {isSpecV1Engine(engineVersion) && workbooksStatus !== "complete" && (
            <div className="mp-note" role="status">
              {workbooksStatus === "error"
                ? "Workbooks could not be built — re-run to retry."
                : "Preparing workbooks… large portfolios take a few minutes."}
            </div>
          )}
          {DOWNLOADS.map(({ kind, label }) => (
            <button key={kind} className="mp-item" role="menuitem" onClick={() => download(kind)}>
              {icon(kind)}
              {label}
            </button>
          ))}
          <div className="mp-sep" role="separator" />
          <button className="mp-item" role="menuitem" onClick={() => download("bundle")}>
            {icon("bundle")}
            All workbooks (.zip)
          </button>
        </div>
      )}
      {error && (
        <div
          role="alert"
          style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, whiteSpace: "nowrap", fontSize: "var(--fs-caption)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function ActionButtons({
  status,
  runFullId,
  engineVersion,
  workbooksStatus,
  onOpenModal,
}: {
  status: RunDetailStatus;
  runFullId: string;
  engineVersion: string;
  workbooksStatus?: string;
  onOpenModal: (k: NonNullable<ModalKind>) => void;
}) {
  const btnBase: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6,
    height: "var(--control-h)", padding: "0 14px",
    border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)",
    fontSize: "var(--fs-body)", fontWeight: "var(--fw-medium)",
    cursor: "pointer", whiteSpace: "nowrap", transition: "background var(--t-micro)",
  };

  if (status === "running") {
    return (
      <button style={{ ...btnBase, background: "var(--surface)", color: "var(--text)" }}>
        Cancel run
      </button>
    );
  }

  if (status === "failed") {
    return (
      <>
        <button style={{ ...btnBase, background: "var(--surface)", color: "var(--text)" }}>
          <RefreshCw size={14} />
          Edit &amp; retry
        </button>
        <button onClick={() => onOpenModal("more")} style={{ ...btnBase, background: "var(--surface)", color: "var(--text)", padding: "0 10px" }} aria-label="More actions">
          <MoreVertical size={16} />
        </button>
      </>
    );
  }

  if (status === "deleted") {
    return (
      <button onClick={() => onOpenModal("restore")} style={{ ...btnBase, background: "var(--surface)", color: "var(--text)" }}>
        <RotateCcw size={14} />
        Restore run
      </button>
    );
  }

  if (status === "success") {
    return (
      <>
        <DownloadMenu runFullId={runFullId} engineVersion={engineVersion} workbooksStatus={workbooksStatus} style={{ ...btnBase, background: "var(--surface)", color: "var(--text)" }} />
        <Link
          href={`/results?run_id=${encodeURIComponent(runFullId)}`}
          style={{
            ...btnBase,
            background: "var(--accent)",
            color: "#fff",
            borderColor: "transparent",
            textDecoration: "none",
          }}
        >
          <BarChart3 size={14} />
          View results
        </Link>
        <button onClick={() => onOpenModal("more")} style={{ ...btnBase, background: "var(--surface)", color: "var(--text)", padding: "0 10px" }} aria-label="More actions">
          <MoreVertical size={16} />
        </button>
      </>
    );
  }

  if (status === "draft" || status === "queued") {
    return (
      <button onClick={() => onOpenModal("more")} style={{ ...btnBase, background: "var(--surface)", color: "var(--text)", padding: "0 10px" }} aria-label="More actions">
        <MoreVertical size={16} />
      </button>
    );
  }

  return null;
}

export function RunDetailHeader({ run, onOpenModal }: RunDetailHeaderProps) {
  const hasBanner = run.status === "running" || run.status === "failed" || run.status === "deleted";

  return (
    <div className="detail-head">
      {/* Back link */}
      <Link href="/runs" className="detail-back">
        <ArrowLeft size={13} />
        All runs
      </Link>

      {/* State banner */}
      {hasBanner && (
        <RunDetailBanner
          variant={run.status as "running" | "failed" | "deleted"}
          run={run}
        />
      )}

      {/* Title row */}
      <div className="detail-top">
        <div>
          <div className="detail-title">
            <h1>{run.name}</h1>
            <HashPill hash={run.id} fullId={run.fullId} />
            <RunStatusPill status={run.status} />
          </div>
          <div className="detail-meta">
            {run.status === "success" && (
              <>
                <span>Computed {run.createdAt}</span>
                <span className="dot" />
                <div className="by-mini">
                  <span className="avatar avatar-sm">{run.byInitials}</span>
                  {run.byName}
                </div>
                {run.elapsed && (
                  <>
                    <span className="dot" />
                    <span>elapsed {run.elapsed}</span>
                  </>
                )}
              </>
            )}
            {run.status === "running" && (
              <>
                <span>Started {run.createdAt}</span>
                <span className="dot" />
                <div className="by-mini">
                  <span className="avatar avatar-sm">{run.byInitials}</span>
                  {run.byName}
                </div>
              </>
            )}
            {run.status === "failed" && (
              <>
                <span>Failed {run.createdAt}</span>
                <span className="dot" />
                <div className="by-mini">
                  <span className="avatar avatar-sm">{run.byInitials}</span>
                  {run.byName}
                </div>
                {run.failureDetails && (
                  <>
                    <span className="dot" />
                    <span>at {run.failureDetails.stage} stage</span>
                  </>
                )}
              </>
            )}
            {run.status === "deleted" && (
              <>
                <span>Computed {run.createdAt}</span>
                <span className="dot" />
                <div className="by-mini">
                  <span className="avatar avatar-sm">{run.byInitials}</span>
                  {run.byName}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="detail-actions">
          <ActionButtons status={run.status} runFullId={run.fullId} engineVersion={run.engineInfo.version} workbooksStatus={run.workbooksStatus} onOpenModal={onOpenModal} />
        </div>
      </div>
    </div>
  );
}
