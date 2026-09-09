import { motion } from "framer-motion";
import type { PDMatrix } from "@/lib/results-types";

const STAGES = ["Stage 1", "Stage 2", "Stage 3"] as const;

interface PdTransitionMatrixProps {
  matrix: PDMatrix | number[][];
  destLabels?: string[];
  amounts?: string[][];
}

export function PdTransitionMatrix({
  matrix,
  destLabels,
  amounts,
}: PdTransitionMatrixProps) {
  const cols = destLabels ?? [...STAGES];

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table className="pd-matrix" data-cols={cols.length} aria-label="PD transition matrix">
          <thead>
            <tr>
              <td className="mat-corner" />
              <td className="mat-axis" colSpan={cols.length}>TO STAGE →</td>
            </tr>
            <tr>
              <td className="mat-corner" />
              {cols.map((s) => (
                <th key={s} className="mat-colhead">{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, ri) => (
              <tr key={ri}>
                <th className="mat-rowhead" scope="row">
                  {STAGES[ri]}
                </th>
                {row.map((val, ci) => {
                  const tint  = Math.round(val * 72);
                  const light = val < 0.45;
                  const dest = cols[ci] ?? STAGES[ci];
                  return (
                    <motion.td
                      key={ci}
                      className="mat-cell"
                      title={`P(${STAGES[ri]} → ${dest}) = ${val.toFixed(3)}`}
                      style={{
                        background: `color-mix(in srgb, var(--accent) ${tint}%, transparent)`,
                        color: light ? "var(--text-muted)" : "#fff",
                      }}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        duration: 0.2,
                        delay: ri * 0.06 + ci * 0.04,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      {amounts
                        ? `${(val * 100).toFixed(1)}%`
                        : val.toFixed(3)}
                      <span className="pct-small">
                        {amounts ? amounts[ri]?.[ci] : `${Math.round(val * 100)}%`}
                      </span>
                    </motion.td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mat-legend">
        <span>0%</span>
        <span
          className="mat-scale"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--accent) 4%, transparent), var(--accent))",
          }}
        />
        <span>100%</span>
        <span style={{ color: "var(--text-muted)" }}>· cell = P(row→col) next month</span>
      </div>
    </div>
  );
}
