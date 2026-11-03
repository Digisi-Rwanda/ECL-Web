"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { UploadZone } from "../UploadZone";
import { PdValidationPanel } from "../pd/PdValidationPanel";
import { DataSubStepper, type FileChipState } from "../RunWizardStepper";
import { canOpenFile, fileCleared, fileIsReady, pdFilesReady, useRunWizard } from "../RunWizardContext";
import { EadValidationPanel } from "@/components/ecl/EadValidationPanel";
import { LgdValidationPanel } from "@/components/ecl/LgdValidationPanel";
import { ReviewAccept } from "@/components/ecl/ReviewAccept";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useApiSession } from "@/hooks/use-api-session";
import { createRun, deleteUpload, downloadTemplate, updateRun } from "@/lib/api/runs";
import { formatApiError } from "@/lib/api/format-api-error";
import { validatePdRun } from "@/lib/api/pd-validation";
import { downloadEclPreview, validateEadRun, validateLgdRun } from "@/lib/api/ecl-validation";
import { DATA_FILES } from "@/lib/new-run-types";
import type { EclStepStatus, FileInputType, PdCriterion, UploadedFile } from "@/lib/new-run-types";

const COPY: Record<FileInputType, { title: string; what: string }> = {
  PD: {
    title: "Probability of Default",
    what: "Monthly loan listings with each loan's stage. Several files are combined into one history.",
  },
  LGD: {
    title: "Loss Given Default",
    what: "One row per loan with the customer's collateral by type. Discounted collateral reduces the loss.",
  },
  EAD: {
    title: "Exposure at Default",
    what: "One row per loan at the reporting date. This step also previews the final ECL.",
  },
};

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
}

const errorText = (err: unknown) => {
  const f = formatApiError(err);
  return [f.summary, f.hint].filter(Boolean).join(" — ");
};

function Summary({ criteria }: { criteria: PdCriterion[] }) {
  const n = (o: string) => criteria.filter((c) => c.outcome === o).length;
  const [passed, review, blocked] = [n("pass"), n("review"), n("block")];
  return (
    <div className={`data-summary ${blocked ? "is-blocked" : review ? "is-review" : "is-ok"}`} role="status">
      {blocked ? <AlertCircle size={18} aria-hidden /> : <CheckCircle2 size={18} aria-hidden />}
      <span>
        <b>{passed}</b> passed · <b>{review}</b> to review · <b>{blocked}</b> blocking
      </span>
      <span className="data-summary-msg">
        {blocked
          ? "Fix the blocking checks in your file and replace it."
          : review
            ? "Read the items to review, then accept them below."
            : "Everything checks out."}
      </span>
    </div>
  );
}

