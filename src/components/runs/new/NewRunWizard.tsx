"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  RunWizardProvider,
  useRunWizard,
  canContinueFrom,
  canOpenFile,
  eadCleared,
  getFooterHint,
} from "./RunWizardContext";
import { RunWizardHeader } from "./RunWizardHeader";
import { RunWizardStepper } from "./RunWizardStepper";
import { RunWizardFooter } from "./RunWizardFooter";
import { WizardCancelModal } from "./WizardCancelModal";
import { DataStep } from "./steps/DataStep";
import { ReviewStep } from "./steps/ReviewStep";
import { ComputeStep } from "./steps/ComputeStep";
import { FailureTerminal } from "./steps/FailureTerminal";
import { DATA_FILES, stepIndex } from "@/lib/new-run-types";
import type { FileInputType, NewRunStep, UploadedFile } from "@/lib/new-run-types";
import { useApiSession } from "@/hooks/use-api-session";
import { deleteRun, fetchRun, updateRun } from "@/lib/api/runs";
import { mapRunDetail } from "@/lib/api/mappers";

const STEP_COMPONENTS: Partial<Record<NewRunStep, React.ComponentType>> = {
  data: DataStep,
  review: ReviewStep,
  compute: ComputeStep,
  failure: FailureTerminal,
};

const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 18 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -18 }),
};

function ReviewerRedirect() {
  const router = useRouter();
  const { role, isLoading } = useApiSession();
  useEffect(() => {
    if (!isLoading && role === "reviewer") router.replace("/runs");
  }, [role, isLoading, router]);
  return null;
}

/** Rebuild a draft from the server when the page is opened with ?run=… (refresh, resume). */
function useResume() {
  const { state, dispatch } = useRunWizard();
  const { token, tenantId } = useApiSession();
  const params = useSearchParams();
  const router = useRouter();
  const done = useRef(false);
  const runParam = params.get("run");

  useEffect(() => {
    if (done.current || !runParam || !token || !tenantId || state.runId) return;
    done.current = true;
    dispatch({ type: "SET_HYDRATING", value: true });
    fetchRun(token, tenantId, runParam)
      .then((raw) => {
        const run = mapRunDetail(raw);
        if (run.status !== "draft" && run.status !== "failed") {
          // Computed or computing: its page is the run detail, not the wizard.
          router.replace(`/runs/${run.fullId}`);
          return;
        }
        dispatch({
          type: "SET_RUN_META",
          runId: run.fullId,
          runName: run.name,
          currency: run.currency,
          engineVersion: run.engineInfo.version,
        });
        const files: UploadedFile[] = run.inputFiles.map((f, i) => ({
          id: `${f.type}-restored-${i}`,
          name: f.name,
          size: f.size,
          sheets: f.sheets,
          type: f.type,
          status: "ok",
          hash: f.hash,
          backendUploadId: f.uploadId,
        }));
        dispatch({ type: "HYDRATE", files, combinePdFiles: run.engineInfo.pdFilesCombined });
        // Review acceptances live on the server; restore them so earlier files stay cleared.
        for (const f of run.inputFiles) if (f.warningsAccepted) dispatch({ type: "SET_REVIEW_ACCEPTED", kind: f.type, value: true });
        const step = params.get("step");
        const file = params.get("file") as FileInputType | null;
        if (file && DATA_FILES.includes(file)) dispatch({ type: "SET_DATA_FILE", kind: file });
        if (step === "review") dispatch({ type: "GO_TO_STEP", step: "review" });
      })
      .catch(() => router.replace("/runs/new"))
      .finally(() => dispatch({ type: "SET_HYDRATING", value: false }));
  }, [runParam, token, tenantId, state.runId, dispatch, params, router]);
}

/** Keep ?run=&step=&file= in the address bar so refresh, Back and links work. */
function useUrlSync() {
  const { state } = useRunWizard();
  const router = useRouter();
  useEffect(() => {
    if (!state.runId || state.hydrating || state.step === "compute" || state.step === "success") return;
    const qs = new URLSearchParams({ run: state.runId, step: state.step });
    if (state.step === "data") qs.set("file", state.dataFile);
    const next = `/runs/new?${qs}`;
    if (`${window.location.pathname}${window.location.search}` !== next) router.replace(next, { scroll: false });
  }, [state.runId, state.step, state.dataFile, state.hydrating, router]);
}

