import type { PdLoanPreviewRowRaw, PdSegmentPreviewRaw } from "./pd-validation";
import { apiFetch } from "./client";

// ── Raw backend shapes ────────────────────────────────────────────────────

export interface SegmentDataRaw {
  name: string;
  mix?: [number, number, number];
  stage1_pct?: number;
  stage2_pct?: number;
  stage3_pct?: number;
  ecl: number;
  outstanding: number;
  coverage: number | string;
  loans: number;
  delta?: number;
}

export interface RunContextRaw {
  runId: string;
  period: string;
  computedAt: string;
  engineVersion: string;
  currency: string;
}

export interface PortfolioRaw {
  runContext?: RunContextRaw;
  segments: SegmentDataRaw[];
  totals?: {
    ecl: number;
    outstanding: number;
    loans: number;
    coverage: string;
  };
}

export interface LoanRowRaw {
  id: string;
  customer: string;
  stage: number;
  pd: number;
  lgd: number;
  ead: number;
  ecl: number;
}

export interface MonthlyRundownRaw {
  month: number;
  marginal_pd?: number;
  cumulative_pd?: number;
  ead: number;
  ecl: number;
}

export interface LoanDetailRaw extends LoanRowRaw {
  segment: string;
  outstanding: number;
  collateral_value?: number;
  maturity?: string;
  rundown?: MonthlyRundownRaw[];
}

export interface SegmentRateStatsRaw {
  cureRate?: number;
  cure_rate?: number;
  avgLgd?: number | null;
  avg_lgd?: number | null;
  avgPd12m?: number | null;
  avg_pd_12m?: number | null;
}

export interface SegmentViewRaw {
  name: string;
  pdMatrix?: [[number, number, number], [number, number, number], [number, number, number]];
  pd_matrix?: [[number, number, number], [number, number, number], [number, number, number]];
  pdObservation?: PdSegmentPreviewRaw;
  pd_observation?: PdSegmentPreviewRaw;
  pdLoans?: PdLoanPreviewRowRaw[];
  pd_loans?: PdLoanPreviewRowRaw[];
  rateStats?: SegmentRateStatsRaw;
  rate_stats?: SegmentRateStatsRaw;
  loans: LoanRowRaw[];
  meta?: {
    total: number;
    page: number;
    per_page: number;
    pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
  total?: number;
  page?: number;
  per_page?: number;
}

// ── API functions ─────────────────────────────────────────────────────────

export interface FetchPortfolioParams {
  run_id?: string;
  stage?: string;
  min_ecl?: number;
}

export interface FetchSegmentParams {
  run_id?: string;
  stage?: string;
  min_ecl?: number;
  page?: number;
  per_page?: number;
}

export interface FetchLoanParams {
  run_id?: string;
}

export async function fetchPortfolio(
  token: string,
  tenantId: string,
  params?: FetchPortfolioParams,
): Promise<PortfolioRaw> {
  const qs = new URLSearchParams();
  if (params?.run_id) qs.set("run_id", params.run_id);
  if (params?.stage) qs.set("stage", params.stage);
  if (params?.min_ecl != null) qs.set("min_ecl", String(params.min_ecl));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<PortfolioRaw>(`/tenants/${tenantId}/results${query}`, { token });
}

export async function fetchSegmentResults(
  token: string,
  tenantId: string,
  segmentName: string,
  params?: FetchSegmentParams,
): Promise<SegmentViewRaw> {
  const qs = new URLSearchParams();
  if (params?.run_id) qs.set("run_id", params.run_id);
  if (params?.stage) qs.set("stage", params.stage);
  if (params?.min_ecl != null) qs.set("min_ecl", String(params.min_ecl));
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<SegmentViewRaw>(
    `/tenants/${tenantId}/results/segments/${encodeURIComponent(segmentName)}${query}`,
    { token },
  );
}

export async function fetchLoanResults(
  token: string,
  tenantId: string,
  loanId: string,
  params?: FetchLoanParams,
): Promise<LoanDetailRaw> {
  const qs = new URLSearchParams();
  if (params?.run_id) qs.set("run_id", params.run_id);
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<LoanDetailRaw>(
    `/tenants/${tenantId}/results/loans/${encodeURIComponent(loanId)}${query}`,
    { token },
  );
}
