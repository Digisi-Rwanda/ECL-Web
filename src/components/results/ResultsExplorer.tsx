"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ResultsHeader, type ExportKind } from "./ResultsHeader";
import { ResultsBreadcrumb } from "./ResultsBreadcrumb";
import { ResultsToolbar } from "./ResultsToolbar";
import { PortfolioView } from "./portfolio/PortfolioView";
import { SegmentView } from "./segment/SegmentView";
import { LoanView } from "./loan/LoanView";
import { ResultsEmptyState } from "./shared/ResultsEmptyState";
import { useAuthedQuery } from "@/hooks/use-authed-query";
import { useApiSession } from "@/hooks/use-api-session";
import { fetchPortfolio, fetchSegmentResults, fetchLoanResults } from "@/lib/api/results";
import { mapPdLoanPreviewRow, mapPdSegmentPreview } from "@/lib/api/pd-validation";
import { fetchRuns, fetchRun, downloadRunArtifactFile, downloadRunWorkbooksBundle } from "@/lib/api/runs";
import { exportCurrentViewCsv } from "@/lib/export-results-csv";
import type { RunListItem } from "@/lib/runs-types";
import {
  mapPortfolio,
  mapLoanDetail,
  mapLoanRow,
  mapPdMatrix,
  mapRunListItem,
  mapRunDetail,
} from "@/lib/api/mappers";
import { defaultFilter } from "@/lib/results-types";
import type { DrillLevel, ExplorerFilter, RunContext } from "@/lib/results-types";
import { ResultsUnavailable } from "./shared/ResultsUnavailable";

const FADE_VARIANTS = {
  hidden:  { opacity: 0, y: 4  },
  visible: { opacity: 1, y: 0  },
  exit:    { opacity: 0, y: -4 },
};

const EMPTY_CONTEXT: RunContext = {
  runId: "",
  period: "—",
  computedAt: "—",
  engineVersion: "—",
  currency: "USD",
};

interface ResultsExplorerProps {
  initialRunId?: string;
}

