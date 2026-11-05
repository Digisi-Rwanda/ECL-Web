"use client";
import { useState } from "react";
import { TrendingUp, CalendarRange, FileSignature, DoorOpen, HelpCircle, Send } from "lucide-react";
import { compute, D, type EventType } from "@/lib/leases/engine";
import { addDays, isISODate, monthKey } from "@/lib/leases/dates";
import { approvedChain, curveOf, curveRate, enginePolicy, fmtDate, isLockedDate, pct, periodLabel, currentPeriod, segmentInputs, termYears } from "@/lib/leases/model";
import { startEvent, getState, type EventDraft } from "@/lib/leases/store";
import type { Lease, LeaseVersion } from "@/lib/leases/types";
import { Drawer } from "@/components/ll/Overlay";
import { Field, DateInput, MoneyInput, RateInput, TextArea, Select, Btn, Banner, Money, Choice, YesNo } from "@/components/ll/Kit";
import { toast } from "@/components/ll/toast";
import { useLeasesState, useMe } from "./use-leases";
import { JournalList } from "./ScheduleTables";

type Ev = "index" | "term" | "modification" | "termination";
const TYPES: Array<{ id: Ev; icon: React.ElementType; title: string; body: string }> = [
  { id: "index", icon: TrendingUp, title: "CPI / index change", body: "Rent changes because an index moved. Remeasured at the original rate." },
  { id: "term", icon: CalendarRange, title: "Lease term reassessment", body: "You now expect to renew or exit early (a significant event in your control). Revised rate." },
  { id: "modification", icon: FileSignature, title: "Contract modification", body: "You and the lessor agreed new terms: rent, term or space. Revised rate; scope decreases book a gain or loss." },
  { id: "termination", icon: DoorOpen, title: "Termination", body: "The lease ends early. Balances are derecognised and the difference goes to profit or loss." },
];
const RULE: Record<Ev, string> = {
  index: "Index change → original discount rate kept (IFRS 16.42(b)).",
  term: "Change in lease term → revised discount rate at the effective date (IFRS 16.40).",
  modification: "Modification not accounted for as a separate lease → revised rate at the effective date (IFRS 16.45).",
  termination: "Full derecognition; the difference between the liability and the ROU asset (less any penalty) goes to profit or loss.",
};

