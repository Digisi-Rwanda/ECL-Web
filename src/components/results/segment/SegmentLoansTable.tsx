import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { StageBadge } from "../shared/StageBadge";
import { ResultsEmptyState } from "../shared/ResultsEmptyState";

import type { LoanRow, ExplorerFilter } from "@/lib/results-types";
import {
  LOAN_TABLE_COLUMNS,
  DEFAULT_VISIBLE_COLUMNS,
} from "@/lib/results-types";

function fmtAmount(n: number): string { return Math.abs(n).toLocaleString("en-US"); }

function columnLabel(id: string, currency: string): string {
  const col = LOAN_TABLE_COLUMNS.find((c) => c.id === id);
  if (!col) return id;
  if (id === "ead") return `EAD (${currency})`;
  if (id === "ecl") return `ECL (${currency})`;
  return col.label;
}

interface SegmentLoansTableProps {
  loans: LoanRow[];
  filter: ExplorerFilter;
  totalCount: number;
  currency?: string;
  page?: number;
  totalPages?: number;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  onDrillLoan: (id: string) => void;
  onClearFilters: () => void;
}

export function SegmentLoansTable({
  loans,
  filter,
  totalCount,
  currency = "USD",
  page = 1,
  totalPages = 1,
  onPrevPage,
  onNextPage,
  onDrillLoan,
  onClearFilters,
}: SegmentLoansTableProps) {
  const visibleCols = filter.visibleColumns ?? DEFAULT_VISIBLE_COLUMNS;

  // Stage, search and min-ECL are applied by the server across every loan of
  // the segment; this page already holds only matching loans.
  const filtered = loans;

  if (filtered.length === 0) {
    return <ResultsEmptyState onClearFilters={onClearFilters} />;
  }

  function renderCell(colId: string, loan: LoanRow) {
    switch (colId) {
      case "id":
        return (
          <span className="loan-link" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)" }}>
            {loan.id}
          </span>
        );
      case "customer":
        return loan.customer;
      case "stage":
        return <StageBadge stage={loan.stage} />;
      case "pd":
        return `${loan.pd.toFixed(1)}%`;
      case "lgd":
        return `${loan.lgd.toFixed(1)}%`;
      case "ead":
        return fmtAmount(loan.ead);
      case "ecl":
        return fmtAmount(loan.ecl);
      default:
        return null;
    }
  }

  const numericCols = new Set(["pd", "lgd", "ead", "ecl"]);

  return (
    <div>
      <div className="tbl-wrap">
        <table className="tbl rx-table" aria-label="Loans">
          <thead>
            <tr>
              {visibleCols.map((colId) => (
                <th
                  key={colId}
                  className={numericCols.has(colId) ? "num" : undefined}
                  aria-sort={colId === "ecl" ? "descending" : undefined}
                >
                  {columnLabel(colId, currency)}
                </th>
              ))}
              <th aria-label="Drill" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((loan, i) => (
              <motion.tr
                key={loan.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => onDrillLoan(loan.id)}
              >
                {visibleCols.map((colId) => (
                  <td
                    key={colId}
                    className={numericCols.has(colId) ? "num" : undefined}
                    style={colId === "ecl" ? { fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"] } : undefined}
                  >
                    {renderCell(colId, loan)}
                  </td>
                ))}
                <td className="num">
                  <ChevronRight size={14} style={{ color: "var(--text-subtle)" }} aria-hidden />
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tbl-foot">
        <span>Showing {filtered.length} of {totalCount.toLocaleString()}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className="fbtn"
            disabled={page <= 1 || !onPrevPage}
            onClick={onPrevPage}
            style={{ height: 30, padding: "0 10px", opacity: page <= 1 ? 0.5 : 1 }}
          >
            Prev
          </button>
          <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>
            Page {page} of {totalPages}
          </span>
          <button
            className="fbtn"
            disabled={page >= totalPages || !onNextPage}
            onClick={onNextPage}
            style={{ height: 30, padding: "0 10px", opacity: page >= totalPages ? 0.5 : 1 }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
