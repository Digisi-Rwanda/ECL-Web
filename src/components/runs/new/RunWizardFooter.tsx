import { ArrowLeft, ArrowRight, Zap } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { NewRunStep } from "@/lib/new-run-types";

interface RunWizardFooterProps {
  currentStep: NewRunStep;
  canContinue: boolean;
  continueHint: string;
  nextLabel: string;
  onBack: () => void;
  onCancel: () => void;
  onNext: () => void;
  showBack?: boolean;
  backLabel?: string;
}


export function RunWizardFooter({
  currentStep,
  canContinue,
  continueHint,
  nextLabel,
  onBack,
  onCancel,
  onNext,
  showBack,
  backLabel = "Back",
}: RunWizardFooterProps) {
  const isConfirm = currentStep === "review";
  const canGoBack = showBack ?? false;

  const btnBase: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6,
    height: "var(--control-h)", padding: "0 14px",
    borderRadius: "var(--r-sm)", fontSize: "var(--fs-body)",
    fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
    cursor: canContinue ? "pointer" : "not-allowed",
    transition: "background var(--t-micro), opacity var(--t-micro)",
    border: "none",
  };

  return (
    <div className="run-foot">
      {/* Back */}
      <button
        onClick={onBack}
        style={{
          ...btnBase,
          background: "none", color: "var(--text-muted)", border: "none",
          visibility: canGoBack ? "visible" : "hidden",
          cursor: "pointer", opacity: 1,
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--text)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)")}
      >
        <ArrowLeft size={15} />
        {backLabel}
      </button>

      {/* Right: cancel + next */}
      <div className="right">
        <button
          onClick={onCancel}
          style={{ ...btnBase, background: "none", color: "var(--text-muted)", cursor: "pointer" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--text)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)")}
        >
          Cancel
        </button>

        {/* Next with tooltip */}
        <div className="tip" style={{ position: "relative" }}>
          <button
            onClick={canContinue ? onNext : undefined}
            disabled={!canContinue}
            aria-disabled={!canContinue}
            style={{
              ...btnBase,
              background: canContinue ? "var(--accent)" : "var(--accent)",
              color: "#fff",
              opacity: canContinue ? 1 : 0.5,
              pointerEvents: canContinue ? "auto" : "none",
            }}
          >
            {isConfirm ? <Zap size={15} /> : null}
            {nextLabel}
            {!isConfirm && <ArrowRight size={15} />}
          </button>

          <AnimatePresence>
            {!canContinue && (
              <motion.span
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="tip-body"
              >
                {continueHint}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