function WizardInner() {
  const { state, dispatch } = useRunWizard();
  const router = useRouter();
  const { token, tenantId, tenantName } = useApiSession();
  const [saving, setSaving] = useState(false);
  useResume();
  useUrlSync();

  const { step, prevStep, cancelModalOpen, runName, dataFile } = state;
  const fileIdx = DATA_FILES.indexOf(dataFile);
  const isTerminal = step === "success" || step === "failure";
  const showFooter = !isTerminal && step !== "compute";
  const direction = stepIndex(step) >= stepIndex(prevStep) ? 1 : -1;

  // Compute finished: the result is the run's report.
  useEffect(() => {
    if (step === "success" && state.runId) router.replace(`/results?run_id=${encodeURIComponent(state.runId)}`);
  }, [step, state.runId, router]);

  // Each new screen starts at the top, with focus on its heading for screen readers.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelector<HTMLElement>(".run-stage h2, .run-stage [role=tablist]")?.focus?.();
  }, [step, dataFile]);

  async function handleNext() {
    if (step === "data") {
      if (fileIdx < DATA_FILES.length - 1) dispatch({ type: "SET_DATA_FILE", kind: DATA_FILES[fileIdx + 1] });
      else dispatch({ type: "GO_TO_STEP", step: "review" });
      return;
    }
    if (step === "review") {
      // Name and currency are edited on Review; save them before compute freezes the run.
      if (token && tenantId && state.runId) {
        setSaving(true);
        try {
          await updateRun(token, tenantId, state.runId, {
            name: runName.trim() || "Untitled run",
            reporting_period: runName.trim() || undefined,
            currency: state.currency ?? undefined,
          });
        } catch {
          setSaving(false);
          return;
        }
        setSaving(false);
      }
      dispatch({ type: "GO_TO_STEP", step: "compute" });
    }
  }

  function handleBack() {
    if (step === "review") dispatch({ type: "SET_DATA_FILE", kind: "EAD" });
    else if (step === "data" && fileIdx > 0) dispatch({ type: "SET_DATA_FILE", kind: DATA_FILES[fileIdx - 1] });
  }

  function handleStepClick(target: NewRunStep) {
    if (target === "data") dispatch({ type: "SET_DATA_FILE", kind: dataFile });
    else if (target === "review" && eadCleared(state)) dispatch({ type: "GO_TO_STEP", step: "review" });
  }

  function handleDiscard() {
    dispatch({ type: "CLOSE_CANCEL_MODAL" });
    if (state.runId && token && tenantId) deleteRun(token, tenantId, state.runId).catch(() => {});
    router.push("/runs");
  }

  const nextLabel =
    step === "review"
      ? saving ? "Saving…" : "Start computation"
      : fileIdx < DATA_FILES.length - 1
        ? `Continue to ${DATA_FILES[fileIdx + 1]}`
        : "Continue to review";
  const StepComponent = STEP_COMPONENTS[step];

  return (
    <>
      <RunWizardHeader
        runName={runName}
        tenantName={tenantName ?? undefined}
        engineVersion={state.engineVersion}
        onExit={() => dispatch({ type: "OPEN_CANCEL_MODAL" })}
      />
      <RunWizardStepper
        currentStep={step === "success" ? "compute" : step}
        terminalState={step === "success" ? "success" : step === "failure" ? "failure" : null}
        onStepClick={handleStepClick}
        canVisitReview={eadCleared(state) && canOpenFile(state, "EAD")}
        dataProgress={step === "data" ? `${dataFile} · ${fileIdx + 1} of ${DATA_FILES.length}` : undefined}
      />

      <div className="run-stage" aria-busy={state.hydrating}>
        {state.hydrating ? (
          <div className="run-card data-checking" role="status">
            <span className="spin" aria-hidden /> <b>Opening your draft run…</b>
          </div>
        ) : (
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step === "data" ? `data-${dataFile}` : step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {StepComponent ? <StepComponent /> : null}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {showFooter && !state.hydrating && (
        <RunWizardFooter
          currentStep={step}
          canContinue={canContinueFrom(state) && !saving}
          continueHint={getFooterHint(state)}
          nextLabel={nextLabel}
          onBack={handleBack}
          showBack={step === "review" || (step === "data" && fileIdx > 0)}
          backLabel={step === "review" ? "Back to EAD" : fileIdx > 0 ? `Back to ${DATA_FILES[fileIdx - 1]}` : "Back"}
          onCancel={() => dispatch({ type: "OPEN_CANCEL_MODAL" })}
          onNext={() => void handleNext()}
        />
      )}

      <WizardCancelModal open={cancelModalOpen} onKeep={() => dispatch({ type: "CLOSE_CANCEL_MODAL" })} onDiscard={handleDiscard} />
    </>
  );
}

export function NewRunWizard() {
  return (
    <RunWizardProvider>
      <ReviewerRedirect />
      <WizardInner />
    </RunWizardProvider>
  );
}
