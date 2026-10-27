import { Check, AlertTriangle, Download, Loader2 } from "lucide-react";
import { InputBadge } from "./shared/InputBadge";
import type { RunInputFile } from "@/lib/runs-types";

interface InputFileCardProps {
  file: RunInputFile;
  busy?: boolean;
  onDownload?: () => void;
}

export function InputFileCard({ file, busy = false, onDownload }: InputFileCardProps) {
  const statusPill =
    file.validationStatus === "ok" ? (
      <span className="pill pill-success" style={{ height: 18 }}>
        <Check size={11} />
        Valid
      </span>
    ) : file.validationStatus === "warn" ? (
      <span className="pill pill-warning" style={{ height: 18 }}>
        <AlertTriangle size={11} />
        {file.warningCount} warning{(file.warningCount ?? 0) > 1 ? "s" : ""}
      </span>
    ) : (
      <span className="pill pill-danger" style={{ height: 18 }}>
        Error
      </span>
    );

  return (
    <div className="input-card">
      <InputBadge type={file.type} />
      <div className="in-meta">
        <div className="in-name">{file.name}</div>
        <div className="in-detail">
          <span>{file.size} · {file.sheets} sheet{file.sheets !== 1 ? "s" : ""}</span>
          {statusPill}
          <span className="in-hash">sha256 {file.hash}</span>
        </div>
      </div>
      <button
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          height: 28, padding: "0 10px",
          background: "var(--surface)", color: "var(--text)",
          border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)",
          fontSize: "var(--fs-caption)", fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
          cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          transition: "background var(--t-micro)",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--surface-sunken)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--surface)")}
        onClick={onDownload}
        disabled={busy}
        aria-label={`Download ${file.name}`}
      >
        {busy ? <Loader2 size={12} style={{ animation: "spin 0.7s linear infinite" }} /> : <Download size={12} />}
        Download
      </button>
    </div>
  );
}
