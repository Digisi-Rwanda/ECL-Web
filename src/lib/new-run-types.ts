// ── Step machine ───────────────────────────────────────────────────────────

export type NewRunStep =
  | "upload"
  | "validate"
  | "confirm"
  | "compute"
  | "success"
  | "failure";

export const STEP_ORDER: NewRunStep[] = ["upload", "validate", "confirm", "compute"];

export function stepIndex(step: NewRunStep): number {
  const idx = STEP_ORDER.indexOf(step);
  return idx === -1 ? STEP_ORDER.length : idx;
}

// ── Uploaded file ──────────────────────────────────────────────────────────

export type FileInputType = "PD" | "LGD" | "EAD";
export type FileStatus = "ok" | "warn" | "error" | "scan";

export interface UploadedFile {
  id: string;
  name: string;
  size: string;        // "2.4 MB"
  sheets: number;
  type: FileInputType;
  status: FileStatus;
  hash: string;        // "a3f9…2c1b"
  errorMessage?: string;
  backendUploadId?: string;
}

// ── Validation ────────────────────────────────────────────────────────────

export interface ValidationIssue {
  id: string;
  level: "warn" | "block";
  title: string;
  location: string;
  fix: string;
  category?: string | null;
}

export interface ValidationFileResult {
  file: UploadedFile;
  issues: ValidationIssue[];
}


// ── PD-first preview (validate-time, before LGD/EAD) ───────────────────────

export type PdCriterionOutcome = "pass" | "review" | "block" | "info";
export type PdCriterionCategory = "structural" | "business" | "info";
export type PdStage = 1 | 2 | 3 | "offbooks";
export type PdPreviewStatus = "idle" | "loading" | "ready" | "blocked" | "error";

export interface PdCriterion {
  id: string;
  code: string;
  name: string;
  category: PdCriterionCategory;
  outcome: PdCriterionOutcome;
  rationale: string;
}

export interface PdLoanPreviewRow {
  loanId: string;
  segment: string;
  reportingMonth: string;
  reportingMonthKey: string;
  staging: PdStage;
  nextStaging: PdStage;
  /** True when this row is the segment's last month — Offbooks here is end-of-window, not an exit. */
  isFinalMonth?: boolean;
}

export interface PdPreviewStats {
  cureRate: number;
  loansObserved: number;
  monthsOfHistory: number;
}

export interface PdSegmentPreview {
  segment: string;
  /** 3×3 or 3×4 (Offbooks) row-normalized probabilities. */
  matrix: number[][];
  amounts?: string[][];
  destLabels?: string[];
  stats: PdPreviewStats;
  /** Spec Step 1: 3×3 shares with Offbooks dropped (rows sum to 1). */
  proportions?: number[][];
  /** Step 1 input balances (3×3), server-formatted. */
  observed3?: string[][];
  /** Spec Step 3: Stage 1 = [A11, A12+A13, 0], Stage 3 absorbing. */
  normalized?: number[][];
  /** Steps 4–7: [transition][month-1] = [Stage 1, Stage 2, Stage 3, Marginal PD]. */
  termStructure?: number[][][];
}

export interface PdPreviewResult {
  status: "ok" | "warn" | "blocking";
  criteria: PdCriterion[];
  loans: PdLoanPreviewRow[];
  segments: PdSegmentPreview[];
  engineVersion: string;
  isMock: boolean;
  issues?: ValidationIssue[];
}

// ── LGD / EAD validation and ECL report (spec v1.0) ───────────────────────

export type EclStepStatus = "idle" | "loading" | "ready" | "blocked" | "error";

export interface EclException {
  category: string;
  dataset: string;
  loanId: string;
  customerId: string;
  field: string;
  value: string;
  issue: string;
  action: string;
}

export interface ReconciliationCheck {
  name: string;
  expected: number;
  actual: number;
  difference: number;
  passed: boolean;
  detail: string;
}

export interface SummaryRow {
  key: string;
  outstanding: number;
  ecl: number;
  /** Fraction. */
  coverage: number;
}

export interface EclTotals {
  outstanding: number;
  ecl: number;
  eclBeforeCap: number;
  coverage: number;
  loans: number;
  excludedRows: number;
  cappedLoans: number;
}

export interface CollateralParameter {
  name: string;
  haircut: number | null;
  years: number | null;
  valid: boolean;
}

export interface LgdLoan {
  loanId: string;
  customerId: string;
  outstanding: number;
  totalCustomerExposure: number;
  proportion: number;
  collateralEir: number;
  /** Per type: [customer value, allocated, discounted]. */
  collateral: Record<string, [number, number, number]>;
  discountedCollateral: number;
}

export interface LgdPreview {
  provisional: boolean;
  parameters: CollateralParameter[];
  loans: LgdLoan[];
  loanCount: number;
  exceptions: EclException[];
  exceptionCount: number;
}

export interface LgdValidationResult {
  status: "ok" | "warn" | "blocking";
  criteria: PdCriterion[];
  preview: LgdPreview | null;
  engineVersion: string;
}

export interface EadLoan {
  loanId: string;
  customerId: string;
  segment: string;
  stage: string;
  treatment: string;
  outstanding: number;
  discountedCollateral: number;
  rows: number;
  eclBeforeCap: number;
  totalEcl: number;
  capped: boolean;
}

export interface EadPreview {
  reportingDate: string | null;
  reportingDateSource: "run" | "file";
  loans: EadLoan[];
  loanCount: number;
  rows: { columns: string[]; data: (number | string | null)[][] };
  rowLoanCount: number;
  totals: EclTotals;
  stageSummary: SummaryRow[];
  segmentSummary: SummaryRow[];
  reconciliation: ReconciliationCheck[];
  exceptions: EclException[];
  exceptionCounts: Record<string, number>;
  excluded: { loanId: string; customerId: string; outstanding: number | null; reason: string }[];
}

