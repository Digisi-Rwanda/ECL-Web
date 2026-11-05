"use client";
import Link from "next/link";
import { useState } from "react";
import { Building2, CalendarDays, BookCheck, Landmark, ListTree, CheckCircle2, Circle, ChevronRight, Plus, Trash2 } from "lucide-react";
import { D, ACCOUNT_LABELS, type AccountKey } from "@/lib/leases/engine";
import { fmtDate, fmtDateTime, inForce, pct, todayISO } from "@/lib/leases/model";
import { setupStatus, saveEntity, openFirstPeriod, submitVersioned, decideVersioned } from "@/lib/leases/store";
import { ASSET_CLASSES, type AssetClass, type PolicyVersion, type IbrCurve, type GlMapping, type Versioned } from "@/lib/leases/types";
import { PageHeader, Card, Field, TextInput, Select, DateInput, Btn, Banner, StatusBadge, RateInput, MoneyInput } from "@/components/ll/Kit";
import { useLeasesState, useAction, useMe } from "../use-leases";
import { PersonById } from "../common";
import { can } from "../use-leases";
import { CURRENCIES } from "@/lib/currencies";

const STEPS = [
  { key: "entity", href: "/leases/setup/entity", icon: Building2, title: "Entity & reporting book", desc: "Legal entity, functional currency, financial year and the IFRS 16 book." },
  { key: "periods", href: "/leases/setup/periods", icon: CalendarDays, title: "First open period", desc: "The month your lease accounting starts posting." },
  { key: "policy", href: "/leases/setup/policy", icon: BookCheck, title: "Accounting policies", desc: "Exemptions, non-lease components, interest convention. Versioned." },
  { key: "rates", href: "/leases/setup/rates", icon: Landmark, title: "Discount rates (IBR curve)", desc: "Incremental borrowing rates by term. Leases pick their rate from here." },
  { key: "gl", href: "/leases/setup/gl", icon: ListTree, title: "GL account mapping", desc: "Where journals post in your ledger. Needed before the first close." },
] as const;

