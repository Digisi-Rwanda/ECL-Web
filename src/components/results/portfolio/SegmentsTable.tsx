import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { StageMixBar } from "../shared/StageMixBar";
import { ResultsDeltaBadge } from "../shared/ResultsDeltaBadge";

import type { SegmentData } from "@/lib/results-types";

function fmtKes(n: number): string { return Math.abs(n).toLocaleString("en-US"); }

interface SegmentsTableProps {
  currency: string;
  segments: SegmentData[];
  onDrillSegment: (name: string) => void;
}

export function SegmentsTable({ segments, currency, onDrillSegment }: SegmentsTableProps) {
  const totalEcl  = segments.reduce((a, s) => a + s.ecl, 0);
  const totalOut  = segments.reduce((a, s) => a + s.outstanding, 0);
  const totalLns  = segments.reduce((a, s) => a + s.loans, 0);

  return (
    <div className="tbl-wrap">
      <table className="tbl rx-table" aria-label="Portfolio segments">
        <thead>
          <tr>
            <th aria-sort="ascending">Segment</th>
            <th>Stage mix</th>
            <th className="num">ECL ({currency})</th>
            <th className="num" style={{ display: "table-cell" }}>Outstanding</th>
            <th className="num">Coverage</th>
            <th className="num">Loans</th>
            <th className="num">Δ vs prior</th>
            <th aria-label="Drill" />
          </tr>
        </thead>
        <tbody>
          {segments.map((seg, i) => (
            <motion.tr
              key={seg.name}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => onDrillSegment(seg.name)}
            >
              <td>
                <span className="seg-link">{seg.name}</span>
              </td>
              <td>
                <StageMixBar mix={seg.mix} />
              </td>
              <td className="num">{fmtKes(seg.ecl)}</td>
              <td className="num">{fmtKes(seg.outstanding)}</td>
              <td className="num">{seg.coverage}</td>
              <td className="num">{seg.loans.toLocaleString()}</td>
              <td className="num">
                <ResultsDeltaBadge delta={seg.delta} />
              </td>
              <td className="num">
                <ChevronRight size={14} style={{ color: "var(--text-subtle)" }} aria-hidden />
              </td>
            </motion.tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: "var(--fw-semibold)" as React.CSSProperties["fontWeight"] }}>
            <td
              colSpan={2}
              style={{ borderTop: "2px solid var(--border-strong)", paddingTop: 12 }}
            >
              Total · {segments.length} segments
            </td>
            <td
              className="num"
              style={{ borderTop: "2px solid var(--border-strong)", paddingTop: 12 }}
            >
              {fmtKes(totalEcl)}
            </td>
            <td
              className="num"
              style={{ borderTop: "2px solid var(--border-strong)", paddingTop: 12 }}
            >
              {fmtKes(totalOut)}
            </td>
            <td
              className="num"
              style={{ borderTop: "2px solid var(--border-strong)", paddingTop: 12 }}
            >
              2.41%
            </td>
            <td
              className="num"
              style={{ borderTop: "2px solid var(--border-strong)", paddingTop: 12 }}
            >
              {totalLns.toLocaleString()}
            </td>
            <td
              colSpan={2}
              style={{ borderTop: "2px solid var(--border-strong)", paddingTop: 12 }}
            />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
