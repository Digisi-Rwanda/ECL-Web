import { BarChart } from "./BarChart";
import { DonutChart } from "./DonutChart";
import type { SegmentBar, StageSlice } from "@/lib/dashboard-types";

interface ChartsGridProps {
  currency: string;
  segments: SegmentBar[];
  stages: StageSlice[];
  dimmed?: boolean;
}

export function ChartsGrid({ segments, stages, currency, dimmed = false }: ChartsGridProps) {
  return (
    <div
      className="dash-grid"
      style={dimmed ? { opacity: 0.45, pointerEvents: "none" } : undefined}
    >
      {/* ECL by segment */}
      <div className="chart-card">
        <div className="cc-head">
          <h3>ECL by segment</h3>
          <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>
            {currency} · top 6
          </span>
        </div>
        <div className="cc-body">
          <BarChart data={segments} />
        </div>
      </div>

      {/* ECL by stage */}
      <div className="chart-card">
        <div className="cc-head">
          <h3>ECL by stage</h3>
          <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>
            share of total
          </span>
        </div>
        <div className="cc-body">
          <DonutChart data={stages} />
        </div>
      </div>
    </div>
  );
}
