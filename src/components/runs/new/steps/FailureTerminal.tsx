"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { useRunWizard } from "../RunWizardContext";

const FALLBACK_FAILURE = {
  stage: "unknown",
  message: "An unexpected error occurred during compute.",
  ref: "—",
};

function stageDescription(stage: string): string {
  switch (stage) {
    case "execute":
      return "The run could not be started. Fix the issue below and try again.";
    case "timeout":
      return "The compute worker did not finish in time. No results were saved.";
    case "polling":
      return "Connection to the server was lost during monitoring. No results were saved.";
    default:
      return `The ${stage.toUpperCase()} engine failed. No partial results were saved.`;
  }
}

export function FailureTerminal() {
  const { state, dispatch } = useRunWizard();
  const failure = state.failureDetails ?? FALLBACK_FAILURE;

  function handleRetry() {
    dispatch({ type: "SET_DATA_FILE", kind: "PD" });
  }

  const isLgdFailure = failure.stage === "lgd";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="run-card run-terminal">
        <div className="rt-ic err" aria-hidden="true">
          <AlertTriangle size={24} />
        </div>

        <h2>
          {failure.stage === "execute"
            ? "Run failed to start"
            : failure.stage === "timeout"
            ? "Compute timed out"
            : failure.stage === "polling"
            ? "Connection lost"
            : `Run failed at the ${failure.stage.toUpperCase()} stage`}
        </h2>

        <p
          className="rc-sub"
          style={{ maxWidth: "46ch", marginLeft: "auto", marginRight: "auto" }}
        >
          {stageDescription(failure.stage)}
        </p>

        <div
          className="callout callout-danger"
          style={{ textAlign: "left", maxWidth: 520, margin: "20px auto" }}
        >
          <AlertTriangle size={15} aria-hidden="true" />
          <div>
            <div style={{ fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"] }}>
              {failure.message}
            </div>
            {failure.ref !== "—" && (
              <div className="t-caption" style={{ marginTop: 2 }}>
                <span className="mono">ref {failure.ref}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={handleRetry}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              height: 44, padding: "0 20px",
              background: "var(--accent)", color: "#fff",
              border: "none", borderRadius: "var(--r-sm)",
              fontSize: "var(--fs-h3)", fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
              cursor: "pointer", transition: "background var(--t-micro)",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--accent-hover)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--accent)")}
          >
            <RefreshCw size={15} />
            Edit inputs &amp; retry
          </button>

          {isLgdFailure && (
            <button
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                height: 44, padding: "0 20px",
                background: "var(--surface)", color: "var(--text)",
                border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)",
                fontSize: "var(--fs-h3)", fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
                cursor: "pointer",
              }}
            >
              Add collateral type in Admin
            </button>
          )}

          <button
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              height: 44, padding: "0 20px",
              background: "none", color: "var(--text-muted)",
              border: "none", borderRadius: "var(--r-sm)",
              fontSize: "var(--fs-h3)", fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
              cursor: "pointer",
            }}
          >
            Contact support
          </button>
        </div>
      </div>
    </motion.div>
  );
}
