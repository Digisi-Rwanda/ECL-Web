import { motion } from "framer-motion";

import type { MonthlyRundown } from "@/lib/results-types";

function fmtKes(n: number): string { return Math.abs(n).toLocaleString("en-US"); }

interface MonthlyRundownTableProps {
  currency: string;
  rundown: MonthlyRundown[];
  totalMonths: number;
}

export function MonthlyRundownTable({ rundown, totalMonths, currency }: MonthlyRundownTableProps) {
  return (
    <div className="rx-panel" style={{ marginTop: "var(--sp-4)" }}>
      <div className="rx-panel-head">
        <h3>Monthly rundown</h3>
        <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>
          first {rundown.length} of {totalMonths} snapshots
        </span>
      </div>
      <div style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table className="tbl rx-table" aria-label="Monthly rundown">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Marginal PD</th>
                <th className="num">Cumulative PD</th>
                <th className="num">EAD ({currency})</th>
                <th className="num">Discounted ECL</th>
              </tr>
            </thead>
            <tbody>
              {rundown.map((row, i) => (
                <motion.tr
                  key={row.month}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.12, delay: i * 0.025 }}
                >
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)" }}>
                    M{String(row.month).padStart(2, "0")}
                  </td>
                  <td className="num">{row.marginalPd.toFixed(2)}%</td>
                  <td className="num">{row.cumulativePd.toFixed(2)}%</td>
                  <td className="num">{fmtKes(row.ead)}</td>
                  <td className="num">{fmtKes(row.ecl)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
