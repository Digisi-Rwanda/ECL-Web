import { motion } from "framer-motion";
import { StageBadge } from "../shared/StageBadge";
import type { StageMix } from "@/lib/results-types";

const FILL_COLORS = [
  "var(--chart-8)", // Stage 1
  "var(--chart-3)", // Stage 2
  "var(--chart-7)", // Stage 3
] as const;

interface StageDistributionProps {
  mix: StageMix;
  cureRate?: string;
  avgLgd?: string;
  avgPd?: string;
}

export function StageDistribution({
  mix,
  cureRate,
  avgLgd,
  avgPd,
}: StageDistributionProps) {
  return (
    <div>
      {/* Stage bars */}
      <div className="stage-dist">
        {([1, 2, 3] as const).map((stage, i) => (
          <div key={stage} className="sd-item">
            <div className="sd-top">
              <StageBadge stage={stage} />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                  fontSize: "var(--fs-caption)",
                }}
              >
                {mix[i]}%
              </span>
            </div>
            <div className="sd-bar-track">
              <motion.span
                className="sd-bar-fill"
                style={{ background: FILL_COLORS[i] }}
                initial={{ width: 0 }}
                animate={{ width: `${mix[i]}%` }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--border)", margin: "18px 0" }} />

      {/* Summary stats */}
      <div className="sd-stats">
        {[
          { k: "Cure rate", v: cureRate ?? "—" },
          { k: "Avg LGD", v: avgLgd ?? "—" },
          { k: "Avg PD (12m)", v: avgPd ?? "—" },
        ].map(({ k, v }) => (
          <div key={k} className="sd-stat-row">
            <span className="sk">{k}</span>
            <span className="sv">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
