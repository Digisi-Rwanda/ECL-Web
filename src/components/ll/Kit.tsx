"use client";
/* Ledgerline kit: atoms & molecules shared by every module. */
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Info, Lock, XCircle, ArrowLeft, Loader2, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "muted";
const PILL: Record<Tone, string> = {
  neutral: "pill pill-neutral", info: "pill pill-running", success: "pill pill-success",
  warning: "pill pill-warning", danger: "pill pill-danger", muted: "pill pill-muted",
};

export function StatusBadge({ tone, children, dot = true }: { tone: Tone; children: React.ReactNode; dot?: boolean }) {
  // raw status codes ("in_review", "posted") read as labels ("In review", "Posted")
  const label = typeof children === "string" ? children.charAt(0).toUpperCase() + children.slice(1).replace(/_/g, " ") : children;
  return <span className={PILL[tone]}>{dot && <span className="dot" aria-hidden="true" />}{label}</span>;
}

export function Money({ value, currency, className, dash }: { value?: string; currency?: string; className?: string; dash?: boolean }) {
  if (value === undefined || value === "") return <span className={cn("ll-num", className)}>—</span>;
  const neg = value.startsWith("-");
  const abs = neg ? value.slice(1) : value;
  const isZero = /^0(\.0+)?$/.test(abs);
  if (dash && isZero) return <span className={cn("ll-num ll-subtle", className)}>—</span>;
  const [i, d] = abs.split(".");
  const s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d !== undefined ? "." + d.padEnd(2, "0").slice(0, 2) : ".00");
  return (
    <span className={cn("ll-num", neg && "ll-neg", className)} title={currency ? `${currency} ${value}` : undefined}>
      {neg ? `(${s})` : s}
      {currency && <span className="ll-subtle" style={{ marginLeft: 4, fontSize: "0.85em" }}>{currency}</span>}
    </span>
  );
}