export interface EadValidationResult {
  status: "ok" | "warn" | "blocking";
  criteria: PdCriterion[];
  preview: EadPreview | null;
  engineVersion: string;
}

export interface EclReport {
  runId: string;
  reportingDate: string | null;
  specVersion: string;
  engineVersion: string;
  totals: EclTotals;
  stageSummary: SummaryRow[];
  segmentSummary: SummaryRow[];
  reconciliation: ReconciliationCheck[];
  exceptionCounts: Record<string, number>;
}

export interface ExceptionsPage {
  items: EclException[];
  total: number;
  page: number;
  perPage: number;
}

// ── Compute ────────────────────────────────────────────────────────────────

export type ComputeStageStatus = "pending" | "active" | "done" | "error";

export interface ComputeStage {
  id: string;
  title: string;
  description: string;
  status: ComputeStageStatus;
  elapsed?: string;
  durationMs: number;
}

export const DEFAULT_COMPUTE_STAGES: Omit<ComputeStage, "status">[] = [
  { id: "pd",  title: "PD engine",    description: "Transition matrices · 299 monthly powers", durationMs: 1600 },
  { id: "lgd", title: "LGD engine",   description: "Input rules · discounted collateral",       durationMs: 2000 },
  { id: "ead", title: "EAD engine",   description: "Snapshots · instalments · missed payments",  durationMs: 1600 },
  { id: "ecl", title: "ECL assembly", description: "EAD × PD × LGD · cap · reconciliation",    durationMs: 1200 },
];

// ── Result ────────────────────────────────────────────────────────────────

export interface RunResult {
  id: string;          // short "c81a…77fe"
  fullId: string;
  totalEcl: number;
  coverageRatio: string;
  currency: string;
}

// ── Wizard state ──────────────────────────────────────────────────────────

export interface NewRunState {
  step: NewRunStep;
  prevStep: NewRunStep;
  runName: string;
  runId: string | null;
  runInitError: string | null;
  pdFiles: UploadedFile[];
  lgdFile: UploadedFile | null;
  eadFile: UploadedFile | null;
  combinePdFiles: boolean;
  pdPreview: PdPreviewResult | null;
  pdPreviewStatus: PdPreviewStatus;
  pdPreviewError: string | null;
  computeProgress: number;
  computeStages: ComputeStage[];
  result: RunResult | null;
  failureDetails: { stage: string; message: string; ref: string } | null;
  cancelModalOpen: boolean;
  uploadProgress: Record<string, number>;
  uploadedFileIds: Record<string, string>;
  /** When returning to Upload from Validate, scroll to and highlight this zone. */
  uploadFocus: FileInputType | null;
  lgdValidation: LgdValidationResult | null;
  lgdStatus: EclStepStatus;
  lgdError: string | null;
  eadValidation: EadValidationResult | null;
  eadStatus: EclStepStatus;
  eadError: string | null;
  /** Review items accepted per component (server records it too). */
  reviewAccepted: Record<FileInputType, boolean>;
}

// ── Actions ───────────────────────────────────────────────────────────────

export type NewRunAction =
  | { type: "SET_RUN_NAME"; name: string }
  | { type: "SET_RUN_ID"; runId: string }
  | { type: "SET_RUN_INIT_ERROR"; error: string | null }
  | { type: "ADD_PD_FILE"; file: UploadedFile }
  | { type: "REMOVE_PD_FILE"; id: string }
  | { type: "SET_LGD_FILE"; file: UploadedFile | null }
  | { type: "SET_EAD_FILE"; file: UploadedFile | null }
  | { type: "SET_COMBINE_PD"; value: boolean }
  | { type: "GO_TO_STEP"; step: NewRunStep }
  | { type: "SET_COMPUTE_PROGRESS"; pct: number }
  | { type: "SET_COMPUTE_STAGES"; stages: ComputeStage[] }
  | { type: "SET_RESULT"; result: RunResult }
  | { type: "SET_FAILURE"; details: { stage: string; message: string; ref: string } }
  | { type: "OPEN_CANCEL_MODAL" }
  | { type: "CLOSE_CANCEL_MODAL" }
  | { type: "SET_UPLOAD_PROGRESS"; fileId: string; progress: number }
  | { type: "SET_UPLOADED_FILE_ID"; fileId: string; serverId: string }
  | { type: "UPDATE_FILE_STATUS"; id: string; status: FileStatus; hash?: string; sheets?: number; errorMessage?: string; backendUploadId?: string }
  | { type: "START_PD_VALIDATING" }
  | { type: "SET_PD_PREVIEW"; result: PdPreviewResult }
  | { type: "SET_PD_PREVIEW_ERROR"; error: string }
  | { type: "CLEAR_PD_PREVIEW" }
  | { type: "REQUEST_FILE_UPLOAD"; kind: FileInputType }
  | { type: "CLEAR_UPLOAD_FOCUS" }
  | { type: "START_STEP_VALIDATING"; kind: "LGD" | "EAD" }
  | { type: "SET_LGD_VALIDATION"; result: LgdValidationResult }
  | { type: "SET_EAD_VALIDATION"; result: EadValidationResult }
  | { type: "SET_STEP_ERROR"; kind: "LGD" | "EAD"; error: string }
  | { type: "RESET_VALIDATION_FROM"; kind: FileInputType }
  | { type: "SET_REVIEW_ACCEPTED"; kind: FileInputType; value: boolean };
