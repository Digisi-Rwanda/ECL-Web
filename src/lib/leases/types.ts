import type { ISODate } from "./dates";
import type { AccountKey, DayCount, EventType, JournalKind, LeaseTerms } from "./engine";

export type Role = "administrator" | "analyst" | "reviewer";

export interface Persona {
  id: string;
  name: string;
  initials: string;
  role: Role;
  title: string;
}

export type AssetClass = "property" | "vehicles" | "equipment" | "it" | "land";
export const ASSET_CLASSES: Record<AssetClass, string> = {
  property: "Property",
  vehicles: "Vehicles",
  equipment: "Equipment",
  it: "IT & data centre",
  land: "Land",
};

export interface Entity {
  id: string;
  name: string;
  currency: string;
  country: string;
  fyStartMonth: number;
}

export interface Book {
  id: string;
  entityId: string;
  name: string;
  framework: "IFRS16";
  standardVersion: string;
}

export type ApprovalStatus = "draft" | "in_review" | "approved" | "superseded";

export interface Versioned {
  version: number;
  effectiveFrom: ISODate;
  status: ApprovalStatus;
  reason: string;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface PolicyVersion extends Versioned {
  dayCount: DayCount;
  shortTermClasses: AssetClass[];
  lowValueElection: boolean;
  lowValueThreshold: string;
  separateNonLeaseClasses: AssetClass[];
  capitalisationThreshold: string;
}

export interface CurvePoint {
  currency: string;
  termYears: number;
  rate: string; // decimal, e.g. "0.0875"
}

export interface IbrCurve extends Versioned {
  source: string;
  points: CurvePoint[];
}

export interface GlMapping extends Versioned {
  accounts: Record<AccountKey, string>;
}

export interface Period {
  key: string; // YYYY-MM
  status: "open" | "closing" | "locked";
  lockedBy?: string;
  lockedAt?: string;
  reopenLog: Array<{ by: string; at: string; reason: string }>;
}

export interface Counterparty {
  id: string;
  name: string;
  vendorRef?: string;
}

export interface OptionItem {
  id: string;
  type: "renewal" | "termination";
  months: number;
  noticeDate?: ISODate;
  reasonablyCertain: boolean | null;
  rationale: string;
}

export interface Assessment {
  identifiedAsset: boolean | null;
  rightToControl: boolean | null;
  exemption: "none" | "short_term" | "low_value" | null;
  exemptionRationale: string;
  options: OptionItem[];
  purchaseOption: { exists: boolean; reasonablyCertain: boolean | null; rationale: string };
  termRationale: string;
}

export interface RateChoice {
  value: string;
  source: "curve" | "override" | "implicit";
  curveVersion?: number;
  termYears?: number;
  reason?: string;
}

export interface Comment {
  id: string;
  by: string;
  at: string;
  text: string;
  field?: string;
  kind: "comment" | "return" | "approve" | "submit" | "withdraw";
}

export type VersionStatus = "draft" | "in_review" | "returned" | "approved" | "superseded" | "withdrawn";

export interface LeaseVersion {
  n: number;
  status: VersionStatus;
  event: EventType;
  effectiveDate: ISODate;
  reason: string;
  terms: LeaseTerms;
  assessment: Assessment;
  rate: RateChoice;
  scopeDecrease?: string;
  terminationPenalty?: string;
  createdBy: string;
  createdAt: string;
  submittedBy?: string;
  submittedAt?: string;
  approverId?: string;
  decidedBy?: string;
  decidedAt?: string;
  comments: Comment[];
  /** set by "Calculate"; cleared whenever inputs change */
  calculated?: { at: string; liability: string; rou: string; checksOk: boolean };
}

export interface LeaseDoc {
  id: string;
  name: string;
  size: number;
  sha256: string;
  kind: "contract" | "amendment" | "evidence";
  uploadedBy: string;
  uploadedAt: string;
  versionN: number;
}

export interface Lease {
  id: string;
  code: string;
  name: string;
  assetClass: AssetClass;
  counterpartyId: string;
  entityId: string;
  location: string;
  currency: string;
  ownerId: string;
  costCentre: string;
  contractTotal?: string;
  /** end of the non-cancellable period; options reasonably certain extend/shorten terms.endDate */
  contractEndDate?: ISODate;
  signatureDate?: ISODate;
  versions: LeaseVersion[];
  docs: LeaseDoc[];
  wizardStep: number;
  createdAt: string;
  updatedAt: string;
  /** optimistic-lock revision, bumped on every write */
  rev: number;
  importBatchId?: string;
  /** nightly check found stored books differ from a fresh recomputation */
  verificationFailed?: boolean;
}

export type LeaseStatus =
  | "draft" | "in_review" | "returned" | "active" | "not_commenced" | "exempt" | "expired" | "terminated";

export interface PostedLine {
  leaseId: string;
  account: AccountKey;
  kind: JournalKind;
  debit: string;
  credit: string;
  catchUp: boolean;
}

export type BatchStatus = "draft" | "approved" | "exported" | "posted" | "reversed";

export interface JournalBatch {
  id: string;
  period: string;
  type: "period" | "reversal";
  status: BatchStatus;
  lines: PostedLine[];
  createdAt: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  exportedAt?: string;
  erpRef?: string;
  postedAt?: string;
  postedBy?: string;
  reversalOf?: string;
  reversedBy?: string;
  idempotencyKey: string;
  sourceRevs?: string;
}

export type CloseStepId = "cutoff" | "rates" | "events" | "generate" | "matching" | "reconcile" | "approve" | "post";

export interface CloseStep {
  id: CloseStepId;
  status: "locked" | "todo" | "running" | "done" | "warning";
  doneBy?: string;
  doneAt?: string;
  note?: string;
  progress?: number;
}

export interface ActualPayment {
  id: string;
  date: ISODate;
  vendor: string;
  amount: string;
  reference: string;
  leaseId?: string;
  expected?: string;
  match: "matched" | "late" | "different" | "unmatched";
  resolution?: "accrue" | "event" | "not_lease" | "accepted";
  resolutionNote?: string;
  resolvedBy?: string;
}

export interface CloseRun {
  period: string;
  steps: CloseStep[];
  batchId?: string;
  payments: ActualPayment[];
  startedBy: string;
  startedAt: string;
}

export interface ImportRowIssue {
  row: number;
  column: string;
  severity: "error" | "warning";
  message: string;
}

export interface ImportRow {
  row: number;
  ref: string;
  name: string;
  values: Record<string, string>;
  issues: ImportRowIssue[];
  action: "create" | "update" | "skip";
  leaseId?: string;
  outcome?: "created" | "updated" | "failed" | "skipped";
  outcomeMessage?: string;
}

export interface ImportBatch {
  id: string;
  fileName: string;
  sha256: string;
  size: number;
  status: "uploaded" | "mapping" | "validating" | "validated" | "committing" | "committed" | "failed" | "cancelled";
  progress: number;
  headers: string[];
  mapping: Record<string, string>;
  rows: ImportRow[];
  warningsAccepted: boolean;
  createdBy: string;
  createdAt: string;
  committedBy?: string;
  committedAt?: string;
  templateVersion: string;
}

export interface Notification {
  id: string;
  at: string;
  to: string; // persona id or "*"
  title: string;
  body: string;
  href: string;
  read: boolean;
}

export interface AuditEntry {
  id: string;
  at: string;
  by: string;
  action: string;
  target: string;
  detail?: string;
}

export interface LeasesState {
  schema: 1;
  tenantId: string;
  seededAs: "sample" | "empty" | "server";
  personaId: string;
  personas: Persona[];
  entity?: Entity;
  book?: Book;
  periods: Period[];
  policies: PolicyVersion[];
  curves: IbrCurve[];
  gl: GlMapping[];
  counterparties: Counterparty[];
  leases: Lease[];
  batches: JournalBatch[];
  closes: CloseRun[];
  imports: ImportBatch[];
  notifications: Notification[];
  audit: AuditEntry[];
  /** posted cumulative amounts per lease/account through the last locked period */
  posted: Record<string, Record<string, string>>;
  savedViews: Array<{ id: string; name: string; query: string }>;
  importMapping?: Record<string, string>;
  seq: { lease: number; batch: number; import: number; id: number };
  /** server-computed close step issues + reconciliations, per non-locked close */
  closeIssues?: Record<string, {
    steps: Partial<Record<CloseStepId, { errors: string[]; warnings: string[] }>>;
    reconciliations: Array<{ id: string; label: string; books: string; gl: string; ok: boolean; diff: string }>;
    sourceChecksum: string;
  }>;
  /** the signed-in user's role in this workspace */
  role?: Role;
}
