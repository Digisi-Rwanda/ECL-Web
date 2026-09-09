"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PdLoanPreviewTable, PD_LOAN_PAGE_SIZE } from "@/components/runs/new/pd/PdLoanPreviewTable";
import { PdLoanStagingDetail } from "@/components/runs/new/pd/PdLoanStagingDetail";
import { reportingPeriodLabel } from "@/lib/api/pd-validation";
import type { PdLoanPreviewRow } from "@/lib/new-run-types";

interface PdLoanHistorySectionProps {
  loans: PdLoanPreviewRow[];
  segmentName: string;
}

function sortRows(
  rows: PdLoanPreviewRow[],
  sortKey: "loanId" | "reportingMonth",
  sortDir: "asc" | "desc",
): PdLoanPreviewRow[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortKey === "loanId" ? a.loanId : a.reportingMonthKey;
    const bv = sortKey === "loanId" ? b.loanId : b.reportingMonthKey;
    return av.localeCompare(bv) * dir;
  });
}

export function PdLoanHistorySection({ loans, segmentName }: PdLoanHistorySectionProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<"loanId" | "reportingMonth">("reportingMonth");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = loans.filter((row) => !q || row.loanId.toLowerCase().includes(q));
    return sortRows(filtered, sortKey, sortDir);
  }, [loans, search, sortKey, sortDir]);

  const uniqueLoanIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const row of filteredSorted) {
      if (!seen.has(row.loanId)) {
        seen.add(row.loanId);
        ids.push(row.loanId);
      }
    }
    return ids;
  }, [filteredSorted]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PD_LOAN_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredSorted.slice((safePage - 1) * PD_LOAN_PAGE_SIZE, safePage * PD_LOAN_PAGE_SIZE);
  const periodLabel = reportingPeriodLabel(loans.map((row) => row.reportingMonthKey));
  const selectedIndex = selectedLoanId ? uniqueLoanIds.indexOf(selectedLoanId) : -1;
  const selectedRows = selectedLoanId
    ? sortRows(
        loans.filter((row) => row.loanId === selectedLoanId),
        "reportingMonth",
        "asc",
      )
    : [];

  function handleSort(key: "loanId" | "reportingMonth") {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  if (loans.length === 0) return null;

  if (selectedLoanId && selectedIndex >= 0) {
    return (
      <div className="pd-loan-history">
        <PdLoanStagingDetail
          loanId={selectedLoanId}
          rows={selectedRows}
          index={selectedIndex}
          total={uniqueLoanIds.length}
          onBack={() => setSelectedLoanId(null)}
          onPrev={() => {
            if (selectedIndex > 0) setSelectedLoanId(uniqueLoanIds[selectedIndex - 1]);
          }}
          onNext={() => {
            if (selectedIndex < uniqueLoanIds.length - 1) {
              setSelectedLoanId(uniqueLoanIds[selectedIndex + 1]);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="pd-loan-history">
      <div className="between" style={{ marginBottom: 10 }}>
        <h3 style={{ fontSize: "var(--fs-h3)", margin: 0 }}>Loan-level PD history</h3>
        <span className="t-caption">
          {uniqueLoanIds.length.toLocaleString()} loan{uniqueLoanIds.length === 1 ? "" : "s"}
          {periodLabel ? ` · ${periodLabel}` : ""}
          {segmentName ? ` · ${segmentName}` : ""}
        </span>
      </div>
      <div className="rx-toolbar-mini">
        <div className="input-wrap search">
          <Search className="ic" size={16} aria-hidden="true" />
          <input
            className="input"
            placeholder="Search Loan ID…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search Loan ID"
          />
        </div>
      </div>
      <PdLoanPreviewTable
        rows={pageRows}
        totalCount={filteredSorted.length}
        page={safePage}
        totalPages={totalPages}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
        onSelectLoan={setSelectedLoanId}
      />
    </div>
  );
}