export function DataStep() {
  const { state, dispatch } = useRunWizard();
  const { token, tenantId } = useApiSession();
  const { uploadFile } = useFileUpload();
  const kind = state.dataFile;
  const runIdRef = useRef<string | null>(state.runId);
  const creating = useRef<Promise<string | null> | null>(null);
  const inFlight = useRef<Record<FileInputType, boolean>>({ PD: false, LGD: false, EAD: false });
  const [reportingDate, setReportingDate] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);

  useEffect(() => {
    runIdRef.current = state.runId;
  }, [state.runId]);

  // The draft run is created when the first file is dropped, never on page load,
  // so opening "New run" twice leaves no empty drafts behind.
  async function ensureRunId(): Promise<string | null> {
    if (runIdRef.current) return runIdRef.current;
    if (!token || !tenantId) return null;
    creating.current ??= (async () => {
      try {
        const raw = await createRun(token, tenantId, { name: state.runName, reporting_period: state.runName });
        const runId = raw.fullId ?? raw.id;
        runIdRef.current = runId;
        dispatch({
          type: "SET_RUN_META",
          runId,
          currency: (raw as { currency?: string }).currency,
          engineVersion: (raw as { engineInfo?: { version?: string } }).engineInfo?.version,
        });
        return runId;
      } catch (err) {
        dispatch({ type: "SET_RUN_INIT_ERROR", error: errorText(err) });
        return null;
      } finally {
        creating.current = null;
      }
    })();
    return creating.current;
  }

  async function handleAdd(file: File) {
    const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const pending: UploadedFile = { id, name: file.name, size: formatBytes(file.size), sheets: 0, type: kind, status: "scan", hash: "—" };
    if (kind === "PD") dispatch({ type: "ADD_PD_FILE", file: pending });
    else dispatch({ type: kind === "LGD" ? "SET_LGD_FILE" : "SET_EAD_FILE", file: pending });
    const runId = await ensureRunId();
    if (!runId) {
      dispatch({ type: "UPDATE_FILE_STATUS", id, status: "error", errorMessage: "Could not start the run. Try again." });
      return;
    }
    // Replacing LGD/EAD: the server keeps one file per kind, so drop the old one first.
    const previous = kind === "LGD" ? state.lgdFile : kind === "EAD" ? state.eadFile : null;
    if (previous?.backendUploadId && token && tenantId) {
      await deleteUpload(token, tenantId, runId, previous.backendUploadId).catch(() => {});
    }
    try {
      const result = await uploadFile(runId, kind, file, (pct) =>
        dispatch({ type: "SET_UPLOAD_PROGRESS", fileId: id, progress: pct }),
      );
      dispatch({
        type: "UPDATE_FILE_STATUS",
        id,
        status: "ok",
        hash: result.sha256 ? `${result.sha256.slice(0, 4)}…${result.sha256.slice(-4)}` : "—",
        sheets: result.sheet_count ?? result.sheetCount ?? 0,
        backendUploadId: result.id,
      });
      dispatch({ type: "RESET_VALIDATION_FROM", kind });
    } catch (err) {
      dispatch({ type: "UPDATE_FILE_STATUS", id, status: "error", errorMessage: errorText(err) });
    }
  }

  async function handleRemove(id: string) {
    const file = kind === "PD" ? state.pdFiles.find((f) => f.id === id) : kind === "LGD" ? state.lgdFile : state.eadFile;
    if (file?.backendUploadId && state.runId && token && tenantId) {
      await deleteUpload(token, tenantId, state.runId, file.backendUploadId).catch(() => {});
    }
    if (kind === "PD") dispatch({ type: "REMOVE_PD_FILE", id });
    else dispatch({ type: kind === "LGD" ? "SET_LGD_FILE" : "SET_EAD_FILE", file: null });
  }

  const validate = useCallback(
    async (target: FileInputType) => {
      if (!state.runId || !token || !tenantId || inFlight.current[target]) return;
      inFlight.current[target] = true;
      try {
        if (target === "PD") {
          dispatch({ type: "START_PD_VALIDATING" });
          try {
            dispatch({ type: "SET_PD_PREVIEW", result: await validatePdRun(token, tenantId, state.runId) });
          } catch (err) {
            dispatch({ type: "SET_PD_PREVIEW_ERROR", error: errorText(err) });
          }
        } else {
          dispatch({ type: "START_STEP_VALIDATING", kind: target });
          try {
            if (target === "LGD") dispatch({ type: "SET_LGD_VALIDATION", result: await validateLgdRun(token, tenantId, state.runId) });
            else dispatch({ type: "SET_EAD_VALIDATION", result: await validateEadRun(token, tenantId, state.runId) });
          } catch (err) {
            dispatch({ type: "SET_STEP_ERROR", kind: target, error: errorText(err) });
          }
        }
      } finally {
        inFlight.current[target] = false;
      }
    },
    [dispatch, state.runId, tenantId, token],
  );

  const files = kind === "PD" ? state.pdFiles : [kind === "LGD" ? state.lgdFile : state.eadFile].filter(Boolean) as UploadedFile[];
  const uploading = files.some((f) => f.status === "scan");
  const ready = kind === "PD" ? pdFilesReady(state) : fileIsReady(files[0] ?? null);
  const status: EclStepStatus = kind === "PD" ? state.pdPreviewStatus : kind === "LGD" ? state.lgdStatus : state.eadStatus;
  const error = kind === "PD" ? state.pdPreviewError : kind === "LGD" ? state.lgdError : state.eadError;
  const criteria = kind === "PD" ? state.pdPreview?.criteria : kind === "LGD" ? state.lgdValidation?.criteria : state.eadValidation?.criteria;

  // Check files as soon as they are uploaded (and after a replace). Earlier files go first:
  // after a refresh their results are gone, and the focused file's gate depends on them.
  useEffect(() => {
    if (uploading) return;
    for (const k of DATA_FILES.slice(0, DATA_FILES.indexOf(kind) + 1)) {
      const st = k === "PD" ? state.pdPreviewStatus : k === "LGD" ? state.lgdStatus : state.eadStatus;
      const ok = k === "PD" ? pdFilesReady(state) : fileIsReady(k === "LGD" ? state.lgdFile : state.eadFile);
      if (ok && st === "idle" && canOpenFile(state, k)) return void validate(k);
      if (st !== "ready") return;
    }
  }, [uploading, kind, state, validate]);

  async function applyReportingDate(value: string | null) {
    if (!token || !tenantId || !state.runId) return;
    setDateError(null);
    try {
      await updateRun(token, tenantId, state.runId, { reporting_date: value });
      dispatch({ type: "RESET_VALIDATION_FROM", kind: "EAD" });
    } catch (err) {
      setDateError(formatApiError(err).summary);
    }
  }

  const chipStates = Object.fromEntries(
    DATA_FILES.map((k) => {
      const st = k === "PD" ? state.pdPreviewStatus : k === "LGD" ? state.lgdStatus : state.eadStatus;
      const value: FileChipState = !canOpenFile(state, k)
        ? "locked"
        : fileCleared(state, k)
          ? "done"
          : st === "blocked" || st === "error"
            ? "blocked"
            : "todo";
      return [k, value];
    }),
  ) as Record<FileInputType, FileChipState>;

  const reviewCount = criteria?.filter((c) => c.outcome === "review").length ?? 0;
  const eadPreview = state.eadValidation?.preview;

  return (
    <div>
      <DataSubStepper current={kind} states={chipStates} onSelect={(k) => dispatch({ type: "SET_DATA_FILE", kind: k })} />

      {state.runInitError && (
        <div className="callout callout-error" style={{ marginBottom: "var(--sp-4)" }} role="alert">
          <AlertCircle size={16} className="ic" aria-hidden />
          <span>Could not create the run: {state.runInitError}</span>
        </div>
      )}

      <section id="data-panel" role="tabpanel" aria-labelledby={`data-${kind}`} className="data-panel">
        {!token || !tenantId ? (
          // Dropping before the session loads would have no workspace to create the run in.
          <div className="data-checking" role="status"><span className="spin" aria-hidden /> Loading workspace…</div>
        ) : <UploadZone
          type={kind}
          files={files}
          onAdd={(f) => void handleAdd(f)}
          onRemove={(id) => void handleRemove(id)}
          onDownloadTemplate={token && tenantId ? () => void downloadTemplate(token, tenantId, kind).catch(() => {}) : undefined}
          uploadProgress={state.uploadProgress}
        />}
        {!files.length && <p className="data-what">{COPY[kind].what}</p>}

        {ready && (
          <div className="run-card data-result">
            {kind === "EAD" && (
              <div className="ecl-date">
                <label htmlFor="ecl-reporting-date">Reporting Date</label>
                <input id="ecl-reporting-date" type="date" className="input" value={reportingDate} onChange={(e) => setReportingDate(e.target.value)} />
                <button type="button" className="btn btn-secondary btn-sm" disabled={!reportingDate} onClick={() => void applyReportingDate(reportingDate)}>
                  Apply
                </button>
                {eadPreview?.reportingDateSource === "run" && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setReportingDate(""); void applyReportingDate(null); }}>
                    Use the file&apos;s date
                  </button>
                )}
                <span>
                  {eadPreview
                    ? eadPreview.reportingDateSource === "run"
                      ? `Set on the run: ${eadPreview.reportingDate}.`
                      : `Using the file's most common date (${eadPreview.reportingDate}). Rows with another date are excluded.`
                    : "Leave empty to use the file's most common date."}
                </span>
                {dateError && <span className="pdts-error" role="alert">{dateError}</span>}
              </div>
            )}

            {(status === "loading" || status === "idle") && (
              <div className="data-checking" role="status">
                <span className="spin" aria-hidden />
                <div>
                  <b>Checking your {kind} file…</b>
                  <div className="pdts-muted">
                    {kind === "EAD" ? "Projecting exposure and computing the ECL preview." : "Applying the specification's checks."} Large files can take a minute.
                  </div>
                </div>
              </div>
            )}

            {status === "error" && (
              <div className="val-summary err">
                <span className="vs-ic" aria-hidden="true"><RefreshCw size={20} /></span>
                <div className="val-summary-body">
                  <div className="vs-t">The {kind} check could not run</div>
                  <div className="vs-d">{error}</div>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => void validate(kind)}>
                    <RefreshCw size={13} aria-hidden="true" /> Try again
                  </button>
                </div>
              </div>
            )}

            {(status === "ready" || status === "blocked") && criteria && (
              <>
                <Summary criteria={criteria} />
                {kind === "PD" && state.pdPreview && <PdValidationPanel preview={state.pdPreview} />}
                {kind === "LGD" && state.lgdValidation && <LgdValidationPanel result={state.lgdValidation} />}
                {kind === "EAD" && state.eadValidation && (
                  <EadValidationPanel
                    result={state.eadValidation}
                    onDownload={token && tenantId && state.runId ? () => downloadEclPreview(token, tenantId, state.runId!) : undefined}
                  />
                )}
                <ReviewAccept
                  kind={kind}
                  reviewCount={status === "blocked" ? 0 : reviewCount}
                  accepted={state.reviewAccepted[kind]}
                  token={token ?? null}
                  tenantId={tenantId ?? null}
                  runId={state.runId}
                  onAccepted={(value) => dispatch({ type: "SET_REVIEW_ACCEPTED", kind, value })}
                />
              </>
            )}
          </div>
        )}
      </section>

    </div>
  );
}
