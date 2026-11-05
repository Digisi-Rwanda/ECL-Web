"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pencil, Plus, Download, Undo2, CheckCircle2, CornerUpLeft, Lock, GitCompare, MessageSquare } from "lucide-react";
import { D, ACCOUNT_LABELS } from "@/lib/leases/engine";
import { monthEnd } from "@/lib/leases/dates";
import {
  approvedChain, balancesAt, computeLease, computeVersions, computeWithPending, currentPeriod, enginePolicy, fmtDate, fmtDateTime, isExempt,
  leaseStatus, pct, pendingVersion, persona, periodLabel, todayISO, glOf,
} from "@/lib/leases/model";
import { decide, withdraw, documentUrl } from "@/lib/leases/store";
import { toCsv, downloadText } from "@/lib/leases/csv";
import { ASSET_CLASSES, type Lease, type LeaseVersion } from "@/lib/leases/types";
import { PageHeader, Card, Btn, BtnLink, Banner, Money, Tabs, StatusBadge, EmptyState, Select, TextArea, Field, Kpi } from "@/components/ll/Kit";
import { Modal } from "@/components/ll/Overlay";

import { useLeasesState, useMe, useQueryParam, useAction, can } from "../use-leases";
import { LeaseStatusBadge, PersonById, RequireSetup } from "../common";
import { ScheduleTables, IntegrityChecks } from "../ScheduleTables";
import { EventDrawer } from "../EventDrawer";

type Tab = "summary" | "schedules" | "payments" | "journals" | "assessment" | "documents" | "history";
const EVENT_LABEL: Record<string, string> = { initial: "Initial recognition", index: "CPI / index change", term: "Term reassessment", modification: "Modification", termination: "Termination" };

export function LeaseDetailView({ id }: { id: string }) {
  const st = useLeasesState()!;
  const lease = st.leases.find((l) => l.id === id);
  if (!lease) {
    return <div className="ll-card"><EmptyState icon={FileText} title="Lease not found" body="It may have been discarded, or the link is wrong." actions={<BtnLink href="/leases/register">All leases</BtnLink>} /></div>;
  }
  return <RequireSetup><Detail lease={lease} /></RequireSetup>;
}