export function SetupChecklist() {
  const st = useLeasesState()!;
  const s = setupStatus(st);
  const me = useMe()!;
  const done = Object.values(s).filter(Boolean).length;
  return (
    <Card title={`Setup · ${done} of ${STEPS.length} done`} sub={me.role === "administrator" ? "Steps 1–4 unlock adding leases; step 5 unlocks period close." : "Only an administrator can change setup."} pad={false}>
      <div className="ll-progress" style={{ margin: "0 16px 4px", marginTop: 12 }}><span style={{ width: `${(done / STEPS.length) * 100}%` }} /></div>
      <ol className="ll-clist">
        {STEPS.map((step, i) => {
          const ok = s[step.key];
          const prevOk = STEPS.slice(0, i).every((x) => x.key === "gl" || s[x.key]);
          return (
            <li key={step.key} className={`ll-citem ${ok ? "done" : prevOk ? "todo" : "locked"}`}>
              <span className="n">{ok ? <CheckCircle2 size={14} /> : i + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p className="d">{step.desc}</p>
              </div>
              <div className="act">
                {prevOk || ok ? (
                  <Link href={step.href} className={`btn btn-sm ${ok ? "btn-ghost" : "btn-primary"}`}>
                    {ok ? "View" : me.role === "administrator" ? "Set up" : "View"} <ChevronRight size={13} />
                  </Link>
                ) : <span className="ll-subtle" style={{ fontSize: "var(--fs-caption)" }}><Circle size={10} /> Locked</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function SetupView() {
  return (
    <>
      <PageHeader title="Setup" sub="Configure how Leases accounts for your contracts. Changes after go-live create new versions; history is never overwritten." back={{ href: "/leases", label: "Overview" }} />
      <SetupChecklist />
    </>
  );
}

// ─── Step: entity ──────────────────────────────────────────────────────────
export function EntityStep() {
  const st = useLeasesState()!;
  const me = useMe()!;
  const { run, pending } = useAction();
  const [name, setName] = useState(st.entity?.name ?? "");
  const [currency, setCurrency] = useState(st.entity?.currency ?? "USD");
  const [country, setCountry] = useState(st.entity?.country ?? "Rwanda");
  const [fy, setFy] = useState(String(st.entity?.fyStartMonth ?? 1));
  const [book, setBook] = useState(st.book?.name ?? "IFRS book");
  const [err, setErr] = useState<Record<string, string>>({});
  const locked = st.leases.length > 0;
  const admin = can(me.role, "admin");
  const save = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Entity name is required.";
    if (!book.trim()) e.book = "Name the reporting book.";
    setErr(e);
    if (Object.keys(e).length) return;
    void run("save", () => saveEntity({ id: st.entity?.id ?? "en_1", name: name.trim(), currency, country, fyStartMonth: Number(fy) }, book.trim()), "Entity saved");
  };
  return (
    <>
      <PageHeader title="Entity & reporting book" back={{ href: "/leases/setup", label: "Setup" }} sub="Who the numbers belong to and which framework applies." />
      {locked && <Banner tone="locked" title="Currency and financial year are locked">Leases exist for this entity. Changing the functional currency would change every recorded amount.</Banner>}
      <Card>
        <div className="ll-form">
          <div className="ll-fields">
            <Field label="Legal entity name" required error={err.name} htmlFor="en"><TextInput id="en" value={name} onChange={setName} disabled={!admin} invalid={!!err.name} /></Field>
            <Field label="Country" htmlFor="co"><TextInput id="co" value={country} onChange={setCountry} disabled={!admin} /></Field>
            <Field label="Functional currency" htmlFor="cu" hint="Leases are measured in this currency.">
              <Select id="cu" value={currency} onChange={setCurrency} disabled={!admin || locked} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </Field>
            <Field label="Financial year starts" htmlFor="fy">
              <Select id="fy" value={fy} onChange={setFy} disabled={!admin || locked} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(Date.UTC(2026, i, 1)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" }) }))} />
            </Field>
          </div>
          <div className="ll-fields">
            <Field label="Reporting book" required error={err.book} hint="e.g. IFRS group book. Local-GAAP books come later." htmlFor="bk"><TextInput id="bk" value={book} onChange={setBook} disabled={!admin} invalid={!!err.book} /></Field>
            <Field label="Framework" hint="Only IFRS 16 lessee accounting is supported in this release."><TextInput value="IFRS 16 — Leases (lessee)" onChange={() => {}} disabled /></Field>
          </div>
          {admin && <div className="ll-row"><Btn variant="primary" loading={pending === "save"} onClick={save}>Save</Btn></div>}
        </div>
      </Card>
    </>
  );
}

// ─── Step: periods ─────────────────────────────────────────────────────────
export function PeriodsStep() {
  const st = useLeasesState()!;
  const me = useMe()!;
  const { run, pending } = useAction();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  return (
    <>
      <PageHeader title="Accounting periods" back={{ href: "/leases/setup", label: "Setup" }} sub="Periods open one month at a time; closing a month locks it." />
      <Card>
        {st.periods.length === 0 ? (
          <div className="ll-form">
            <Field label="First open month" hint="Leases that commenced earlier are measured from commencement; amounts before this month form the opening balance." htmlFor="m">
              <input id="m" type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} disabled={!can(me.role, "admin")} />
            </Field>
            {can(me.role, "admin") && <div className="ll-row"><Btn variant="primary" loading={pending === "p"} onClick={() => run("p", () => openFirstPeriod(month), "Period opened")}>Open period</Btn></div>}
          </div>
        ) : (
          <div className="ll-table-wrap">
            <table className="ll-table">
              <thead><tr><th>Period</th><th>Status</th><th>Locked by</th><th>Reopened</th></tr></thead>
              <tbody>
                {[...st.periods].reverse().map((p) => (
                  <tr key={p.key}>
                    <td className="ll-mono"><Link className="ll-link" href={`/leases/close/${p.key}`}>{p.key}</Link></td>
                    <td><StatusBadge tone={p.status === "locked" ? "muted" : p.status === "closing" ? "warning" : "success"}>{p.status}</StatusBadge></td>
                    <td>{p.lockedBy ? <PersonById st={st} id={p.lockedBy} /> : "—"}</td>
                    <td>{p.reopenLog.length ? `${p.reopenLog.length}× (last: ${p.reopenLog.at(-1)!.reason})` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

// ─── Versioned helpers ─────────────────────────────────────────────────────
function VersionHistory<T extends Versioned>({ list, kind, render }: { list: T[]; kind: "policies" | "curves" | "gl"; render?: (v: T) => React.ReactNode }) {
  const st = useLeasesState()!;
  const me = useMe()!;
  const { run, pending } = useAction();
  const inf = inForce(list);
  return (
    <Card title="Versions" sub="Every change is a new version with an effective date. Leases use the version in force on their dates." pad={false}>
      <div className="ll-table-wrap">
        <table className="ll-table">
          <thead><tr><th>Version</th><th>Effective from</th><th>Status</th><th>Reason</th><th>By</th><th>Approved</th><th /></tr></thead>
          <tbody>
            {[...list].reverse().map((v) => (
              <tr key={v.version}>
                <td className="ll-mono">v{v.version}{inf?.version === v.version && <> <StatusBadge tone="success" dot={false}>In force</StatusBadge></>}</td>
                <td>{fmtDate(v.effectiveFrom)}</td>
                <td><StatusBadge tone={v.status === "approved" ? "success" : "info"}>{v.status === "in_review" ? "Awaiting approval" : v.status}</StatusBadge></td>
                <td style={{ maxWidth: 280 }}>{v.reason}{render?.(v)}</td>
                <td><PersonById st={st} id={v.createdBy} /></td>
                <td>{v.approvedBy ? <><PersonById st={st} id={v.approvedBy} /> <span className="ll-subtle" style={{ fontSize: 11 }}>{fmtDateTime(v.approvedAt)}</span></> : "—"}</td>
                <td>
                  {v.status === "in_review" && can(me.role, "review") && v.createdBy !== me.id && (
                    <span className="ll-row" style={{ flexWrap: "nowrap" }}>
                      <Btn size="sm" variant="primary" loading={pending === `a${v.version}`} onClick={() => run(`a${v.version}`, () => decideVersioned(kind, v.version, true), `v${v.version} approved`)}>Approve</Btn>
                      <Btn size="sm" loading={pending === `r${v.version}`} onClick={() => run(`r${v.version}`, () => decideVersioned(kind, v.version, false, "Rejected"), `v${v.version} rejected`)}>Reject</Btn>
                    </span>
                  )}
                  {v.status === "in_review" && v.createdBy === me.id && <span className="ll-subtle" style={{ fontSize: 11 }}>Someone else must approve</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SubmitBar({ first, onSubmit, busy }: { first: boolean; onSubmit: (eff: string, reason: string) => void; busy: boolean }) {
  const [eff, setEff] = useState(first ? "2020-01-01" : todayISO());
  const [reason, setReason] = useState("");
  return (
    <div className="ll-fields" style={{ alignItems: "end" }}>
      <Field label="Effective from" required htmlFor="eff" hint={first ? "Use a date on or before your earliest lease." : undefined}><DateInput id="eff" value={eff} onChange={setEff} /></Field>
      {!first && <Field label="Reason for change" required htmlFor="rs"><TextInput id="rs" value={reason} onChange={setReason} placeholder="e.g. Board approved new low-value threshold" /></Field>}
      <div><Btn variant="primary" loading={busy} onClick={() => onSubmit(eff, reason)}>{first ? "Save and approve" : "Submit for approval"}</Btn></div>
    </div>
  );
}

// ─── Step: policy ──────────────────────────────────────────────────────────
export function PolicyStep() {
  const st = useLeasesState()!;
  const me = useMe()!;
  const { run, pending } = useAction();
  const cur = inForce(st.policies);
  const [p, setP] = useState<Omit<PolicyVersion, keyof Versioned>>(() => ({
    dayCount: cur?.dayCount ?? "periodic",
    shortTermClasses: cur?.shortTermClasses ?? ["vehicles", "equipment", "it"],
    lowValueElection: cur?.lowValueElection ?? true,
    lowValueThreshold: cur?.lowValueThreshold ?? "5000",
    separateNonLeaseClasses: cur?.separateNonLeaseClasses ?? ["property"],
    capitalisationThreshold: cur?.capitalisationThreshold ?? "0",
  }));
  const admin = can(me.role, "admin");
  const toggle = (k: "shortTermClasses" | "separateNonLeaseClasses", c: AssetClass) =>
    setP({ ...p, [k]: p[k].includes(c) ? p[k].filter((x) => x !== c) : [...p[k], c] });
  const pendingV = st.policies.some((v) => v.status === "in_review");
  return (
    <>
      <PageHeader title="Accounting policies" back={{ href: "/leases/setup", label: "Setup" }} sub="Elections under IFRS 16. They apply from their effective date." />
      {pendingV && <Banner tone="info" title="A policy change is awaiting approval">Approve or reject it below before submitting another.</Banner>}
      <Card title={cur ? `Edit — creates v${st.policies.length + 1}` : "Initial policy"}>
        <fieldset disabled={!admin} className="ll-form">
          <div className="ll-question">
            <h4>Short-term exemption (≤ 12 months, no purchase option)</h4>
            <p className="ll-muted" style={{ fontSize: "var(--fs-caption)" }}>Elected by class of asset. Exempt leases are expensed straight-line with no balance-sheet entries.</p>
            <div className="ll-row">{(Object.keys(ASSET_CLASSES) as AssetClass[]).map((c) => <label key={c} className="ll-chip" aria-pressed={p.shortTermClasses.includes(c)} style={{ cursor: "pointer" }}><input type="checkbox" className="sr-only" checked={p.shortTermClasses.includes(c)} onChange={() => toggle("shortTermClasses", c)} />{ASSET_CLASSES[c]}</label>)}</div>
          </div>
          <div className="ll-question">
            <h4>Low-value exemption</h4>
            <p className="ll-muted" style={{ fontSize: "var(--fs-caption)" }}>Elected lease by lease, based on the value of the asset when new (around USD 5,000 per the IASB&apos;s basis), not on materiality.</p>
            <div className="ll-fields">
              <Field label="Use the low-value exemption"><Select value={p.lowValueElection ? "y" : "n"} onChange={(v) => setP({ ...p, lowValueElection: v === "y" })} options={[{ value: "y", label: "Yes" }, { value: "n", label: "No" }]} /></Field>
              <Field label={`Threshold (asset value when new, ${st.entity?.currency})`}><MoneyInput value={p.lowValueThreshold} onChange={(v) => setP({ ...p, lowValueThreshold: v })} /></Field>
            </div>
          </div>
          <div className="ll-question">
            <h4>Separate non-lease components (service charges)</h4>
            <p className="ll-muted" style={{ fontSize: "var(--fs-caption)" }}>Classes not ticked include service charges in the lease liability (practical expedient).</p>
            <div className="ll-row">{(Object.keys(ASSET_CLASSES) as AssetClass[]).map((c) => <label key={c} className="ll-chip" aria-pressed={p.separateNonLeaseClasses.includes(c)} style={{ cursor: "pointer" }}><input type="checkbox" className="sr-only" checked={p.separateNonLeaseClasses.includes(c)} onChange={() => toggle("separateNonLeaseClasses", c)} />{ASSET_CLASSES[c]}</label>)}</div>
          </div>
          <div className="ll-fields">
            <Field label="Interest convention" hint="Periodic: each payment period is an equal fraction of a year (matches most contracts). Actual/365: exact days.">
              <Select value={p.dayCount} onChange={(v) => setP({ ...p, dayCount: v })} options={[{ value: "periodic", label: "Periodic (effective annual rate)" }, { value: "act365", label: "Actual / 365" }]} />
            </Field>
            <Field label={`Capitalisation threshold (${st.entity?.currency})`} hint="Shown as a warning on smaller leases; the reviewer decides."><MoneyInput value={p.capitalisationThreshold} onChange={(v) => setP({ ...p, capitalisationThreshold: v })} /></Field>
          </div>
          {admin && !pendingV && <SubmitBar first={!cur} busy={pending === "s"} onSubmit={(eff, reason) => run("s", () => submitVersioned("policies", p as never, eff, reason), cur ? "Submitted for approval" : "Policy saved")} />}
        </fieldset>
      </Card>
      {st.policies.length > 0 && <VersionHistory list={st.policies} kind="policies" />}
    </>
  );
}

// ─── Step: rates ───────────────────────────────────────────────────────────
export function RatesStep() {
  const st = useLeasesState()!;
  const me = useMe()!;
  const { run, pending } = useAction();
  const cur = inForce(st.curves);
  const ccy = st.entity?.currency ?? "USD";
  const [source, setSource] = useState(cur?.source ?? "");
  const [points, setPoints] = useState(() => (cur?.points.filter((p) => p.currency === ccy) ?? [1, 3, 5, 10].map((y) => ({ currency: ccy, termYears: y, rate: "" }))).map((p) => ({ ...p })));
  const [hints, setHints] = useState<Record<number, string | null>>({});
  const admin = can(me.role, "admin");
  const pendingV = st.curves.some((v) => v.status === "in_review");
  const usage = (v: IbrCurve) => st.leases.filter((l) => l.versions.some((x) => x.rate.curveVersion === v.version)).length;
  const submit = (eff: string, reason: string) => {
    const bad = points.find((p) => !p.rate || D(p.rate).lte(0) || D(p.rate).gt(0.4));
    if (!source.trim()) return run("s", () => Promise.reject(new Error("Say where the rates come from (evidence).")));
    if (bad) return run("s", () => Promise.reject(new Error(`${bad.termYears}-year rate must be between 0% and 40%.`)));
    const terms = points.map((p) => p.termYears);
    if (new Set(terms).size !== terms.length) return run("s", () => Promise.reject(new Error("Each term can appear once.")));
    return run("s", () => submitVersioned("curves", { source, points: [...points].sort((a, b) => a.termYears - b.termYears) } as never, eff, reason), cur ? "Curve submitted for approval" : "Curve saved");
  };
  return (
    <>
      <PageHeader title="Discount rates (IBR curve)" back={{ href: "/leases/setup", label: "Setup" }} sub="Incremental borrowing rate = reference rate + credit spread + lease adjustment, by term. New leases interpolate from the curve in force at commencement." />
      {pendingV && <Banner tone="info" title="A curve change is awaiting approval" />}
      <Card title={cur ? `New curve — creates v${st.curves.length + 1}` : "Initial curve"} sub={`${ccy}. Existing leases keep the rate they were measured with.`}>
        <fieldset disabled={!admin} className="ll-form">
          <Field label="Source / evidence" required hint="e.g. Bank quotes 3 Jan + sovereign curve, Treasury memo T-2026-01"><TextInput value={source} onChange={setSource} /></Field>
          <div className="ll-table-wrap">
            <table className="ll-table">
              <thead><tr><th>Term (years)</th><th>Rate (% p.a., effective)</th><th /></tr></thead>
              <tbody>
                {points.map((p, i) => (
                  <tr key={i}>
                    <td style={{ width: 140 }}><input style={{ maxWidth: 110 }} className="input num" type="number" min={1} max={50} value={p.termYears} onChange={(e) => setPoints(points.map((x, j) => (j === i ? { ...x, termYears: Number(e.target.value) } : x)))} aria-label="Term in years" /></td>
                    <td>
                      <div style={{ maxWidth: 180 }}><RateInput value={p.rate} onChange={(v) => setPoints(points.map((x, j) => (j === i ? { ...x, rate: v } : x)))} onUnitHint={(h) => setHints({ ...hints, [i]: h })} aria-label={`${p.termYears}-year rate`} /></div>
                      {hints[i] && <span className="hint" style={{ color: "var(--warning)", fontSize: 12 }}>{hints[i]}</span>}
                    </td>
                    <td><button type="button" className="btn btn-icon btn-sm" aria-label="Remove term" onClick={() => setPoints(points.filter((_, j) => j !== i))} disabled={points.length <= 1}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div><Btn size="sm" onClick={() => setPoints([...points, { currency: ccy, termYears: (points.at(-1)?.termYears ?? 0) + 5, rate: "" }])}><Plus size={13} /> Add term</Btn></div>
          {admin && !pendingV && <SubmitBar first={!cur} busy={pending === "s"} onSubmit={submit} />}
        </fieldset>
      </Card>
      {st.curves.length > 0 && (
        <VersionHistory list={st.curves} kind="curves" render={(v) => (
          <div className="ll-subtle" style={{ fontSize: 11, marginTop: 4 }}>
            {v.points.map((p) => `${p.termYears}y ${pct(p.rate)}`).join(" · ")} · used by {usage(v)} lease{usage(v) === 1 ? "" : "s"}
          </div>
        )} />
      )}
    </>
  );
}

// ─── Step: GL mapping ──────────────────────────────────────────────────────
export function GlStep() {
  const st = useLeasesState()!;
  const me = useMe()!;
  const { run, pending } = useAction();
  const cur = inForce(st.gl);
  const [acc, setAcc] = useState<Record<AccountKey, string>>(() => ({ ...(Object.fromEntries(Object.keys(ACCOUNT_LABELS).map((k) => [k, ""])) as Record<AccountKey, string>), ...(cur?.accounts ?? {}) }));
  const admin = can(me.role, "admin");
  const pendingV = st.gl.some((v) => v.status === "in_review");
  const missing = Object.values(acc).filter((v) => !v.trim()).length;
  return (
    <>
      <PageHeader title="GL account mapping" back={{ href: "/leases/setup", label: "Setup" }} sub="Account codes in your ledger. Posted journals keep the mapping that was in force when they were posted." />
      {pendingV && <Banner tone="info" title="A mapping change is awaiting approval" />}
      <Card title={cur ? `Edit — creates v${st.gl.length + 1}` : "Initial mapping"} sub={missing ? `${missing} account${missing > 1 ? "s" : ""} not mapped — period close is blocked until every account has a code.` : "All accounts mapped."}>
        <fieldset disabled={!admin} className="ll-form">
          <div className="ll-fields">
            {(Object.keys(ACCOUNT_LABELS) as AccountKey[]).map((k) => (
              <Field key={k} label={ACCOUNT_LABELS[k]} htmlFor={`gl-${k}`} error={!acc[k].trim() ? "Not mapped" : undefined}>
                <TextInput id={`gl-${k}`} value={acc[k]} onChange={(v) => setAcc({ ...acc, [k]: v.replace(/[^\w.\-]/g, "") })} className="ll-mono" placeholder="e.g. 2410" />
              </Field>
            ))}
          </div>
          {admin && !pendingV && <SubmitBar first={!cur} busy={pending === "s"} onSubmit={(eff, reason) => run("s", () => submitVersioned("gl", { accounts: acc } as never, eff, reason), cur ? "Submitted for approval" : "Mapping saved")} />}
        </fieldset>
      </Card>
      {st.gl.length > 0 && <VersionHistory list={st.gl as GlMapping[]} kind="gl" />}
    </>
  );
}


