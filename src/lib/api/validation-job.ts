/**
 * Validation runs as a background job on the server: POST starts (or joins) it
 * and returns a job id; GET reports queued | running | complete | error. Big
 * books take as long as they need without any request timing out.
 */
import { apiFetch, ApiError } from "@/lib/api/client";

export type ValidationScope = "pd" | "lgd" | "ead";

interface JobStatus<T> {
  jobId: string;
  status: "queued" | "running" | "complete" | "error";
  result?: T;
  error?: { code: string; detail: string; status: number };
}

const POLL_MS = 1_500;
// Generous: a very large EAD book previews the full ECL. Polls are tiny.
const MAX_WAIT_MS = 20 * 60 * 1000;
// Transient network blips while polling are retried, not surfaced.
const MAX_CONSECUTIVE_POLL_ERRORS = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runValidationJob<T>(
  token: string,
  tenantId: string,
  runId: string,
  scope: ValidationScope,
): Promise<T> {
  const started = await apiFetch<{ jobId: string }>(
    `/tenants/${tenantId}/runs/${runId}/validate?scope=${scope}`,
    { method: "POST", body: JSON.stringify({}), token },
  );
  const deadline = Date.now() + MAX_WAIT_MS;
  let errors = 0;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    let job: JobStatus<T>;
    try {
      job = await apiFetch<JobStatus<T>>(
        `/tenants/${tenantId}/runs/${runId}/validation-jobs/${started.jobId}`,
        { token },
      );
      errors = 0;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) throw err;
      if (++errors >= MAX_CONSECUTIVE_POLL_ERRORS) throw err;
      continue;
    }
    if (job.status === "complete" && job.result) return job.result;
    if (job.status === "error") {
      throw new ApiError(job.error?.code ?? "VALIDATION_FAILED", job.error?.detail ?? "Validation failed.", job.error?.status ?? 500);
    }
  }
  throw new ApiError("VALIDATION_TIMEOUT", "Validation is taking unusually long. Try again in a few minutes.", 504);
}