export function EventDrawer({ lease, open, onOpenChange }: { lease: Lease; open: boolean; onOpenChange: (o: boolean) => void }) {
  const st = useLeasesState()!;
  const me = useMe()!;
  const chain = approvedChain(lease);
  const last = chain[chain.length - 1];
  const period = currentPeriod(st);
  const [type, setType] = useState<Ev | null>(null);
  const [classify, setClassify] = useState(false);
  const [eff, setEff] = useState(period ? `${period.key}-01` : "");
  const [amount, setAmount] = useState("");
  const [end, setEnd] = useState(last?.terms.endDate ?? "");
  const [scope, setScope] = useState("");
  const [penalty, setPenalty] = useState("");
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState<string | null>(null);
  const [approver, setApprover] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState<{ agreed: boolean | null; newAsset: boolean | null; ends: "no" | "partly" | "fully" | null; index: boolean | null }>({ agreed: null, newAsset: null, ends: null, index: null });

  const reset = () => { setType(null); setClassify(false); setAmount(""); setScope(""); setPenalty(""); setReason(""); setOverride(null); setApprover(""); };
  const revisedEnd = type === "term" || type === "modification" ? end : last?.terms.endDate ?? "";
  const curveRev = !isISODate(eff) || !isISODate(revisedEnd) || revisedEnd <= eff ? undefined : curveRate(curveOf(st, eff), lease.currency, termYears(eff, revisedEnd));
  const rateValue = type === "index" ? last?.rate.value : override ?? curveRev ?? "";

  const draft: EventDraft | null = type ? {
    event: type, effectiveDate: eff, reason,
    newAmount: (type === "index" || type === "modification") && amount ? amount : undefined,
    newEndDate: (type === "term" || type === "modification") && end !== last?.terms.endDate ? end : undefined,
    scopeDecrease: type === "modification" && scope ? D(scope).toString() : undefined,
    terminationPenalty: type === "termination" ? penalty || "0" : undefined,
    rate: type === "index" ? last!.rate : override ? { value: override, source: "override", reason: "Overridden in event" } : { value: curveRev ?? "", source: "curve", curveVersion: curveOf(st, eff)?.version, termYears: isISODate(revisedEnd) && isISODate(eff) ? termYears(eff, revisedEnd) : undefined },
  } : null;

  const errors: string[] = [];
  if (type) {
    const prevStart = chain.length > 1 ? last.effectiveDate : chain[0]?.terms.commencementDate;
    if (!isISODate(eff)) errors.push("Choose the effective date.");
    else if (eff <= prevStart) errors.push(`Effective date must be after ${fmtDate(prevStart)}.`);
    else if (eff > last.terms.endDate) errors.push("Effective date must be within the lease term.");
    if (type === "index" && !amount) errors.push("Enter the new payment amount.");
    if (type === "term" && end === last.terms.endDate) errors.push("Enter the new lease end date.");
    if (type === "modification" && !amount && end === last.terms.endDate && !scope) errors.push("Change the rent, the end date or the scope.");
    if (type !== "index" && type !== "termination" && !rateValue) errors.push("No discount rate — check the curve.");
    if (!reason.trim()) errors.push("Describe the change and its evidence.");
  }

  // Before/after preview on the real engine (not saved)
  const draftKey = draft && !errors.length ? JSON.stringify(draft) : "";
  // computed per render; only runs once the form is valid (engine is ~100 ms for a 10-year lease)
  const preview = ((): { seg: ReturnType<typeof compute>["segments"][number]; journals: ReturnType<typeof compute>["journals"]; ok: boolean } | null => {
    if (!draftKey) return null;
    const d = JSON.parse(draftKey) as EventDraft;
    const ch = approvedChain(lease);
    const prev = ch[ch.length - 1];
    try {
      const terms = structuredClone(prev.terms);
      if (d.newAmount && terms.paymentRule) terms.paymentRule.amountSteps = [...(terms.paymentRule.amountSteps ?? []).filter((x) => x.from < d.effectiveDate), { from: d.effectiveDate, amount: d.newAmount }];
      if (d.newEndDate) terms.endDate = d.newEndDate;
      const cand: LeaseVersion = { ...structuredClone(prev), n: lease.versions.length + 1, status: "draft", event: d.event as EventType, effectiveDate: d.effectiveDate, terms, rate: d.rate, scopeDecrease: d.scopeDecrease, terminationPenalty: d.terminationPenalty };
      const c = compute(segmentInputs([...ch, cand]), enginePolicy(getState()!));
      const seg = c.segments.at(-1)!;
      const month = monthKey(d.effectiveDate);
      return { seg, journals: c.journals.filter((j) => j.month === month && (j.kind === "remeasurement" || j.kind === "derecognition")), ok: c.checks.every((k) => k.ok) };
    } catch {
      return null;
    }
  })();

  const classified: Ev | "separate" | null =
    q.agreed === false ? (q.index === null ? null : q.index ? "index" : "term")
      : q.agreed === true ? (q.newAsset === null ? null : q.newAsset ? "separate" : q.ends === null ? null : q.ends === "fully" ? "termination" : "modification")
        : null;

  const reviewers = st.personas.filter((p) => p.id !== me.id && p.role !== "analyst");
  const submit = async () => {
    if (!draft || errors.length) return;
    if (!approver) { toast("danger", "Choose a reviewer."); return; }
    setBusy(true);
    try {
      await startEvent(lease.id, lease.rev, { ...draft, approverId: approver });
      toast("success", "Change submitted for review");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast("danger", e instanceof Error ? e.message : "Couldn't record the change");
    }
    setBusy(false);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}
      title={type ? TYPES.find((x) => x.id === type)!.title : "Record a change"}
      sub={`${lease.code} · ${lease.name}`}
      footer={type ? (
        <>
          <Btn onClick={() => setType(null)}>Back</Btn>
          <Btn variant="primary" onClick={submit} loading={busy} disabled={!!errors.length || !preview?.ok}><Send size={14} /> Submit for review</Btn>
        </>
      ) : undefined}
    >
      {!type && !classify && (
        <>
          <div className="ll-stack">
            {TYPES.map((x) => (
              <button key={x.id} className="input-card" style={{ textAlign: "left", cursor: "pointer", alignItems: "flex-start" }} onClick={() => setType(x.id)}>
                <x.icon size={18} style={{ color: "var(--module-leases)", marginTop: 2 }} />
                <span><strong style={{ display: "block" }}>{x.title}</strong><span className="ll-muted" style={{ fontSize: 13 }}>{x.body}</span></span>
              </button>
            ))}
          </div>
          <Btn variant="ghost" onClick={() => setClassify(true)}><HelpCircle size={14} /> Not sure which one?</Btn>
        </>
      )}

      {!type && classify && (
        <div className="ll-stack">
          <div className="ll-question"><h4>Did you and the lessor agree to change the contract?</h4><YesNo name="Agreed change" value={q.agreed} onChange={(v) => setQ({ ...q, agreed: v })} /></div>
          {q.agreed === false && <div className="ll-question"><h4>Did the rent change because an index or rate (e.g. CPI) moved?</h4><YesNo name="Index change" value={q.index} onChange={(v) => setQ({ ...q, index: v })} /></div>}
          {q.agreed === true && <div className="ll-question"><h4>Does it add the right to use another asset, at roughly its stand-alone price?</h4><YesNo name="New asset" value={q.newAsset} onChange={(v) => setQ({ ...q, newAsset: v })} /></div>}
          {q.agreed === true && q.newAsset === false && <div className="ll-question"><h4>Does it end the lease?</h4><Choice name="Ends" value={q.ends} onChange={(v) => setQ({ ...q, ends: v })} options={[{ value: "no", label: "No" }, { value: "partly", label: "Partly (less space)" }, { value: "fully", label: "Fully" }]} /></div>}
          {classified === "separate" && <Banner tone="info" title="Account for it as a separate new lease">Create a new lease for the added asset; this lease stays as it is.</Banner>}
          {classified && classified !== "separate" && <Banner tone="success" title={`This is a ${TYPES.find((x) => x.id === classified)!.title.toLowerCase()}`} action={<Btn size="sm" variant="primary" onClick={() => { setType(classified); setClassify(false); }}>Continue</Btn>} />}
          <Btn variant="ghost" onClick={() => setClassify(false)}>Back to the list</Btn>
        </div>
      )}

      {type && (
        <>
          <Banner tone="info">{RULE[type]}</Banner>
          <div className="ll-fields">
            <Field label="Effective date" required hint="When the change takes effect, not when you heard about it."><DateInput value={eff} onChange={setEff} /></Field>
            {(type === "index" || type === "modification") && <Field label="New payment amount" hint={`Current: ${last.terms.paymentRule?.amountSteps?.at(-1)?.amount ?? last.terms.paymentRule?.amount}`}><MoneyInput value={amount} onChange={setAmount} currency={lease.currency} /></Field>}
            {(type === "term" || type === "modification") && <Field label="Lease end date" hint={`Currently ${fmtDate(last.terms.endDate)}`}><DateInput value={end} onChange={setEnd} /></Field>}
            {type === "modification" && <Field label="Share of space given back" hint="Leave empty if the scope doesn't shrink."><Select value={scope} onChange={setScope} options={[{ value: "", label: "None" }, ...[0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75].map((x) => ({ value: String(x), label: `${x * 100}%` }))]} /></Field>}
            {type === "termination" && <Field label="Termination penalty paid" hint="Leave 0 if none."><MoneyInput value={penalty} onChange={setPenalty} currency={lease.currency} /></Field>}
          </div>
          {isISODate(eff) && isLockedDate(st, eff) && <Banner tone="warning" title={`${periodLabel(monthKey(eff))} is locked`}>The effect on locked months is posted as a catch-up in {period ? periodLabel(period.key) : "the next open period"}. Locked periods are not rewritten.</Banner>}
          {type !== "index" && type !== "termination" && (
            <div className="ll-question">
              <h4>Revised discount rate</h4>
              <p style={{ fontSize: 14 }}>{curveRev ? <>Curve <strong className="ll-mono">{pct(curveRev)}</strong> for the remaining {isISODate(eff) && isISODate(revisedEnd) ? termYears(eff, revisedEnd) : "—"} years</> : "Enter dates to pick a rate."}</p>
              {override === null ? <Btn size="sm" variant="ghost" onClick={() => setOverride(curveRev ?? "")}>Override rate</Btn> : <Field label="Override (% p.a.)"><RateInput value={override} onChange={setOverride} /></Field>}
            </div>
          )}
          <Field label="Reason and evidence" required hint="e.g. landlord letter ref, NISR CPI release, board decision."><TextArea value={reason} onChange={setReason} /></Field>

          {errors.length > 0 ? (
            <ul className="ll-muted" style={{ fontSize: 13, listStyle: "disc", paddingLeft: 18 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          ) : preview && (
            <div className="ll-card">
              <div className="ll-card-head"><h3>Effect on {fmtDate(eff)}</h3></div>
              <div className="ll-card-pad ll-stack">
                <div className="ll-table-wrap">
                  <table className="ll-table">
                    <thead><tr><th /><th className="num">Before</th><th className="num">After</th><th className="num">Change</th></tr></thead>
                    <tbody>
                      <tr><td>Lease liability</td><td className="num"><Money value={preview.seg.liabBefore.toFixed(2)} /></td><td className="num"><Money value={preview.seg.L0.toFixed(2)} /></td><td className="num"><Money value={preview.seg.L0.minus(preview.seg.liabBefore).toFixed(2)} /></td></tr>
                      <tr><td>Right-of-use asset</td><td className="num"><Money value={preview.seg.rouBefore.toFixed(2)} /></td><td className="num"><Money value={preview.seg.R0.toFixed(2)} /></td><td className="num"><Money value={preview.seg.R0.minus(preview.seg.rouBefore).toFixed(2)} /></td></tr>
                      <tr><td>Gain / (loss)</td><td /><td /><td className="num"><Money value={preview.seg.gainLoss.toFixed(2)} /></td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="ll-muted" style={{ fontSize: 12 }}>Rate used: {type === "termination" ? "n/a" : pct(draft!.rate.value)} · Remaining term ends {fmtDate(type === "termination" ? addDays(eff, -1) : revisedEnd)}</p>
                {preview.journals.length > 0 && <JournalList lines={preview.journals} />}
                {!preview.ok && <Banner tone="danger">The recalculated schedule fails an integrity check. Check the inputs.</Banner>}
              </div>
            </div>
          )}
          <Field label="Reviewer" required hint="Someone other than you approves the change.">
            <Select value={approver} onChange={setApprover} placeholder="Choose a reviewer" options={reviewers.map((p) => ({ value: p.id, label: `${p.name} — ${p.title}` }))} />
          </Field>
        </>
      )}
    </Drawer>
  );
}
