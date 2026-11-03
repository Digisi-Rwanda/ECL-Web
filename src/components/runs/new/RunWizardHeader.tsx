import { ArrowLeft } from "lucide-react";

interface RunWizardHeaderProps {
  runName: string;
  tenantName?: string;
  engineVersion?: string | null;
  onExit: () => void;
}

export function RunWizardHeader({ runName, tenantName = "Workspace", engineVersion, onExit }: RunWizardHeaderProps) {
  return (
    <div className="run-head">
      <div className="rh-left">
        <button
          className="back-btn"
          onClick={onExit}
          aria-label="Exit wizard"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1>New Run</h1>
          <div className="rh-sub">
            {tenantName} · {runName}
          </div>
        </div>
      </div>
      {engineVersion && (
        <span className="statpill">
          <span className="k">Engine</span>
          <span className="v">{engineVersion}</span>
        </span>
      )}
    </div>
  );
}
