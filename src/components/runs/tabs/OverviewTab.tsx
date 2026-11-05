"use client";

import { BarChart3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { BarChart } from "@/components/dashboard/BarChart";
import type { RunDetail } from "@/lib/runs-types";

interface OverviewTabProps {
  run: RunDetail;
}

export function OverviewTab({ run }: OverviewTabProps) {
  const router  = useRouter();
  const eclKpi  = run.kpis.find((k) => k.id === "total-ecl");
  const covKpi  = run.kpis.find((k) => k.id === "coverage");
  const outKpi  = run.kpis.find((k) => k.id === "outstanding");
  const topSeg  = run.segments[0];

  return (
    <div>
      <div className="ov-grid">
        {/* ECL by segment bar chart */}
        <div className="chart-card">
          <div className="cc-head">
            <h3>ECL by segment</h3>
            <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>{run.currency}</span>
          </div>
          <div className="cc-body">
            <BarChart data={run.segments} />
          </div>
        </div>

        {/* Summary narrative */}
        <div className="ov-summary">
          <h3>What this run says</h3>
          <p>
            Total ECL of{" "}
            <strong>{run.currency} {eclKpi?.value ?? "—"}</strong>{" "}
            across {run.segments.length} segment{run.segments.length !== 1 ? "s" : ""}
            {outKpi?.subNote ? ` and ${outKpi.subNote}` : ""}.
          </p>

          <div className="ov-stat">
            <span className="k">Highest ECL segment</span>
            <span className="v">
              {topSeg ? `${topSeg.name} · ${topSeg.value.toLocaleString()}` : "—"}
            </span>
          </div>
          <div className="ov-stat">
            <span className="k">Total outstanding</span>
            <span className="v">{outKpi?.value ?? "—"}</span>
          </div>
          <div className="ov-stat">
            <span className="k">Coverage ratio</span>
            <span className="v">{covKpi?.value ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
        <button
          onClick={() => router.push(`/ecl/results?run_id=${run.fullId}`)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            height: "var(--control-h)", padding: "0 14px",
            background: "var(--accent)", color: "#fff",
            border: "none", borderRadius: "var(--r-sm)",
            fontSize: "var(--fs-body)", fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
            cursor: "pointer", transition: "background var(--t-micro)",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--accent)")}
        >
          <BarChart3 size={14} />
          Open in Results Explorer
        </button>
      </div>
    </div>
  );
}
