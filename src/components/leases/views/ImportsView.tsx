"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Download, FileSpreadsheet, XCircle, AlertTriangle, CheckCircle2, RotateCcw, Send } from "lucide-react";
import { fmtDateTime, member } from "@/lib/leases/model";
import {
  createImport, setImportMapping, acceptImportWarnings, startCommit, retryFailed, cancelImport, submitImported, refreshImport, importErrorsCsv,
  IMPORT_COLUMNS, IMPORT_TEMPLATE_VERSION, importTemplateRows,
} from "@/lib/leases/store";
import { toCsv, downloadText } from "@/lib/leases/csv";
import type { ImportBatch } from "@/lib/leases/types";
import { PageHeader, Card, Btn, Banner, StatusBadge, EmptyState, Stepper, Progress, Select, BtnLink, Kpi, Tabs } from "@/components/ll/Kit";
import { Confirm } from "@/components/ll/Overlay";
import { toast } from "@/components/ll/toast";
import { useLeasesState, useMe, useAction, can } from "../use-leases";
import { RequireSetup } from "../common";

const STATUS_TONE: Record<ImportBatch["status"], "neutral" | "info" | "success" | "warning" | "danger" | "muted"> = {
  uploaded: "neutral", mapping: "warning", validating: "info", validated: "warning", committing: "info", committed: "success", failed: "danger", cancelled: "muted",
};

