import { motion } from "framer-motion";
import { LoanIdentityGrid } from "./LoanIdentityGrid";
import { EclDecompositionChain } from "./EclDecompositionChain";
import { MonthlyRundownTable } from "./MonthlyRundownTable";
import { StageBadge } from "../shared/StageBadge";
import { SkeletonBlock } from "@/components/dashboard/shared/SkeletonBlock";
import type { LoanDetail } from "@/lib/results-types";

interface LoanViewProps {
  loan: LoanDetail;
  isLoading: boolean;
  currency: string;
}

export function LoanView({ loan, isLoading, currency }: LoanViewProps) {
  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SkeletonBlock height={36} width={200} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1 }}>
          {[...Array(4)].map((_, i) => <SkeletonBlock key={i} height={72} />)}
        </div>
        <SkeletonBlock height={200} />
        <SkeletonBlock height={300} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Loan header */}
      <div className="loan-id-head">
        <h2>{loan.id}</h2>
        <StageBadge stage={loan.stage} />
        <span className="rx-tag">{loan.segment}</span>
      </div>

      {/* Identity grid */}
      <LoanIdentityGrid loan={loan} />

      {/* ECL decomposition chain */}
      <EclDecompositionChain loan={loan} currency={currency} />

      {/* Monthly rundown */}
      <MonthlyRundownTable rundown={loan.rundown} totalMonths={34} currency={currency} />
    </motion.div>
  );
}
