"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, RefreshCw, Upload } from "lucide-react";
import { UploadZone } from "../UploadZone";
import { canReturnToValidate, nextMissingPairFile, useRunWizard } from "../RunWizardContext";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useApiSession } from "@/hooks/use-api-session";
import { createRun, deleteUpload, downloadTemplate } from "@/lib/api/runs";
import type { UploadedFile, FileInputType } from "@/lib/new-run-types";
import { PdValidateActionRow } from "../pd/PdValidateActionRow";

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function addFileToState(
  dispatch: ReturnType<typeof useRunWizard>["dispatch"],
  kind: FileInputType,
  file: UploadedFile,
) {
  if (kind === "PD") {
    dispatch({ type: "ADD_PD_FILE", file });
  } else if (kind === "LGD") {
    dispatch({ type: "SET_LGD_FILE", file });
  } else {
    dispatch({ type: "SET_EAD_FILE", file });
  }
}

export function UploadStep() {
  const { state, dispatch } = useRunWizard();
  const { uploadFile } = useFileUpload();
  const { token, tenantId } = useApiSession();
  const initRunPromiseRef = useRef<Promise<string | null> | null>(null);
  const runIdRef = useRef<string | null>(state.runId);
  const nextMissing = nextMissingPairFile(state);
  const returningToValidate = canReturnToValidate(state);

  useEffect(() => {
    runIdRef.current = state.runId;
  }, [state.runId]);

  useEffect(() => {
    if (!state.uploadFocus) return;
    const node = document.getElementById(`upload-zone-${state.uploadFocus}`);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state.uploadFocus]);

  // Fallback: create draft run on the client if SSR init did not set one
  useEffect(() => {
    if (state.runId || state.runInitError || !token || !tenantId) return;

    let cancelled = false;
    initRunPromiseRef.current = (async () => {
      try {
        const raw = await createRun(token, tenantId, {
          name: state.runName,
          reporting_period: state.runName,
        });
        const runId = raw.fullId ?? raw.id;
        if (!cancelled) {
          runIdRef.current = runId;
          dispatch({ type: "SET_RUN_ID", runId });
        }
        return runId;
      } catch (err: unknown) {
        if (!cancelled) {
          const msg =
            err instanceof Error
              ? err.message
              : "Failed to start a new run. Check your connection and try again.";
          dispatch({ type: "SET_RUN_INIT_ERROR", error: msg });
        }
        return null;
      } finally {
        initRunPromiseRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.runId, state.runInitError, state.runName, token, tenantId, dispatch]);

  async function ensureRunId(): Promise<string | null> {
    if (runIdRef.current) return runIdRef.current;
    if (!token || !tenantId) {
      dispatch({
        type: "SET_RUN_INIT_ERROR",
        error: "Your session is missing workspace context. Sign out and sign in again.",
      });
      return null;
    }

    if (initRunPromiseRef.current) {
      return initRunPromiseRef.current;
    }

    initRunPromiseRef.current = (async () => {
      dispatch({ type: "SET_RUN_INIT_ERROR", error: null });
      try {
        const raw = await createRun(token, tenantId, {
          name: state.runName,
          reporting_period: state.runName,
        });
        const runId = raw.fullId ?? raw.id;
        runIdRef.current = runId;
        dispatch({ type: "SET_RUN_ID", runId });
        return runId;
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to start a new run. Check your connection and try again.";
        dispatch({ type: "SET_RUN_INIT_ERROR", error: msg });
        return null;
      } finally {
        initRunPromiseRef.current = null;
      }
    })();

    return initRunPromiseRef.current;
  }

  async function handleRetryInit() {
    if (!token || !tenantId) return;
    dispatch({ type: "SET_RUN_INIT_ERROR", error: null });
    try {
      const raw = await createRun(token, tenantId, { name: state.runName });
      const runId = raw.fullId ?? raw.id;
      runIdRef.current = runId;
      dispatch({ type: "SET_RUN_ID", runId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start a new run. Check your connection and try again.";
      dispatch({ type: "SET_RUN_INIT_ERROR", error: msg });
    }
  }

  async function handleAdd(kind: FileInputType, file: File) {
    const clientId = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const pending: UploadedFile = {
      id: clientId,
      name: file.name,
      size: formatBytes(file.size),
      sheets: 0,
      type: kind,
      status: "scan",
      hash: "—",
    };

    // Show the file immediately so the user gets feedback
    addFileToState(dispatch, kind, pending);

    const runId = await ensureRunId();
    if (!runId) {
      dispatch({
        type: "UPDATE_FILE_STATUS",
        id: clientId,
        status: "error",
        errorMessage: "Could not start run. Use Retry above or refresh the page.",
      });
      return;
    }

    try {
      const result = await uploadFile(
        runId,
        kind,
        file,
        (pct) => dispatch({ type: "SET_UPLOAD_PROGRESS", fileId: clientId, progress: pct }),
      );
      dispatch({ type: "SET_UPLOADED_FILE_ID", fileId: clientId, serverId: result.id });
      dispatch({
        type: "UPDATE_FILE_STATUS",
        id: clientId,
        status: "ok",
        hash: result.sha256 ? result.sha256.slice(0, 4) + "…" + result.sha256.slice(-4) : "—",
        sheets: result.sheet_count ?? result.sheetCount ?? 0,
        backendUploadId: result.id,
      });
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Upload failed. Please try again.";
      dispatch({ type: "UPDATE_FILE_STATUS", id: clientId, status: "error", errorMessage });
    }
  }

  async function handleRemovePd(id: string) {
    const file = state.pdFiles.find((f) => f.id === id);
    if (file?.backendUploadId && state.runId && token && tenantId) {
      try {
        await deleteUpload(token, tenantId, state.runId, file.backendUploadId);
      } catch {
        /* still remove from UI */
      }
    }
    dispatch({ type: "REMOVE_PD_FILE", id });
  }

  async function handleRemoveLgd(_id: string) {
    if (state.lgdFile?.backendUploadId && state.runId && token && tenantId) {
      try {
        await deleteUpload(token, tenantId, state.runId, state.lgdFile.backendUploadId);
      } catch {
        /* still remove from UI */
      }
    }
    dispatch({ type: "SET_LGD_FILE", file: null });
  }

  async function handleRemoveEad(_id: string) {
    if (state.eadFile?.backendUploadId && state.runId && token && tenantId) {
      try {
        await deleteUpload(token, tenantId, state.runId, state.eadFile.backendUploadId);
      } catch {
        /* still remove from UI */
      }
    }
    dispatch({ type: "SET_EAD_FILE", file: null });
  }

  async function handleDownloadTemplate(kind: FileInputType) {
    if (!token || !tenantId) return;
    try {
      await downloadTemplate(token, tenantId, kind);
    } catch {
      /* surfaced by browser if download fails */
    }
  }

  return (
    <div>
      {/* Run init error banner */}
      {state.runInitError && (
        <div
          className="callout callout-error"
          style={{ marginBottom: "var(--sp-4)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <AlertCircle size={16} className="ic" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            <div>
              <div style={{ fontWeight: "var(--fw-semibold)" as React.CSSProperties["fontWeight"], marginBottom: 2 }}>
                Could not create run
              </div>
              <div style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>
                {state.runInitError}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRetryInit}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
              height: 28, padding: "0 10px",
              background: "none", border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)",
              fontSize: "var(--fs-caption)", color: "var(--text)", cursor: "pointer",
            }}
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      )}

      {state.uploadFocus && (
        <div className="callout callout-info" style={{ marginBottom: "var(--sp-4)" }}>
          <Upload size={15} className="ic" aria-hidden="true" />
          <span>
            {state.uploadFocus === "LGD"
              ? "Your PD file and its validation stay on this run. Upload Loss Given Default here, then continue to validation."
              : state.uploadFocus === "EAD"
              ? "PD and LGD stay on this run. Upload Exposure at Default here, then continue to validation — EAD is validated last and previews the final ECL."
              : "Drop the file for this zone. Files already on this run are kept."}
          </span>
        </div>
      )}

      {!state.uploadFocus && returningToValidate && nextMissing && (
        <div className="callout callout-info" style={{ marginBottom: "var(--sp-4)" }}>
          <Upload size={15} className="ic" aria-hidden="true" />
          <span>
            {nextMissing === "LGD"
              ? "PD is validated and kept. Upload Loss Given Default next, then return to validation."
              : "PD and LGD are kept. Upload Exposure at Default next, then return to validation."}
          </span>
        </div>
      )}

      {/* Header card */}
      <div className="run-card" style={{ marginBottom: "var(--sp-4)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 14, alignItems: "flex-start" }}>
          <div>
            <h2>Upload your monthly files</h2>
            <p className="rc-sub">Upload in order: Probability of Default, then Loss Given Default, then Exposure at Default. Each file is validated in that order, one step at a time; the EAD step previews the final ECL. Files already uploaded stay on this run when you move between steps.</p>
          </div>
          {/* Run name input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
            <label
              htmlFor="run-name"
              style={{ fontSize: "var(--fs-caption)", fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"], color: "var(--text-muted)" }}
            >
              Run name / period
            </label>
            <input
              id="run-name"
              className="input"
              value={state.runName}
              onChange={(e) => dispatch({ type: "SET_RUN_NAME", name: e.target.value })}
              style={{
                height: "var(--control-h)", background: "var(--surface)", border: "1px solid var(--border-strong)",
                borderRadius: "var(--r-sm)", padding: "0 12px", fontSize: "var(--fs-body)", color: "var(--text)",
              }}
              aria-label="Run name or period"
            />
          </div>
        </div>
      </div>

      {/* PD zone */}
      <UploadZone
        type="PD"
        files={state.pdFiles}
        onAdd={(file) => handleAdd("PD", file)}
        onRemove={handleRemovePd}
        onDownloadTemplate={() => handleDownloadTemplate("PD")}
        uploadProgress={state.uploadProgress}
        footer={<PdValidateActionRow />}
        highlighted={state.uploadFocus === "PD"}
      />

      {/* LGD zone */}
      <UploadZone
        type="LGD"
        files={state.lgdFile ? [state.lgdFile] : []}
        onAdd={(file) => handleAdd("LGD", file)}
        onRemove={handleRemoveLgd}
        onDownloadTemplate={() => handleDownloadTemplate("LGD")}
        uploadProgress={state.uploadProgress}
        highlighted={state.uploadFocus === "LGD"}
        footer={
          returningToValidate && (state.uploadFocus === "LGD" || nextMissing === "LGD") ? (
            <div className="pd-validate-row">
              <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>
                {state.lgdFile
                  ? "LGD is on this run. PD validation is unchanged."
                  : "Upload LGD — PD stays validated on this run."}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => dispatch({ type: "GO_TO_STEP", step: "validate" })}
              >
                Back to validation
              </button>
            </div>
          ) : undefined
        }
      />

      {/* EAD zone */}
      <UploadZone
        type="EAD"
        files={state.eadFile ? [state.eadFile] : []}
        onAdd={(file) => handleAdd("EAD", file)}
        onRemove={handleRemoveEad}
        onDownloadTemplate={() => handleDownloadTemplate("EAD")}
        uploadProgress={state.uploadProgress}
        highlighted={state.uploadFocus === "EAD"}
        footer={
          returningToValidate && (state.uploadFocus === "EAD" || nextMissing === "EAD") ? (
            <div className="pd-validate-row">
              <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>
                {state.eadFile
                  ? "EAD is on this run. Return to validate LGD and EAD together."
                  : "Upload EAD next — PD and LGD stay on this run."}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => dispatch({ type: "GO_TO_STEP", step: "validate" })}
              >
                Back to validation
              </button>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
