/**
 * PD-scoped validation + preview.
 *
 * Runs as a background validation job (see validation-job.ts). A finished job
 * carries `criteria` and `pd_preview` whenever the workbook was evaluated —
 * including when it blocks. An error means there was nothing to evaluate (no
 * PD file, unreadable workbook, missing run).
 */

import { ApiError } from "@/lib/api/client";
import { runValidationJob } from "@/lib/api/validation-job";
import type {
  PdCriterion,
  PdCriterionCategory,
  PdCriterionOutcome,
  PdLoanPreviewRow,
  PdPreviewResult,
  PdSegmentPreview,
  PdStage,
  ValidationIssue,
} from "@/lib/new-run-types";


const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export interface PdCriterionRaw {
  id: string;
  code: string;
  name: string;
  category: PdCriterionCategory | string;
  outcome: PdCriterionOutcome | string;
  rationale?: string;
  message?: string;
}

export interface PdLoanPreviewRowRaw {
  loan_id?: string;
  loanId?: string;
  segment: string;
  reporting_month?: string;
  reportingMonth?: string;
  reporting_month_key?: string;
  reportingMonthKey?: string;
  staging: number | string;
  next_staging?: number | string;
  nextStaging?: number | string;
  is_final_month?: boolean;
  isFinalMonth?: boolean;
}

export interface PdSegmentPreviewRaw {
  segment: string;
  matrix: number[][];
  amounts?: string[][];
  dest_labels?: string[];
  destLabels?: string[];
  proportions?: number[][];
  observed_3?: string[][];
  normalized?: number[][];
  term_structure?: number[][][];
  stats: {
    cure_rate?: number;
    cureRate?: number;
    loans_observed?: number;
    loansObserved?: number;
    months_of_history?: number;
    monthsOfHistory?: number;
  };
}

export interface PdValidationResultRaw {
  status: "ok" | "warn" | "blocking";
  criteria?: PdCriterionRaw[];
  pd_preview?: {
    loans?: PdLoanPreviewRowRaw[];
    segments?: PdSegmentPreviewRaw[];
    engine_version?: string;
    engineVersion?: string;
  };
  issues?: Array<{
    id: string;
    level: "warn" | "block";
    title: string;
    location?: string;
    fix?: string;
    category?: string | null;
  }>;
}

export function parsePdStage(value: number | string | undefined): PdStage {
  if (value === 1 || value === 2 || value === 3) return value;
  if (value === "offbooks" || value === "Offbooks" || value === 0 || value === "0") {
    return "offbooks";
  }
  const asText = String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");
  if (asText === "1" || asText === "stage1") return 1;
  if (asText === "2" || asText === "stage2") return 2;
  if (asText === "3" || asText === "stage3") return 3;
  if (asText === "offbooks") return "offbooks";
  // Unknown labels must not look like a performing loan. Offbooks is the
  // visibly-wrong badge; Stage 1 would be a silently-wrong one.
  return "offbooks";
}

export function monthKeyFromLabel(label: string): string {
  const match = label.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return label;
  const months: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  const mm = months[match[1]];
  return mm ? `${match[2]}-${mm}` : label;
}

export function monthLabelFromKey(key: string): string {
  const match = key.match(/^(\d{4})-(\d{2})$/);
  if (!match) return key;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return key;
  return `${MONTH_ABBR[month - 1]} ${match[1]}`;
}

/** Inclusive display range from YYYY-MM keys, e.g. "Oct 2024–Feb 2025". */
export function reportingPeriodLabel(keys: Iterable<string>): string {
  const unique = [...new Set(Array.from(keys).filter(Boolean))].sort();
  if (unique.length === 0) return "";
  const first = monthLabelFromKey(unique[0]);
  const last = monthLabelFromKey(unique[unique.length - 1]);
  return first === last ? first : `${first}–${last}`;
}

function mapCriterion(raw: PdCriterionRaw): PdCriterion {
  const category = raw.category as PdCriterionCategory;
  const outcome = raw.outcome as PdCriterionOutcome;
  return {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    category: ["structural", "business", "info"].includes(category) ? category : "business",
    outcome: ["pass", "review", "block", "info"].includes(outcome) ? outcome : "review",
    rationale: raw.rationale ?? raw.message ?? "",
  };
}

export function mapPdLoanPreviewRow(raw: PdLoanPreviewRowRaw): PdLoanPreviewRow {
  const reportingMonth = raw.reportingMonth ?? raw.reporting_month ?? "";
  return {
    loanId: raw.loanId ?? raw.loan_id ?? "",
    segment: raw.segment,
    reportingMonth,
    reportingMonthKey:
      raw.reportingMonthKey ?? raw.reporting_month_key ?? monthKeyFromLabel(reportingMonth),
    staging: parsePdStage(raw.staging),
    nextStaging: parsePdStage(raw.nextStaging ?? raw.next_staging),
    isFinalMonth: raw.isFinalMonth ?? raw.is_final_month ?? false,
  };
}

export function mapPdSegmentPreview(raw: PdSegmentPreviewRaw): PdSegmentPreview {
  return {
    segment: raw.segment,
    matrix: raw.matrix,
    amounts: raw.amounts,
    destLabels: raw.destLabels ?? raw.dest_labels,
    proportions: raw.proportions,
    observed3: raw.observed_3,
    normalized: raw.normalized,
    termStructure: raw.term_structure,
    stats: {
      cureRate: raw.stats.cureRate ?? raw.stats.cure_rate ?? 0,
      loansObserved: raw.stats.loansObserved ?? raw.stats.loans_observed ?? 0,
      monthsOfHistory: raw.stats.monthsOfHistory ?? raw.stats.months_of_history ?? 0,
    },
  };
}

export function mapPdValidationResult(raw: PdValidationResultRaw): PdPreviewResult {
  const preview = raw.pd_preview;
  const criteria = (raw.criteria ?? []).map(mapCriterion);
  const mappedIssues: ValidationIssue[] | undefined = raw.issues?.map((issue) => ({
    id: issue.id,
    level: issue.level,
    title: issue.title,
    location: issue.location ?? "—",
    fix: issue.fix ?? "",
    category: issue.category ?? null,
  }));
  const issues = mappedIssues?.length
    ? mappedIssues
    : criteria
        .filter((c) => c.outcome === "block")
        .map((c) => ({
          id: c.id,
          level: "block" as const,
          title: `${c.code} · ${c.name}`,
          location: "—",
          fix: c.rationale,
          category: null,
        }));

  return {
    status: raw.status,
    criteria,
    loans: (preview?.loans ?? []).map(mapPdLoanPreviewRow),
    segments: (preview?.segments ?? []).map(mapPdSegmentPreview),
    engineVersion: preview?.engineVersion ?? preview?.engine_version ?? "",
    isMock: false,
    issues: issues.length ? issues : undefined,
  };
}

export async function validatePdRun(
  token: string,
  tenantId: string,
  runId: string,
): Promise<PdPreviewResult> {
  const raw = await runValidationJob<PdValidationResultRaw>(token, tenantId, runId, "pd");
  if (!raw.criteria?.length || !raw.pd_preview) {
    throw new ApiError(
      "INVALID_PD_PREVIEW",
      "The server returned a PD validation response without a checklist or preview.",
      502,
    );
  }
  return mapPdValidationResult(raw);
}

export function countPdCriteria(criteria: PdCriterion[]): {
  passed: number;
  review: number;
  blocked: number;
} {
  return {
    passed: criteria.filter((c) => c.outcome === "pass").length,
    review: criteria.filter((c) => c.outcome === "review").length,
    blocked: criteria.filter((c) => c.outcome === "block").length,
  };
}
