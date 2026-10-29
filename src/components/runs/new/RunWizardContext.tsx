"use client";

import { createContext, useContext, useReducer, type Dispatch } from "react";
import {
  DEFAULT_COMPUTE_STAGES,
  type EclStepStatus,
  type FileInputType,
  type NewRunState,
  type NewRunAction,
  type UploadedFile,
} from "@/lib/new-run-types";

// ── Default state ──────────────────────────────────────────────────────────

const initialState: NewRunState = {
  step: "upload",
  prevStep: "upload",
  runName: "May 2026",
  runId: null,
  runInitError: null,
  pdFiles: [],
  lgdFile: null,
  eadFile: null,
  combinePdFiles: true,
  pdPreview: null,
  pdPreviewStatus: "idle",
  pdPreviewError: null,
  computeProgress: 0,
  computeStages: DEFAULT_COMPUTE_STAGES.map((s) => ({ ...s, status: "pending" as const })),
  result: null,
  failureDetails: null,
  cancelModalOpen: false,
  uploadProgress: {},
  uploadedFileIds: {},
  uploadFocus: null,
  lgdValidation: null,
  lgdStatus: "idle",
  lgdError: null,
  eadValidation: null,
  eadStatus: "idle",
  eadError: null,
  reviewAccepted: { PD: false, LGD: false, EAD: false },
};

const ORDER: FileInputType[] = ["PD", "LGD", "EAD"];

/** A changed file invalidates its own validation and every later step's (mirrors the server). */
function resetFrom(state: NewRunState, kind: FileInputType): NewRunState {
  const from = ORDER.indexOf(kind);
  const hit = (k: FileInputType) => ORDER.indexOf(k) >= from;
  return {
    ...state,
    ...(hit("PD") ? { pdPreview: null, pdPreviewStatus: "idle" as const, pdPreviewError: null } : {}),
    ...(hit("LGD") ? { lgdValidation: null, lgdStatus: "idle" as const, lgdError: null } : {}),
    eadValidation: null,
    eadStatus: "idle",
    eadError: null,
    reviewAccepted: {
      PD: hit("PD") ? false : state.reviewAccepted.PD,
      LGD: hit("LGD") ? false : state.reviewAccepted.LGD,
      EAD: false,
    },
  };
}

function stepStatus(status: "ok" | "warn" | "blocking"): EclStepStatus {
  return status === "blocking" ? "blocked" : "ready";
}

// ── Reducer ────────────────────────────────────────────────────────────────

function reducer(state: NewRunState, action: NewRunAction): NewRunState {
  switch (action.type) {
    case "SET_RUN_NAME":
      return { ...state, runName: action.name };

    case "ADD_PD_FILE":
      return { ...resetFrom(state, "PD"), pdFiles: [...state.pdFiles, action.file] };

    case "REMOVE_PD_FILE":
      return { ...resetFrom(state, "PD"), pdFiles: state.pdFiles.filter((f) => f.id !== action.id) };

    case "SET_LGD_FILE":
      return {
        ...resetFrom(state, "LGD"),
        lgdFile: action.file,
        uploadFocus: action.file ? null : state.uploadFocus,
      };

    case "SET_EAD_FILE":
      return {
        ...resetFrom(state, "EAD"),
        eadFile: action.file,
        uploadFocus: action.file ? null : state.uploadFocus,
      };

    case "START_STEP_VALIDATING":
      return action.kind === "LGD"
        ? { ...state, lgdValidation: null, lgdStatus: "loading", lgdError: null }
        : { ...state, eadValidation: null, eadStatus: "loading", eadError: null };

    case "SET_LGD_VALIDATION":
      return { ...state, lgdValidation: action.result, lgdStatus: stepStatus(action.result.status), lgdError: null };

    case "SET_EAD_VALIDATION":
      return { ...state, eadValidation: action.result, eadStatus: stepStatus(action.result.status), eadError: null };

    case "SET_STEP_ERROR":
      return action.kind === "LGD"
        ? { ...state, lgdValidation: null, lgdStatus: "error", lgdError: action.error }
        : { ...state, eadValidation: null, eadStatus: "error", eadError: action.error };

    case "RESET_VALIDATION_FROM":
      return resetFrom(state, action.kind);

    case "SET_REVIEW_ACCEPTED":
      return { ...state, reviewAccepted: { ...state.reviewAccepted, [action.kind]: action.value } };

    case "SET_COMBINE_PD":
      return { ...state, combinePdFiles: action.value };

    case "GO_TO_STEP":
      return {
        ...state,
        prevStep: state.step,
        step: action.step,
        uploadFocus: action.step === "upload" ? state.uploadFocus : null,
      };

    case "SET_COMPUTE_PROGRESS":
      return { ...state, computeProgress: action.pct };

    case "SET_COMPUTE_STAGES":
      return { ...state, computeStages: action.stages };

    case "SET_RESULT":
      return { ...state, result: action.result };

    case "SET_FAILURE":
      return { ...state, failureDetails: action.details };

    case "OPEN_CANCEL_MODAL":
      return { ...state, cancelModalOpen: true };

    case "CLOSE_CANCEL_MODAL":
      return { ...state, cancelModalOpen: false };

    case "SET_RUN_ID":
      return { ...state, runId: action.runId, runInitError: null };

    case "SET_RUN_INIT_ERROR":
      return { ...state, runInitError: action.error };

    case "SET_UPLOAD_PROGRESS":
      return { ...state, uploadProgress: { ...state.uploadProgress, [action.fileId]: action.progress } };

    case "SET_UPLOADED_FILE_ID":
      return { ...state, uploadedFileIds: { ...state.uploadedFileIds, [action.fileId]: action.serverId } };

    case "UPDATE_FILE_STATUS": {
      const { id, status, hash, sheets, errorMessage, backendUploadId } = action;
      function patchFile(f: UploadedFile): UploadedFile {
        if (f.id !== id) return f;
        return {
          ...f,
          status,
          ...(hash !== undefined ? { hash } : {}),
          ...(sheets !== undefined ? { sheets } : {}),
          ...(errorMessage !== undefined ? { errorMessage } : {}),
          ...(backendUploadId !== undefined ? { backendUploadId } : {}),
        };
      }
      return {
        ...state,
        pdFiles: state.pdFiles.map(patchFile),
        lgdFile: state.lgdFile ? patchFile(state.lgdFile) : null,
        eadFile: state.eadFile ? patchFile(state.eadFile) : null,
      };
    }

    case "START_PD_VALIDATING":
      return { ...state, pdPreview: null, pdPreviewStatus: "loading", pdPreviewError: null, reviewAccepted: { ...state.reviewAccepted, PD: false } };

    case "SET_PD_PREVIEW":
      return {
        ...state,
        pdPreview: action.result,
        pdPreviewStatus: action.result.status === "blocking" ? "blocked" : "ready",
        pdPreviewError: null,
      };

    case "SET_PD_PREVIEW_ERROR":
      return { ...state, pdPreview: null, pdPreviewStatus: "error", pdPreviewError: action.error };

    case "CLEAR_PD_PREVIEW":
      return { ...state, pdPreview: null, pdPreviewStatus: "idle", pdPreviewError: null };

    case "REQUEST_FILE_UPLOAD":
      return {
        ...state,
        prevStep: state.step,
        step: "upload",
        uploadFocus: action.kind,
      };

    case "CLEAR_UPLOAD_FOCUS":
      return { ...state, uploadFocus: null };

    default:
      return state;
  }
}

