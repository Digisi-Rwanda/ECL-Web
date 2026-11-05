import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";
import type { ApiError } from "@/lib/api/client";
import type { RunDetail } from "@/lib/runs-types";

interface ResultsUnavailableProps {
  error?: ApiError | null;
  runId: string;
  run?: RunDetail | null;
  isLoading?: boolean;
}

function statusLabel(status: RunDetail["status"]): string {
  const labels: Record<RunDetail["status"], string> = {
    success: "complete",
    failed: "failed",
    running: "running",
    queued: "queued",
    draft: "draft",
    deleted: "deleted",
  };
  return labels[status] ?? status;
}

export function ResultsUnavailable({ error, runId, run, isLoading }: ResultsUnavailableProps) {
  if (isLoading) {
    return (
      <div className="rx-unavailable">
        <p className="rx-unavailable-msg">Loading run details…</p>
      </div>
    );
  }

  let title = "No segment data available";
  let message =
    "The results explorer needs per-loan EAD output from a finished compute run. None was found for this run.";

  if (error?.code === "RUN_NOT_COMPLETE") {
    title = "Computation not finished";
    message = error.message;
  } else if (error?.code === "NO_COMPLETED_RUNS") {
    title = "No completed runs yet";
    message =
      "Finish uploading, validating, and computing a run first. Results will appear here once a run completes successfully.";
  } else if (error?.code === "RESOURCE_NOT_FOUND") {
    title = "Results not available";
    message = run
      ? run.status === "success"
        ? "This run is marked complete, but the API could not load its result breakdown. The Celery worker may not have persisted EAD rows — try re-running the computation."
        : `This run is "${statusLabel(run.status)}". Results are only available after the compute engine finishes successfully.`
      : "The requested run could not be found or is not complete yet.";
  } else if (error) {
    title = "Could not load results";
    message = error.message;
  } else if (run && run.status !== "success") {
    title = "Computation not finished";
    message = `This run is "${statusLabel(run.status)}". Upload your files, pass validation, and start computation to generate ECL results.`;
  } else if (run?.status === "success") {
    title = "No segment breakdown saved";
    message =
      "The run summary may show totals on the run page, but per-segment drill-down data was not found in the database. Re-run the computation with the Celery worker running.";
  }

  const showRunKpis = run?.status === "success" && run.kpis.some((kpi) => kpi.value !== "—");

  return (
    <div className="rx-unavailable">
      <div className="rx-unavailable-ic" aria-hidden="true">
        <AlertCircle size={22} />
      </div>
      <h2>{title}</h2>
      <p className="rx-unavailable-msg">{message}</p>

      {showRunKpis && (
        <div className="rx-kpis" style={{ marginTop: "var(--sp-4)" }}>
          {run.kpis.map((kpi) => (
            <div key={kpi.id} className="kpi">
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value">
                {kpi.currencyPrefix && <span className="kpi-cur">{kpi.currencyPrefix}</span>}
                {kpi.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rx-unavailable-actions">
        {runId && (
          <Link href={`/ecl/runs/${runId}`} className="rx-unavailable-link">
            View run details
            <ArrowRight size={14} />
          </Link>
        )}
        {run?.status !== "success" && (
          <Link href="/ecl/runs/new" className="rx-unavailable-link secondary">
            Start a new run
            <ArrowRight size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}
