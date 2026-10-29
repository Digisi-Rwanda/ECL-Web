"use client";

import { useRunWizard } from "../RunWizardContext";
import { useApiSession } from "@/hooks/use-api-session";
import { updateRun } from "@/lib/api/runs";
import { ConfirmGrid } from "../ConfirmGrid";

export function ConfirmStep() {
  const { state, dispatch } = useRunWizard();
  const { token, tenantId, tenantName, currency } = useApiSession();

  async function handleToggleCombine(value: boolean) {
    dispatch({ type: "SET_COMBINE_PD", value });
    if (state.runId && token && tenantId) {
      await updateRun(token, tenantId, state.runId, { combine_pd_files: value }).catch(() => {});
    }
    // The PD curve feeds LGD/EAD validation, so both must run again on the new curve.
    dispatch({ type: "RESET_VALIDATION_FROM", kind: "LGD" });
    dispatch({ type: "GO_TO_STEP", step: "validate" });
  }

  return (
    <div className="run-card">
      <h2>Confirm &amp; start</h2>
      <p className="rc-sub">
        Review the run below. Once started, the engine is deterministic — these exact inputs and engine version will always produce the same output.
      </p>
      <ConfirmGrid
        state={state}
        tenantName={tenantName ?? undefined}
        currency={currency}
        onToggleCombine={(v) => void handleToggleCombine(v)}
      />
    </div>
  );
}
