"use client";

import { useMemo, useState } from "react";
import { Download, Info } from "lucide-react";
import { PdObservedMatrixCard } from "@/components/pd/PdObservedMatrixCard";
import { PdTransitionMatrix } from "@/components/results/segment/PdTransitionMatrix";
import type { PdSegmentPreview } from "@/lib/new-run-types";

// Walks the "Lifetime PD Term Structure" spec Steps 1–7 for one segment.
// Every number is computed server-side by the same code that feeds ECL; this
// component only arranges and explains them — it never re-derives a value.

const STAGES = ["Stage 1", "Stage 2", "Stage 3"] as const;
const MONTHS = 299;
const PAGE = 20;

const STEPS = [
  { id: "observed", label: "Observed" },
  { id: "percent", label: "1–2 · % & cure" },
  { id: "normalize", label: "3 · Normalize" },
  { id: "powers", label: "4 · Powers" },
  { id: "dataset", label: "5–6 · Dataset" },
  { id: "final", label: "7 · Final output" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

const pct = (v: number, digits = 4) => `${(v * 100).toFixed(digits)}%`;

interface Row {
  month: number;
  transition: number;
  s1: number;
  s2: number;
  s3: number;
  marginal: number;
}

function buildRows(term: number[][][], sorted: boolean): Row[] {
  const rows: Row[] = [];
  const push = (t: number, m: number) => {
    const [s1, s2, s3, marginal] = term[t][m];
    rows.push({ month: m + 1, transition: t, s1, s2, s3, marginal });
  };
  // Step 5 builds month-major (Table 4); Step 6 sorts Transition, then Month (Table 5).
  if (sorted) for (let t = 0; t < 3; t++) for (let m = 0; m < MONTHS; m++) push(t, m);
  else for (let m = 0; m < MONTHS; m++) for (let t = 0; t < 3; t++) push(t, m);
  return rows;
}

function CumulativeChart({ term }: { term: number[][][] }) {
  const w = 640;
  const h = 200;
  const pad = { l: 44, r: 12, t: 12, b: 28 };
  const colors = ["var(--accent)", "#d97706", "#dc2626"];
  const x = (m: number) => pad.l + ((m - 1) / (MONTHS - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v) * (h - pad.t - pad.b);
  return (
    <figure className="pdts-chart">
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Cumulative probability of Stage 3 by month, per starting stage">
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="var(--border)" />
              <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="pdts-axis">{`${v * 100}%`}</text>
            </g>
          ))}
          {[1, 60, 120, 180, 240, 299].map((m) => (
            <text key={m} x={x(m)} y={h - 8} textAnchor="middle" className="pdts-axis">{m}</text>
          ))}
          {term.map((rows, t) => (
            <polyline
              key={t}
              fill="none"
              stroke={colors[t]}
              strokeWidth={2}
              points={rows.map((r, m) => `${x(m + 1)},${y(r[2])}`).join(" ")}
            />
          ))}
        </svg>
      </div>
      <figcaption className="pdts-legend">
        {STAGES.map((s, t) => (
          <span key={s}>
            <i style={{ background: colors[t] }} /> Starting {s}
          </span>
        ))}
        <span className="pdts-muted">· y = cumulative Stage 3 (default) probability · x = month</span>
      </figcaption>
    </figure>
  );
}

interface TableProps {
  rows: Row[];
  segment: string;
  columns: "dataset" | "final";
  cureRate: number;
}