export function ImportsView() {
  const st = useLeasesState()!;
  const me = useMe()!;
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const onFile = async (f?: File) => {
    if (!f) return;
    if (!/\.(csv|xlsx)$/i.test(f.name)) { toast("danger", "Upload a .csv or .xlsx file."); return; }
    if (f.size > 20 * 1024 * 1024) { toast("danger", "File is larger than 20 MB."); return; }
    setBusy(true);
    try {
      const id = await createImport(f);
      router.push(`/leases/imports/${id}`);
    } catch (e) {
      toast("danger", e instanceof Error ? e.message : "Couldn't read the file");
      setBusy(false);
    }
  };
  return (
    <RequireSetup>
      <PageHeader title="Imports" sub="Bring many leases in at once. Every row is validated before anything is created; each lease commits on its own so one bad row never blocks the rest." />
      {can(me.role, "prepare") ? (
        <div className="ll-grid ll-grid-2">
          <Card title="1. Download the template" sub={`Version ${IMPORT_TEMPLATE_VERSION}. One row per lease; dates as YYYY-MM-DD; rates as percentages.`}>
            <div className="ll-stack">
              <ul className="ll-muted" style={{ fontSize: 13, listStyle: "disc", paddingLeft: 18 }}>
                <li>Required: {IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.key).join(", ")}</li>
                <li>Leave discount_rate_pct empty to use the IBR curve.</li>
                <li>Irregular payments and options are added on each draft after import.</li>
              </ul>
              <div><Btn onClick={() => downloadText(`ledgerline_leases_template_${IMPORT_TEMPLATE_VERSION}.csv`, toCsv(importTemplateRows()))}><Download size={14} /> Download CSV template</Btn></div>
            </div>
          </Card>
          <Card title="2. Upload the file">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
            <div
              className="input-card"
              style={{ borderStyle: "dashed", justifyContent: "center", padding: 28, cursor: "pointer", flexDirection: "column", textAlign: "center", background: drag ? "var(--accent-subtle)" : undefined }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); void onFile(e.dataTransfer.files[0]); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}
              aria-busy={busy}
            >
              <Upload size={20} className="ll-subtle" />
              <span>{busy ? "Reading file…" : "Drop a CSV or Excel file here, or click to choose"}</span>
              <span className="ll-subtle" style={{ fontSize: 12 }}>Up to 10,000 rows · the same file can&apos;t be imported twice</span>
            </div>
          </Card>
        </div>
      ) : <Banner tone="info">Reviewers can see import history; preparers and administrators run imports.</Banner>}
      <Card title="History" pad={false}>
        {st.imports.length === 0 ? <EmptyState icon={FileSpreadsheet} title="No imports yet" /> : (
          <div className="ll-table-wrap"><table className="ll-table">
            <thead><tr><th>Import</th><th>File</th><th>Status</th><th className="num">Rows</th><th>By</th><th>When</th></tr></thead>
            <tbody>{st.imports.map((b) => (
              <tr key={b.id}>
                <td><Link className="ll-link ll-mono" href={`/leases/imports/${b.id}`}>{b.id}</Link></td>
                <td>{b.fileName}</td>
                <td><StatusBadge tone={STATUS_TONE[b.status]}>{b.status}</StatusBadge></td>
                <td className="num">{b.rows.length || "—"}</td>
                <td>{member(st, b.createdBy).name}</td>
                <td className="ll-muted" style={{ fontSize: 12 }}>{fmtDateTime(b.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </RequireSetup>
  );
}

export function ImportBatchView({ id }: { id: string }) {
  const st = useLeasesState()!;
  const me = useMe()!;
  const router = useRouter();
  const { run, pending } = useAction();
  const b = st.imports.find((x) => x.id === id);
  const [mapping, setMapping] = useState<Record<string, string>>(() => ({ ...(b?.mapping ?? {}) }));
  const [filter, setFilter] = useState<"issues" | "errors" | "warnings" | "all">("issues");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [approver, setApprover] = useState("");
  const running = b?.status === "validating" || b?.status === "committing";
  // rows live on the detail endpoint; poll while a background job runs
  useEffect(() => {
    void refreshImport(id).catch(() => {});
    if (!running) return;
    const t = setInterval(() => void refreshImport(id).catch(() => {}), 1000);
    return () => clearInterval(t);
  }, [id, running]);
  if (!b) return <div className="ll-card"><EmptyState icon={FileSpreadsheet} title="Import not found" actions={<BtnLink href="/leases/imports">Imports</BtnLink>} /></div>;
  if (!b.rows?.length && b.status === "committed" && !b.headers?.length) {
    return (
      <>
        <PageHeader back={{ href: "/leases/imports", label: "Imports" }} title={b.id} badge={<StatusBadge tone="success">committed</StatusBadge>} sub={b.fileName} />
        <Banner tone="info">Loading rows…</Banner>
      </>
    );
  }
  const stepIdx = { uploaded: 0, mapping: 1, validating: 2, validated: 3, committing: 4, committed: 5, failed: 5, cancelled: 5 }[b.status];
  const errorsN = b.rows.filter((r) => r.issues.some((i) => i.severity === "error")).length;
  const warnRows = b.rows.filter((r) => r.action !== "skip" && r.issues.some((i) => i.severity === "warning"));
  const ok = b.rows.filter((r) => r.action !== "skip");
  const created = b.rows.filter((r) => r.outcome === "created" || r.outcome === "updated");
  const failed = b.rows.filter((r) => r.outcome === "failed");
  const rows = b.rows.filter((r) => filter === "all" || (filter === "errors" ? r.issues.some((i) => i.severity === "error") : filter === "warnings" ? r.issues.some((i) => i.severity === "warning") : r.issues.length > 0 || r.outcome === "failed"));
  const errorFile = () => run("err", async () => downloadText(`${b.id}_errors.csv`, await importErrorsCsv(b.id)));
  const reviewers = st.members.filter((p) => p.id !== me.id && p.role !== "analyst");

  return (
    <>
      <PageHeader back={{ href: "/leases/imports", label: "Imports" }} title={b.id} badge={<StatusBadge tone={STATUS_TONE[b.status]}>{b.status}</StatusBadge>} sub={<>{b.fileName} · {b.rows.length} rows · SHA-256 <span className="ll-mono">{b.sha256.slice(0, 12)}…</span></>} actions={!["committed", "cancelled", "committing"].includes(b.status) ? <Btn variant="ghost" onClick={() => setCancelOpen(true)}>Cancel import</Btn> : undefined} />
      <Stepper current={Math.min(stepIdx, 4)} steps={["Upload", "Map columns", "Validate", "Review", "Commit"].map((label, i) => ({ label, done: i < stepIdx, disabled: true }))} />

      {b.status === "mapping" && (
        <Card title="Map your columns" sub="We matched what we could by name. Required columns must be mapped; your mapping is remembered for next time.">
          <div className="ll-fields">
            {IMPORT_COLUMNS.map((c) => (
              <label key={c.key} className="ll-field">
                <span className="ll-label">{c.label}{c.required && <span className="req">*</span>} <span className="ll-code">{c.key}</span></span>
                <Select value={mapping[c.key] ?? ""} onChange={(v) => setMapping({ ...mapping, [c.key]: v })} options={[{ value: "", label: c.required ? "— choose a column —" : "— not in file —" }, ...b.headers.map((h) => ({ value: h, label: h }))]} invalid={c.required && !mapping[c.key]} />
              </label>
            ))}
          </div>
          <div className="ll-row" style={{ marginTop: 16 }}><Btn variant="primary" loading={pending === "map"} onClick={() => run("map", () => setImportMapping(b.id, mapping))}>Validate {b.rows.length} rows</Btn></div>
        </Card>
      )}

      {(b.status === "validating" || b.status === "committing") && (
        <Card title={b.status === "validating" ? "Validating…" : "Committing…"} sub="You can leave this page — it keeps going and you'll get a notification.">
          <Progress value={b.progress} label={b.status} />
          <p className="ll-muted" style={{ fontSize: 13, marginTop: 8 }}>{b.progress}% · {b.status === "committing" ? "each lease is created in its own transaction" : "checking dates, amounts, references and duplicates"}</p>
        </Card>
      )}

      {(b.status === "validated" || b.status === "committed" || b.status === "cancelled") && (
        <>
          <div className="ll-kpis">
            {b.status === "committed" ? (
              <>
                <Kpi label="Created / updated" value={created.length} sub="As drafts — submit them for review" />
                <Kpi label="Failed" value={failed.length} sub={failed.length ? "Retry after fixing" : "None"} />
                <Kpi label="Skipped (errors)" value={errorsN} />
              </>
            ) : (
              <>
                <Kpi label="Ready to import" value={ok.length} />
                <Kpi label="Rows with errors" value={errorsN} sub="Skipped — fix and re-upload" />
                <Kpi label="Rows with warnings" value={warnRows.length} sub={warnRows.length ? (b.warningsAccepted ? "Accepted" : "Need acceptance") : "None"} />
              </>
            )}
          </div>
          {b.status === "validated" && (
            <Card>
              <div className="ll-stack">
                {errorsN > 0 && <Banner tone="danger" title={`${errorsN} row${errorsN > 1 ? "s" : ""} will be skipped`} action={<Btn size="sm" onClick={errorFile}><Download size={13} /> Error file</Btn>}>Download the error file, fix those rows in Excel and upload them as a new file.</Banner>}
                {warnRows.length > 0 && !b.warningsAccepted && <Banner tone="warning" title={`${warnRows.length} row${warnRows.length > 1 ? "s have" : " has"} warnings`} action={<Btn size="sm" onClick={() => run("acc", () => acceptImportWarnings(b.id), "Warnings accepted")}>Accept warnings</Btn>}>Review them below. Accepting is recorded with your name.</Banner>}
                <div className="ll-row">
                  <Btn variant="primary" disabled={!can(me.role, "admin") || (warnRows.length > 0 && !b.warningsAccepted) || ok.length === 0} loading={pending === "commit"} onClick={() => run("commit", () => startCommit(b.id))}>Import {ok.length} lease{ok.length === 1 ? "" : "s"} as drafts</Btn>
                  {!can(me.role, "admin") && <span className="ll-subtle" style={{ fontSize: 12 }}>An administrator commits imports.</span>}
                </div>
              </div>
            </Card>
          )}
          {b.status === "committed" && (
            <Card title="Next" sub="Imported leases are drafts with their calculation done. A reviewer still has to approve each one.">
              <div className="ll-row">
                {failed.length > 0 && <Btn loading={pending === "retry"} onClick={() => run("retry", () => retryFailed(b.id))}><RotateCcw size={14} /> Retry {failed.length} failed</Btn>}
                <Select value={approver} onChange={setApprover} placeholder="Choose a reviewer" options={reviewers.map((p) => ({ value: p.id, label: p.name }))} aria-label="Reviewer" />
                <Btn variant="primary" disabled={!approver || !created.length} loading={pending === "sub"} onClick={async () => { const n = await run("sub", () => submitImported(b.id, approver)); if (n !== undefined) toast("success", `${n} leases submitted for review`); }}><Send size={14} /> Submit all for review</Btn>
                <BtnLink href="/leases/drafts">Open drafts</BtnLink>
              </div>
            </Card>
          )}
          <Card pad={false} title="Rows" actions={<Tabs label="Row filter" value={filter} onChange={setFilter} tabs={[{ id: "issues", label: "Needs attention" }, { id: "errors", label: "Errors", count: errorsN }, { id: "warnings", label: "Warnings", count: warnRows.length }, { id: "all", label: "All", count: b.rows.length }]} />}>
            {rows.length === 0 ? <EmptyState icon={CheckCircle2} title="Nothing here" /> : (
              <div className="ll-table-wrap" style={{ maxHeight: 520, overflowY: "auto" }}><table className="ll-table">
                <thead><tr><th>Row</th><th>Reference</th><th>Name</th><th>Result</th><th>Issues</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.row}>
                    <td className="ll-subtle">{r.row}</td>
                    <td className="ll-mono" style={{ fontSize: 12 }}>{r.ref || "—"}</td>
                    <td>{r.name || "—"}</td>
                    <td>{r.outcome ? <StatusBadge tone={r.outcome === "failed" ? "danger" : r.outcome === "skipped" ? "muted" : "success"}>{r.outcome}{r.outcomeMessage && r.outcome !== "failed" ? ` · ${r.outcomeMessage}` : ""}</StatusBadge> : <StatusBadge tone={r.action === "skip" ? "danger" : r.action === "update" ? "info" : "success"}>{r.action === "skip" ? "will skip" : r.action}</StatusBadge>}</td>
                    <td>
                      <ul style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {r.issues.map((i, k) => <li key={k} style={{ fontSize: 12, display: "flex", gap: 6 }}>{i.severity === "error" ? <XCircle size={12} color="var(--danger)" style={{ flex: "none", marginTop: 2 }} /> : <AlertTriangle size={12} color="var(--warning)" style={{ flex: "none", marginTop: 2 }} />}<span><span className="ll-code">{i.column}</span> {i.message}</span></li>)}
                        {r.outcome === "failed" && <li style={{ fontSize: 12, color: "var(--danger)" }}>{r.outcomeMessage}</li>}
                      </ul>
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>
        </>
      )}
      <Confirm open={cancelOpen} onOpenChange={setCancelOpen} title="Cancel this import?" consequences={["Nothing from this file has been created.", "You can upload the file again later."]} confirmLabel="Cancel import" tone="danger" onConfirm={async () => { await run("cancel", () => cancelImport(b.id), "Import cancelled"); router.push("/leases/imports"); }} />
    </>
  );
}
