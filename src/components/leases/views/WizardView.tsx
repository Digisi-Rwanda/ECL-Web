"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText, Upload, Trash2, Plus, CheckCircle2, AlertTriangle, Calculator, Send, Loader2, Info, Ban, ArrowLeft, ArrowRight, Eye,
} from "lucide-react";
import { buildCashFlows, D, exemptExpense, type ManualLine, type FlowKind } from "@/lib/leases/engine";
import { addDays, addMonths, isISODate, monthsBetween, type ISODate } from "@/lib/leases/dates";
import {
  computeWithPending, curveOf, curveRate, exemptionHint, fmtDate, isLockedDate, pct, policyOf, pendingVersion, persona, termYears,
  money, periodLabel, currentPeriod, approvedChain,
} from "@/lib/leases/model";
import {
  createDraft, updateDraft, calculate, submitForReview, discardDraft, addDoc, removeDoc, addCounterparty, validateVersion,
  possibleDuplicates, getState, LeaseError, documentUrl,
} from "@/lib/leases/store";
import type { Lease, LeaseVersion, OptionItem } from "@/lib/leases/types";
import {
  PageHeader, Card, Field, TextInput, DateInput, MoneyInput, RateInput, Select, TextArea, YesNo, Choice, Combobox, Btn, Banner,
  Stepper, ErrorSummary, Money, EmptyState, StatusBadge,
} from "@/components/ll/Kit";
import { Confirm } from "@/components/ll/Overlay";
import { toast } from "@/components/ll/toast";
import { useLeasesState, useMe, can } from "../use-leases";
import { RequireSetup, CLASS_OPTIONS, PersonById } from "../common";
import { ScheduleTables, JournalList } from "../ScheduleTables";

const STEPS = ["Contract", "Payments", "Assessment", "Measure", "Review & submit"] as const;
const STEP_FIELDS: string[][] = [
  ["name", "counterpartyId", "commencementDate", "endDate", "currency"],
  ["amount", "rentFreeMonths", "line"],
  ["identifiedAsset", "rightToControl", "notLease", "exemption", "exemptionRationale", "option", "purchaseOption", "rate", "rateReason"],
  [],
  [],
];
const stepOf = (field: string) => STEP_FIELDS.findIndex((fs) => fs.some((f) => field.startsWith(f)));

/** Object URLs for files uploaded in this session (instant preview); stored files use a signed URL. */
const previews = new Map<string, string>();

type Local = { lease: Lease; v: LeaseVersion };

function deriveEnd(contractEnd: string, commencement: string, options: OptionItem[]): string {
  if (!isISODate(contractEnd)) return "";
  let end = contractEnd;
  for (const o of options) {
    if (o.type === "renewal" && o.reasonablyCertain) end = addDays(addMonths(addDays(end, 1), o.months), -1);
  }
  for (const o of options) {
    if (o.type === "termination" && o.reasonablyCertain && isISODate(commencement)) {
      const t = addDays(addMonths(commencement, o.months), -1);
      if (t < end) end = t;
    }
  }
  return end;
}

export function WizardView() {
  const st = useLeasesState()!;
  const me = useMe()!;
  const router = useRouter();
  const sp = useSearchParams();
  const draftId = sp.get("draft");
  const stored = draftId ? st.leases.find((l) => l.id === draftId) : undefined;

  if (!can(me.role, "prepare")) {
    return (
      <RequireSetup>
        <div className="ll-card"><EmptyState icon={Ban} title="Reviewers don't create leases" body="Leases are prepared by preparers or administrators and come to you for review in your inbox." /></div>
      </RequireSetup>
    );
  }
  if (draftId && !stored) {
    return <div className="ll-card"><EmptyState icon={FileText} title="Draft not found" body="It may have been discarded or submitted." actions={<Btn onClick={() => router.push("/leases/drafts")}>Go to drafts</Btn>} /></div>;
  }
  if (stored && approvedChain(stored).length) return <Redirect to={`/leases/${stored.id}`} />;
  return <RequireSetup><Wizard key={draftId ?? "new"} initial={stored} /></RequireSetup>;
}

function blank(st: NonNullable<ReturnType<typeof getState>>, meId: string): Local {
  const now = new Date().toISOString();
  return {
    lease: {
      id: "", code: "New lease", name: "", assetClass: "property", counterpartyId: "", entityId: st.entity!.id, location: "",
      currency: st.entity!.currency, ownerId: meId, costCentre: "", versions: [], docs: [], wizardStep: 0, createdAt: now, updatedAt: now, rev: 0,
    },
    v: {
      n: 1, status: "draft", event: "initial", effectiveDate: "", reason: "New lease",
      terms: {
        commencementDate: "", endDate: "", manualLines: [], nonLeasePerPayment: "0", separateNonLease: true, prepaidBeforeCommencement: "0",
        initialDirectCosts: "0", incentivesReceived: "0", restorationEstimate: "0",
        paymentRule: { amount: "", frequency: "monthly", timing: "advance", escalation: { type: "none" }, rentFreeMonths: 0 },
      },
      assessment: { identifiedAsset: null, rightToControl: null, exemption: null, exemptionRationale: "", options: [], purchaseOption: { exists: false, reasonablyCertain: null, rationale: "" }, termRationale: "" },
      rate: { value: "", source: "curve" }, createdBy: meId, createdAt: now, comments: [],
    },
  };
}