function TermTable({ rows, segment, columns, cureRate }: TableProps) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const safe = Math.min(page, pages);
  const slice = rows.slice((safe - 1) * PAGE, safe * PAGE);
  return (
    <div>
      <div className="tbl-wrap">
        <table className="tbl pdts-table" aria-label="PD term structure dataset">
          <thead>
            <tr>
              <th>SEGMENT</th>
              <th>Month</th>
              <th>Transition</th>
              <th className="num">Stage 1</th>
              <th className="num">Stage 2</th>
              <th className="num">Stage 3</th>
              {columns !== "dataset" && <th className="num">Marginal PD</th>}
              {columns === "final" && <th className="num">Cure Rate</th>}
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => {
              return (
                <tr key={`${r.transition}-${r.month}`} data-first={r.month === 1 || undefined}>
                  <td>{segment}</td>
                  <td className="mono">{r.month}</td>
                  <td>{STAGES[r.transition]}</td>
                  <td className="num">{pct(r.s1)}</td>
                  <td className="num">{pct(r.s2)}</td>
                  <td className="num">{pct(r.s3)}</td>
                  {columns !== "dataset" && <td className="num pdts-strong">{pct(r.marginal)}</td>}
                  {columns === "final" && <td className="num">{pct(cureRate, 3)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="tbl-foot">
        <span>
          Rows {(safe - 1) * PAGE + 1}–{Math.min(safe * PAGE, rows.length)} of {rows.length.toLocaleString()}
        </span>
        <span className="pdts-pager">
          <button type="button" className="btn btn-secondary btn-sm" disabled={safe === 1} onClick={() => setPage(safe - 1)}>
            Prev
          </button>
          <span>
            Page {safe} of {pages}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={safe === pages} onClick={() => setPage(safe + 1)}>
            Next
          </button>
        </span>
      </div>
    </div>
  );
}

function TransitionFilter({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="pdts-chips" role="group" aria-label="Filter by starting stage">
      {[null, 0, 1, 2].map((v) => (
        <button
          key={String(v)}
          type="button"
          className="pdts-chip"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {v === null ? "All" : STAGES[v]}
        </button>
      ))}
    </div>
  );
}

interface PdTermStructureCardProps {
  segment: PdSegmentPreview;
  periodLabel?: string;
  onDownload?: () => Promise<void>;
}

export function PdTermStructureCard({ segment, periodLabel, onDownload }: PdTermStructureCardProps) {
  const [step, setStep] = useState<StepId>("observed");
  const [month, setMonth] = useState(12);
  const [sortedView, setSortedView] = useState(true);
  const [transition, setTransition] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const { proportions: p, normalized: n, termStructure: term, observed3 } = segment;
  const cure = segment.stats.cureRate;
  const ready = Boolean(p && n && term);

  const rows = useMemo(() => (term ? buildRows(term, sortedView) : []), [term, sortedView]);
  const sortedRows = useMemo(() => (term ? buildRows(term, true) : []), [term]);
  const filtered = useMemo(
    () => (transition === null ? sortedRows : sortedRows.filter((r) => r.transition === transition)),
    [sortedRows, transition],
  );
  // Matrix powers are stored per starting stage; reassemble M^month for display.
  const powered = term ? term.map((rowsForStage) => rowsForStage[month - 1].slice(0, 3)) : null;

  async function handleDownload() {
    if (!onDownload) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await onDownload();
    } catch {
      setDownloadError("Download failed. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="rx-panel pdts">
      <div className="rx-panel-head">
        <h3>PD term structure</h3>
        <span className="pdts-muted">
          {periodLabel ? `${periodLabel} · ` : ""}
          {segment.segment} · Steps 1–7
        </span>
      </div>
      <div className="tabs pdts-steps" role="tablist" aria-label="PD calculation step">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={step === s.id}
            onClick={() => setStep(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="rx-panel-body" role="tabpanel">
        {step === "observed" && (
          <>
            <p className="pdts-lead">
              Money-weighted transitions pooled over the history, including loans that left the book (Offbooks).
            </p>
            <PdObservedMatrixCard
              segment={segment}
              caption="Observed P(row → col) next month — stored at compute and reused in Results."
            />
          </>
        )}

        {step !== "observed" && !ready && (
          <div className="preview-note">
            <Info className="ic" size={14} aria-hidden="true" />
            <span>Re-run PD validation to load the term structure for this segment.</span>
          </div>
        )}

        {step === "percent" && p && (
          <>
            <p className="pdts-lead">
              <b>Step 1.</b> Drop the Offbooks column, then divide each cell by its row total so every row sums
              to 100%. <code>A(ij) = balance(i→j) / Σ balance(i→1..3)</code>
            </p>
            <PdTransitionMatrix matrix={p} amounts={observed3} />
            <div className="pdts-formula">
              <span className="kpi-label">Step 2 · Cure rate</span>
              <code>
                A31 + A32 = {pct(p[2][0], 3)} + {pct(p[2][1], 3)} = <b>{pct(cure, 3)}</b>
              </code>
              <span className="pdts-muted">
                Share of Stage 3 balances that move back to Stage 1 or 2. Used in ECL as LGD = LGW × (1 − cure rate).
              </span>
            </div>
          </>
        )}

        {step === "normalize" && p && n && (
          <>
            <p className="pdts-lead">
              <b>Step 3.</b> Stage 1 cannot jump straight to default, and Stage 3 is absorbing.
            </p>
            <PdTransitionMatrix matrix={n} />
            <ul className="pdts-rules">
              <li>
                <b>Stage 1 row</b> — keep A11 = {pct(p[0][0], 3)}; Stage 2 = A12 + A13 = {pct(p[0][1], 3)} +{" "}
                {pct(p[0][2], 3)} = <b>{pct(n[0][1], 3)}</b>; Stage 3 = 0%
              </li>
              <li>
                <b>Stage 2 row</b> — unchanged: {pct(n[1][0], 3)} · {pct(n[1][1], 3)} · {pct(n[1][2], 3)}
              </li>
              <li>
                <b>Stage 3 row</b> — 0% · 0% · 100% (absorbing)
              </li>
            </ul>
          </>
        )}

        {step === "powers" && term && powered && (
          <>
            <p className="pdts-lead">
              <b>Step 4.</b> Raise the normalized matrix to powers M¹ … M²⁹⁹. Row <i>i</i> of Mⁿ is the chance of
              being in each stage after <i>n</i> months, starting from stage <i>i</i>.
            </p>
            <div className="pdts-slider">
              <label htmlFor="pdts-month">
                Month <b className="mono">n = {month}</b>
              </label>
              <input
                id="pdts-month"
                type="range"
                min={1}
                max={MONTHS}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              />
              <input
                type="number"
                min={1}
                max={MONTHS}
                value={month}
                aria-label="Month"
                className="input pdts-month-input"
                onChange={(e) => setMonth(Math.min(MONTHS, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>
            <PdTransitionMatrix matrix={powered} />
            <CumulativeChart term={term} />
          </>
        )}

        {step === "dataset" && term && (
          <>
            <p className="pdts-lead">
              <b>Step 5.</b> One row per segment, month and starting stage (299 × 3 = 897 rows); the stage columns
              are the Transition row of M<sup>Month</sup>. <b>Step 6.</b> Sort by Segment, Transition, Month.
            </p>
            <div className="pdts-chips" role="group" aria-label="Dataset order">
              <button type="button" className="pdts-chip" aria-pressed={!sortedView} onClick={() => setSortedView(false)}>
                As built (Step 5)
              </button>
              <button type="button" className="pdts-chip" aria-pressed={sortedView} onClick={() => setSortedView(true)}>
                Sorted (Step 6)
              </button>
            </div>
            <TermTable key={String(sortedView)} rows={rows} segment={segment.segment} columns="dataset" cureRate={cure} />
          </>
        )}

        {step === "final" && term && (
          <>
            <div className="between pdts-final-head">
              <p className="pdts-lead" style={{ margin: 0 }}>
                <b>Step 7.</b> Marginal PD: first month of each Transition = Stage 3, then{" "}
                <code>(S3ₙ − S3ₙ₋₁) / (1 − S3ₙ₋₁)</code> (0 if the denominator is 0). This final dataset is
                exactly what the ECL joins on (Segment, Month, Transition): Credit loss = EAD × Marginal PD × LGD.
              </p>
              {onDownload && (
                <button type="button" className="btn btn-primary btn-sm" onClick={handleDownload} disabled={downloading}>
                  <Download className="ic" aria-hidden="true" />
                  {downloading ? "Preparing…" : "Download PD Calcs.xlsx"}
                </button>
              )}
            </div>
            {downloadError && (
              <p role="alert" className="pdts-error">
                {downloadError}
              </p>
            )}
            <TransitionFilter value={transition} onChange={setTransition} />
            <TermTable key={`f-${transition}`} rows={filtered} segment={segment.segment} columns="final" cureRate={cure} />
          </>
        )}
      </div>
    </div>
  );
}
