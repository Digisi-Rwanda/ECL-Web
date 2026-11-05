"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Copy, Check, Search } from "lucide-react";
import { motion } from "framer-motion";
import { RunStatusPill } from "./shared/RunStatusPill";
import { SkeletonBlock } from "@/components/dashboard/shared/SkeletonBlock";
import type { RunListItem } from "@/lib/runs-types";

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(id); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }
  return (
    <span className="run-id-cell" onClick={handleCopy} role="button" tabIndex={0} aria-label="Copy run ID">
      {id}
      {copied ? <Check size={13} className="copy-ic" style={{ color: "var(--success)" }} /> : <Copy size={13} className="copy-ic" />}
    </span>
  );
}

interface RunsListTableProps {
  runs: RunListItem[];
  loading?: boolean;
  totalCount: number;
  currency?: string;
  page?: number;
  totalPages?: number;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  onClearFilters: () => void;
}

export function RunsListTable({
  runs,
  loading,
  totalCount,
  currency = "USD",
  page = 1,
  totalPages = 1,
  onPrevPage,
  onNextPage,
  onClearFilters,
}: RunsListTableProps) {
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[...Array(5)].map((_, i) => <SkeletonBlock key={i} height={48} className="skel-row" />)}
      </div>
    );
  }

  function formatEcl(amount: number | null, currency: string) {
    if (amount === null) return <span className="amount zero">—</span>;
    return <span className="amount">{currency} {amount.toLocaleString("en-US")}</span>;
  }

  return (
    <>
      <div className="tbl-wrap list-table-wrap">
        <table className="tbl runs-table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Period</th>
              <th className="hidden sm:table-cell">Created</th>
              <th className="hidden md:table-cell">By</th>
              <th>Status</th>
              <th className="num">Total ECL ({currency})</th>
              <th className="num hidden lg:table-cell">Coverage</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ padding: "48px 0", textAlign: "center" }}
                  >
                    <Search size={24} style={{ color: "var(--text-subtle)", margin: "0 auto 12px" }} />
                    <h3 style={{ fontSize: "var(--fs-h3)", color: "var(--text)", marginBottom: 4 }}>No runs match</h3>
                    <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-body)", marginBottom: 16 }}>
                      No runs match your search and filters.
                    </p>
                    <button
                      onClick={onClearFilters}
                      style={{ background: "none", border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)", padding: "6px 14px", fontSize: "var(--fs-body)", color: "var(--text-muted)", cursor: "pointer" }}
                    >
                      Clear filters
                    </button>
                  </motion.div>
                </td>
              </tr>
            ) : (
              runs.map((run, i) => (
                <motion.tr
                  key={run.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: i * 0.03 }}
                  onClick={() => router.push(`/ecl/runs/${run.fullId}`)}
                  style={{ opacity: run.status === "deleted" ? 0.6 : 1 }}
                >
                  <td><CopyId id={run.id} /></td>
                  <td style={{ color: "var(--text-muted)", fontSize: "var(--fs-body)" }}>{run.period}</td>
                  <td className="hidden sm:table-cell" style={{ color: "var(--text-muted)", fontSize: "var(--fs-caption)", fontFamily: "var(--font-mono)" }}>{run.createdAt}</td>
                  <td className="hidden md:table-cell">
                    <div className="by-mini">
                      <span className="avatar avatar-sm">{run.byInitials}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "var(--fs-caption)" }}>{run.byName}</span>
                    </div>
                  </td>
                  <td><RunStatusPill status={run.status} /></td>
                  <td className="num">{formatEcl(run.eclAmount, run.currency)}</td>
                  <td className="num hidden lg:table-cell" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)" }}>
                    {run.coverage ?? "—"}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/ecl/runs/${run.fullId}`); }}
                        style={{ width: 30, height: 30, border: 0, background: "none", color: "var(--text-subtle)", display: "grid", placeItems: "center", borderRadius: "var(--r-sm)", cursor: "pointer" }}
                        aria-label="View run"
                      >
                        <Eye size={14} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Table footer */}
      <div className="tbl-foot">
        <span>Showing {runs.length} of {totalCount}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            disabled={page <= 1 || !onPrevPage}
            onClick={onPrevPage}
            style={{ height: 28, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "none", fontSize: "var(--fs-caption)", color: "var(--text-subtle)", cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.5 : 1 }}
          >
            Prev
          </button>
          <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages || !onNextPage}
            onClick={onNextPage}
            style={{ height: 28, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "none", fontSize: "var(--fs-caption)", color: "var(--text-subtle)", cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.5 : 1 }}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}
