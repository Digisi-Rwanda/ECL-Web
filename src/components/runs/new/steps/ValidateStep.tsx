"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Info, RefreshCw, Upload } from "lucide-react";
import { ValidationFileItem } from "../ValidationFileItem";
import { PendingFileItem } from "../pd/PendingFileItem";
import { useRunWizard, fileIsReady, pdFilesReady } from "../RunWizardContext";
import { useApiSession } from "@/hooks/use-api-session";
import { uploadRunFile, deleteUpload, downloadTemplate, checkBackendAvailable, updateRun } from "@/lib/api/runs";
import { formatApiError } from "@/lib/api/format-api-error";
import { validatePdRun } from "@/lib/api/pd-validation";
import { downloadEclPreview, validateEadRun, validateLgdRun } from "@/lib/api/ecl-validation";
import { EadValidationPanel } from "@/components/ecl/EadValidationPanel";
import { LgdValidationPanel } from "@/components/ecl/LgdValidationPanel";
import { ReviewAccept } from "@/components/ecl/ReviewAccept";
import { StepSection } from "@/components/ecl/StepSection";
import type { FileInputType, PdCriterion, UploadedFile } from "@/lib/new-run-types";

const reviewCount = (criteria: PdCriterion[] | undefined) => criteria?.filter((c) => c.outcome === "review").length ?? 0;

