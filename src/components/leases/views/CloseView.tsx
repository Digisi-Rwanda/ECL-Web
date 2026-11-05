"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { CalendarCheck, Play, Lock, Unlock, Download, CheckCircle2, RefreshCw, ChevronRight, Upload } from "lucide-react";
import { D, ACCOUNT_LABELS } from "@/lib/leases/engine";
import { monthEnd } from "@/lib/leases/dates";
import { currentPeriod, fmtDateTime, glOf, periodLabel, persona, lastLocked } from "@/lib/leases/model";
import {
  closeOf, startClose, completeStep, stepIssues, generateBatch, resolvePayment, exportBatch, markPosted, lockPeriod, reopenPeriod,
  uploadPayments, confirmScheduledPayments,
  reconciliations, batchTotals, batchStale,
} from "@/lib/leases/store";
import { downloadText } from "@/lib/leases/csv";
import type { CloseStepId, JournalBatch, LeasesState, ActualPayment } from "@/lib/leases/types";
import { PageHeader, Card, Btn, Banner, Money, StatusBadge, EmptyState, TextInput, TextArea, Select, Field, CheckRow, BtnLink } from "@/components/ll/Kit";
import { Confirm, Modal } from "@/components/ll/Overlay";
import { useLeasesState, useMe, useAction, can } from "../use-leases";
import { PersonById, RequireSetup } from "../common";

const STEPS: Array<{ id: CloseStepId; title: string; desc: string }> = [
  { id: "cutoff", title: "Cut-off", desc: "Every lease signed or commenced by month-end is in the register and approved." },
  { id: "rates", title: "Rates & policies", desc: "Approved policy and discount-rate curve in force for the period." },
  { id: "events", title: "Lifecycle events", desc: "CPI reviews, reassessments and modifications effective this month are approved." },
  { id: "generate", title: "Generate entries", desc: "Interest, payments, depreciation, unwinding, remeasurements and catch-ups for every lease." },
  { id: "matching", title: "Payment matching", desc: "Scheduled payments matched to what was actually paid (AP/bank)." },
  { id: "reconcile", title: "Reconciliations", desc: "Subledger ties to the GL; debits equal credits; every account mapped." },
  { id: "approve", title: "Approve batch", desc: "A reviewer — not the person who generated it — approves the journal batch." },
  { id: "post", title: "Post & lock", desc: "Export to the ERP, record the ERP reference, then lock the period." },
];