// ── Context ────────────────────────────────────────────────────────────────

interface RunWizardContextValue {
  state: NewRunState;
  dispatch: Dispatch<NewRunAction>;
}

const RunWizardContext = createContext<RunWizardContextValue | null>(null);

export function RunWizardProvider({
  children,
  initialRunId = null,
  initialRunInitError = null,
}: {
  children: React.ReactNode;
  initialRunId?: string | null;
  initialRunInitError?: string | null;
}) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    runId: initialRunId,
    runInitError: initialRunInitError,
  });
  return (
    <RunWizardContext.Provider value={{ state, dispatch }}>
      {children}
    </RunWizardContext.Provider>
  );
}

export function useRunWizard() {
  const ctx = useContext(RunWizardContext);
  if (!ctx) throw new Error("useRunWizard must be inside RunWizardProvider");
  return ctx;
}

// ── Validation helpers ────────────────────────────────────────────────────

export function fileIsReady(file: UploadedFile | null): boolean {
  return file !== null && (file.status === "ok" || file.status === "warn");
}

export function pdFilesReady(state: NewRunState): boolean {
  return state.pdFiles.some((f) => fileIsReady(f));
}

export function nextMissingPairFile(state: NewRunState): "LGD" | "EAD" | null {
  if (!fileIsReady(state.lgdFile)) return "LGD";
  if (!fileIsReady(state.eadFile)) return "EAD";
  return null;
}

export function canReturnToValidate(state: NewRunState): boolean {
  if (!pdFilesReady(state)) return false;
  return state.prevStep === "validate" || state.pdPreviewStatus !== "idle";
}

/** One component's gate: validated, nothing blocking, review items accepted. */
export function stepCleared(
  status: "ok" | "warn" | "blocking" | undefined,
  accepted: boolean,
): boolean {
  return status === "ok" || (status === "warn" && accepted);
}

export function pdCleared(state: NewRunState): boolean {
  return state.pdPreviewStatus === "ready" && stepCleared(state.pdPreview?.status, state.reviewAccepted.PD);
}

export function lgdCleared(state: NewRunState): boolean {
  return state.lgdStatus === "ready" && stepCleared(state.lgdValidation?.status, state.reviewAccepted.LGD);
}

export function eadCleared(state: NewRunState): boolean {
  return state.eadStatus === "ready" && stepCleared(state.eadValidation?.status, state.reviewAccepted.EAD);
}

export function canContinueFrom(state: NewRunState): boolean {
  if (state.step === "upload") return pdFilesReady(state);
  if (state.step === "validate") return pdCleared(state) && lgdCleared(state) && eadCleared(state);
  return true;
}

export function getFooterHint(state: NewRunState): string {
  if (state.step === "upload") {
    return pdFilesReady(state) ? "Continue to validate PD" : "Upload a PD workbook first";
  }
  if (state.step === "validate") {
    const steps: [string, NewRunState["pdPreviewStatus"], boolean, boolean][] = [
      ["PD", state.pdPreviewStatus, pdCleared(state), !!state.pdFiles.length],
      ["LGD", state.lgdStatus, lgdCleared(state), !!state.lgdFile],
      ["EAD", state.eadStatus, eadCleared(state), !!state.eadFile],
    ];
    for (const [kind, status, cleared, uploaded] of steps) {
      if (cleared) continue;
      if (!uploaded) return `Upload ${kind} to continue`;
      if (status === "loading") return `Validating ${kind}…`;
      if (status === "blocked") return `Fix the blocking ${kind} checks and re-upload`;
      if (status === "error") return `Retry ${kind} validation`;
      if (status === "ready") return `Review and accept the ${kind} review items`;
      return `Validate ${kind} to continue`;
    }
  }
  return "Complete this step to continue";
}
