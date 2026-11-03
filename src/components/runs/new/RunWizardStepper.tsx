import { Check, X } from "lucide-react";
import { DATA_FILES, STEP_ORDER, stepIndex } from "@/lib/new-run-types";
import type { FileInputType, NewRunStep } from "@/lib/new-run-types";

const STEPS: { id: NewRunStep | "results"; label: string }[] = [
  { id: "data", label: "Data" },
  { id: "review", label: "Review" },
  { id: "compute", label: "Compute" },
  { id: "results", label: "Results" },
];

const FILE_LABELS: Record<FileInputType, string> = {
  PD: "Probability of Default",
  LGD: "Loss Given Default",
  EAD: "Exposure at Default",
};

interface RunWizardStepperProps {
  currentStep: NewRunStep;
  terminalState?: "success" | "failure" | null;
  onStepClick?: (step: NewRunStep) => void;
  canVisitReview?: boolean;
  /** "2 of 3" under Data while a file is in focus. */
  dataProgress?: string;
}

export function RunWizardStepper({
  currentStep,
  terminalState,
  onStepClick,
  canVisitReview = false,
  dataProgress,
}: RunWizardStepperProps) {
  const curIdx = terminalState === "success" ? STEPS.length - 1 : stepIndex(currentStep);

  return (
    <nav className="run-steps" aria-label="Run progress">
      {STEPS.map((s, i) => {
        const isActive = i === curIdx && terminalState !== "failure";
        const isDone = i < curIdx || (terminalState === "success" && i === curIdx);
        const isError = terminalState === "failure" && i === STEP_ORDER.indexOf("compute");
        const cls = isDone ? "done" : isError ? "error" : isActive ? "active" : "";
        const target = s.id as NewRunStep;
        const clickable =
          !!onStepClick &&
          !terminalState &&
          i !== curIdx &&
          (s.id === "data" || (s.id === "review" && canVisitReview));

        return (
          <div key={s.id} style={{ display: "contents" }}>
            <div
              className={`rs ${cls}${clickable ? " rs-clickable" : ""}`}
              aria-current={isActive ? "step" : undefined}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => onStepClick(target) : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onStepClick(target);
                      }
                    }
                  : undefined
              }
            >
              <span className="n" aria-hidden="true">
                {isDone ? <Check size={13} /> : isError ? <X size={13} /> : i + 1}
              </span>
              <span className="lbl-txt">
                {s.label}
                {s.id === "data" && isActive && dataProgress ? (
                  <span className="rs-sub"> · {dataProgress}</span>
                ) : null}
              </span>
            </div>
            {i < STEPS.length - 1 && <span className={`line${isDone ? " done-line" : ""}`} aria-hidden="true" />}
          </div>
        );
      })}
    </nav>
  );
}

export type FileChipState = "done" | "active" | "blocked" | "todo" | "locked";

/** PD → LGD → EAD inside the Data step: one file in focus, finished ones checked. */
export function DataSubStepper({
  current,
  states,
  onSelect,
}: {
  current: FileInputType;
  states: Record<FileInputType, FileChipState>;
  onSelect: (kind: FileInputType) => void;
}) {
  return (
    <div className="data-steps" role="tablist" aria-label="Input files">
      {DATA_FILES.map((kind, i) => {
        const st = states[kind];
        const selected = kind === current;
        return (
          <div key={kind} style={{ display: "contents" }}>
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="data-panel"
              disabled={st === "locked"}
              className={`ds ds-${st}${selected ? " ds-current" : ""}`}
              onClick={() => onSelect(kind)}
              title={st === "locked" ? "Finish the previous file first" : FILE_LABELS[kind]}
            >
              <span className="ds-n" aria-hidden="true">
                {st === "done" ? <Check size={12} /> : st === "blocked" ? <X size={12} /> : i + 1}
              </span>
              <span className="ds-k">{kind}</span>
              <span className="ds-l">{FILE_LABELS[kind]}</span>
            </button>
            {i < DATA_FILES.length - 1 && <span className={`ds-line${st === "done" ? " done" : ""}`} aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
}
