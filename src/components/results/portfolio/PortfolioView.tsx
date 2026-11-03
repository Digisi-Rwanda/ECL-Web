import { motion } from "framer-motion";
import { SegmentsTable } from "./SegmentsTable";
import { SkeletonBlock } from "@/components/dashboard/shared/SkeletonBlock";
import type { SegmentData } from "@/lib/results-types";

function fmtAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface PortfolioViewProps {
  segments: SegmentData[];
  isLoading: boolean;
  currency?: string;
  onDrillSegment: (name: string) => void;
}

export function PortfolioView({ segments, isLoading, currency = "USD", onDrillSegment }: PortfolioViewProps) {
  if (isLoading) {
    return (
      <div>
        <div className="rx-kpis" style={{ marginBottom: "var(--sp-4)" }}>
          {[...Array(4)].map((_, i) => (
            <SkeletonBlock key={i} height={88} className="skel-kpi" />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...Array(7)].map((_, i) => (
            <SkeletonBlock key={i} height={48} className="skel-row" />
          ))}
        </div>
      </div>
    );
  }

  const totalEcl = segments.reduce((a, s) => a + s.ecl, 0);
  const totalOutstanding = segments.reduce((a, s) => a + s.outstanding, 0);
  const totalLoans = segments.reduce((a, s) => a + s.loans, 0);
  const coverageRatio =
    totalOutstanding > 0 ? `${((totalEcl / totalOutstanding) * 100).toFixed(2)}%` : "—";

  const portfolioKpis = [
    { label: "Total ECL", cur: currency, value: fmtAmount(totalEcl) },
    { label: "Coverage ratio", cur: "", value: coverageRatio },
    { label: "Total outstanding", cur: currency, value: fmtAmount(totalOutstanding) },
    { label: "Loans analysed", cur: "", value: totalLoans.toLocaleString() },
  ];

  return (
    <div>
      {/* KPI strip */}
      <div className="rx-kpis">
        {portfolioKpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            className="kpi"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">
              {kpi.cur && <span className="kpi-cur">{kpi.cur}</span>}
              {kpi.value}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Segment table */}
      <SegmentsTable segments={segments} currency={currency} onDrillSegment={onDrillSegment} />
    </div>
  );
}