function Detail({ lease }: { lease: Lease }) {
  const st = useLeasesState()!;
  const me = useMe()!;
  const router = useRouter();
  const [tab, setTab] = useQueryParam("tab", "summary");
  const [vq, setVq] = useQueryParam("v");
  const [eventOpen, setEventOpen] = useState(false);
  const [decision, setDecision] = useState<"approve" | "return" | null>(null);
  const [comment, setComment] = useState("");
  const [field, setField] = useState("");
  const [compare, setCompare] = useState(false);
  const { run, pending } = useAction();
  const chain = approvedChain(lease);
  const pend = pendingVersion(lease);
  const status = leaseStatus(lease);
  const lessor = st.counterparties.find((c) => c.id === lease.counterpartyId)?.name ?? "—";
  const period = currentPeriod(st);
  const asOf = period ? monthEnd(period.key) : todayISO();
  const selected = lease.versions.find((v) => String(v.n) === vq) ?? pend ?? chain.at(-1) ?? lease.versions.at(-1)!;
  const viewingPending = selected === pend;
  const exempt = isExempt(chain[0] ?? lease.versions[0]);

  // what to show in schedules: approved books, or the chain up to the selected version
  const selN = selected.n;
  const comp = useMemo(() => {
    if (exempt) return undefined;
    if (viewingPending) return computeWithPending(st, lease);
    const all = approvedChain(lease);
    const upto = all.filter((v) => v.n <= selN);
    if (!upto.length) return undefined;
    return upto.length === all.length ? computeLease(st, lease) : computeVersions(`${st.tenantId}:${lease.id}:${lease.rev}:upto${selN}`, upto, enginePolicy(st));
  }, [st, lease, selN, viewingPending, exempt]);
  const bal = chain.length ? balancesAt(st, lease, asOf) : undefined;
  const canReview = pend?.status === "in_review" && can(me.role, "review") && pend.submittedBy !== me.id && pend.createdBy !== me.id;
  const lockedPeriods = st.periods.filter((p) => p.status === "locked").length;

  const exportCsv = () => {
    if (!comp) return;
    downloadText(`${lease.code}_schedule.csv`, toCsv([
      ["lease", lease.code, lease.name], ["currency", lease.currency], ["rate", selected.rate.value], ["version", `v${selected.n}`], [],
      ["month", "liab_opening", "additions", "interest", "payments", "remeasurement", "derecognised", "liab_closing", "rou_opening", "rou_additions", "depreciation", "rou_adjustment", "rou_derecognised", "rou_closing", "gain_loss"],
      ...comp.rows.map((r) => [r.month, r.liabOpening, r.additions, r.interest, r.payments, r.remeasurement, r.derecognised, r.liabClosing, r.rouOpening, r.rouAdditions, r.depreciation, r.rouAdjustment, r.rouDerecognised, r.rouClosing, r.gainLoss]),
      [], ["journals"], ["date", "entry", "account", "gl", "debit", "credit"],
      ...comp.journals.map((j) => [j.date, j.memo, ACCOUNT_LABELS[j.account], glOf(st)?.accounts[j.account] ?? "", j.debit, j.credit]),
    ]));
  };

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "summary", label: "Summary" },
    { id: "schedules", label: "Schedules" },
    { id: "payments", label: "Payments" },
    { id: "journals", label: "Journals" },
    { id: "assessment", label: "Assessment" },
    { id: "documents", label: "Documents", count: lease.docs.length },
    { id: "history", label: "History", count: lease.versions.length },
  ];
  const t = tab as Tab;

  return (
    <>
      <PageHeader
        back={{ href: "/leases/register", label: "All leases" }}
        eyebrow={`${lease.code} · ${ASSET_CLASSES[lease.assetClass]} · ${lessor}`}
        title={lease.name}
        badge={<LeaseStatusBadge status={status} />}
        sub={
          <>
            <span className="ll-row" style={{ gap: 6 }}>
              Version
              <select className="select" style={{ height: 28, width: "auto", fontSize: 12 }} value={selected.n} onChange={(e) => setVq(e.target.value)} aria-label="Version">
                {[...lease.versions].reverse().map((v) => <option key={v.n} value={v.n}>v{v.n} · {EVENT_LABEL[v.event]} · {v.status.replace("_", " ")}</option>)}
              </select>
            </span>
            {selected.n > 1 && <Btn size="sm" variant="ghost" onClick={() => setCompare(true)}><GitCompare size={13} /> Compare with v{selected.n - 1}</Btn>}
          </>
        }
        actions={
          <>
            <Btn onClick={exportCsv} disabled={!comp}><Download size={14} /> Export</Btn>
            {pend && (pend.status === "draft" || pend.status === "returned") && can(me.role, "prepare") && pend.event === "initial" && <BtnLink href={`/leases/new?draft=${lease.id}`} variant="primary"><Pencil size={14} /> Continue draft</BtnLink>}
            {pend?.status === "in_review" && pend.submittedBy === me.id && <Btn loading={pending === "wd"} onClick={() => run("wd", () => withdraw(lease.id, lease.rev), "Withdrawn — back to draft")}><Undo2 size={14} /> Withdraw</Btn>}
            {!pend && chain.length > 0 && !exempt && (status === "active" || status === "not_commenced") && can(me.role, "prepare") && <Btn variant="primary" onClick={() => setEventOpen(true)}><Plus size={14} /> Record change</Btn>}
          </>
        }
      />

      {pend?.status === "in_review" && (
        <Banner tone="info" title={`${pend.event === "initial" ? "New lease" : EVENT_LABEL[pend.event]} v${pend.n} is in review`}>
          Submitted by {persona(st, pend.submittedBy!).name} {fmtDateTime(pend.submittedAt)} · reviewer {persona(st, pend.approverId!).name}
          {pend.event !== "initial" && <> · effective {fmtDate(pend.effectiveDate)}. The books still show v{chain.at(-1)?.n} until it&apos;s approved.</>}
        </Banner>
      )}
      {pend && pend.event !== "initial" && pend.status !== "in_review" && <Banner tone="warning" title={`Change v${pend.n} is a draft`}>{pend.status === "returned" ? "It was returned with comments — see History." : "Submit it for review or discard it."}</Banner>}
      {lease.verificationFailed && <Banner tone="danger" title="Stored schedule no longer matches its inputs">The nightly check recalculated this lease and got different books. Record a change to recalculate and re-approve, or contact support.</Banner>}
      {status === "terminated" && <Banner tone="locked" title="Terminated">Ended {fmtDate(chain.at(-1)!.effectiveDate)}. History is kept; no further changes.</Banner>}
      {status === "expired" && <Banner tone="locked" title="Expired">The lease term ended {fmtDate(chain.at(-1)!.terms.endDate)}. If you still occupy the asset, record a term reassessment or a new lease (holdover).</Banner>}
      {selected !== (pend ?? chain.at(-1)) && <Banner tone="info" title={`Viewing v${selected.n} (${selected.status})`} action={<Btn size="sm" onClick={() => setVq("")}>Back to latest</Btn>}>Schedules show the books as they were with this version.</Banner>}

      {bal && !exempt && (
        <div className="ll-kpis">
          {status === "not_commenced" && comp ? (
            <>
              <Kpi label="Liability at commencement" value={<Money value={comp.segments[0].L0.toFixed(2)} />} sub={`Recognised ${fmtDate(chain[0].terms.commencementDate)}`} />
              <Kpi label="Right-of-use at commencement" value={<Money value={comp.segments[0].R0.toFixed(2)} />} sub="Commitment until then" />
            </>
          ) : (
            <>
              <Kpi label={`Liability at ${fmtDate(asOf)}`} value={<Money value={bal.liability} />} sub={D(bal.current).isZero() ? lease.currency : <>Current <Money value={bal.current} /></>} />
              <Kpi label="Right-of-use NBV" value={<Money value={bal.rou} />} sub={lease.currency} />
            </>
          )}
          <Kpi label="Discount rate" value={pct(chain.at(-1)!.rate.value)} sub={chain.at(-1)!.rate.source === "curve" ? `curve v${chain.at(-1)!.rate.curveVersion}` : chain.at(-1)!.rate.source} />
          <Kpi label="Lease term" value={`${Math.round((new Date(chain.at(-1)!.terms.endDate).getTime() - new Date(chain[0].terms.commencementDate).getTime()) / 2.6298e9)} months`} sub={`${fmtDate(chain[0].terms.commencementDate)} – ${fmtDate(chain.at(-1)!.terms.endDate)}`} />
        </div>
      )}

      <Tabs label="Lease sections" value={t} onChange={(x) => setTab(x)} tabs={tabs} />

      {t === "summary" && (
        <div className="ll-split">
          <Card title="Key facts">
            <dl className="ll-dl">
              <dt>Lessor</dt><dd>{lessor}</dd>
              <dt>Location</dt><dd>{lease.location || "—"}</dd>
              <dt>Owner</dt><dd><PersonById st={st} id={lease.ownerId} /></dd>
              <dt>Cost centre</dt><dd>{lease.costCentre || "—"}</dd>
              <dt>Commencement</dt><dd>{fmtDate(selected.terms.commencementDate)}</dd>
              <dt>End of lease term</dt><dd>{fmtDate(selected.terms.endDate)}</dd>
              <dt>Payments</dt><dd>{selected.terms.paymentRule ? `${Number(selected.terms.paymentRule.amountSteps?.at(-1)?.amount ?? selected.terms.paymentRule.amount).toLocaleString()} ${selected.terms.paymentRule.frequency}, in ${selected.terms.paymentRule.timing}` : "Manual lines"}{selected.terms.paymentRule?.escalation.type === "fixed_pct" ? ` · +${pct(selected.terms.paymentRule.escalation.pct)} every ${selected.terms.paymentRule.escalation.everyMonths} months` : ""}</dd>
              <dt>Treatment</dt><dd>{exempt ? `Exempt (${selected.assessment.exemption?.replace("_", "-")})` : "Capitalised (IFRS 16)"}</dd>
              <dt>Discount rate</dt><dd>{exempt ? "—" : `${pct(selected.rate.value)} · ${selected.rate.source}${selected.rate.reason ? ` — ${selected.rate.reason}` : ""}`}</dd>
              {bal && !exempt && status !== "not_commenced" && <><dt>Current / non-current</dt><dd><Money value={bal.current} /> / <Money value={bal.nonCurrent} /></dd></>}
            </dl>
          </Card>
          <Card title="Timeline">
            <Timeline lease={lease} />
            {comp && <div style={{ marginTop: 16 }}><IntegrityChecks c={comp} /></div>}
          </Card>
        </div>
      )}

      {t === "schedules" && (exempt ? <Card title="Exempt lease"><p className="ll-muted">No liability or ROU schedule — payments are expensed straight-line. See Journals.</p></Card> : comp ? <Card title={viewingPending ? `Schedules including pending v${selected.n}` : "Schedules"} sub={lockedPeriods ? `${lockedPeriods} locked periods shown with a lock.` : undefined}><ScheduleTables c={comp} currency={lease.currency} /></Card> : <Card><EmptyState icon={FileText} title="Not calculated yet" body="Finish the draft to see schedules." /></Card>)}

      {t === "payments" && <PaymentsTab lease={lease} />}
      {t === "journals" && <JournalsTab lease={lease} />}
      {t === "assessment" && <AssessmentTab v={selected} />}
      {t === "documents" && (
        <Card title="Documents" sub="Fingerprinted on upload; files on approved versions can't be removed.">
          {lease.docs.length === 0 ? <EmptyState icon={FileText} title="No documents" body="Attach the signed contract from the draft." /> : (
            <div className="ll-table-wrap"><table className="ll-table">
              <thead><tr><th>File</th><th>Kind</th><th>Version</th><th>SHA-256</th><th>Uploaded</th><th /></tr></thead>
              <tbody>{lease.docs.map((d) => <tr key={d.id}><td>{d.name}</td><td>{d.kind}</td><td>v{d.versionN}</td><td className="ll-code">{d.sha256.slice(0, 16)}…</td><td><PersonById st={st} id={d.uploadedBy} /> <span className="ll-subtle" style={{ fontSize: 11 }}>{fmtDateTime(d.uploadedAt)}</span></td><td><Btn size="sm" variant="ghost" onClick={async () => { const w = window.open("", "_blank"); try { const url = await documentUrl(lease.id, d.id); if (w) w.location.href = url; } catch { w?.close(); } }}>Open</Btn></td></tr>)}</tbody>
            </table></div>
          )}
        </Card>
      )}
      {t === "history" && <HistoryTab lease={lease} />}

      {canReview && (
        <div className="ll-actionbar" role="region" aria-label="Review">
          <span className="ll-save"><MessageSquare size={13} /> {pend!.approverId === me.id ? <>You&apos;re the reviewer for v{pend!.n}.</> : <>Assigned to {persona(st, pend!.approverId).name} — as an administrator you can also decide.</>} Check the schedules and checks first.</span>
          <span className="ll-spacer" />
          <Btn onClick={() => setDecision("return")}><CornerUpLeft size={14} /> Return</Btn>
          <Btn variant="primary" onClick={() => setDecision("approve")}><CheckCircle2 size={14} /> Approve</Btn>
        </div>
      )}
      {pend?.status === "in_review" && !canReview && pend.approverId === me.id && <Banner tone="info">You prepared this version, so someone else must approve it.</Banner>}

      <Modal
        open={!!decision}
        onOpenChange={(o) => !o && setDecision(null)}
        title={decision === "approve" ? `Approve v${pend?.n}?` : `Return v${pend?.n} to ${persona(st, pend?.submittedBy).name}?`}
        footer={
          <>
            <Btn onClick={() => setDecision(null)}>Cancel</Btn>
            <Btn
              variant="primary"
              loading={pending === "dc"}
              onClick={async () => {
                const ok = await run("dc", () => decide(lease.id, lease.rev, decision === "approve", comment, field || undefined), decision === "approve" ? `${lease.code} v${pend?.n} approved` : "Returned with comments");
                if (ok !== undefined) { setDecision(null); setComment(""); setField(""); if (decision === "return") router.push("/leases/inbox"); }
              }}
            >{decision === "approve" ? "Approve" : "Return"}</Btn>
          </>
        }
      >
        {decision === "approve" ? (
          <ul style={{ paddingLeft: 18, listStyle: "disc", color: "var(--text-muted)", fontSize: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            <li>v{pend?.n} becomes part of the books and is locked; later changes are new versions.</li>
            <li>Its journals go into the next close batch{pend && pend.effectiveDate && st.periods.some((p) => p.status === "locked" && p.key === pend.effectiveDate.slice(0, 7)) ? " — including a catch-up for locked months" : ""}.</li>
            <li>Nothing is posted to the ledger until the batch is approved and posted.</li>
          </ul>
        ) : (
          <>
            <Field label="Which part needs work?"><Select value={field} onChange={setField} options={[{ value: "", label: "General" }, { value: "commencementDate", label: "Dates" }, { value: "amount", label: "Payments" }, { value: "options", label: "Options / lease term" }, { value: "rate", label: "Discount rate" }, { value: "exemption", label: "Exemption" }]} /></Field>
          </>
        )}
        <Field label={decision === "approve" ? "Comment (optional)" : "What needs to change"} required={decision === "return"}><TextArea value={comment} onChange={setComment} rows={3} /></Field>
      </Modal>
      <Modal open={compare} onOpenChange={setCompare} title={`v${selected.n - 1} → v${selected.n}`}>
        <DiffView a={lease.versions.find((v) => v.n === selected.n - 1)} b={selected} />
      </Modal>
      <EventDrawer lease={lease} open={eventOpen} onOpenChange={setEventOpen} />
    </>
  );
}

function Timeline({ lease }: { lease: Lease }) {
  const chain = approvedChain(lease);
  const first = chain[0] ?? lease.versions[0];
  const last = chain.at(-1) ?? lease.versions.at(-1)!;
  const start = first.terms.commencementDate;
  const end = last.terms.endDate;
  if (!start || !end) return <p className="ll-muted">Dates not set.</p>;
  const span = new Date(end).getTime() - new Date(start).getTime();
  const pos = (d: string) => Math.max(0, Math.min(100, ((new Date(d).getTime() - new Date(start).getTime()) / span) * 100));
  const today = todayISO();
  const pts: Array<{ d: string; label: string; cls: string }> = [
    { d: start, label: `Start ${fmtDate(start)}`, cls: "" },
    ...lease.versions.filter((v) => v.event !== "initial" && v.status !== "withdrawn").map((v) => ({ d: v.effectiveDate, label: `v${v.n} ${EVENT_LABEL[v.event]}${v.status !== "approved" ? " (pending)" : ""}`, cls: "event" })),
    ...last.assessment.options.filter((o) => o.noticeDate).map((o) => ({ d: o.noticeDate!, label: `Notice ${fmtDate(o.noticeDate)}`, cls: "option" })),
    ...(today > start && today < end ? [{ d: today, label: "Today", cls: "today" }] : []),
    { d: end, label: `End ${fmtDate(end)}`, cls: "" },
  ];
  return (
    <div className="ll-stack">
      <div className="ll-timeline" style={{ height: 70 }} aria-hidden="true">
        <span className="ll-tl-track" />
        <span className="ll-tl-fill" style={{ width: `${pos(today)}%` }} />
        {pts.map((p, i) => <span key={i} className={`ll-tl-pt ${p.cls}`} style={{ left: `calc(${pos(p.d)}% * 0.92 + 4%)` }}><span className="dot" /></span>)}
      </div>
      <ol className="ll-stack" style={{ gap: 6 }}>
        {pts.sort((a, b) => (a.d < b.d ? -1 : 1)).map((p, i) => <li key={i} className="ll-row" style={{ fontSize: 13 }}><span className={`ll-tl-pt ${p.cls}`} style={{ position: "static", transform: "none" }}><span className="dot" /></span><span className="ll-mono ll-muted" style={{ fontSize: 12, minWidth: 92 }}>{fmtDate(p.d)}</span>{p.label.replace(/^(Start|End|Notice) .*/, "$1")}</li>)}
      </ol>
    </div>
  );
}

function PaymentsTab({ lease }: { lease: Lease }) {
  const st = useLeasesState()!;
  const c = computeLease(st, lease);
  const actuals = st.closes.flatMap((cl) => cl.payments.filter((p) => p.leaseId === lease.id).map((p) => ({ ...p, period: cl.period })));
  const today = todayISO();
  if (!c) return <Card><EmptyState icon={FileText} title="No schedule" body={isExempt(approvedChain(lease)[0]) ? "Exempt lease — payments are expensed as incurred." : "Approve the lease to see its payments."} /></Card>;
  const next = c.flows.filter((f) => f.date >= today).slice(0, 12);
  return (
    <div className="ll-grid ll-grid-2">
      <Card title="Upcoming payments" sub="Next 12 scheduled" pad={false}>
        <div className="ll-table-wrap"><table className="ll-table"><thead><tr><th>Date</th><th className="num">Amount</th></tr></thead>
          <tbody>{next.map((f, i) => <tr key={i}><td className="ll-mono" style={{ fontSize: 12 }}>{fmtDate(f.date)}</td><td className="num"><Money value={f.amount.toFixed(2)} /></td></tr>)}</tbody></table></div>
      </Card>
      <Card title="Matched to actual payments" sub="From period-close payment matching" pad={false}>
        {actuals.length === 0 ? <EmptyState icon={FileText} title="No matched payments yet" body="Payments are matched during the period close." /> : (
          <div className="ll-table-wrap"><table className="ll-table"><thead><tr><th>Period</th><th>Reference</th><th className="num">Expected</th><th className="num">Paid</th><th>Status</th></tr></thead>
            <tbody>{actuals.map((p) => <tr key={p.id}><td>{periodLabel(p.period)}</td><td className="ll-code">{p.reference}</td><td className="num"><Money value={p.expected} /></td><td className="num"><Money value={p.amount} /></td><td><StatusBadge tone={p.match === "matched" ? "success" : p.resolution ? "neutral" : "warning"}>{p.match}{p.resolution ? ` · ${p.resolution.replace("_", " ")}` : ""}</StatusBadge></td></tr>)}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}

function JournalsTab({ lease }: { lease: Lease }) {
  const st = useLeasesState()!;
  const gl = glOf(st)?.accounts;
  const posted = st.batches.flatMap((b) => b.lines.filter((l) => l.leaseId === lease.id).map((l) => ({ ...l, batch: b })));
  return (
    <Card title="Posted journal lines" sub="From journal batches; generated monthly during the close." pad={false}>
      {posted.length === 0 ? <EmptyState icon={FileText} title="Nothing posted yet" body="Lines appear after the first close that includes this lease." /> : (
        <div className="ll-table-wrap" style={{ maxHeight: 520, overflowY: "auto" }}>
          <table className="ll-table">
            <thead><tr><th>Period</th><th>Batch</th><th>Account</th><th>Kind</th><th className="num">Debit</th><th className="num">Credit</th><th>Status</th></tr></thead>
            <tbody>{posted.map((l, i) => (
              <tr key={i}>
                <td>{periodLabel(l.batch.period)}</td>
                <td><Link className="ll-link ll-mono" style={{ fontSize: 12 }} href={`/leases/journals/${l.batch.id}`}>{l.batch.id}</Link></td>
                <td>{gl?.[l.account] && <span className="ll-code" style={{ marginRight: 6 }}>{gl[l.account]}</span>}{ACCOUNT_LABELS[l.account]}</td>
                <td>{l.catchUp ? <StatusBadge tone="warning" dot={false}>catch-up</StatusBadge> : l.kind}</td>
                <td className="num"><Money value={l.debit} dash /></td>
                <td className="num"><Money value={l.credit} dash /></td>
                <td><StatusBadge tone={l.batch.status === "posted" ? "success" : l.batch.status === "reversed" ? "muted" : "info"}>{l.batch.status}</StatusBadge></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AssessmentTab({ v }: { v: LeaseVersion }) {
  const a = v.assessment;
  const yn = (x: boolean | null) => (x === null ? "Not answered" : x ? "Yes" : "No");
  return (
    <div className="ll-grid ll-grid-2">
      <Card title="Lease identification">
        <dl className="ll-dl">
          <dt>Identified asset</dt><dd>{yn(a.identifiedAsset)}</dd>
          <dt>Right to control use</dt><dd>{yn(a.rightToControl)}</dd>
          <dt>Exemption</dt><dd>{a.exemption === "none" ? "None — capitalised" : a.exemption ?? "—"}{a.exemptionRationale && <div className="ll-muted" style={{ fontSize: 12 }}>{a.exemptionRationale}</div>}</dd>
          <dt>Term rationale</dt><dd>{a.termRationale || "—"}</dd>
        </dl>
      </Card>
      <Card title="Options and rate">
        {a.options.length === 0 ? <p className="ll-muted">No renewal or termination options.</p> : (
          <ul className="ll-stack">{a.options.map((o) => <li key={o.id}><strong>{o.months}-month {o.type}</strong> — {o.reasonablyCertain ? "reasonably certain" : "not reasonably certain"}{o.noticeDate && ` · notice by ${fmtDate(o.noticeDate)}`}<div className="ll-muted" style={{ fontSize: 12 }}>{o.rationale}</div></li>)}</ul>
        )}
        <dl className="ll-dl" style={{ marginTop: 12 }}>
          <dt>Purchase option</dt><dd>{a.purchaseOption.exists ? `Yes — ${a.purchaseOption.reasonablyCertain ? "reasonably certain" : "not certain"}` : "No"}</dd>
          <dt>Discount rate</dt><dd>{pct(v.rate.value)} · {v.rate.source}{v.rate.curveVersion ? ` v${v.rate.curveVersion}` : ""}{v.rate.reason ? ` — ${v.rate.reason}` : ""}</dd>
        </dl>
      </Card>
    </div>
  );
}

function HistoryTab({ lease }: { lease: Lease }) {
  const st = useLeasesState()!;
  const audit = st.audit.filter((a) => a.target.startsWith(lease.code));
  return (
    <div className="ll-grid ll-grid-2">
      <Card title="Versions" pad={false}>
        <ol>
          {[...lease.versions].reverse().map((v) => (
            <li key={v.n} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              <div className="ll-row"><strong>v{v.n}</strong> {EVENT_LABEL[v.event]} <StatusBadge tone={v.status === "approved" ? "success" : v.status === "in_review" ? "info" : v.status === "returned" ? "warning" : "neutral"}>{v.status.replace("_", " ")}</StatusBadge></div>
              <div className="ll-muted" style={{ fontSize: 12 }}>Effective {fmtDate(v.effectiveDate || v.terms.commencementDate)} · {v.reason}</div>
              <ul className="ll-stack" style={{ marginTop: 8, gap: 6 }}>
                {v.comments.map((c) => (
                  <li key={c.id} className="ll-row" style={{ alignItems: "flex-start", flexWrap: "nowrap", fontSize: 13 }}>
                    <PersonById st={st} id={c.by} />
                    <span style={{ flex: 1 }}><span className="ll-subtle" style={{ fontSize: 11 }}>{c.kind} · {fmtDateTime(c.at)}{c.field ? ` · on ${c.field}` : ""}</span><br />{c.text}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Card>
      <Card title="Audit trail" pad={false}>
        {audit.length === 0 ? <EmptyState icon={Lock} title="No audit entries yet" /> : (
          <ul>{audit.map((a) => <li key={a.id} style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: 13 }}><span className="ll-code">{fmtDateTime(a.at)}</span> · <PersonById st={st} id={a.by} /> · {a.action}{a.detail ? ` — ${a.detail}` : ""}</li>)}</ul>
        )}
      </Card>
    </div>
  );
}

function DiffView({ a, b }: { a?: LeaseVersion; b: LeaseVersion }) {
  if (!a) return <p className="ll-muted">Nothing to compare.</p>;
  const amt = (v: LeaseVersion) => v.terms.paymentRule?.amountSteps?.at(-1)?.amount ?? v.terms.paymentRule?.amount ?? "—";
  const rows: Array<[string, string, string]> = [
    ["Event", EVENT_LABEL[a.event], EVENT_LABEL[b.event]],
    ["Effective", fmtDate(a.effectiveDate), fmtDate(b.effectiveDate)],
    ["End of term", fmtDate(a.terms.endDate), fmtDate(b.terms.endDate)],
    ["Current rent", amt(a), amt(b)],
    ["Discount rate", pct(a.rate.value), pct(b.rate.value)],
    ["Scope given back", a.scopeDecrease ? pct(a.scopeDecrease) : "—", b.scopeDecrease ? pct(b.scopeDecrease) : "—"],
    ["Liability at version start", a.calculated?.liability || "—", b.calculated?.liability || "—"],
    ["Reason", a.reason, b.reason],
  ];
  return (
    <div className="ll-table-wrap"><table className="ll-table">
      <thead><tr><th /><th>v{a.n}</th><th>v{b.n}</th></tr></thead>
      <tbody>{rows.map(([k, x, y]) => <tr key={k}><td className="ll-muted">{k}</td><td className={x !== y ? "ll-diff-old" : undefined}>{x}</td><td className={x !== y ? "ll-diff-new" : undefined}>{y}</td></tr>)}</tbody>
    </table></div>
  );
}


