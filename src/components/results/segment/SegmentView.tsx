import { motion } from "framer-motion";
import { PdObservedMatrixCard } from "@/components/pd/PdObservedMatrixCard";
import { PdLoanHistorySection } from "@/components/pd/PdLoanHistorySection";
import { PdTransitionMatrix } from "./PdTransitionMatrix";
import { StageDistribution } from "./StageDistribution";
import { SegmentLoansTable } from "./SegmentLoansTable";
import { SkeletonBlock } from "@/components/dashboard/shared/SkeletonBlock";
import { reportingPeriodLabel } from "@/lib/api/pd-validation";
import type { PdLoanPreviewRow, PdSegmentPreview } from "@/lib/new-run-types";
import type { SegmentData, ExplorerFilter, LoanRow, PDMatrix } from "@/lib/results-types";

const EMPTY_MATRIX: PDMatrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

function fmtAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtPct(value: number | null | undefined): string | undefined {
  if (value == null || Number.isNaN(value)) return undefined;
  return `${(value * 100).toFixed(2)}%`;
}

interface SegmentViewProps {
  segment: SegmentData;
  filter: ExplorerFilter;
  isLoading: boolean;
  loans?: LoanRow[];
  pdMatrix?: PDMatrix;
  pdObservation?: PdSegmentPreview | null;
  pdLoans?: PdLoanPreviewRow[];
  rateStats?: {
    cureRate: number;
    avgLgd: number | null;
    avgPd12m: number | null;
  } | null;
  currency?: string;
  totalCount?: number;
  page?: number;
  totalPages?: number;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  onDrillLoan: (id: string) => void;
  onClearFilters: () => void;
}

export function SegmentView({
  segment,
  filter,
  isLoading,
  loans = [],
  pdMatrix = EMPTY_MATRIX,
  pdObservation = null,
  pdLoans = [],
  rateStats = null,
  currency = "USD",
  totalCount,
  page = 1,
  totalPages = 1,
  onPrevPage,
  onNextPage,
  onDrillLoan,
  onClearFilters,
}: SegmentViewProps) {
  if (isLoading) {
    return (
      <div>
        <div className="rx-kpis k3" style={{ marginBottom: "var(--sp-4)" }}>
          {[...Array(3)].map((_, i) => (
            <SkeletonBlock key={i} height={88} className="skel-kpi" />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-4)", marginBottom: "var(--sp-4)" }}>
          <SkeletonBlock height={260} />
          <SkeletonBlock height={260} />
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <SkeletonBlock height={48} className="skel-row" />
          </div>
        ))}
      </div>
    );
  }

  const KPIS = [
    { label: "Segment ECL", cur: currency, value: fmtAmount(segment.ecl) },
    { label: "Coverage", cur: "", value: segment.coverage },
    { label: "Loans", cur: "", value: segment.loans.toLocaleString() },
  ];

  const periodLabel = reportingPeriodLabel(pdLoans.map((row) => row.reportingMonthKey));
  const matrixCaption = periodLabel
    ? `${periodLabel} · ${segment.name} · observed transitions`
    : `${segment.name} · observed transitions`;

  return (
    <div>
      <div className="rx-kpis k3">
        {KPIS.map((kpi, i) => (
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)",
          gap: "var(--sp-4)",
          marginBottom: "var(--sp-4)",
        }}
        className="seg-panel-grid"
      >
        <motion.div
          className="rx-panel"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="rx-panel-head">
            <h3>PD transition matrix</h3>
            <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>
              {pdObservation ? matrixCaption : `monthly · ${segment.name}`}
            </span>
          </div>
          <div className="rx-panel-body">
            {pdObservation ? (
              <PdObservedMatrixCard segment={pdObservation} caption="Same extract and P(row → col) formula as PD validation." />
            ) : (
              <PdTransitionMatrix matrix={pdMatrix} />
            )}
          </div>
        </motion.div>

        <motion.div
          className="rx-panel"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="rx-panel-head">
            <h3>Stage distribution</h3>
            <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>
              by exposure
            </span>
          </div>
          <div className="rx-panel-body">
            <StageDistribution
              mix={segment.mix}
              cureRate={
                rateStats
                  ? `${(rateStats.cureRate * 100).toFixed(1)}%`
                  : undefined
              }
              avgLgd={fmtPct(rateStats?.avgLgd)}
              avgPd={fmtPct(rateStats?.avgPd12m)}
            />
          </div>
        </motion.div>
      </div>

      {pdLoans.length > 0 && (
        <div style={{ marginBottom: "var(--sp-6)" }}>
          <PdLoanHistorySection loans={pdLoans} segmentName={segment.name} />
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h3 style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--fw-semibold)" as React.CSSProperties["fontWeight"] }}>
          Loans · {segment.name}
        </h3>
        <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>
          {segment.loans.toLocaleString()} loans · ECL
        </span>
      </div>
      <SegmentLoansTable
        loans={loans}
        filter={filter}
        totalCount={totalCount ?? segment.loans}
        currency={currency}
        page={page}
        totalPages={totalPages}
        onPrevPage={onPrevPage}
        onNextPage={onNextPage}
        onDrillLoan={onDrillLoan}
        onClearFilters={onClearFilters}
      />
    </div>
  );
}
