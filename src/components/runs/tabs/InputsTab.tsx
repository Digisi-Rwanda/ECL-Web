"use client";

import { useState } from "react";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { InputFileCard } from "../InputFileCard";
import type { RunDetail, RunInputFile } from "@/lib/runs-types";
import { useApiSession } from "@/hooks/use-api-session";
import { downloadRunInput } from "@/lib/api/runs";

interface InputsTabProps {
  run: RunDetail;
}

export function InputsTab({ run }: InputsTabProps) {
  const hasWarnings = (run.acceptedWarnings ?? 0) > 0;
  const { token, tenantId } = useApiSession();
  const [busy, setBusy] = useState<RunInputFile["type"] | "bundle" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(kind: RunInputFile["type"] | "bundle") {
    if (!token || !tenantId || busy) return;
    setError(null);
    setBusy(kind);
    try {
      await downloadRunInput(token, tenantId, run.fullId, kind);
    } catch {
      setError("Download failed. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {/* Warning callout */}
      {hasWarnings && (
        <div className="callout callout-warning" style={{ marginBottom: "var(--sp-4)" }}>
          <AlertTriangle size={16} className="ic" style={{ flexShrink: 0, marginTop: 1, color: "var(--warning)" }} />
          <span style={{ fontSize: "var(--fs-body)", color: "var(--text)" }}>
            This run was computed with{" "}
            <strong>{run.acceptedWarnings} accepted warning{run.acceptedWarnings !== 1 ? "s" : ""}</strong>. They did not block the calculation.
          </span>
        </div>
      )}

      {/* Input file cards */}
      {run.inputFiles.map((file) => (
        <InputFileCard
          key={`${file.type}-${file.name}`}
          file={file}
          busy={busy === file.type}
          onDownload={() => download(file.type)}
        />
      ))}

      {/* Download all */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 16 }}>
        {error && (
          <span role="alert" style={{ fontSize: "var(--fs-caption)", color: "var(--danger)" }}>
            {error}
          </span>
        )}
        <button
          onClick={() => download("bundle")}
          disabled={busy !== null || run.inputFiles.length === 0}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            height: "var(--control-h)", padding: "0 14px",
            background: "var(--surface)", color: "var(--text)",
            border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)",
            fontSize: "var(--fs-body)", fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
            cursor: "pointer", transition: "background var(--t-micro)",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--surface-sunken)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--surface)")}
        >
          {busy === "bundle" ? <Loader2 size={14} style={{ animation: "spin 0.7s linear infinite" }} /> : <Download size={14} />}
          Download all inputs (.zip)
        </button>
      </div>
    </div>
  );
}