export function ValidateStep() {
  const { state, dispatch } = useRunWizard();
  const { token, tenantId } = useApiSession();
  const [reuploadingId, setReuploadingId] = useState<string | null>(null);
  const [reportingDate, setReportingDate] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);

  // Effects can fire twice (React strict mode, fast re-renders); one request per step at a time.
  const inFlight = useRef<Record<FileInputType, boolean>>({ PD: false, LGD: false, EAD: false });
  const pdReady = pdFilesReady(state);
  const primaryPd = state.pdFiles[0];

  const runPdValidation = useCallback(async () => {
    if (!state.runId || !token || !tenantId || inFlight.current.PD) return;
    inFlight.current.PD = true;
    try {
      await validatePd(state.runId, token, tenantId);
    } finally {
      inFlight.current.PD = false;
    }
  }, [state.runId, tenantId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function validatePd(runId: string, token: string, tenantId: string) {
    dispatch({ type: "START_PD_VALIDATING" });
    if (!(await checkBackendAvailable())) {
      dispatch({ type: "SET_PD_PREVIEW_ERROR", error: "We couldn't connect to the service — check your internet connection and try again." });
      return;
    }
    try {
      dispatch({ type: "SET_PD_PREVIEW", result: await validatePdRun(token, tenantId, runId) });
    } catch (err: unknown) {
      const f = formatApiError(err);
      dispatch({ type: "SET_PD_PREVIEW_ERROR", error: [f.summary, f.hint].filter(Boolean).join(" — ") });
    }
  }

  const runStepValidation = useCallback(
    async (kind: "LGD" | "EAD") => {
      if (!state.runId || !token || !tenantId || inFlight.current[kind]) return;
      inFlight.current[kind] = true;
      dispatch({ type: "START_STEP_VALIDATING", kind });
      try {
        if (kind === "LGD") dispatch({ type: "SET_LGD_VALIDATION", result: await validateLgdRun(token, tenantId, state.runId) });
        else dispatch({ type: "SET_EAD_VALIDATION", result: await validateEadRun(token, tenantId, state.runId) });
      } catch (err: unknown) {
        const f = formatApiError(err);
        dispatch({ type: "SET_STEP_ERROR", kind, error: [f.summary, f.hint].filter(Boolean).join(" — ") });
      } finally {
        inFlight.current[kind] = false;
      }
    },
    [dispatch, state.runId, tenantId, token],
  );

  // One lane: PD validates first, LGD once PD has a result, EAD once LGD has one.
  useEffect(() => {
    if (pdReady && state.pdPreviewStatus === "idle") void runPdValidation();
  }, [pdReady, state.pdPreviewStatus, runPdValidation]);
  useEffect(() => {
    const pdDone = state.pdPreviewStatus === "ready" || state.pdPreviewStatus === "blocked";
    if (pdDone && fileIsReady(state.lgdFile) && state.lgdStatus === "idle") void runStepValidation("LGD");
  }, [state.pdPreviewStatus, state.lgdFile, state.lgdStatus, runStepValidation]);
  useEffect(() => {
    if (state.lgdStatus === "ready" && fileIsReady(state.eadFile) && state.eadStatus === "idle") void runStepValidation("EAD");
  }, [state.lgdStatus, state.eadFile, state.eadStatus, runStepValidation]);

  async function handleReupload(file: UploadedFile, newFile: File) {
    setReuploadingId(file.id);
    try {
      if (file.backendUploadId) await deleteUpload(token!, tenantId!, state.runId!, file.backendUploadId);
      const result = await uploadRunFile(token!, tenantId!, state.runId!, file.type, newFile);
      dispatch({
        type: "UPDATE_FILE_STATUS",
        id: file.id,
        status: "ok",
        sheets: result.sheet_count ?? result.sheetCount ?? 0,
        hash: result.sha256 ? result.sha256.slice(0, 4) + "…" + result.sha256.slice(-4) : "—",
        backendUploadId: result.id,
      });
      dispatch({ type: "RESET_VALIDATION_FROM", kind: file.type });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Re-upload failed";
      dispatch({ type: "UPDATE_FILE_STATUS", id: file.id, status: "error", errorMessage: msg });
    } finally {
      setReuploadingId(null);
    }
  }

  async function handleDownloadTemplate(kind: FileInputType) {
    if (!token || !tenantId) return;
    try {
      await downloadTemplate(token, tenantId, kind);
    } catch {
      /* download errors surface via browser */
    }
  }

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

  const pdBlockingResult =
    state.pdPreview?.status === "blocking" && primaryPd ? { file: primaryPd, issues: state.pdPreview.issues ?? [] } : null;
  const accept = (kind: FileInputType) => (value: boolean) => dispatch({ type: "SET_REVIEW_ACCEPTED", kind, value });
  const eadPreview = state.eadValidation?.preview;

  return (
    <div>
      <div className="run-card" style={{ marginBottom: "var(--sp-4)" }}>
        <h2>Validate your files</h2>
        <p className="rc-sub">
          One step at a time: Probability of Default, then Loss Given Default, then Exposure at Default. Each step uses the
          exact calculation that compute will run; the EAD step previews the final ECL. Review items are the
          specification&apos;s own adjustments — accept them to continue; blocking items must be fixed and re-uploaded.
        </p>
      </div>

      {!pdReady && (
        <div className="run-card" style={{ marginBottom: "var(--sp-4)" }}>
          <div className="rx-empty" style={{ padding: "var(--sp-12) var(--sp-4)" }}>
            <div className="rx-empty-inner">
              <div className="rx-empty-ic">
                <Upload size={20} />
              </div>
              <h3>No PD file uploaded yet</h3>
              <p>Upload a Probability of Default workbook to validate it — you don&apos;t need Loss Given Default or Exposure at Default yet.</p>
            </div>
          </div>
        </div>
      )}

      {pdReady && state.pdPreviewStatus === "loading" && (
        <div className="run-card" style={{ marginBottom: "var(--sp-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{ width: 22, height: 22, borderRadius: "50%", border: "2.5px solid var(--accent-border)", borderTopColor: "var(--accent)", animation: "spin 0.7s linear infinite", flexShrink: 0 }}
              aria-hidden="true"
            />
            <div>
              <div style={{ fontWeight: "var(--fw-semibold)" as React.CSSProperties["fontWeight"], color: "var(--text)", fontSize: "var(--fs-body)" }}>
                Validating your PD file…
              </div>
              <div className="rc-sub">Checking structure, staging logic and computing the transition-matrix preview.</div>
            </div>
          </div>
          <div className="progress indeterminate" style={{ marginTop: 16 }}>
            <div className="bar" />
          </div>
        </div>
      )}

      {pdReady && state.pdPreviewStatus === "error" && (
        <div className="val-summary err" style={{ marginBottom: "var(--sp-4)" }}>
          <span className="vs-ic" aria-hidden="true"><RefreshCw size={20} /></span>
          <div className="val-summary-body">
            <div className="vs-t">PD validation could not run</div>
            <div className="vs-d">{state.pdPreviewError ?? "Retry the PD preview."}</div>
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  dispatch({ type: "CLEAR_PD_PREVIEW" });
                  void runPdValidation();
                }}
              >
                <RefreshCw size={13} aria-hidden="true" />
                Retry PD validation
              </button>
            </div>
          </div>
        </div>
      )}

      {pdReady && state.pdPreviewStatus === "blocked" && pdBlockingResult && (
        <div className="val-summary err" style={{ marginBottom: "var(--sp-4)" }}>
          <span className="vs-ic" aria-hidden="true"><RefreshCw size={20} /></span>
          <div className="val-summary-body">
            <div className="vs-t">
              {pdBlockingResult.issues.length} blocking error{pdBlockingResult.issues.length !== 1 ? "s" : ""} found
            </div>
            <div className="vs-d">
              Fix these in {pdBlockingResult.file.name} and re-upload before this file can continue.
            </div>
          </div>
        </div>
      )}

      {pdReady &&
        (state.pdPreviewStatus === "ready" || state.pdPreviewStatus === "blocked") &&
        state.pdPreview &&
        primaryPd && (
        <ValidationFileItem
          result={{
            file: primaryPd,
            issues: state.pdPreview.issues ?? [],
          }}
          zoneLabel="PD"
          extraFileCount={Math.max(0, state.pdFiles.length - 1)}
          pdPreview={state.pdPreview}
          onReupload={(newFile) =>
            handleReupload(primaryPd, newFile)
          }
          isReuploading={reuploadingId === primaryPd.id}
          onDownloadTemplate={() => handleDownloadTemplate("PD")}
        />
      )}

      {state.pdPreview && (
        <ReviewAccept
          kind="PD"
          reviewCount={reviewCount(state.pdPreview.criteria)}
          accepted={state.reviewAccepted.PD}
          token={token ?? null}
          tenantId={tenantId ?? null}
          runId={state.runId}
          onAccepted={accept("PD")}
        />
      )}

      {/* ── Step 2: LGD ───────────────────────────────────────────── */}
      {state.lgdFile ? (
        <StepSection
          file={state.lgdFile}
          zone="LGD"
          title="Collateral dataset · discounted collateral (spec Step 1)"
          status={state.lgdStatus}
          criteria={state.lgdValidation?.criteria}
          accepted={state.reviewAccepted.LGD}
          error={state.lgdError}
          loadingText={state.pdPreviewStatus === "loading" ? "Waiting for PD validation…" : "Applying the input rules and discounting collateral…"}
          onRetry={() => void runStepValidation("LGD")}
          onReupload={(f) => handleReupload(state.lgdFile!, f)}
          isReuploading={reuploadingId === state.lgdFile.id}
        >
          {state.lgdValidation && (
            <>
              <LgdValidationPanel result={state.lgdValidation} />
              <ReviewAccept
                kind="LGD"
                reviewCount={reviewCount(state.lgdValidation.criteria)}
                accepted={state.reviewAccepted.LGD}
                token={token ?? null}
                tenantId={tenantId ?? null}
                runId={state.runId}
                onAccepted={accept("LGD")}
              />
            </>
          )}
        </StepSection>
      ) : (
        pdReady && <PendingFileItem kind="LGD" recommended onUpload={() => dispatch({ type: "REQUEST_FILE_UPLOAD", kind: "LGD" })} />
      )}

      {/* ── Step 3: EAD + ECL preview ─────────────────────────────── */}
      {state.eadFile ? (
        <StepSection
          file={state.eadFile}
          zone="EAD"
          title="Exposure dataset · EAD, PD join and ECL (spec Steps 2–11)"
          status={state.eadStatus}
          criteria={state.eadValidation?.criteria}
          accepted={state.reviewAccepted.EAD}
          error={state.eadError}
          loadingText={state.lgdStatus !== "ready" ? "Waiting for LGD validation…" : "Projecting exposure and computing the ECL preview…"}
          onRetry={() => void runStepValidation("EAD")}
          onReupload={(f) => handleReupload(state.eadFile!, f)}
          isReuploading={reuploadingId === state.eadFile.id}
        >
          <div className="ecl-date" style={{ marginBottom: "var(--sp-3)" }}>
            <label htmlFor="ecl-reporting-date">Run Reporting Date</label>
            <input
              id="ecl-reporting-date"
              type="date"
              className="input"
              value={reportingDate}
              onChange={(e) => setReportingDate(e.target.value)}
            />
            <button type="button" className="btn btn-secondary btn-sm" disabled={!reportingDate} onClick={() => void applyReportingDate(reportingDate)}>
              Apply
            </button>
            {eadPreview?.reportingDateSource === "run" && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setReportingDate(""); void applyReportingDate(null); }}>
                Use the file&apos;s date
              </button>
            )}
            <span>
              {eadPreview?.reportingDateSource === "run"
                ? `Set on the run: ${eadPreview.reportingDate}.`
                : `Using the file's most common date${eadPreview?.reportingDate ? ` (${eadPreview.reportingDate})` : ""}. Rows with another date are excluded.`}
            </span>
            {dateError && <span className="pdts-error" role="alert">{dateError}</span>}
          </div>
          {state.eadValidation && (
            <>
              <EadValidationPanel
                result={state.eadValidation}
                onDownload={token && tenantId && state.runId ? () => downloadEclPreview(token, tenantId, state.runId!) : undefined}
              />
              <ReviewAccept
                kind="EAD"
                reviewCount={reviewCount(state.eadValidation.criteria)}
                accepted={state.reviewAccepted.EAD}
                token={token ?? null}
                tenantId={tenantId ?? null}
                runId={state.runId}
                onAccepted={accept("EAD")}
              />
            </>
          )}
        </StepSection>
      ) : (
        state.lgdFile && (
          <PendingFileItem
            kind="EAD"
            recommended
            onUpload={fileIsReady(state.lgdFile) ? () => dispatch({ type: "REQUEST_FILE_UPLOAD", kind: "EAD" }) : undefined}
          />
        )
      )}

      <div className="callout callout-info" style={{ marginTop: "var(--sp-4)" }}>
        <Info size={15} className="ic" aria-hidden="true" />
        <span>Nothing is saved until you confirm and compute. Compute uses exactly the rules and numbers shown here.</span>
      </div>
    </div>
  );
}
