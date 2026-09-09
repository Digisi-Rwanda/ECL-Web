"use client";

import { PdTransitionMatrix } from "@/components/results/segment/PdTransitionMatrix";
import type { PdSegmentPreview } from "@/lib/new-run-types";

interface PdObservedMatrixCardProps {
  segment: PdSegmentPreview;
  caption: string;
}

export function PdObservedMatrixCard({ segment, caption }: PdObservedMatrixCardProps) {
  return (
    <div>
      <PdTransitionMatrix
        matrix={segment.matrix}
        destLabels={segment.destLabels}
        amounts={segment.amounts}
      />
      <div className="hr" style={{ margin: "16px 0", height: 1, background: "var(--border)" }} />
      <div className="pd-obs-stats">
        <div className="kpi">
          <span className="kpi-label">Cure rate</span>
          <span className="kpi-value">{(segment.stats.cureRate * 100).toFixed(1)}%</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Loans observed</span>
          <span className="kpi-value">{segment.stats.loansObserved.toLocaleString()}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Months of history</span>
          <span className="kpi-value">{segment.stats.monthsOfHistory}</span>
        </div>
      </div>
      <p className="pd-obs-caption">{caption}</p>
    </div>
  );
}