function Wizard({ initial }: { initial?: Lease }) {
  const st = useLeasesState()!;
  const me = useMe()!;
  const router = useRouter();
  const [local, setLocal] = useState<Local>(() => (initial ? { lease: structuredClone(initial), v: structuredClone(pendingVersion(initial)!) } : blank(st, me.id)));
  const [step, setStep] = useState(Math.min(initial?.wizardStep ?? 0, 4));
  const [save, setSave] = useState<"idle" | "dirty" | "saving" | "saved" | "error" | "conflict">("idle");
  const [shownErrors, setShownErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [rateHint, setRateHint] = useState<string | null>(null);
  const [approver, setApprover] = useState("");
  const [note, setNote] = useState("");
  const revRef = useRef(initial?.rev ?? 0);
  const idRef = useRef(initial?.id ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { lease, v } = local;
  const t = v.terms;
  const a = v.assessment;
  const cur = lease.currency;
  const policy = policyOf(st, t.commencementDate || undefined);
  const readOnly = !!initial && v.createdBy !== me.id && me.role !== "administrator";
  const [savedId, setSavedId] = useState(initial?.id ?? "");
  const isNew = !savedId;

  // ── persistence ────────────────────────────────────────────────────────
  const flush = useCallback(async (l: Local = local): Promise<boolean> => {
    if (!idRef.current || readOnly) return true;
    if (timer.current) clearTimeout(timer.current);
    setSave("saving");
    try {
      const { lease: L, v: V } = l;
      revRef.current = await updateDraft(idRef.current, revRef.current, {
        lease: { name: L.name, assetClass: L.assetClass, counterpartyId: L.counterpartyId, location: L.location, ownerId: L.ownerId, costCentre: L.costCentre, contractTotal: L.contractTotal, signatureDate: L.signatureDate, contractEndDate: L.contractEndDate, wizardStep: L.wizardStep },
        version: { terms: V.terms, assessment: V.assessment, rate: V.rate },
      });
      setSave("saved");
      return true;
    } catch (e) {
      setSave(e instanceof LeaseError && e.code === "conflict" ? "conflict" : "error");
      return false;
    }
  }, [local, readOnly]);

  const patch = (fn: (d: Local) => void) => {
    if (readOnly) return;
    setLocal((prev) => {
      const next = structuredClone(prev);
      fn(next);
      // derived: accounting lease term end and curve rate
      const n = next.v;
      n.terms.endDate = deriveEnd(next.lease.contractEndDate ?? "", n.terms.commencementDate, n.assessment.options);
      if (n.rate.source === "curve" && isISODate(n.terms.commencementDate) && isISODate(n.terms.endDate) && n.terms.endDate > n.terms.commencementDate) {
        const curve = curveOf(getState()!, n.terms.commencementDate);
        const yrs = termYears(n.terms.commencementDate, n.terms.endDate);
        n.rate = { value: curveRate(curve, next.lease.currency, yrs) ?? "", source: "curve", curveVersion: curve?.version, termYears: yrs };
      }
      n.calculated = undefined;
      if (idRef.current) {
        setSave("dirty");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flushRef.current(next), 700);
      }
      return next;
    });
  };
  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; }, [flush]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (save === "dirty" || save === "saving") e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  // ── validation ─────────────────────────────────────────────────────────
  const errors = useMemo(() => {
    const e = validateVersion(st, lease, v);
    if (!lease.contractEndDate) e.endDate = "Contract end date is required.";
    if (!t.endDate && lease.contractEndDate) delete e.endDate;
    return e;
  }, [st, lease, v, t.endDate]);
  const errorsFor = (s: number) => Object.fromEntries(Object.entries(errors).filter(([k]) => stepOf(k) === s || (s === 2 && k.startsWith("option"))));
  const stepDone = (s: number) => (s < 3 ? Object.keys(errorsFor(s)).length === 0 : s === 3 ? !!v.calculated?.checksOk : false);
  const err = (k: string) => shownErrors[k];

  const go = async (to: number) => {
    if (to > step) {
      const e = errorsFor(step);
      if (Object.keys(e).length) {
        setShownErrors(e);
        return;
      }
      if (step === 3 && !v.calculated?.checksOk) {
        toast("danger", "Calculate and pass every check before continuing.");
        return;
      }
    }
    setShownErrors({});
    if (isNew) {
      setBusy("create");
      try {
        const { id, rev } = await createDraft({ name: lease.name.trim(), assetClass: lease.assetClass, counterpartyId: lease.counterpartyId, location: lease.location });
        idRef.current = id;
        revRef.current = rev;
        setSavedId(id);
        const next = structuredClone(local);
        next.lease.id = id;
        next.lease.wizardStep = Math.max(next.lease.wizardStep, to);
        await flush(next);
        router.replace(`/leases/new?draft=${id}`, { scroll: false });
        toast("success", "Draft saved — you can leave and come back any time.");
      } catch (e) {
        toast("danger", e instanceof Error ? e.message : "Couldn't create the draft.");
        setBusy(null);
        return;
      }
      setBusy(null);
    } else {
      const next = structuredClone(local);
      next.lease.wizardStep = Math.max(next.lease.wizardStep, to);
      setLocal(next);
      await flush(next);
    }
    setStep(to);
    window.scrollTo?.({ top: 0 });
    document.querySelector(".app-shell-main")?.scrollTo({ top: 0 });
  };

  const jump = (field: string) => {
    const s = stepOf(field);
    if (s >= 0 && s !== step) setStep(s);
    setTimeout(() => document.getElementById(`f-${field.replace(/\d+$/, "")}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
  };

  // ── documents ─────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [docBusy, setDocBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!idRef.current) { toast("info", "Fill in the name and lessor first — the draft is created when you continue."); return; }
    setDocBusy(true);
    for (const f of Array.from(files)) {
      if (f.size > 25 * 1024 * 1024) { toast("danger", `${f.name} is larger than 25 MB.`); continue; }
      if (!/pdf|image/.test(f.type)) { toast("danger", `${f.name}: upload a PDF or an image.`); continue; }
      try {
        const up = await addDoc(idRef.current, f);
        const hash = up.sha256;
        const fresh = getState()!.leases.find((l) => l.id === idRef.current)!;
        const doc = fresh.docs.find((d) => d.id === up.id) ?? fresh.docs.at(-1)!;
        previews.set(doc.id, URL.createObjectURL(f));
        revRef.current = fresh.rev;
        setLocal((p) => ({ ...p, lease: { ...p.lease, docs: fresh.docs } }));
        setPreview(doc.id);
        toast("success", `${f.name} attached · SHA-256 ${hash.slice(0, 10)}…`);
      } catch (e) {
        toast("danger", e instanceof Error ? e.message : "Upload failed");
      }
    }
    setDocBusy(false);
  };

  // ── derived data ───────────────────────────────────────────────────────
  const flows = useMemo(() => {
    try { return t.commencementDate && t.endDate && t.endDate > t.commencementDate ? buildCashFlows(t) : []; } catch { return []; }
  }, [t]);
  const flowsTotal = flows.reduce((s, f) => s.plus(f.amount), D(0));
  const months = isISODate(t.commencementDate) && isISODate(t.endDate) ? Math.round(monthsBetween(t.commencementDate, addDays(t.endDate, 1))) : 0;
  const hint = exemptionHint(policy, lease.assetClass, months);
  const exempt = !!a.exemption && a.exemption !== "none";
  const storedLease = savedId ? st.leases.find((l) => l.id === savedId) : undefined;
  const comp = step >= 3 && storedLease && v.calculated && !exempt ? computeWithPending(st, storedLease) : undefined;
  const dups = storedLease ? possibleDuplicates(st, storedLease) : [];
  const lockedStart = isISODate(t.commencementDate) && isLockedDate(st, t.commencementDate);
  const period = currentPeriod(st);
  const returned = [...(initial?.versions.at(-1)?.comments ?? [])].reverse().find((c) => c.kind === "return");
  const reviewers = st.personas.filter((p) => p.id !== me.id && (p.role === "reviewer" || p.role === "administrator"));
  const notLease = a.identifiedAsset === false || a.rightToControl === false;

  const doCalculate = async () => {
    setBusy("calc");
    const ok = await flush();
    if (!ok) { setBusy(null); return; }
    try {
      revRef.current = await calculate(idRef.current, revRef.current);
      const fresh = getState()!.leases.find((l) => l.id === idRef.current)!;
      setLocal({ lease: structuredClone(fresh), v: structuredClone(pendingVersion(fresh)!) });
      const c = pendingVersion(fresh)!.calculated!;
      toast(c.checksOk ? "success" : "danger", c.checksOk ? "Calculated — all checks passed" : "Calculated, but some checks failed");
    } catch (e) {
      toast("danger", e instanceof Error ? e.message : "Calculation failed");
    }
    setBusy(null);
  };
  const doSubmit = async () => {
    if (!approver) { setShownErrors({ approver: "Choose who reviews this lease." }); return; }
    setBusy("submit");
    const ok = await flush();
    if (!ok) { setBusy(null); return; }
    try {
      await submitForReview(idRef.current, revRef.current, approver, note);
      toast("success", `Submitted to ${persona(st, approver).name} for review`);
      router.push(`/leases/${idRef.current}`);
    } catch (e) {
      toast("danger", e instanceof Error ? e.message : "Submit failed");
      setBusy(null);
    }
  };

  const saveLabel = { idle: isNew ? "Not saved yet" : "All changes saved", dirty: "Unsaved changes…", saving: "Saving…", saved: "All changes saved", error: "Couldn't save — retrying on next change", conflict: "Changed elsewhere" }[save];

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <>
      <PageHeader
        back={{ href: "/leases/drafts", label: "Drafts" }}
        eyebrow={isNew ? "New lease" : `${lease.code} · draft v${v.n}`}
        title={lease.name || "New lease"}
        badge={v.status === "returned" ? <StatusBadge tone="warning">Returned</StatusBadge> : undefined}
        actions={!isNew && !readOnly ? <Btn variant="ghost" onClick={() => setDiscardOpen(true)}><Trash2 size={14} /> Discard draft</Btn> : undefined}
      />
      {readOnly && <Banner tone="locked" title="Read-only">This draft belongs to <PersonById st={st} id={v.createdBy} />. Only they or an administrator can edit it.</Banner>}
      {save === "conflict" && <Banner tone="danger" title="This draft was changed somewhere else" action={<Btn size="sm" onClick={() => window.location.reload()}>Reload</Btn>}>Your latest edits weren&apos;t saved, so nothing was overwritten. Reload to continue from the newest version.</Banner>}
      {returned && v.status !== "in_review" && (
        <Banner tone="warning" title={`Returned by ${persona(st, returned.by).name}`} action={returned.field ? <Btn size="sm" onClick={() => jump(returned.field === "options" ? "option" : returned.field!)}>Go to field</Btn> : undefined}>
          “{returned.text}”
        </Banner>
      )}
      <Stepper
        current={step}
        steps={STEPS.map((label, i) => ({ label, done: i < step && stepDone(i), error: i < step && !stepDone(i) && i < 3, disabled: i > Math.max(lease.wizardStep, step) || (isNew && i > 0) }))}
        onSelect={(i) => (i <= step ? setStep(i) : void go(i))}
      />
      <ErrorSummary errors={shownErrors} onJump={jump} />

      {/* ── Step 1: Contract ── */}
      {step === 0 && (
        <div className={preview ? "ll-split" : undefined}>
          <div className="ll-stack">
            <Card title="Contract" sub="Who, what and when. Dates are the contract's; options are assessed in step 3.">
              <fieldset disabled={readOnly} className="ll-form">
                <div className="ll-fields">
                  <Field id="f-name" label="Lease name" required error={err("name")} htmlFor="nm" hint="e.g. Branch — Remera, floor 2"><TextInput id="nm" value={lease.name} onChange={(x) => patch((d) => { d.lease.name = x; })} invalid={!!err("name")} /></Field>
                  <Field id="f-counterpartyId" label="Lessor" required error={err("counterpartyId")} htmlFor="cp">
                    <Combobox id="cp" value={lease.counterpartyId} onChange={(x) => patch((d) => { d.lease.counterpartyId = x; })} options={st.counterparties.map((c) => ({ id: c.id, label: c.name }))} onCreate={(n) => addCounterparty(n)} placeholder="Search or add a lessor" invalid={!!err("counterpartyId")} />
                  </Field>
                </div>
                <div className="ll-fields">
                  <Field label="Asset class" htmlFor="cl"><Select id="cl" value={lease.assetClass} onChange={(x) => patch((d) => { d.lease.assetClass = x; d.v.terms.separateNonLease = (policy?.separateNonLeaseClasses ?? []).includes(x); })} options={CLASS_OPTIONS.map((c) => ({ value: c.value, label: c.label }))} /></Field>
                  <Field label="Location" htmlFor="lo"><TextInput id="lo" value={lease.location} onChange={(x) => patch((d) => { d.lease.location = x; })} /></Field>
                  <Field id="f-currency" label="Currency" error={err("currency")} hint={`Entity functional currency (${st.entity!.currency}). FX leases come later.`}><TextInput value={cur} onChange={() => {}} disabled /></Field>
                </div>
                <div className="ll-fields">
                  <Field label="Signed on" htmlFor="sg" hint="Optional. Between signing and commencement the lease is a commitment, not on the balance sheet."><DateInput id="sg" value={lease.signatureDate ?? ""} onChange={(x) => patch((d) => { d.lease.signatureDate = x; })} /></Field>
                  <Field id="f-commencementDate" label="Commencement date" required error={err("commencementDate")} htmlFor="cd" hint="The day the asset is available for use."><DateInput id="cd" value={t.commencementDate} onChange={(x) => patch((d) => { d.v.terms.commencementDate = x; })} invalid={!!err("commencementDate")} /></Field>
                  <Field id="f-endDate" label="Contract end date" required error={err("endDate")} htmlFor="ed" hint="Last day of the non-cancellable period."><DateInput id="ed" value={lease.contractEndDate ?? ""} onChange={(x) => patch((d) => { d.lease.contractEndDate = x; })} invalid={!!err("endDate")} /></Field>
                </div>
                {lockedStart && <Banner tone="warning" title={`Commences in a locked period (${periodLabel(t.commencementDate.slice(0, 7))})`}>That&apos;s fine — the catch-up for past months posts in {period ? periodLabel(period.key) : "the next open period"}. Locked months are never rewritten.</Banner>}
                {lease.signatureDate && t.commencementDate && lease.signatureDate > t.commencementDate && <Banner tone="info">Signed after commencement — check the commencement date is when you got access, not when you signed.</Banner>}
                <div className="ll-fields">
                  <Field label="Owner" htmlFor="ow"><Select id="ow" value={lease.ownerId} onChange={(x) => patch((d) => { d.lease.ownerId = x; })} options={st.personas.map((p) => ({ value: p.id, label: p.name }))} /></Field>
                  <Field label="Cost centre" htmlFor="cc"><TextInput id="cc" value={lease.costCentre} onChange={(x) => patch((d) => { d.lease.costCentre = x; })} placeholder="e.g. CC-110" /></Field>
                  <Field label="Contract total (optional)" htmlFor="ct" hint="If the contract states a total, we compare it to the schedule."><MoneyInput id="ct" value={lease.contractTotal ?? ""} onChange={(x) => patch((d) => { d.lease.contractTotal = x; })} currency={cur} /></Field>
                </div>
              </fieldset>
            </Card>
            <Card title="Documents" sub="Signed contract and amendments. Each file is fingerprinted (SHA-256) so the same file can't be attached twice." actions={!readOnly ? <Btn size="sm" onClick={() => fileRef.current?.click()} loading={docBusy}><Upload size={13} /> Upload</Btn> : undefined}>
              <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
              {lease.docs.length === 0 ? (
                <div
                  className="input-card"
                  style={{ borderStyle: "dashed", justifyContent: "center", padding: 24, cursor: readOnly ? "default" : "pointer", flexDirection: "column", textAlign: "center" }}
                  onClick={() => !readOnly && fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); if (!readOnly) void onFiles(e.dataTransfer.files); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}
                >
                  <Upload size={18} className="ll-subtle" />
                  <span>Drop the signed contract here, or click to choose</span>
                  <span className="ll-subtle" style={{ fontSize: 12 }}>PDF or image · up to 25 MB{isNew ? " · available after the draft is created" : ""}</span>
                </div>
              ) : (
                <ul className="ll-stack">
                  {lease.docs.map((d) => (
                    <li key={d.id} className="input-card">
                      <FileText size={16} className="ll-subtle" />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                        <span className="ll-code">{d.kind} · {(d.size / 1024).toFixed(0)} KB · {d.sha256.slice(0, 12)}…</span>
                      </span>
                      <Btn size="sm" variant="ghost" onClick={async () => {
                        if (preview === d.id) return setPreview(null);
                        try {
                          if (!previews.has(d.id)) previews.set(d.id, await documentUrl(savedId, d.id));
                          setPreview(d.id);
                        } catch (e) { toast("danger", e instanceof Error ? e.message : "Couldn't open the document"); }
                      }}><Eye size={13} /> {preview === d.id ? "Hide" : "View"}</Btn>
                      {!readOnly && <button className="btn btn-icon btn-sm" aria-label={`Remove ${d.name}`} onClick={async () => { try { await removeDoc(idRef.current, d.id); const fresh = getState()!.leases.find((l) => l.id === idRef.current)!; revRef.current = fresh.rev; setLocal((p) => ({ ...p, lease: { ...p.lease, docs: fresh.docs } })); if (preview === d.id) setPreview(null); } catch (e) { toast("danger", e instanceof Error ? e.message : "Couldn't remove"); } }}><Trash2 size={14} /></button>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          {preview && previews.get(preview) && (
            <div style={{ position: "sticky", top: 16 }}>
              <Card title="Contract" actions={<Btn size="sm" variant="ghost" onClick={() => setPreview(null)}>Close</Btn>} pad={false}>
                <iframe title="Contract preview" src={previews.get(preview)} className="ll-pdf" style={{ border: 0, height: "70vh" }} />
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Payments ── */}
      {step === 1 && (
        <div className="ll-split">
          <div className="ll-stack">
            <Card title="Payment schedule" sub="Describe the rent rule; we generate every dated payment. Add irregular payments below.">
              <fieldset disabled={readOnly} className="ll-form">
                <div className="ll-fields">
                  <Field id="f-amount" label="Payment amount" required error={err("amount")} htmlFor="am" hint="Per period, excluding VAT."><MoneyInput id="am" value={t.paymentRule?.amount ?? ""} onChange={(x) => patch((d) => { d.v.terms.paymentRule!.amount = x; })} currency={cur} invalid={!!err("amount")} /></Field>
                  <Field label="Frequency" htmlFor="fq"><Select id="fq" value={t.paymentRule!.frequency} onChange={(x) => patch((d) => { d.v.terms.paymentRule!.frequency = x; })} options={[{ value: "monthly", label: "Monthly" }, { value: "quarterly", label: "Quarterly" }, { value: "semiannual", label: "Every 6 months" }, { value: "annual", label: "Annually" }]} /></Field>
                  <Field label="Paid" htmlFor="tm" hint={t.paymentRule!.timing === "advance" ? "Start of each period — the first payment is made at commencement." : "End of each period."}>
                    <Select id="tm" value={t.paymentRule!.timing} onChange={(x) => patch((d) => { d.v.terms.paymentRule!.timing = x; })} options={[{ value: "advance", label: "In advance" }, { value: "arrears", label: "In arrears" }]} />
                  </Field>
                </div>
                <div className="ll-fields">
                  <Field id="f-rentFreeMonths" label="Rent-free months at start" error={err("rentFreeMonths")} htmlFor="rf"><input id="rf" type="number" min={0} max={60} className="input num" value={t.paymentRule!.rentFreeMonths} onChange={(e) => patch((d) => { d.v.terms.paymentRule!.rentFreeMonths = Math.max(0, Number(e.target.value)); })} /></Field>
                  <Field label="Escalation" htmlFor="es">
                    <Select id="es" value={t.paymentRule!.escalation.type} onChange={(x) => patch((d) => { d.v.terms.paymentRule!.escalation = x === "fixed_pct" ? { type: "fixed_pct", pct: "0.05", everyMonths: 12 } : { type: x }; })} options={[{ value: "none", label: "None" }, { value: "fixed_pct", label: "Fixed % increase" }, { value: "cpi", label: "CPI-linked" }]} />
                  </Field>
                  {t.paymentRule!.escalation.type === "fixed_pct" && (
                    <>
                      <Field label="Increase" htmlFor="ep"><RateInput id="ep" value={t.paymentRule!.escalation.pct ?? ""} onChange={(x) => patch((d) => { d.v.terms.paymentRule!.escalation.pct = x; })} /></Field>
                      <Field label="Every (months)" htmlFor="ev"><input id="ev" type="number" min={1} className="input num" value={t.paymentRule!.escalation.everyMonths ?? 12} onChange={(e) => patch((d) => { d.v.terms.paymentRule!.escalation.everyMonths = Math.max(1, Number(e.target.value)); })} /></Field>
                    </>
                  )}
                </div>
                {t.paymentRule!.escalation.type === "cpi" && <Banner tone="info" title="CPI-linked rent">IFRS 16 measures with the index at commencement — future CPI isn&apos;t forecast. When an uplift is applied, record it as a CPI event on the lease; the liability is remeasured at the original rate.</Banner>}
                <div className="ll-question">
                  <h4>Service charge inside each payment</h4>
                  <div className="ll-fields">
                    <Field label="Non-lease amount per payment" htmlFor="nl"><MoneyInput id="nl" value={t.nonLeasePerPayment} onChange={(x) => patch((d) => { d.v.terms.nonLeasePerPayment = x || "0"; })} currency={cur} /></Field>
                    <Field label="Treatment" hint={`Policy for ${CLASS_OPTIONS.find((c) => c.value === lease.assetClass)?.label}: ${(policy?.separateNonLeaseClasses ?? []).includes(lease.assetClass) ? "separate" : "include"}.`}>
                      <Select value={t.separateNonLease ? "sep" : "inc"} onChange={(x) => patch((d) => { d.v.terms.separateNonLease = x === "sep"; })} options={[{ value: "sep", label: "Separate — expense as incurred" }, { value: "inc", label: "Include in lease liability" }]} />
                    </Field>
                  </div>
                </div>
              </fieldset>
            </Card>
            <Card title="Irregular payments" sub="Purchase option price, residual value guarantee, a one-off payment, or rent the rule can't express." actions={!readOnly ? <Btn size="sm" onClick={() => patch((d) => { d.v.terms.manualLines.push({ date: d.v.terms.commencementDate, amount: "", kind: "fixed", endOfDay: true }); })}><Plus size={13} /> Add payment</Btn> : undefined}>
              {t.manualLines.length === 0 ? <p className="ll-muted" style={{ fontSize: "var(--fs-caption)" }}>None.</p> : (
                <div className="ll-stack" id="f-line">
                  {t.manualLines.map((m, i) => (
                    <div key={i} className="ll-fields" style={{ alignItems: "end" }}>
                      <Field label="Date" error={err(`line${i}`)}><DateInput value={m.date} onChange={(x) => patch((d) => { d.v.terms.manualLines[i].date = x; })} disabled={readOnly} /></Field>
                      <Field label="Amount"><MoneyInput value={m.amount} onChange={(x) => patch((d) => { d.v.terms.manualLines[i].amount = x; })} currency={cur} disabled={readOnly} /></Field>
                      <Field label="Type"><Select value={m.kind} onChange={(x) => patch((d) => { d.v.terms.manualLines[i].kind = x as FlowKind; })} disabled={readOnly} options={[{ value: "fixed", label: "Fixed payment" }, { value: "rvg", label: "Residual value guarantee" }, { value: "purchase_option", label: "Purchase option price" }, { value: "termination_penalty", label: "Termination penalty" }, { value: "other", label: "Other" }]} /></Field>
                      <div><button className="btn btn-icon" aria-label={`Remove payment ${i + 1}`} disabled={readOnly} onClick={() => patch((d) => { d.v.terms.manualLines.splice(i, 1); })}><Trash2 size={14} /></button></div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title="At commencement" sub="These change the right-of-use asset, not the liability.">
              <fieldset disabled={readOnly} className="ll-fields">
                <Field label="Paid before commencement" hint="e.g. first rent paid on signing"><MoneyInput value={t.prepaidBeforeCommencement} onChange={(x) => patch((d) => { d.v.terms.prepaidBeforeCommencement = x || "0"; })} currency={cur} /></Field>
                <Field label="Initial direct costs" hint="Incremental only, e.g. agent fee — not staff time."><MoneyInput value={t.initialDirectCosts} onChange={(x) => patch((d) => { d.v.terms.initialDirectCosts = x || "0"; })} currency={cur} /></Field>
                <Field label="Incentives received" hint="e.g. cash from the landlord for fit-out."><MoneyInput value={t.incentivesReceived} onChange={(x) => patch((d) => { d.v.terms.incentivesReceived = x || "0"; })} currency={cur} /></Field>
                <Field label="Restoration estimate at end" hint="Undiscounted. We discount it and create the provision."><MoneyInput value={t.restorationEstimate} onChange={(x) => patch((d) => { d.v.terms.restorationEstimate = x || "0"; })} currency={cur} /></Field>
              </fieldset>
            </Card>
          </div>
          <div style={{ position: "sticky", top: 16 }}>
            <Card title="Generated payments" sub={flows.length ? `${flows.length} payments · total ${money(flowsTotal.toFixed(2))} ${cur}` : "Enter dates and an amount to see the schedule."} pad={false}>
              {flows.length > 0 && (
                <>
                  <div className="ll-card-pad ll-stack" style={{ borderBottom: "1px solid var(--border)" }}>
                    <dl className="ll-dl">
                      <dt>First payment</dt><dd>{fmtDate(flows[0].date)} · <Money value={flows[0].amount.toFixed(2)} /></dd>
                      <dt>Last payment</dt><dd>{fmtDate(flows.at(-1)!.date)} · <Money value={flows.at(-1)!.amount.toFixed(2)} /></dd>
                      <dt>Lease term</dt><dd>{months} months{t.endDate !== lease.contractEndDate && lease.contractEndDate ? " (incl. options)" : ""}</dd>
                    </dl>
                    {lease.contractTotal && !D(lease.contractTotal).minus(flowsTotal).abs().lt(1) && (
                      <Banner tone="warning" title="Doesn't match the contract total">Schedule {money(flowsTotal.toFixed(2))} vs contract {money(lease.contractTotal)} — check escalations, rent-free months and irregular payments.</Banner>
                    )}
                  </div>
                  <div className="ll-table-wrap" style={{ maxHeight: 420, overflowY: "auto" }}>
                    <table className="ll-table">
                      <thead><tr><th>#</th><th>Date</th><th className="num">Amount</th></tr></thead>
                      <tbody>{flows.map((f, i) => <tr key={i}><td className="ll-subtle">{i + 1}</td><td className="ll-mono" style={{ fontSize: 12 }}>{fmtDate(f.date)}{f.manual && <span className="ll-subtle"> · manual</span>}</td><td className="num"><Money value={f.amount.toFixed(2)} /></td></tr>)}</tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ── Step 3: Assessment ── */}
      {step === 2 && (
        <div className="ll-split">
          <div className="ll-stack">
            {notLease && <Banner tone="danger" title="This contract doesn't contain a lease" action={<Btn size="sm" variant="danger" onClick={() => setDiscardOpen(true)}>Discard draft</Btn>}>Without an identified asset that you control, IFRS 16 doesn&apos;t apply — account for it as a service contract.</Banner>}
            <Question id="identifiedAsset" title="1. Is there an identified asset?" err={err("identifiedAsset")} why="Explicitly or implicitly specified, and the supplier has no substantive right to swap it during the term. A specific floor or a named vehicle is identified; 'any 50 m² in the building' usually is not.">
              <YesNo name="Identified asset" value={a.identifiedAsset} onChange={(x) => patch((d) => { d.v.assessment.identifiedAsset = x; })} />
            </Question>
            <Question id="rightToControl" title="2. Do you control how it's used?" err={err("rightToControl")} why="You get substantially all the economic benefits and you direct how and for what purpose it is used throughout the period.">
              <YesNo name="Right to control" value={a.rightToControl} onChange={(x) => patch((d) => { d.v.assessment.rightToControl = x; })} />
            </Question>
            <Question id="exemption" title="3. Does a recognition exemption apply?" err={err("exemption") ?? err("exemptionRationale")} why="Short-term: 12 months or less with no purchase option, elected by asset class. Low-value: the asset is low value when new, elected lease by lease. Exempt leases are expensed straight-line.">
              {hint && <Banner tone="info">Policy suggests <strong>{hint === "short_term" ? "short-term" : "low-value"}</strong> for this lease — you decide.</Banner>}
              <Choice name="Exemption" value={a.exemption} onChange={(x) => patch((d) => { d.v.assessment.exemption = x; })} options={[{ value: "none", label: "No — capitalise" }, { value: "short_term", label: "Short-term" }, { value: "low_value", label: "Low-value" }]} />
              {exempt && <Field label="Why the exemption applies" required error={err("exemptionRationale")}><TextArea value={a.exemptionRationale} onChange={(x) => patch((d) => { d.v.assessment.exemptionRationale = x; })} /></Field>}
              {a.exemption === "short_term" && months > 12 && <Banner tone="warning">The term is {months} months — short-term needs 12 months or less including options.</Banner>}
            </Question>
            {!exempt && (
              <>
                <Question id="option" title="4. Renewal and termination options" err={Object.entries(shownErrors).find(([k]) => k.startsWith("option"))?.[1]} why="Include renewal periods you're reasonably certain to exercise, and periods after a termination option you're reasonably certain not to exercise. Consider fit-out spent, relocation cost, importance of the site and below-market renewal rent.">
                  {a.options.length === 0 && <p className="ll-muted" style={{ fontSize: "var(--fs-caption)" }}>No options recorded.</p>}
                  {a.options.map((o, i) => (
                    <div key={o.id} className="ll-card ll-card-pad ll-stack">
                      <div className="ll-fields">
                        <Field label="Type"><Select value={o.type} onChange={(x) => patch((d) => { d.v.assessment.options[i].type = x; })} options={[{ value: "renewal", label: "Renewal" }, { value: "termination", label: "Early termination" }]} /></Field>
                        <Field label={o.type === "renewal" ? "Extends by (months)" : "Can terminate after (months)"}><input type="number" min={1} className="input num" value={o.months} onChange={(e) => patch((d) => { d.v.assessment.options[i].months = Math.max(1, Number(e.target.value)); })} /></Field>
                        <Field label="Notice deadline" hint="We alert the owner 90 days before."><DateInput value={o.noticeDate ?? ""} onChange={(x) => patch((d) => { d.v.assessment.options[i].noticeDate = x; })} /></Field>
                      </div>
                      <div className="ll-row"><span className="ll-muted" style={{ fontSize: 13 }}>{o.type === "renewal" ? "Reasonably certain to renew?" : "Reasonably certain to terminate?"}</span><YesNo name="Reasonably certain" value={o.reasonablyCertain} onChange={(x) => patch((d) => { d.v.assessment.options[i].reasonablyCertain = x; })} /></div>
                      <Field label="Rationale" required error={err(`option${i}`)}><TextArea value={o.rationale} onChange={(x) => patch((d) => { d.v.assessment.options[i].rationale = x; })} placeholder="Evidence: fit-out spend, strategy, market rent comparison…" /></Field>
                      <div><Btn size="sm" variant="ghost" onClick={() => patch((d) => { d.v.assessment.options.splice(i, 1); })}><Trash2 size={13} /> Remove option</Btn></div>
                    </div>
                  ))}
                  {!readOnly && <div><Btn size="sm" onClick={() => patch((d) => { d.v.assessment.options.push({ id: `op${Date.now()}`, type: "renewal", months: 12, reasonablyCertain: null, rationale: "" }); })}><Plus size={13} /> Add option</Btn></div>}
                </Question>
                <Question id="purchaseOption" title="5. Purchase option" err={err("purchaseOption")} why="If you're reasonably certain to buy the asset, the price is a lease payment and the ROU asset is depreciated over the asset's useful life.">
                  <div className="ll-row"><span className="ll-muted" style={{ fontSize: 13 }}>Is there a purchase option?</span><YesNo name="Purchase option exists" value={a.purchaseOption.exists} onChange={(x) => patch((d) => { d.v.assessment.purchaseOption.exists = x; })} /></div>
                  {a.purchaseOption.exists && (
                    <>
                      <div className="ll-row"><span className="ll-muted" style={{ fontSize: 13 }}>Reasonably certain to exercise?</span><YesNo name="Reasonably certain to buy" value={a.purchaseOption.reasonablyCertain} onChange={(x) => patch((d) => { d.v.assessment.purchaseOption.reasonablyCertain = x; })} /></div>
                      {a.purchaseOption.reasonablyCertain && (
                        <div className="ll-fields">
                          <Field label="Asset useful life ends" hint="ROU is depreciated to this date. Add the price as an irregular payment in step 2."><DateInput value={t.usefulLifeEnd ?? ""} onChange={(x) => patch((d) => { d.v.terms.usefulLifeEnd = x || undefined; })} /></Field>
                        </div>
                      )}
                    </>
                  )}
                </Question>
                <Question id="rate" title="6. Discount rate" err={err("rate") ?? err("rateReason")} why="Use the rate implicit in the lease if you can determine it (rare for lessees); otherwise your incremental borrowing rate for a similar term, currency and security — taken from the approved curve.">
                  <Choice name="Rate source" value={v.rate.source} onChange={(x) => patch((d) => { d.v.rate = { ...d.v.rate, source: x, reason: x === "curve" ? undefined : d.v.rate.reason }; })} options={[{ value: "curve", label: "IBR curve" }, { value: "implicit", label: "Implicit rate" }, { value: "override", label: "Override" }]} />
                  {v.rate.source === "curve" ? (
                    v.rate.value ? <p style={{ fontSize: 14 }}><strong className="ll-mono">{pct(v.rate.value)}</strong> <span className="ll-muted">· curve v{v.rate.curveVersion} · {v.rate.termYears} years interpolated</span></p> : <p className="ll-muted">Enter the dates first.</p>
                  ) : (
                    <div className="ll-fields">
                      <Field label="Rate (% per year, effective)" required error={err("rate")}><RateInput value={v.rate.value} onChange={(x) => patch((d) => { d.v.rate.value = x; })} onUnitHint={setRateHint} invalid={!!err("rate")} /></Field>
                      <Field label={v.rate.source === "implicit" ? "How it was determined" : "Why not the curve?"} required error={err("rateReason")}><TextArea value={v.rate.reason ?? ""} onChange={(x) => patch((d) => { d.v.rate.reason = x; })} rows={2} /></Field>
                    </div>
                  )}
                  {rateHint && <Banner tone="warning">{rateHint}</Banner>}
                  {v.rate.source !== "curve" && <p className="ll-subtle" style={{ fontSize: 12 }}>Overrides are flagged to the reviewer.</p>}
                </Question>
              </>
            )}
          </div>
          <div style={{ position: "sticky", top: 16 }}>
            <Card title="Result">
              <dl className="ll-dl">
                <dt>Contains a lease</dt><dd>{a.identifiedAsset === null || a.rightToControl === null ? "—" : notLease ? "No" : "Yes"}</dd>
                <dt>Treatment</dt><dd>{a.exemption === null ? "—" : exempt ? `Exempt (${a.exemption === "short_term" ? "short-term" : "low-value"}) — straight-line expense` : "Capitalise: ROU asset + lease liability"}</dd>
                <dt>Lease term</dt><dd>{t.endDate ? `${fmtDate(t.commencementDate)} – ${fmtDate(t.endDate)} (${months} months)` : "—"}</dd>
                {!exempt && <><dt>Discount rate</dt><dd className="ll-mono">{v.rate.value ? pct(v.rate.value) : "—"}</dd></>}
              </dl>
              {t.endDate && lease.contractEndDate && t.endDate !== lease.contractEndDate && <p className="ll-muted" style={{ fontSize: 12, marginTop: 10 }}>Term differs from the contract end ({fmtDate(lease.contractEndDate)}) because of options you&apos;re reasonably certain about. Payments continue at the escalated rent — adjust in step 2 if the renewal rent differs.</p>}
            </Card>
          </div>
        </div>
      )}

      {/* ── Step 4: Measure ── */}
      {step === 3 && (
        <div className="ll-stack">
          {exempt ? (
            <Card title="Exempt lease — straight-line expense" sub="No ROU asset or lease liability. Payments are expensed evenly over the term.">
              <JournalList lines={exemptExpense(t)} limitMonths={6} />
              {!v.calculated && <div style={{ marginTop: 12 }}><Btn variant="primary" onClick={doCalculate} loading={busy === "calc"}><CheckCircle2 size={14} /> Confirm treatment</Btn></div>}
            </Card>
          ) : (
            <>
              <Card title="Initial measurement" sub="Present value of unpaid payments on their actual dates, at the chosen rate." actions={<Btn variant={v.calculated ? "secondary" : "primary"} onClick={doCalculate} loading={busy === "calc"} disabled={readOnly}><Calculator size={14} /> {v.calculated ? "Recalculate" : "Calculate"}</Btn>}>
                {!v.calculated ? (
                  <EmptyState icon={Calculator} title="Not calculated yet" body="Calculate to see the lease liability, right-of-use asset, schedules, day-one journal and integrity checks." />
                ) : (
                  <div className="ll-kpis">
                    <div className="ll-kpi"><span className="k">Lease liability</span><span className="v"><Money value={v.calculated.liability} /></span><span className="s">{cur} at commencement</span></div>
                    <div className="ll-kpi"><span className="k">Right-of-use asset</span><span className="v"><Money value={v.calculated.rou} /></span><span className="s">incl. prepaid, IDC, restoration, less incentives</span></div>
                    <div className="ll-kpi"><span className="k">Discount rate</span><span className="v">{pct(v.rate.value)}</span><span className="s">{v.rate.source === "curve" ? `curve v${v.rate.curveVersion}` : v.rate.source}</span></div>
                    <div className="ll-kpi"><span className="k">Checks</span><span className="v" style={{ color: v.calculated.checksOk ? "var(--success)" : "var(--danger)" }}>{v.calculated.checksOk ? "All passed" : "Failed"}</span><span className="s">{comp ? `${comp.checks.filter((k) => k.ok).length}/${comp.checks.length}` : ""}</span></div>
                  </div>
                )}
              </Card>
              {comp && <Card title="Schedules"><ScheduleTables c={comp} currency={cur} initial={comp.checks.every((k) => k.ok) ? "liability" : "checks"} /></Card>}
            </>
          )}
        </div>
      )}

      {/* ── Step 5: Review & submit ── */}
      {step === 4 && (
        <div className="ll-split">
          <div className="ll-stack">
            <Card title="Summary">
              <dl className="ll-dl">
                <dt>Lease</dt><dd>{lease.name} <span className="ll-code">{lease.code}</span></dd>
                <dt>Lessor</dt><dd>{st.counterparties.find((c) => c.id === lease.counterpartyId)?.name ?? "—"}</dd>
                <dt>Term</dt><dd>{fmtDate(t.commencementDate)} – {fmtDate(t.endDate)} ({months} months)</dd>
                <dt>Payments</dt><dd>{flows.length} · {money(flowsTotal.toFixed(2))} {cur}</dd>
                <dt>Treatment</dt><dd>{exempt ? `Exempt — ${a.exemption === "short_term" ? "short-term" : "low-value"}` : "Capitalised"}</dd>
                {!exempt && <><dt>Rate</dt><dd>{pct(v.rate.value)} ({v.rate.source === "curve" ? `curve v${v.rate.curveVersion}` : `${v.rate.source}: ${v.rate.reason}`})</dd></>}
                {!exempt && v.calculated && <><dt>Liability / ROU</dt><dd><Money value={v.calculated.liability} /> / <Money value={v.calculated.rou} /></dd></>}
                <dt>Options</dt><dd>{a.options.length ? a.options.map((o) => `${o.months}m ${o.type} — ${o.reasonablyCertain ? "certain" : "not certain"}`).join("; ") : "None"}</dd>
                <dt>Documents</dt><dd>{lease.docs.length ? lease.docs.map((d) => d.name).join(", ") : "None"}</dd>
              </dl>
            </Card>
            <Card title="Before you submit" pad={false}>
              <div>
                <CheckLine ok={!!v.calculated?.checksOk} label="Calculated and all integrity checks pass" />
                <CheckLine ok={lease.docs.length > 0} warn label={lease.docs.length ? "Signed contract attached" : "No contract attached — reviewers usually return leases without evidence"} />
                <CheckLine ok={dups.length === 0} warn label={dups.length ? `Possible duplicate of ${dups.map((d) => d.code).join(", ")} (same lessor, location and overlapping dates)` : "No possible duplicates"} />
                <CheckLine ok={!lockedStart} warn label={lockedStart ? "Commences in a locked period — past months post as a catch-up" : "Commences in an open period"} />
                {!exempt && policy && v.calculated && D(v.calculated.liability).lt(policy.capitalisationThreshold || 0) && <CheckLine ok={false} warn label={`Below the capitalisation threshold (${money(policy.capitalisationThreshold)}) — consider the low-value exemption`} />}
                <CheckLine ok={v.rate.source === "curve" || exempt} warn label={v.rate.source === "curve" || exempt ? "Rate from the approved curve" : "Rate overridden — the reviewer will see your reason"} />
              </div>
            </Card>
          </div>
          <div style={{ position: "sticky", top: 16 }}>
            <Card title="Submit for review" sub="Approval locks this version. Later changes are recorded as events, never edits.">
              <div className="ll-form">
                <Field label="Reviewer" required error={shownErrors.approver} hint="You can't review your own lease.">
                  <Select id="approver" value={approver} onChange={setApprover} placeholder="Choose a reviewer" options={reviewers.map((p) => ({ value: p.id, label: `${p.name} — ${p.title}` }))} invalid={!!shownErrors.approver} />
                </Field>
                <Field label="Note for the reviewer (optional)"><TextArea value={note} onChange={setNote} rows={3} placeholder="Anything unusual about this lease" /></Field>
                <Btn variant="primary" onClick={doSubmit} loading={busy === "submit"} disabled={readOnly || !v.calculated?.checksOk}><Send size={14} /> Submit for review</Btn>
                {!v.calculated?.checksOk && <p className="ll-subtle" style={{ fontSize: 12 }}>Calculate in step 4 first.</p>}
              </div>
            </Card>
          </div>
        </div>
      )}

      <div className="ll-actionbar">
        <span className="ll-save" aria-live="polite">
          {save === "saving" ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : save === "error" || save === "conflict" ? <AlertTriangle size={12} color="var(--danger)" /> : save === "dirty" ? <Info size={12} /> : <CheckCircle2 size={12} />}
          {saveLabel}
        </span>
        <span className="ll-spacer" />
        {step > 0 && <Btn onClick={() => go(step - 1)}><ArrowLeft size={14} /> Back</Btn>}
        {step < 4 && <Btn variant="primary" loading={busy === "create"} onClick={() => go(step + 1)} disabled={readOnly && step >= Math.max(lease.wizardStep, 0)}>Continue <ArrowRight size={14} /></Btn>}
      </div>

      <Confirm
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard this draft?"
        consequences={["The draft, its answers and attached documents are removed.", "Nothing was posted, so no accounting is affected.", "This can't be undone."]}
        confirmLabel="Discard draft"
        tone="danger"
        onConfirm={async () => {
          try {
            if (idRef.current) await discardDraft(idRef.current);
            toast("success", "Draft discarded");
            router.push("/leases/drafts");
          } catch (e) {
            toast("danger", e instanceof Error ? e.message : "Couldn't discard");
          }
        }}
      />
    </>
  );
}

function Redirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => router.replace(to), [router, to]);
  return null;
}

function Question({ id, title, why, err, children }: { id: string; title: string; why: string; err?: string; children: React.ReactNode }) {
  return (
    <section id={`f-${id}`} className={`ll-question${err ? " err" : ""}`}>
      <h4>{title}</h4>
      <details><summary>Why this matters</summary><p>{why}</p></details>
      {children}
      {err && <span className="ll-field"><span className="err" role="alert">{err}</span></span>}
    </section>
  );
}

function CheckLine({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  return (
    <div className={`ll-check ${ok ? "ok" : warn ? "warn" : "bad"}`}>
      {ok ? <CheckCircle2 size={16} className="ic" /> : <AlertTriangle size={16} className="ic" />}
      <span>{label}</span>
    </div>
  );
}

export type { ManualLine, ISODate };
