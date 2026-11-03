"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Calendar, ChevronDown, Download } from "lucide-react";
import { KpiStrip } from "./KpiStrip";
import { ChartsGrid } from "./ChartsGrid";
import { TrendChart } from "./TrendChart";
import { RunsTable } from "./RunsTable";
import { DashboardBanner } from "./DashboardBanner";
import { EmptyState } from "./EmptyState";
import { LoadingSkeleton } from "./LoadingSkeleton";
import type { DashboardData } from "@/lib/dashboard-types";

interface DashboardViewProps {
  initialData: DashboardData;
}

export function DashboardView({ initialData }: DashboardViewProps) {
  const { state, kpis, segments, stages, trend, runs, bannerProps, tenant } = initialData;

  const isIncomplete = state === "incomplete";
  const isFailed = state === "failed";

  const contextText =
    state === "loading"
      ? "Loading…"
      : state === "empty"
      ? "No runs yet"
      : state === "incomplete"
      ? "Setup incomplete"
      : state === "running"
      ? "Run in progress"
      : state === "failed"
      ? "Last run failed"
      : "Last run 30 May 2026";

  return (
    <>
      {/* Page header */}
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="ph-sub">
            <span>{tenant.name}</span>
            <span style={{ color: "var(--text-subtle)" }}>·</span>
            <span>{contextText}</span>
          </div>
        </div>
        {state !== "empty" && state !== "incomplete" && state !== "loading" && (
          <div className="ph-actions">
            <button
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 28,
                padding: "0 10px",
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--r-sm)",
                fontSize: "var(--fs-caption)",
                fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
                cursor: "pointer",
              }}
            >
              <Calendar size={12} />
              May 2026
              <ChevronDown size={11} />
            </button>
            <button
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 28,
                padding: "0 10px",
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--r-sm)",
                fontSize: "var(--fs-caption)",
                fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
                cursor: "pointer",
              }}
            >
              <Download size={12} />
              Export
            </button>
          </div>
        )}
      </div>

      {/* State-driven content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.65, 0, 0.35, 1] }}
        >
          {/* LOADING */}
          {state === "loading" && <LoadingSkeleton />}

          {/* EMPTY (first run hero) */}
          {state === "empty" && <EmptyState />}

          {/* ALL OTHER STATES */}
          {state !== "loading" && state !== "empty" && (
            <>
              {/* Banner slot */}
              <AnimatePresence>
                {bannerProps && (
                  <DashboardBanner key={bannerProps.variant} {...bannerProps} />
                )}
              </AnimatePresence>

              {/* KPI strip */}
              {kpis.length > 0 && (
                <KpiStrip kpis={kpis} locked={isIncomplete} stale={isFailed} />
              )}

              {/* Charts (dimmed when setup incomplete) */}
              {segments.length > 0 && stages.length > 0 && (
                <ChartsGrid
                  segments={segments}
                  stages={stages}
                  // The chart shows the latest run, so label it with that run's currency.
                  currency={kpis.find((k) => k.currencyPrefix)?.currencyPrefix ?? tenant.currency}
                  dimmed={isIncomplete}
                />
              )}

              {/* Trend chart */}
              {trend.length > 0 && (
                <TrendChart data={trend} dimmed={isIncomplete} />
              )}

              {/* Recent runs */}
              <RunsTable runs={runs} />
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