export function ResultsExplorer({ initialRunId }: ResultsExplorerProps) {
  const router = useRouter();
  const { tenantId, token, currency: sessionCurrency } = useApiSession();
  const [level,   setLevel]   = useState<DrillLevel>("portfolio");
  const [curSeg,  setCurSeg]  = useState("");
  const [curLoan, setCurLoan] = useState("");
  const [filter,  setFilter]  = useState<ExplorerFilter>(defaultFilter);
  const [density, setDensity] = useState<"compact" | "comfortable">("compact");
  const [runId,   setRunId]   = useState(initialRunId ?? "");
  const [segmentPage, setSegmentPage] = useState(1);
  const SEGMENT_PER_PAGE = 50;
  const [exportBusy, setExportBusy] = useState<ExportKind | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const runsQuery = useAuthedQuery(
    ["runs", tenantId, "results-switcher"],
    (token, tid) => fetchRuns(token, tid, { per_page: 50 }),
    { staleTime: 30_000 },
  );

  const runs = useMemo(
    () => (runsQuery.data?.items ?? []).map(mapRunListItem),
    [runsQuery.data?.items],
  );

  const runDetailQuery = useAuthedQuery(
    ["run-detail-results", tenantId, runId],
    (token, tid) => fetchRun(token, tid, runId).then(mapRunDetail),
    { enabled: !!runId, staleTime: 30_000 },
  );

  const runDetail = runDetailQuery.data ?? null;

  // Portfolio query
  const portfolioQuery = useAuthedQuery(
    ["portfolio", tenantId, runId, filter.stageFilters.indexOf(false) >= 0 ? filter.stageFilters.join() : "all", filter.minEcl ?? "none"],
    (token, tid) =>
      fetchPortfolio(token, tid, {
        run_id: runId || undefined,
        min_ecl: filter.minEcl,
      }),
    { staleTime: 60_000 },
  );

  // Segment query — only enabled when drilling into a segment
  const segmentQuery = useAuthedQuery(
    ["segment", tenantId, runId, curSeg, filter.minEcl ?? "none", segmentPage],
    (token, tid) =>
      fetchSegmentResults(token, tid, curSeg, {
        run_id: runId || undefined,
        per_page: SEGMENT_PER_PAGE,
        page: segmentPage,
        min_ecl: filter.minEcl,
      }),
    { enabled: level === "segment" && !!curSeg, staleTime: 60_000 },
  );

  // Loan query — only enabled when drilling into a loan
  const loanQuery = useAuthedQuery(
    ["loan", tenantId, runId, curLoan],
    (token, tid) => fetchLoanResults(token, tid, curLoan, { run_id: runId || undefined }),
    { enabled: level === "loan" && !!curLoan, staleTime: 60_000 },
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    wrapRef.current?.setAttribute("data-density", density);
  }, [density]);

  // Resolve full run id once portfolio or runs list is available.
  useEffect(() => {
    if (runId) return;
    if (initialRunId) {
      setRunId(initialRunId);
      return;
    }
    const shortId = portfolioQuery.data
      ? mapPortfolio(portfolioQuery.data).context.runId
      : undefined;
    if (!shortId || runs.length === 0) return;
    const match = runs.find((r) => r.id === shortId);
    if (match) setRunId(match.fullId);
  }, [runId, initialRunId, portfolioQuery.data, runs]);

  function handleRunSelect(run: RunListItem) {
    if (run.status === "success") {
      if (run.fullId === runId) return;
      setRunId(run.fullId);
      setLevel("portfolio");
      setCurSeg("");
      setCurLoan("");
      setFilter(defaultFilter);
      setSegmentPage(1);
      router.replace(`/results?run_id=${encodeURIComponent(run.fullId)}`, { scroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    router.push(`/runs/${run.fullId}`);
  }

  function drill(lvl: DrillLevel) {
    setLevel(lvl);
    if (lvl === "portfolio" || lvl === "segment") {
      setFilter((f) => ({ ...f, search: "" }));
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function drillSegment(name: string) {
    setCurSeg(name);
    setSegmentPage(1);
    drill("segment");
  }

  function drillLoan(id: string) {
    setCurLoan(id);
    drill("loan");
  }

  function clearFilters() {
    setFilter(defaultFilter);
    if (level === "empty") drill("segment");
  }

  function handleFilterChange(patch: Partial<ExplorerFilter>) {
    setFilter((prev) => ({ ...prev, ...patch }));
    if ("minEcl" in patch || "stageFilters" in patch) {
      setSegmentPage(1);
    }
  }

  const segmentMeta = segmentQuery.data?.meta;
  const segmentTotal = segmentMeta?.total ?? segmentQuery.data?.total ?? 0;
  const segmentTotalPages = segmentMeta?.pages ?? Math.max(1, Math.ceil(segmentTotal / SEGMENT_PER_PAGE));

  // Derived data
  const portfolioResult = portfolioQuery.data ? mapPortfolio(portfolioQuery.data) : null;
  const portfolioSegments = portfolioResult?.segments ?? [];
  const partialContext = portfolioResult?.context ?? {};

  const runContext: RunContext = {
    runId: partialContext.runId ?? runDetail?.id ?? runId,
    period: partialContext.period ?? runDetail?.period ?? "—",
    computedAt: partialContext.computedAt ?? runDetail?.createdAt ?? "—",
    engineVersion:
      partialContext.engineVersion ?? runDetail?.engineInfo?.version ?? "—",
    currency: partialContext.currency ?? runDetail?.currency ?? sessionCurrency ?? "USD",
  };

  const displayContext =
    portfolioQuery.data || runDetail ? runContext : EMPTY_CONTEXT;
  const currency = displayContext.currency;

  const segmentLoans = segmentQuery.data
    ? (segmentQuery.data.loans ?? []).map(mapLoanRow)
    : [];

  const segmentPdMatrix = mapPdMatrix(
    segmentQuery.data?.pdMatrix ?? segmentQuery.data?.pd_matrix,
  );
  const segmentPdObservationRaw =
    segmentQuery.data?.pdObservation ?? segmentQuery.data?.pd_observation;
  const segmentPdObservation = segmentPdObservationRaw
    ? mapPdSegmentPreview(segmentPdObservationRaw)
    : null;
  const segmentPdLoans = (
    segmentQuery.data?.pdLoans ?? segmentQuery.data?.pd_loans ?? []
  ).map(mapPdLoanPreviewRow);
  const rateStatsRaw = segmentQuery.data?.rateStats ?? segmentQuery.data?.rate_stats;
  const segmentRateStats = rateStatsRaw
    ? {
        cureRate: rateStatsRaw.cureRate ?? rateStatsRaw.cure_rate ?? 0,
        avgLgd: rateStatsRaw.avgLgd ?? rateStatsRaw.avg_lgd ?? null,
        avgPd12m: rateStatsRaw.avgPd12m ?? rateStatsRaw.avg_pd_12m ?? null,
      }
    : null;

  const currentSeg = portfolioSegments.find((s) => s.name === curSeg) ?? portfolioSegments[0];

  const currentLoan = loanQuery.data ? mapLoanDetail(loanQuery.data) : null;

  const rowSummary = useMemo(() => {
    if (level === "portfolio") {
      const totalEcl = portfolioSegments.reduce((a, s) => a + s.ecl, 0);
      return `${portfolioSegments.length} segments · ${currency} ${totalEcl >= 1_000_000 ? (totalEcl / 1_000_000).toFixed(1) + "M" : totalEcl.toLocaleString()}`;
    }
    if (level === "segment" && currentSeg) {
      return `${currentSeg.loans.toLocaleString()} loans · ${currency} ${currentSeg.ecl >= 1_000_000 ? (currentSeg.ecl / 1_000_000).toFixed(1) + "M" : currentSeg.ecl.toLocaleString()}`;
    }
    if (level === "loan") return `Loan ${curLoan}`;
    return "0 results";
  }, [level, portfolioSegments, currentSeg, curLoan, currency]);

  const showToolbar = level !== "loan";
  const isPortfolioLoading = portfolioQuery.isLoading;
  const isSegmentLoading = segmentQuery.isLoading;
  const isLoanLoading = loanQuery.isLoading;
  const portfolioUnavailable =
    portfolioQuery.isError ||
    (!isPortfolioLoading &&
      !portfolioQuery.isError &&
      portfolioSegments.length === 0 &&
      level === "portfolio");

  const currentRunStatus =
    runDetail?.status ??
    runs.find((run) => run.fullId === runId)?.status ??
    null;

  const exportViewLoading =
    (level === "portfolio" && isPortfolioLoading) ||
    (level === "segment" && isSegmentLoading) ||
    (level === "loan" && isLoanLoading);

  const exportDisabled =
    !runId ||
    !token ||
    !tenantId ||
    currentRunStatus !== "success" ||
    portfolioUnavailable ||
    exportViewLoading ||
    (level === "loan" && !currentLoan) ||
    (level === "segment" && !curSeg);

  async function handleExportArtifact(kind: "PD_CALCS" | "ECL_SUMMARY", label: string) {
    if (!token || !tenantId || !runId || exportDisabled) return;
    setExportError(null);
    setExportBusy(kind === "PD_CALCS" ? "pd" : "summary");
    try {
      await downloadRunArtifactFile(token, tenantId, runId, kind);
    } catch {
      setExportError(`Could not download the ${label}. Try again in a moment.`);
    } finally {
      setExportBusy(null);
    }
  }

  async function handleExportWorkbooksBundle() {
    if (!token || !tenantId || !runId || exportDisabled) return;
    setExportError(null);
    setExportBusy("bundle");
    try {
      await downloadRunWorkbooksBundle(token, tenantId, runId);
    } catch {
      setExportError("Could not download the PD / LGD / EAD workbooks. Try again in a moment.");
    } finally {
      setExportBusy(null);
    }
  }

  function handleExportCurrentView() {
    if (exportDisabled) return;
    setExportError(null);
    setExportBusy("csv");
    try {
      exportCurrentViewCsv({
        level,
        runId: displayContext.runId || runId,
        currency,
        segments: portfolioSegments,
        segmentName: curSeg,
        loans: segmentLoans,
        loan: currentLoan,
        filter,
      });
    } catch {
      setExportError("Could not export the current view as CSV.");
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <div ref={wrapRef} data-density={density}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Run context header */}
        <ResultsHeader
          runContext={displayContext}
          runs={runs}
          currentRunFullId={runId}
          runsLoading={runsQuery.isLoading}
          density={density}
          exportDisabled={exportDisabled}
          exportBusy={exportBusy}
          onDensityToggle={() =>
            setDensity((d) => (d === "compact" ? "comfortable" : "compact"))
          }
          onRunSelect={handleRunSelect}
          onExportCurrentView={handleExportCurrentView}
          onExportPdWorkbook={() => handleExportArtifact("PD_CALCS", "PD term structure workbook")}
          onExportFullWorkbook={() => handleExportArtifact("ECL_SUMMARY", "full results workbook")}
          onExportWorkbooksBundle={handleExportWorkbooksBundle}
        />

        {exportError && (
          <div
            role="alert"
            style={{
              marginTop: 8,
              padding: "8px 12px",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--danger-border, #fecaca)",
              background: "var(--danger-bg, #fef2f2)",
              color: "var(--danger, #b91c1c)",
              fontSize: "var(--fs-caption)",
            }}
          >
            {exportError}
          </div>
        )}

        {/* Breadcrumb */}
        <ResultsBreadcrumb
          level={level}
          curSeg={curSeg}
          curLoan={curLoan}
          onDrill={drill}
        />

        {/* Filter toolbar */}
        {showToolbar && !portfolioUnavailable && (
          <ResultsToolbar
            filter={filter}
            rowSummary={rowSummary}
            hidden={false}
            onChange={handleFilterChange}
            onClearFilters={clearFilters}
          />
        )}

        {/* View switcher with animated transitions */}
        <AnimatePresence mode="wait">
          {level === "portfolio" && portfolioUnavailable && (
            <motion.div
              key="unavailable"
              variants={FADE_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <ResultsUnavailable
                error={portfolioQuery.error}
                runId={runId}
                run={runDetail}
                isLoading={isPortfolioLoading || (!!runId && runDetailQuery.isLoading)}
              />
            </motion.div>
          )}

          {level === "portfolio" && !portfolioUnavailable && (
            <motion.div
              key="portfolio"
              variants={FADE_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <PortfolioView
                segments={portfolioSegments}
                isLoading={isPortfolioLoading}
                currency={currency}
                onDrillSegment={drillSegment}
              />
            </motion.div>
          )}

          {level === "segment" && currentSeg && (
            <motion.div
              key="segment"
              variants={FADE_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <SegmentView
                segment={currentSeg}
                filter={filter}
                isLoading={isSegmentLoading}
                loans={segmentLoans}
                pdMatrix={segmentPdMatrix}
                pdObservation={segmentPdObservation}
                pdLoans={segmentPdLoans}
                rateStats={segmentRateStats}
                currency={currency}
                totalCount={segmentTotal}
                page={segmentPage}
                totalPages={segmentTotalPages}
                onPrevPage={() => setSegmentPage((p) => Math.max(1, p - 1))}
                onNextPage={() => setSegmentPage((p) => Math.min(segmentTotalPages, p + 1))}
                onDrillLoan={drillLoan}
                onClearFilters={clearFilters}
              />
            </motion.div>
          )}

          {level === "loan" && (
            <motion.div
              key="loan"
              variants={FADE_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              {currentLoan ? (
                <LoanView loan={currentLoan} isLoading={isLoanLoading} />
              ) : (
                <LoanView loan={{
                  id: curLoan, customer: "Loading...", stage: 1, pd: 0, lgd: 0, ead: 0, ecl: 0,
                  segment: curSeg, outstanding: 0, collateralValue: 0, maturity: "—", rundown: [],
                }} isLoading={true} />
              )}
            </motion.div>
          )}

          {level === "empty" && (
            <motion.div
              key="empty"
              variants={FADE_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <ResultsEmptyState onClearFilters={clearFilters} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
