import {
  apiFetch,
  ApiError,
  refreshAccessToken,
  SERVER_FETCH_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
} from "./client";
import { buildApiPath } from "@/lib/env";

export { checkBackendAvailable } from "./client";

// ── Raw backend shapes (camelCase — matches RunListItemOut / RunDetailOut) ──

export interface RunListItemRaw {
  id: string;
  fullId: string;
  name: string;
  period: string;
  createdAt: string;
  byInitials: string;
  byName: string;
  status: string;
  eclAmount: number | null;
  coverage: string | null;
  currency: string;
}

export interface RunInputFileRaw {
  type: "PD" | "LGD" | "EAD";
  name: string;
  size: string;
  sheets: number;
  validationStatus: "ok" | "warn" | "error";
  warningCount?: number | null;
  hash: string;
}

export interface AuditEventRaw {
  id: string;
  kind: "ok" | "err" | "accent" | "default";
  iconName: string;
  title: string;
  description: string;
  who: string;
  time: string;
}

export interface EngineProgressStageRaw {
  status: "pending" | "queued" | "running" | "complete" | "failed";
  started_at?: string | null;
  finished_at?: string | null;
  elapsed_ms?: number | null;
}

export interface EngineProgressRaw {
  pd: EngineProgressStageRaw;
  lgd: EngineProgressStageRaw;
  ead: EngineProgressStageRaw;
  ecl: EngineProgressStageRaw;
}

export interface FailureDetailsRaw {
  stage: string;
  message: string;
  ref: string;
}

export interface RunDetailRaw extends RunListItemRaw {
  elapsed?: string | null;
  kpis?: Array<{
    id: string;
    label: string;
    helpText?: string | null;
    currencyPrefix?: string | null;
    value: string;
    delta?: number | null;
    deltaDir?: "up" | "down" | "flat" | null;
    subNote?: string | null;
    staleAsOf?: string | null;
  }>;
  segments?: Array<{ name: string; value: number }>;
  inputFiles?: RunInputFileRaw[];
  auditEvents?: AuditEventRaw[];
  engineInfo?: {
    version: string;
    releasedDate: string;
    pdMethod: string;
    lgdMethod: string;
    eadMethod: string;
    pdFilesCombined: boolean;
    deterministic: boolean;
  };
  engineProgress?: EngineProgressRaw | null;
  failureDetails?: FailureDetailsRaw | null;
  deletedBy?: string | null;
  deletedAt?: string | null;
  acceptedWarnings?: number | null;
  workbooksStatus?: string | null;
}

export interface UploadResultRaw {
  id: string;
  kind: "PD" | "LGD" | "EAD";
  filename: string;
  size_bytes?: number;
  sizeBytes?: number;
  sheet_count?: number;
  sheetCount?: number;
  row_count?: number;
  rowCount?: number;
  sha256: string;
}

export interface DownloadUrlRaw {
  url: string;
  expires_at: string;
}

// ── API functions ─────────────────────────────────────────────────────────

export interface FetchRunsParams {
  page?: number;
  per_page?: number;
  status?: string;
  search?: string;
}

export interface FetchRunsResult {
  items: RunListItemRaw[];
  meta: { page: number; per_page: number; total: number };
}

