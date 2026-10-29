/**
 * LGD → EAD validation lane and the ECL report (spec "ECL Calculation
 * Specification" v1.0). The server computes every number; this module only
 * moves payloads and maps snake_case names.
 *
 * POST /tenants/{id}/runs/{runId}/validate?scope=lgd|ead
 * POST /tenants/{id}/runs/{runId}/validation/{kind}/accept
 * GET  /tenants/{id}/runs/{runId}/ecl/preview-export
 * GET  /tenants/{id}/runs/{runId}/ecl-report
 * GET  /tenants/{id}/runs/{runId}/exceptions
 */
import { apiFetch, ApiError } from "@/lib/api/client";
import { buildApiPath } from "@/lib/env";
import type {
  EadValidationResult,
  EclReport,
  ExceptionsPage,
  FileInputType,
  LgdValidationResult,
  PdCriterion,
} from "@/lib/new-run-types";

const VALIDATE_TIMEOUT_MS = 180_000;

interface RawResult<P> {
  status: "ok" | "warn" | "blocking";
  criteria: PdCriterion[];
  preview: P | null;
  engine_version: string;
}

export async function validateLgdRun(token: string, tenantId: string, runId: string): Promise<LgdValidationResult> {
  const raw = await apiFetch<RawResult<LgdValidationResult["preview"]>>(
    `/tenants/${tenantId}/runs/${runId}/validate?scope=lgd`,
    { method: "POST", body: JSON.stringify({}), token, timeoutMs: VALIDATE_TIMEOUT_MS },
  );
  return { status: raw.status, criteria: raw.criteria, preview: raw.preview, engineVersion: raw.engine_version };
}

export async function validateEadRun(token: string, tenantId: string, runId: string): Promise<EadValidationResult> {
  const raw = await apiFetch<RawResult<EadValidationResult["preview"]>>(
    `/tenants/${tenantId}/runs/${runId}/validate?scope=ead`,
    { method: "POST", body: JSON.stringify({}), token, timeoutMs: VALIDATE_TIMEOUT_MS },
  );
  return { status: raw.status, criteria: raw.criteria, preview: raw.preview, engineVersion: raw.engine_version };
}

export async function acceptReview(token: string, tenantId: string, runId: string, kind: FileInputType): Promise<void> {
  await apiFetch(`/tenants/${tenantId}/runs/${runId}/validation/${kind}/accept`, {
    method: "POST",
    body: JSON.stringify({}),
    token,
  });
}

export async function getEclReport(token: string, tenantId: string, runId: string): Promise<EclReport> {
  return apiFetch<EclReport>(`/tenants/${tenantId}/runs/${runId}/ecl-report`, { token });
}

export async function getRunExceptions(
  token: string,
  tenantId: string,
  runId: string,
  { page = 1, perPage = 50, category }: { page?: number; perPage?: number; category?: string } = {},
): Promise<ExceptionsPage> {
  const q = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (category) q.set("category", category);
  return apiFetch<ExceptionsPage>(`/tenants/${tenantId}/runs/${runId}/exceptions?${q}`, { token });
}

export async function downloadEclPreview(token: string, tenantId: string, runId: string): Promise<void> {
  const res = await fetch(buildApiPath(`/tenants/${tenantId}/runs/${runId}/ecl/preview-export`), {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) throw new ApiError("DOWNLOAD_FAILED", "Loan Detail preview download failed.", res.status);
  const name =
    /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "Preview - ECL Loan Detail.xlsx";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
