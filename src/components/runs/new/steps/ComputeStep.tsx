"use client";

import { useEffect, useRef, useState } from "react";
import { ComputeRing } from "../ComputeRing";
import { ComputeStageTracker } from "../ComputeStageTracker";
import { useRunWizard } from "../RunWizardContext";
import { useApiSession } from "@/hooks/use-api-session";
import { executeRun, fetchRun } from "@/lib/api/runs";
import { mapEngineProgress, mapRunListItem } from "@/lib/api/mappers";

const POLL_INTERVAL_MS = 2_000;
// Compute keeps running on the server whatever the browser does; these limits
// only decide when this screen stops watching.
const COMPUTE_TIMEOUT_MS = 45 * 60 * 1000;
// About 5 minutes of continuous failed polls (a restarting or very busy server).
const MAX_POLL_FAILURES = 150;

export function ComputeStep() {
  const { state, dispatch } = useRunWizard();
  const [reconnecting, setReconnecting] = useState(false);
  const { token, tenantId } = useApiSession();
  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const executeOnceRef  = useRef(false);
  const pollSetupRef    = useRef(false);

  function clearTimers() {
    if (pollRef.current)    clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }

  function goToFailure(stage: string, message: string) {
    clearTimers();
    dispatch({ type: "SET_FAILURE", details: { stage, message, ref: "—" } });
    setTimeout(() => dispatch({ type: "GO_TO_STEP", step: "failure" }), 0);
  }

  useEffect(() => {
    if (!state.runId || !token || !tenantId) return;

    dispatch({ type: "SET_COMPUTE_PROGRESS", pct: 0 });

    // Fire execute once per ComputeStep mount (Strict Mode remount must not double-dispatch).
    if (!executeOnceRef.current) {
      executeOnceRef.current = true;
      executeRun(token, tenantId, state.runId).catch((err: unknown) => {
        goToFailure(
          "execute",
          err instanceof Error
            ? err.message
            : "Failed to start computation. Check that all three files are uploaded and validated.",
        );
      });
    }

    // Polling may restart after Strict Mode remount; execute must not.
    if (pollSetupRef.current) return;
    pollSetupRef.current = true;

    // Absolute timeout — if nothing finishes in 8 min, tell the user
    timeoutRef.current = setTimeout(() => {
      goToFailure(
        "timeout",
        "Still computing after 45 minutes. The run continues on the server — open it from the Runs page to see when it finishes.",
      );
    }, COMPUTE_TIMEOUT_MS);

    let failedPolls = 0;
    let pollInFlight = false;
    let kickRetries = 0;

    async function pollRunStatus() {
      if (!state.runId || !token || !tenantId) return;
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        const raw = await fetchRun(token, tenantId, state.runId, { view: "progress" });
        failedPolls = 0;
        setReconnecting(false);

        const stages = mapEngineProgress(raw.engineProgress ?? null);
        dispatch({ type: "SET_COMPUTE_STAGES", stages });

        const doneCount   = stages.filter((s) => s.status === "done").length;
        const activeCount = stages.filter((s) => s.status === "active").length;
        const pct = Math.min(99, Math.round(((doneCount + activeCount * 0.5) / stages.length) * 100));
        dispatch({ type: "SET_COMPUTE_PROGRESS", pct });

        const mappedStatus = raw.status === "complete" ? "success" : raw.status;
        const stillQueued =
          raw.status === "queued" &&
          stages.every((s) => s.status === "pending");
        if (stillQueued && kickRetries < 2) {
          kickRetries += 1;
          void executeRun(token, tenantId, state.runId).catch(() => {
            /* next poll retries or the timeout surfaces a failure */
          });
        }

        if (mappedStatus === "success") {
          clearTimers();
          dispatch({ type: "SET_COMPUTE_PROGRESS", pct: 100 });
          const item = mapRunListItem(raw);
          dispatch({
            type: "SET_RESULT",
            result: {
              id: item.id,
              fullId: item.fullId,
              totalEcl: item.eclAmount ?? 0,
              coverageRatio: item.coverage ?? "—",
              currency: item.currency,
            },
          });
          setTimeout(() => dispatch({ type: "GO_TO_STEP", step: "success" }), 500);
        } else if (mappedStatus === "failed") {
          clearTimers();
          dispatch({
            type: "SET_FAILURE",
            details: {
              stage: raw.failureDetails?.stage ?? "unknown",
              message: raw.failureDetails?.message ?? "An unexpected error occurred.",
              ref: raw.failureDetails?.ref ?? "—",
            },
          });
          setTimeout(() => dispatch({ type: "GO_TO_STEP", step: "failure" }), 300);
        }
      } catch {
        failedPolls++;
        // A busy or restarting server misses a few polls; keep watching.
        if (failedPolls >= 3) setReconnecting(true);
        if (failedPolls >= MAX_POLL_FAILURES) {
          goToFailure(
            "polling",
            "Lost contact with the server for several minutes. The run may still finish — check it on the Runs page.",
          );
        }
      } finally {
        pollInFlight = false;
      }
    }

    // Poll immediately, then every 2s
    void pollRunStatus();
    pollRef.current = setInterval(() => void pollRunStatus(), POLL_INTERVAL_MS);

    return () => {
      clearTimers();
      pollSetupRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasStarted = state.computeStages.some(
    (s) => s.status === "active" || s.status === "done",
  );

  return (
    <div className="run-card">
      <div className="compute-wrap">
        <ComputeRing progress={state.computeProgress} />
        <h2 style={{ fontSize: "var(--fs-h2)" }}>Computing your ECL</h2>
        <p className="rc-sub" style={{ marginTop: 6 }}>
          {hasStarted
            ? "Large portfolios can take several minutes. You can leave this page; the run continues on the server."
            : "Starting the PD, LGD and EAD engines…"}
        </p>
        <ComputeStageTracker stages={state.computeStages} />
        {reconnecting && (
          <p className="rc-sub" role="status" style={{ marginTop: 12 }}>
            Reconnecting to the server… the computation keeps running in the meantime.
          </p>
        )}
      </div>
    </div>
  );
}