export function CloseListView() {
  const st = useLeasesState()!;
  const cur = currentPeriod(st);
  return (
    <RequireSetup need={["entity", "periods", "policy", "rates"]}>
      <PageHeader title="Period close" sub="Close one month at a time. A locked month is never rewritten: later changes post as catch-ups." actions={cur ? <BtnLink href={`/leases/close/${cur.key}`} variant="primary"><CalendarCheck size={14} /> {closeOf(st, cur.key) ? "Continue" : "Open"} {periodLabel(cur.key)}</BtnLink> : undefined} />
      <Card pad={false}>
        <div className="ll-table-wrap">
          <table className="ll-table">
            <thead><tr><th>Period</th><th>Status</th><th>Progress</th><th>Batch</th><th>Locked</th><th /></tr></thead>
            <tbody>
              {[...st.periods].reverse().map((p) => {
                const c = closeOf(st, p.key);
                const done = c?.steps.filter((x) => x.status === "done" || x.status === "warning").length ?? 0;
                const b = st.batches.find((x) => x.id === c?.batchId);
                return (
                  <tr key={p.key}>
                    <td><Link href={`/leases/close/${p.key}`} className="ll-link">{periodLabel(p.key)}</Link></td>
                    <td><StatusBadge tone={p.status === "locked" ? "muted" : p.status === "closing" ? "warning" : "success"}>{p.status === "locked" ? <><Lock size={11} /> Locked</> : p.status === "closing" ? "Closing" : "Open"}</StatusBadge>{p.reopenLog.length > 0 && <span className="ll-subtle" style={{ fontSize: 11, marginLeft: 6 }}>reopened {p.reopenLog.length}×</span>}</td>
                    <td style={{ minWidth: 140 }}><div className="ll-progress"><span style={{ width: `${(done / 8) * 100}%` }} /></div></td>
                    <td className="ll-code">{b ? <Link className="ll-link ll-mono" href={`/leases/journals/${b.id}`}>{b.id}</Link> : "—"}</td>
                    <td>{p.lockedBy ? <><PersonById st={st} id={p.lockedBy} /> <span className="ll-subtle" style={{ fontSize: 11 }}>{fmtDateTime(p.lockedAt)}</span></> : "—"}</td>
                    <td><ChevronRight size={14} className="ll-subtle" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </RequireSetup>
  );
}

export function CloseView({ period }: { period: string }) {
  const st = useLeasesState()!;
  const p = st.periods.find((x) => x.key === period);
  if (!p) return <div className="ll-card"><EmptyState icon={CalendarCheck} title="Period not open" body="Periods open one month at a time after the previous one is locked." actions={<BtnLink href="/leases/close">All periods</BtnLink>} /></div>;
  return <RequireSetup><Close period={period} /></RequireSetup>;
}

function Close({ period }: { period: string }) {
  const st = useLeasesState()!;
  const me = useMe()!;
  const { run, pending } = useAction();
  const p = st.periods.find((x) => x.key === period)!;
  const c = closeOf(st, period);
  const b = st.batches.find((x) => x.id === c?.batchId);
  const [accept, setAccept] = useState<CloseStepId | null>(null);
  const [note, setNote] = useState("");
  const [lockOpen, setLockOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [erpRef, setErpRef] = useState("");
  const [genProgress, setGenProgress] = useState<number | null>(null);
  const prevOpen = st.periods.find((x, i) => st.periods[i + 1]?.key === period && x.status !== "locked");
  const today = new Date().toISOString().slice(0, 10);
  const ended = today > monthEnd(period);
  const locked = p.status === "locked";
  const last = lastLocked(st);

  const generate = async () => {
    // a visible job: progress while the batch is built lease by lease
    setGenProgress(5);
    const timer = setInterval(() => setGenProgress((x) => Math.min(92, (x ?? 0) + 11)), 120);
    await run("gen", () => generateBatch(period), "Journal batch generated");
    clearInterval(timer);
    setGenProgress(null);
  };

  if (!c) {
    return (
      <>
        <PageHeader back={{ href: "/leases/close", label: "Period close" }} title={`${periodLabel(period)} close`} badge={<StatusBadge tone={locked ? "muted" : "success"}>{locked ? "Locked" : "Open"}</StatusBadge>} />
        {p.reopenLog.length > 0 && !locked && <Banner tone="warning" title="This period was reopened">“{p.reopenLog.at(-1)!.reason}” — {persona(st, p.reopenLog.at(-1)!.by).name}, {fmtDateTime(p.reopenLog.at(-1)!.at)}. The previous batch was reversed; run the close again.</Banner>}
        <Card>
          <EmptyState
            icon={CalendarCheck}
            title={locked ? "This period was locked without a close record" : "Close not started"}
            body={prevOpen ? `Close ${periodLabel(prevOpen.key)} first.` : !ended ? `${periodLabel(period)} hasn't ended yet. You can start early to preview entries; posting is usually done after month-end.` : "Start the close to generate this month's lease journals."}
            actions={!locked && !prevOpen && can(me.role, "prepare") ? <Btn variant="primary" loading={pending === "start"} onClick={() => run("start", () => startClose(period), "Close started")}><Play size={14} /> Start close</Btn> : undefined}
          />
        </Card>
      </>
    );
  }
  const done = c.steps.filter((x) => x.status === "done" || x.status === "warning").length;
  const recs = reconciliations(st, c);

  return (
    <>
      <PageHeader
        back={{ href: "/leases/close", label: "Period close" }}
        title={`${periodLabel(period)} close`}
        badge={<StatusBadge tone={locked ? "muted" : "warning"}>{locked ? "Locked" : `${done} of 8 done`}</StatusBadge>}
        sub={<>Started by {persona(st, c.startedBy).name} · {fmtDateTime(c.startedAt)}</>}
        actions={locked && last?.key === period && can(me.role, "admin") ? <Btn onClick={() => setReopenOpen(true)}><Unlock size={14} /> Reopen period</Btn> : undefined}
      />
      {locked && <Banner tone="locked" title={`${periodLabel(period)} is locked`}>Locked by {persona(st, p.lockedBy).name} {fmtDateTime(p.lockedAt)}. Changes dated in this month post as catch-ups in the next open period.</Banner>}
      {p.reopenLog.length > 0 && !locked && <Banner tone="warning" title="This period was reopened">“{p.reopenLog.at(-1)!.reason}” — {persona(st, p.reopenLog.at(-1)!.by).name}, {fmtDateTime(p.reopenLog.at(-1)!.at)}. The previous batch was reversed.</Banner>}
      <div className="ll-progress" aria-hidden="true"><span style={{ width: `${(done / 8) * 100}%` }} /></div>

      <Card pad={false}>
        <ol className="ll-clist">
          {STEPS.map((s, i) => {
            const step = c.steps.find((x) => x.id === s.id)!;
            const issues = step.status === "locked" ? { errors: [], warnings: [] } : stepIssues(st, c, s.id);
            const finished = step.status === "done" || step.status === "warning";
            return (
              <li key={s.id} className={`ll-citem ${step.status}`}>
                <span className="n">{finished ? (step.status === "warning" ? "!" : <CheckCircle2 size={14} />) : step.status === "locked" ? i + 1 : i + 1}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p className="d">{s.desc}</p>
                  {finished && <p className="d">Done by {persona(st, step.doneBy).name} · {fmtDateTime(step.doneAt)}{step.note ? ` — “${step.note}”` : ""}</p>}
                </div>
                <div className="act">
                  {!locked && !finished && step.status !== "locked" && s.id !== "generate" && s.id !== "post" && s.id !== "matching" && (
                    issues.warnings.length && !issues.errors.length
                      ? <Btn size="sm" onClick={() => { setAccept(s.id); setNote(""); }}>Review warning</Btn>
                      : <Btn size="sm" variant="primary" disabled={!!issues.errors.length || (s.id === "approve" && !can(me.role, "review"))} loading={pending === s.id} onClick={() => run(s.id, () => completeStep(period, s.id), `${s.title} done`)}>{s.id === "approve" ? "Approve batch" : "Mark done"}</Btn>
                  )}
                  {!locked && s.id === "generate" && step.status !== "locked" && (b?.status ?? "draft") === "draft" && <Btn size="sm" variant={finished ? "secondary" : "primary"} loading={pending === "gen"} onClick={generate}>{finished ? <><RefreshCw size={13} /> Regenerate</> : "Generate"}</Btn>}
                </div>
                {step.status !== "locked" && !finished && (issues.errors.length > 0 || issues.warnings.length > 0) && (
                  <div className="body">
                    {issues.errors.map((e) => <CheckRow key={e} ok={false} label={e} />)}
                    {issues.warnings.map((e) => <CheckRow key={e} ok={false} warn label={e} />)}
                  </div>
                )}
                {s.id === "generate" && genProgress !== null && <div className="body"><div className="ll-progress" role="progressbar" aria-valuenow={genProgress} aria-label="Generating"><span style={{ width: `${genProgress}%` }} /></div><p className="d">Building entries lease by lease…</p></div>}
                {s.id === "generate" && b && <div className="body"><BatchSummary st={st} b={b} /></div>}
                {s.id === "matching" && step.status !== "locked" && <div className="body"><Matching period={period} payments={c.payments} locked={locked} /></div>}
                {s.id === "matching" && !finished && step.status !== "locked" && !locked && (
                  <div className="body"><Btn size="sm" variant="primary" disabled={!!issues.errors.length} loading={pending === "matching"} onClick={() => run("matching", () => completeStep(period, "matching"), "Payments matched")}>Mark done</Btn></div>
                )}
                {s.id === "reconcile" && step.status !== "locked" && (
                  <div className="body ll-card" style={{ marginTop: 8 }}>
                    {recs.map((r) => <CheckRow key={r.id} ok={r.ok} label={r.label} detail={`subledger ${D(r.books).toFixed(2)} · GL ${D(r.gl).toFixed(2)} · difference ${r.diff}`} />)}
                  </div>
                )}
                {s.id === "approve" && step.status === "todo" && b && b.createdBy === me.id && <div className="body"><p className="d">You generated this batch, so a reviewer or another administrator must approve it.</p></div>}
                {s.id === "post" && step.status !== "locked" && b && !locked && (
                  <div className="body ll-stack" style={{ marginTop: 8 }}>
                    <div className="ll-row">
                      <Btn size="sm" loading={pending === "exp"} onClick={() => run("exp", () => downloadBatch(b.id))}><Download size={13} /> Export journal file</Btn>
                      {b.exportedAt && <span className="ll-subtle" style={{ fontSize: 12 }}>Exported {fmtDateTime(b.exportedAt)} · idempotency key <span className="ll-mono">{b.idempotencyKey}</span></span>}
                    </div>
                    {b.status !== "posted" ? (
                      <div className="ll-row" style={{ alignItems: "flex-end" }}>
                        <Field label="ERP document reference" hint="From your ERP after importing the file. Posting twice is blocked."><TextInput value={erpRef} onChange={setErpRef} placeholder="e.g. SAP-JE-202611-4411" disabled={!can(me.role, "admin") || b.status === "draft"} /></Field>
                        <Btn size="sm" variant="primary" disabled={!erpRef.trim() || !can(me.role, "admin")} loading={pending === "post"} onClick={() => run("post", () => markPosted(b.id, erpRef), "Batch marked as posted")}>Mark posted</Btn>
                      </div>
                    ) : (
                      <div className="ll-row"><StatusBadge tone="success">Posted · {b.erpRef}</StatusBadge><Btn size="sm" variant="primary" disabled={!can(me.role, "admin")} onClick={() => setLockOpen(true)}><Lock size={13} /> Lock {periodLabel(period)}</Btn>{!can(me.role, "admin") && <span className="ll-subtle" style={{ fontSize: 12 }}>Only an administrator can lock.</span>}</div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      <Modal open={!!accept} onOpenChange={(o) => !o && setAccept(null)} title="Accept the warning?" footer={<><Btn onClick={() => setAccept(null)}>Cancel</Btn><Btn variant="primary" loading={pending === "acc"} onClick={async () => { const ok = await run("acc", () => completeStep(period, accept!, note, true), "Accepted with reason"); if (ok !== undefined) setAccept(null); }}>Accept and continue</Btn></>}>
        {accept && stepIssues(st, c, accept).warnings.map((w) => <Banner key={w} tone="warning">{w}</Banner>)}
        <Field label="Reason (kept in the audit trail)" required><TextArea value={note} onChange={setNote} rows={3} /></Field>
      </Modal>
      <Confirm
        open={lockOpen}
        onOpenChange={setLockOpen}
        title={`Lock ${periodLabel(period)}?`}
        tone="danger"
        typeToConfirm={period}
        consequences={[`${periodLabel(period)} becomes read-only everywhere.`, "Changes dated in this month will post as catch-ups in the next period.", "Reopening needs an administrator, a reason, and reverses the posted batch."]}
        confirmLabel="Lock period"
        onConfirm={() => run("lock", () => lockPeriod(period), `${periodLabel(period)} locked`)}
      />
      <Modal open={reopenOpen} onOpenChange={setReopenOpen} title={`Reopen ${periodLabel(period)}?`} footer={<><Btn onClick={() => setReopenOpen(false)}>Cancel</Btn><Btn variant="danger" disabled={!reopenReason.trim()} loading={pending === "re"} onClick={async () => { const ok = await run("re", () => reopenPeriod(period, reopenReason), "Period reopened"); if (ok !== undefined) setReopenOpen(false); }}>Reopen</Btn></>}>
        <ul style={{ paddingLeft: 18, listStyle: "disc", color: "var(--text-muted)", fontSize: 14 }}>
          <li>The posted batch {b?.id} is reversed with a linked reversal batch.</li>
          <li>The close restarts; a banner shows on every page until it&apos;s locked again.</li>
        </ul>
        <Field label="Reason" required><TextArea value={reopenReason} onChange={setReopenReason} rows={3} placeholder="e.g. Auditor adjustment to the Musanze CPI uplift" /></Field>
      </Modal>
    </>
  );
}

function BatchSummary({ st, b }: { st: LeasesState; b: JournalBatch }) {
  const t = batchTotals(b);
  const byAcc = useMemo(() => {
    const m = new Map<string, ReturnType<typeof D>>();
    for (const l of b.lines) m.set(l.account, (m.get(l.account) ?? D(0)).plus(l.debit).minus(l.credit));
    return [...m.entries()];
  }, [b]);
  const catchUps = b.lines.filter((l) => l.catchUp);
  const gl = glOf(st)?.accounts as Record<string, string> | undefined;
  return (
    <div className="ll-stack" style={{ marginTop: 8 }}>
      {batchStale(st, b) && <Banner tone="warning" title="Out of date">Leases were approved after this batch was generated. Regenerate it.</Banner>}
      {catchUps.length > 0 && <Banner tone="info" title={`${new Set(catchUps.map((l) => l.leaseId)).size} lease(s) with catch-up entries`}>Back-dated changes affecting locked months are posted here, in {periodLabel(b.period)}.</Banner>}
      <div className="ll-row"><Link href={`/leases/journals/${b.id}`} className="ll-link ll-mono">{b.id}</Link><StatusBadge tone={b.status === "posted" ? "success" : b.status === "draft" ? "neutral" : "info"}>{b.status}</StatusBadge><span className="ll-muted" style={{ fontSize: 12 }}>{b.lines.length} lines · Dr {Number(t.dr).toLocaleString()} = Cr {Number(t.cr).toLocaleString()} {t.balanced ? "✓" : "✗"}</span></div>
      <div className="ll-table-wrap"><table className="ll-table">
        <thead><tr><th>Account</th><th className="num">Net Dr / (Cr)</th></tr></thead>
        <tbody>{byAcc.map(([a, v]) => <tr key={a}><td>{gl?.[a] && <span className="ll-code" style={{ marginRight: 6 }}>{gl[a]}</span>}{ACCOUNT_LABELS[a as keyof typeof ACCOUNT_LABELS]}</td><td className="num"><Money value={v.toFixed(2)} /></td></tr>)}</tbody>
      </table></div>
    </div>
  );
}

function Matching({ period, payments, locked }: { period: string; payments: ActualPayment[]; locked: boolean }) {
  const st = useLeasesState()!;
  const { run } = useAction();
  const [open, setOpen] = useState<ActualPayment | null>(null);
  const [res, setRes] = useState<NonNullable<ActualPayment["resolution"]>>("accrue");
  const [note, setNote] = useState("");
  const apRef = useRef<HTMLInputElement>(null);
  const issues = payments.filter((p) => p.match !== "matched");
  const matched = payments.length - issues.length;
  const unpaid = issues.filter((p) => p.match === "late" && !p.resolution).length;
  return (
    <div className="ll-stack" style={{ marginTop: 8 }}>
      <p className="d">{matched} of {payments.length} scheduled payments matched (vendor, amount, ±10 days). {issues.filter((x) => !x.resolution).length} need a decision.</p>
      {!locked && (
        <div className="ll-row">
          <input ref={apRef} type="file" accept=".csv,.xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void run("ap", () => uploadPayments(period, f), "Payments file matched"); }} />
          <Btn size="sm" onClick={() => apRef.current?.click()}><Upload size={13} /> Upload AP / bank file</Btn>
          {unpaid > 0 && <Btn size="sm" onClick={() => run("conf", () => confirmScheduledPayments(period), `${unpaid} payments confirmed as paid`)}>Confirm {unpaid} paid as scheduled</Btn>}
          <span className="ll-subtle" style={{ fontSize: 12 }}>File columns: date, vendor, amount, reference.</span>
        </div>
      )}
      <div className="ll-table-wrap"><table className="ll-table">
        <thead><tr><th>Ref</th><th>Vendor</th><th>Lease</th><th className="num">Expected</th><th className="num">Paid</th><th>Status</th><th /></tr></thead>
        <tbody>
          {issues.map((p) => {
            const l = st.leases.find((x) => x.id === p.leaseId);
            return (
              <tr key={p.id}>
                <td className="ll-code">{p.reference}</td>
                <td>{p.vendor}</td>
                <td>{l ? <Link className="ll-link" href={`/leases/${l.id}`}>{l.code}</Link> : <span className="ll-subtle">none</span>}</td>
                <td className="num"><Money value={p.expected} /></td>
                <td className="num"><Money value={p.amount} /></td>
                <td><StatusBadge tone={p.resolution ? "neutral" : "warning"}>{p.match === "late" ? "Awaiting payment" : p.match === "different" ? "Different amount" : "No lease"}{p.resolution ? ` → ${p.resolution.replace("_", " ")}` : ""}</StatusBadge></td>
                <td>{!locked && <Btn size="sm" onClick={() => { setOpen(p); setRes(p.match === "unmatched" ? "not_lease" : p.match === "late" ? "accrue" : "event"); setNote(p.resolutionNote ?? ""); }}>{p.resolution ? "Change" : "Resolve"}</Btn>}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      <Modal open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={`Resolve ${open?.reference}`} footer={<><Btn onClick={() => setOpen(null)}>Cancel</Btn><Btn variant="primary" onClick={async () => { const ok = await run("res", () => resolvePayment(period, open!.id, res, note), "Resolved"); if (ok !== undefined) setOpen(null); }}>Save</Btn></>}>
        {open && <p className="ll-muted" style={{ fontSize: 14 }}>{open.vendor} · expected {open.expected ?? "—"} · paid {open.amount}</p>}
        <Field label="Resolution">
          <Select value={res} onChange={setRes} options={[
            { value: "accrue", label: "Late — keep the liability reduction, accrue the payable" },
            { value: "event", label: "Rent changed — record a CPI/modification event on the lease" },
            { value: "not_lease", label: "Not a lease payment — exclude" },
            { value: "accepted", label: "Accept difference (e.g. bank charges)" },
          ]} />
        </Field>
        {res === "event" && open?.leaseId && <Banner tone="info">Record the change on <Link className="ll-link" href={`/leases/${open.leaseId}`}>the lease</Link>; it will flow into this or the next batch.</Banner>}
        <Field label="Note" required={res !== "accepted"}><TextArea value={note} onChange={setNote} rows={2} /></Field>
      </Modal>
    </div>
  );
}

/** Server builds the ERP journal file (and marks the batch exported); we just save it. */
async function downloadBatch(code: string) {
  downloadText(`${code}.csv`, await exportBatch(code));
}

export { downloadBatch, BatchSummary };