export async function fetchRuns(
  token: string,
  tenantId: string,
  params?: FetchRunsParams,
): Promise<FetchRunsResult> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString() ? `?${qs.toString()}` : "";

  const controller =
    typeof window === "undefined" ? new AbortController() : null;
  const timeoutId =
    controller &&
    setTimeout(() => controller.abort(), SERVER_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(buildApiPath(`/tenants/${tenantId}/runs${query}`), {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
      signal: controller?.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(
        body.code ?? "API_ERROR",
        body.detail ?? "Request failed.",
        res.status,
      );
    }
    return {
      items: (body.data ?? []) as RunListItemRaw[],
      meta: body.meta ?? { page: 1, per_page: 50, total: 0 },
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(
        "TIMEOUT",
        "The request timed out. Please try again.",
        408,
      );
    }
    if (err instanceof TypeError) {
      throw new ApiError(
        "NETWORK_ERROR",
        "We couldn't connect to the service. Check your internet connection and try again.",
        0,
      );
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function fetchRun(
  token: string,
  tenantId: string,
  runId: string,
  opts?: { view?: "full" | "progress" },
): Promise<RunDetailRaw> {
  const query = opts?.view && opts.view !== "full" ? `?view=${opts.view}` : "";
  return apiFetch<RunDetailRaw>(`/tenants/${tenantId}/runs/${runId}${query}`, { token });
}

export async function createRun(
  token: string,
  tenantId: string,
  body: { name: string; reporting_period?: string },
): Promise<RunDetailRaw> {
  return apiFetch<RunDetailRaw>(`/tenants/${tenantId}/runs`, {
    method: "POST",
    body: JSON.stringify(body),
    token,
  });
}

export async function updateRun(
  token: string,
  tenantId: string,
  runId: string,
  body: { combine_pd_files?: boolean; name?: string; reporting_period?: string; reporting_date?: string | null },
): Promise<RunDetailRaw> {
  return apiFetch<RunDetailRaw>(`/tenants/${tenantId}/runs/${runId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteRun(
  token: string,
  tenantId: string,
  runId: string,
): Promise<void> {
  return apiFetch<void>(`/tenants/${tenantId}/runs/${runId}`, {
    method: "DELETE",
    token,
  });
}

export async function rerunRun(
  token: string,
  tenantId: string,
  runId: string,
  body?: { name?: string },
): Promise<RunDetailRaw> {
  return apiFetch<RunDetailRaw>(`/tenants/${tenantId}/runs/${runId}/rerun`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
    token,
  });
}

export async function executeRun(
  token: string,
  tenantId: string,
  runId: string,
): Promise<{ run_id: string; status: string }> {
  return apiFetch<{ run_id: string; status: string }>(
    `/tenants/${tenantId}/runs/${runId}/execute`,
    { method: "POST", body: JSON.stringify({}), token },
  );
}

export type OutputArtifactKind =
  | "PD_CALCS"
  | "LOAN_DETAIL"
  | "PORTFOLIO_SUMMARY"
  | "LGD"
  | "RUNDOWN"
  | "ECL_SUMMARY";

const ARTIFACT_DEFAULT_FILENAMES: Record<OutputArtifactKind, string> = {
  PD_CALCS: "PD Calcs.xlsx",
  LOAN_DETAIL: "ECL Loan Detail.xlsx",
  PORTFOLIO_SUMMARY: "ECL Portfolio Summary.xlsx",
  LGD: "LGD.xlsx",
  RUNDOWN: "Contractual Rundown.xlsx",
  ECL_SUMMARY: "ECL Summary.xlsx",
};

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) return decodeURIComponent(encoded[1]);
  const match = /filename="([^"]+)"/i.exec(header);
  return match?.[1] ?? fallback;
}

/** Downloads one uploaded input file ("PD" | "LGD" | "EAD") or all of them as a zip ("bundle"). */
export async function downloadRunInput(
  token: string,
  tenantId: string,
  runId: string,
  kind: "PD" | "LGD" | "EAD" | "bundle",
): Promise<void> {
  const path = kind === "bundle" ? "inputs/bundle" : `inputs/${kind}/file`;
  const res = await fetch(buildApiPath(`/tenants/${tenantId}/runs/${runId}/${path}`), {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    throw new ApiError("DOWNLOAD_FAILED", "Input file download failed.", res.status);
  }
  const fallback = kind === "bundle" ? `ECL_${runId}_inputs.zip` : `ECL_${runId}_${kind}.xlsx`;
  triggerBlobDownload(
    await res.blob(),
    filenameFromContentDisposition(res.headers.get("Content-Disposition"), fallback),
  );
}

export async function getDownloadUrl(
  token: string,
  tenantId: string,
  runId: string,
  kind: OutputArtifactKind,
): Promise<DownloadUrlRaw> {
  return apiFetch<DownloadUrlRaw>(
    `/tenants/${tenantId}/runs/${runId}/downloads/${kind}`,
    { token },
  );
}

export async function downloadRunArtifactFile(
  token: string,
  tenantId: string,
  runId: string,
  kind: OutputArtifactKind,
): Promise<void> {
  const res = await fetch(
    buildApiPath(`/tenants/${tenantId}/runs/${runId}/downloads/${kind}/file`),
    {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    },
  );
  if (!res.ok) {
    throw new ApiError("DOWNLOAD_FAILED", "Workbook download failed.", res.status);
  }
  const blob = await res.blob();
  triggerBlobDownload(
    blob,
    filenameFromContentDisposition(res.headers.get("Content-Disposition"), ARTIFACT_DEFAULT_FILENAMES[kind]),
  );
}

/** PD Calcs.xlsx built from the PD upload alone — available before LGD/EAD. */
export async function downloadPdExport(token: string, tenantId: string, runId: string): Promise<void> {
  const res = await fetch(buildApiPath(`/tenants/${tenantId}/runs/${runId}/pd/export`), {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    throw new ApiError("DOWNLOAD_FAILED", "PD workbook download failed.", res.status);
  }
  triggerBlobDownload(
    await res.blob(),
    filenameFromContentDisposition(res.headers.get("Content-Disposition"), "PD Calcs.xlsx"),
  );
}

export async function downloadRunWorkbooksBundle(
  token: string,
  tenantId: string,
  runId: string,
): Promise<void> {
  const res = await fetch(buildApiPath(`/tenants/${tenantId}/runs/${runId}/downloads/bundle`), {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    throw new ApiError("DOWNLOAD_FAILED", "Workbook bundle download failed.", res.status);
  }
  const blob = await res.blob();
  triggerBlobDownload(
    blob,
    filenameFromContentDisposition(
      res.headers.get("Content-Disposition"),
      `ECL_${runId}_PD_LGD_EAD_workbooks.zip`,
    ),
  );
}

export async function downloadTemplate(
  token: string,
  tenantId: string,
  kind: "PD" | "LGD" | "EAD",
): Promise<void> {
  const res = await fetch(buildApiPath(`/tenants/${tenantId}/templates/${kind}`), {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    throw new ApiError("DOWNLOAD_FAILED", "Template download failed.", res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ECL_${kind}_template.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function deleteUpload(
  token: string,
  tenantId: string,
  runId: string,
  uploadId: string,
): Promise<void> {
  return apiFetch<void>(`/tenants/${tenantId}/runs/${runId}/uploads/${uploadId}`, {
    token,
    method: "DELETE",
  });
}

// ── XHR file upload with progress ─────────────────────────────────────────

function uploadRunFileOnce(
  authToken: string,
  tenantId: string,
  runId: string,
  kind: "PD" | "LGD" | "EAD",
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadResultRaw> {
  return new Promise<UploadResultRaw>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const timeoutId = setTimeout(() => {
      xhr.abort();
      reject(
        new ApiError(
          "TIMEOUT",
          "Upload is taking longer than expected. Check your connection and try again.",
          408,
        ),
      );
    }, UPLOAD_TIMEOUT_MS);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      clearTimeout(timeoutId);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText);
          resolve(body.data as UploadResultRaw);
        } catch {
          reject(new ApiError("PARSE_ERROR", "Invalid upload response.", xhr.status));
        }
        return;
      }

      if (xhr.status === 401) {
        reject(new ApiError("UNAUTHORIZED", "Session expired.", 401));
        return;
      }

      let detail = "Upload failed.";
      let code = "UPLOAD_FAILED";
      try {
        const parsed = JSON.parse(xhr.responseText);
        detail = parsed?.detail ?? detail;
        code = parsed?.code ?? code;
      } catch {
        /* ignore */
      }
      reject(new ApiError(code, detail, xhr.status));
    };

    xhr.onerror = () => {
      clearTimeout(timeoutId);
      reject(
        new ApiError(
          "NETWORK_ERROR",
          "We couldn't upload your file. Check your connection and try again.",
          0,
        ),
      );
    };

    xhr.onabort = () => {
      clearTimeout(timeoutId);
    };

    xhr.open("POST", buildApiPath(`/tenants/${tenantId}/runs/${runId}/uploads`));
    xhr.withCredentials = true;
    xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);

    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    xhr.send(form);
  });
}

export async function uploadRunFile(
  token: string,
  tenantId: string,
  runId: string,
  kind: "PD" | "LGD" | "EAD",
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadResultRaw> {
  try {
    return await uploadRunFileOnce(token, tenantId, runId, kind, file, onProgress);
  } catch (err) {
    if (err instanceof ApiError && err.code === "UNAUTHORIZED" && typeof window !== "undefined") {
      const newToken = await refreshAccessToken();
      if (!newToken) {
        const { signOut } = await import("next-auth/react");
        await signOut({ redirectTo: "/sign-in" });
        throw new ApiError("UNAUTHORIZED", "Your session has expired. Sign in again to continue.", 401);
      }
      return uploadRunFileOnce(newToken, tenantId, runId, kind, file, onProgress);
    }
    throw err;
  }
}