export function PageHeader({
  title, sub, actions, back, eyebrow, badge,
}: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string }; eyebrow?: string; badge?: React.ReactNode }) {
  return (
    <div>
      {back && (
        <Link href={back.href} className="detail-back"><ArrowLeft size={14} /> {back.label}</Link>
      )}
      <div className="ll-head">
        <div style={{ minWidth: 0 }}>
          {eyebrow && <p className="ll-eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</p>}
          <h1>{title}{badge}</h1>
          {sub && <div className="ll-sub">{sub}</div>}
        </div>
        {actions && <div className="ll-actions">{actions}</div>}
      </div>
    </div>
  );
}

const BANNER_IC = { info: Info, warning: AlertTriangle, danger: XCircle, success: CheckCircle2, locked: Lock };
export function Banner({
  tone = "info", title, children, action, role,
}: { tone?: keyof typeof BANNER_IC; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; role?: "status" | "alert" }) {
  const Ic = BANNER_IC[tone];
  return (
    <div className={cn("ll-banner", tone)} role={role ?? (tone === "danger" ? "alert" : "status")}>
      <Ic size={16} aria-hidden="true" />
      <div className="ll-banner-body">
        {title && <div className="ll-banner-title">{title}</div>}
        {children && <div className="ll-banner-text">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, actions }: { icon: React.ElementType; title: string; body?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="ll-empty">
      <span className="ll-empty-ic" aria-hidden="true"><Icon size={20} /></span>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {actions && <div className="ll-row">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, sub, href, icon: Icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; icon?: React.ElementType }) {
  const inner = (
    <>
      <span className="k">{Icon && <Icon size={13} aria-hidden="true" />}{label}</span>
      <span className="v">{value}</span>
      {sub && <span className="s">{sub}</span>}
    </>
  );
  return href ? <Link href={href} className="ll-kpi">{inner}</Link> : <div className="ll-kpi">{inner}</div>;
}

export function Card({ title, sub, actions, children, pad = true, id }: { title?: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; pad?: boolean; id?: string }) {
  return (
    <section className="ll-card" id={id}>
      {(title || actions) && (
        <header className="ll-card-head">
          <div style={{ minWidth: 0 }}>
            {title && <h2>{title}</h2>}
            {sub && <p>{sub}</p>}
          </div>
          {actions && <div className="ll-row">{actions}</div>}
        </header>
      )}
      <div className={pad ? "ll-card-pad" : undefined}>{children}</div>
    </section>
  );
}

export function Skeleton({ h = 14, w = "100%", r = 6 }: { h?: number; w?: number | string; r?: number }) {
  return <span className="skel" style={{ display: "block", height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}
export function SkeletonPage() {
  return (
    <div className="ll-page" aria-busy="true" aria-label="Loading">
      <Skeleton h={28} w={240} />
      <div className="ll-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="ll-kpi"><Skeleton h={12} w={90} /><Skeleton h={22} w={140} /></div>)}</div>
      <div className="ll-card ll-card-pad ll-stack">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={16} />)}</div>
    </div>
  );
}

export function Btn({
  variant = "secondary", size, loading, children, className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "lg"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      className={cn("btn", `btn-${variant}`, size && `btn-${size}`, className)}
    >
      {loading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function BtnLink({ href, variant = "secondary", size, children, className }: { href: string; variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "lg"; children: React.ReactNode; className?: string }) {
  return <Link href={href} className={cn("btn", `btn-${variant}`, size && `btn-${size}`, className)}>{children}</Link>;
}

export function Avatar({ initials, title }: { initials: string; title?: string }) {
  return <span className="ll-avatar" title={title} aria-hidden={title ? undefined : true}>{initials}</span>;
}

export function Person({ name, initials }: { name?: string; initials?: string }) {
  if (!name) return <span className="ll-subtle">—</span>;
  return <span className="ll-person"><Avatar initials={initials ?? name.slice(0, 2).toUpperCase()} />{name}</span>;
}

export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="ll-progress">
      <span style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

// ─── Form molecules ───────────────────────────────────────────────────────

export function Field({
  label, hint, error, required, children, htmlFor, id,
}: { label: React.ReactNode; hint?: React.ReactNode; error?: string; required?: boolean; children: React.ReactNode; htmlFor?: string; id?: string }) {
  return (
    <div className="ll-field" id={id}>
      <label htmlFor={htmlFor}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>
      {children}
      {error ? <span className="err" role="alert"><XCircle size={12} style={{ marginTop: 2, flex: "none" }} />{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { value: string; onChange: (v: string) => void; invalid?: boolean };

export function TextInput({ value, onChange, invalid, className, ...rest }: InputProps) {
  return <input {...rest} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} className={cn("input", invalid && "input-error", className)} />;
}

/** Native date input: keyboard + mobile pickers for free; value stays ISO. */
export function DateInput({ value, onChange, invalid, ...rest }: InputProps) {
  return <input type="date" {...rest} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} className={cn("input", invalid && "input-error")} />;
}

/** Money as a plain decimal string; strips thousands separators on input, shows them on blur. */
export function MoneyInput({ value, onChange, invalid, currency, ...rest }: InputProps & { currency?: string }) {
  const [focus, setFocus] = useState(false);
  const shown = focus || !value ? value : value.replace(/^(-?\d+)/, (m) => m.replace(/\B(?=(\d{3})+(?!\d))/g, ","));
  return (
    <div className={cn("ll-affix", currency && "has-pfx")}>
      {currency && <span className="pfx">{currency}</span>}
      <input
        {...rest}
        inputMode="decimal"
        value={shown}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onChange={(e) => {
          const v = e.target.value.replace(/[,\s]/g, "");
          if (v === "" || /^-?\d*\.?\d{0,2}$/.test(v)) onChange(v);
        }}
        aria-invalid={invalid || undefined}
        className={cn("input num", invalid && "input-error")}
      />
    </div>
  );
}

/** Percentage entry stored as a decimal string ("8.75" → "0.0875"). Guards the 10-vs-0.10 mistake. */
export function RateInput({ value, onChange, invalid, onUnitHint, ...rest }: InputProps & { onUnitHint?: (msg: string | null) => void }) {
  const toPct = (d: string) => (d === "" ? "" : String(Number((Number(d) * 100).toFixed(6))));
  const [text, setText] = useState(toPct(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(toPct(value));
    }
  }, [value]);
  return (
    <div className="ll-affix">
      <input
        {...rest}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/[%\s]/g, "");
          if (t !== "" && !/^\d*\.?\d{0,4}$/.test(t)) return;
          setText(t);
          const n = Number(t);
          onUnitHint?.(t !== "" && n > 0 && n < 1 ? `Did you mean ${Number((n * 100).toFixed(4))}%? Rates are entered as percentages.` : null);
          const dec = t === "" ? "" : String(Number((n / 100).toFixed(8)));
          last.current = dec;
          onChange(dec);
        }}
        aria-invalid={invalid || undefined}
        className={cn("input num", invalid && "input-error")}
      />
      <span className="sfx">%</span>
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options, invalid, placeholder, ...rest }: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> & { value: T | ""; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; invalid?: boolean; placeholder?: string }) {
  return (
    <select {...rest} value={value} onChange={(e) => onChange(e.target.value as T)} aria-invalid={invalid || undefined} className={cn("select", invalid && "input-error")}>
      {placeholder !== undefined && <option value="" disabled>{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function TextArea({ value, onChange, invalid, ...rest }: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & { value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return <textarea {...rest} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} className={cn("textarea", invalid && "input-error")} rows={rest.rows ?? 3} />;
}

export function YesNo({ value, onChange, labels = ["Yes", "No"], name }: { value: boolean | null; onChange: (v: boolean) => void; labels?: [string, string]; name: string }) {
  return (
    <div className="ll-yesno" role="group" aria-label={name}>
      <button type="button" aria-pressed={value === true} onClick={() => onChange(true)}>{labels[0]}</button>
      <button type="button" aria-pressed={value === false} onClick={() => onChange(false)}>{labels[1]}</button>
    </div>
  );
}

export function Choice<T extends string>({ value, onChange, options, name }: { value: T | null; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; name: string }) {
  return (
    <div className="ll-yesno" role="group" aria-label={name}>
      {options.map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

/** Typeahead with "+ Add" for a new value. */
export function Combobox({
  value, onChange, options, onCreate, placeholder, invalid, id,
}: { value: string; onChange: (id: string) => void; options: Array<{ id: string; label: string }>; onCreate?: (label: string) => Promise<string>; placeholder?: string; invalid?: boolean; id?: string }) {
  const selected = options.find((o) => o.id === value);
  // null while not typing → show the selected label
  const [typed, setQ] = useState<string | null>(null);
  const q = typed ?? selected?.label ?? "";
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const matches = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  const exact = options.some((o) => o.label.toLowerCase() === q.trim().toLowerCase());
  const canCreate = !!onCreate && q.trim().length > 1 && !exact;
  const total = matches.length + (canCreate ? 1 : 0);
  const pick = async (i: number) => {
    if (i < matches.length) {
      onChange(matches[i].id);
      setQ(null);
    } else if (canCreate) {
      const nid = await onCreate!(q.trim());
      onChange(nid);
      setQ(null);
    }
    setOpen(false);
  };
  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        className={cn("input", invalid && "input-error")}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        value={q}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); setQ(null); }, 150)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(total - 1, a + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === "Enter" && open && total) { e.preventDefault(); void pick(active); }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && total > 0 && (
        <ul id={listId} role="listbox" className="menu-pop" style={{ left: 0, right: 0, top: "calc(100% + 4px)", maxHeight: 260, overflowY: "auto" }}>
          {matches.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === active} className="mp-item" style={i === active ? { background: "var(--surface-sunken)" } : undefined} onMouseDown={(e) => { e.preventDefault(); void pick(i); }}>
              {o.label}
            </li>
          ))}
          {canCreate && (
            <li role="option" aria-selected={active === matches.length} className="mp-item" style={active === matches.length ? { background: "var(--surface-sunken)" } : undefined} onMouseDown={(e) => { e.preventDefault(); void pick(matches.length); }}>
              <span className="ll-link">+ Add “{q.trim()}”</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function ErrorSummary({ errors, onJump }: { errors: Record<string, string>; onJump?: (field: string) => void }) {
  const entries = Object.entries(errors);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (entries.length) ref.current?.focus(); }, [entries.length]);
  if (!entries.length) return null;
  return (
    <div className="ll-errsum" role="alert" tabIndex={-1} ref={ref}>
      <strong>Fix {entries.length} {entries.length === 1 ? "thing" : "things"} before continuing:</strong>
      <ul>
        {entries.map(([k, v]) => <li key={k}>{onJump ? <button type="button" onClick={() => onJump(k)}>{v}</button> : v}</li>)}
      </ul>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: Array<{ id: T; label: string; count?: number }>; label: string }) {
  return (
    <div className="ll-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          className="tab"
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            const i = tabs.findIndex((x) => x.id === value);
            if (e.key === "ArrowRight") onChange(tabs[(i + 1) % tabs.length].id);
            if (e.key === "ArrowLeft") onChange(tabs[(i - 1 + tabs.length) % tabs.length].id);
          }}
        >
          {t.label}
          {t.count !== undefined && <span className="count-badge" style={{ marginLeft: 0 }}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ steps, current, onSelect }: { steps: Array<{ label: string; done?: boolean; error?: boolean; disabled?: boolean }>; current: number; onSelect?: (i: number) => void }) {
  return (
    <nav className="ll-stepper" aria-label="Progress">
      {steps.map((s, i) => (
        <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {i > 0 && <span className="ll-step-sep" aria-hidden="true" />}
          <button
            type="button"
            className={cn("ll-step", s.done && "done", s.error && "err")}
            aria-current={i === current ? "step" : undefined}
            disabled={s.disabled}
            onClick={() => onSelect?.(i)}
          >
            <span className="n">{s.done && i !== current ? "✓" : i + 1}</span>
            <span className="lbl">{s.label}</span>
          </button>
        </span>
      ))}
    </nav>
  );
}

export function CheckRow({ ok, warn, label, detail }: { ok: boolean; warn?: boolean; label: React.ReactNode; detail?: React.ReactNode }) {
  const Ic = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  return (
    <div className={cn("ll-check", ok ? "ok" : warn ? "warn" : "bad")}>
      <Ic size={16} className="ic" aria-hidden="true" />
      <div style={{ minWidth: 0 }}>
        <div>{label}</div>
        {detail && <div className="d">{detail}</div>}
      </div>
      <span className="sr-only">{ok ? "passed" : warn ? "warning" : "failed"}</span>
    </div>
  );
}

export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="ll-link" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>{children}<ChevronRight size={13} /></Link>;
}
