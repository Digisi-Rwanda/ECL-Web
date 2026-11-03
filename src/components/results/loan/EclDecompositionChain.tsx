import { motion } from "framer-motion";

import type { LoanDetail } from "@/lib/results-types";

function fmtKes(n: number): string { return Math.abs(n).toLocaleString("en-US"); }

interface ChainNodeProps {
  label: string;
  value: string;
  desc: string;
  result?: boolean;
  index: number;
}

function ChainNode({ label, value, desc, result = false, index }: ChainNodeProps) {
  return (
    <motion.div
      className={`chain-node${result ? " result" : ""}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="cn-k">{label}</div>
      <div className="cn-v">{value}</div>
      <div className="cn-d">{desc}</div>
    </motion.div>
  );
}

function ChainOp({ symbol }: { symbol: string }) {
  return <div className="chain-op">{symbol}</div>;
}

interface EclDecompositionChainProps {
  currency: string;
  loan: LoanDetail;
}

export function EclDecompositionChain({ loan, currency }: EclDecompositionChainProps) {
  const eclKes = `${fmtKes(loan.ecl)}`;
  const eadM   = (loan.ead / 1_000_000).toFixed(2) + "M";

  return (
    <div>
      <div className="rx-panel">
        <div className="rx-panel-head">
          <h3>ECL decomposition</h3>
          <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>
            PD × LGD × EAD, discounted
          </span>
        </div>
        <div className="rx-panel-body">
          <div className="ecl-chain">
            <ChainNode
              label="PD · lifetime"
              value={`${loan.pd.toFixed(1)}%`}
              desc={`Stage ${loan.stage} · cumulative`}
              index={0}
            />
            <ChainOp symbol="×" />
            <ChainNode
              label="LGD"
              value={`${loan.lgd.toFixed(1)}%`}
              desc="after collateral"
              index={1}
            />
            <ChainOp symbol="×" />
            <ChainNode
              label="EAD"
              value={eadM}
              desc="disc. exposure"
              index={2}
            />
            <ChainOp symbol="=" />
            <ChainNode
              label="ECL"
              value={eclKes}
              desc={`${currency} · this loan`}
              result
              index={3}
            />
          </div>

          <p className="rundown-note">
            Computed across {loan.maturity.split(" · ")[1]} monthly snapshots; lifetime PD accumulates marginal
            monthly default probabilities, EAD follows the forward rundown, and collateral is discounted
            by a 40% haircut over 18 months to realization.
          </p>
        </div>
      </div>
    </div>
  );
}
