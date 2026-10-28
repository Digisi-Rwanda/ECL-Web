"use client";

import { useMemo, useState } from "react";
import { Hash, Info, Search } from "lucide-react";
import { PdTermStructureCard } from "@/components/pd/PdTermStructureCard";
import { useApiSession } from "@/hooks/use-api-session";
import { downloadPdExport } from "@/lib/api/runs";
import { useRunWizard } from "../RunWizardContext";
import { CriteriaGroup } from "./CriteriaGroup";
import { CriteriaRow } from "./CriteriaRow";
import { PdLoanPreviewTable, PD_LOAN_PAGE_SIZE } from "./PdLoanPreviewTable";
import { PdLoanStagingDetail } from "./PdLoanStagingDetail";
import { countPdCriteria, reportingPeriodLabel } from "@/lib/api/pd-validation";
import type { PdLoanPreviewRow, PdPreviewResult } from "@/lib/new-run-types";

interface PdValidationPanelProps {
  preview: PdPreviewResult;
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

export function PdValidationPanel({ preview }: PdValidationPanelProps) {
  const { token, tenantId } = useApiSession();
  const runId = useRunWizard().state.runId;
  const structural = preview.criteria.filter((c) => c.category === "structural");
  const business = preview.criteria.filter((c) => c.category === "business");
  const info = preview.criteria.find((c) => c.category === "info");
  const structuralCounts = countPdCriteria(structural);
  const businessCounts = countPdCriteria(business);

  const segments = preview.segments.map((s) => s.segment);
  const [activeSegment, setActiveSegment] = useState(segments[0] ?? "");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<"loanId" | "reportingMonth">("reportingMonth");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = preview.loans.filter((row) => {
      const segOk = !activeSegment || row.segment === activeSegment;
      const searchOk = !q || row.loanId.toLowerCase().includes(q);
      return segOk && searchOk;
    });
    return sortRows(filtered, sortKey, sortDir);
  }, [preview.loans, activeSegment, search, sortKey, sortDir]);

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

  const activePreview = preview.segments.find((s) => s.segment === activeSegment) ?? preview.segments[0];
  const loanCount = activePreview?.stats.loansObserved ?? uniqueLoanIds.length;
  const periodKeys = (
    activeSegment
      ? preview.loans.filter((row) => row.segment === activeSegment)
      : preview.loans
  ).map((row) => row.reportingMonthKey);
  const periodLabel = reportingPeriodLabel(periodKeys);

  const selectedIndex = selectedLoanId ? uniqueLoanIds.indexOf(selectedLoanId) : -1;
  const selectedRows = selectedLoanId
    ? sortRows(
        preview.loans.filter((r) => r.loanId === selectedLoanId),
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

  function handleSegment(name: string) {
    setActiveSegment(name);
    setPage(1);
    setSelectedLoanId(null);
  }

  const structuralCountLabel =
    structuralCounts.blocked > 0
      ? `${structuralCounts.blocked} blocking`
      : structuralCounts.review > 0
        ? `${structuralCounts.passed} passed · ${structuralCounts.review} to review`
        : "All passed";
  const structuralCountCls =
    structuralCounts.blocked > 0 ? "pill-danger" : structuralCounts.review > 0 ? "pill-warning" : "pill-success";

  const businessCountLabel =
    businessCounts.blocked > 0
      ? `${businessCounts.blocked} blocking`
      : `${businessCounts.passed} passed · ${businessCounts.review} to review`;
  const businessCountCls =
    businessCounts.blocked > 0 ? "pill-danger" : businessCounts.review > 0 ? "pill-warning" : "pill-success";

  return (
    <div>
      <CriteriaGroup
        title="Format & completeness checks"
        subtitle={`${structural.length} checks`}
        countLabel={structuralCountLabel}
        countClassName={structuralCountCls}
        defaultOpen={structuralCounts.blocked > 0 || structuralCounts.review > 0}
      >
        {structural.map((c) => (
          <CriteriaRow key={c.id} criterion={c} />
        ))}
      </CriteriaGroup>

      <CriteriaGroup
        title="Business & statistical checks"
        subtitle="EC-11–EC-19"
        countLabel={businessCountLabel}
        countClassName={businessCountCls}
        defaultOpen
      >
        {business.map((c) => (
          <CriteriaRow key={c.id} criterion={c} />
        ))}
      </CriteriaGroup>

      {info && (
        <div className="callout callout-info" style={{ marginTop: "var(--sp-3)" }}>
          <Hash size={15} className="ic" aria-hidden="true" />
          <span>
            <strong>{info.code}</strong>
            {preview.engineVersion ? ` · Engine ${preview.engineVersion}` : ""}
            {info.rationale ? ` — ${info.rationale}` : ""}
          </span>
        </div>
      )}

      {preview.loans.length > 0 && selectedLoanId && selectedIndex >= 0 ? (
        <div style={{ marginTop: "var(--sp-6)" }}>
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
      ) : preview.loans.length > 0 ? (
        <>
          <div className="between" style={{ marginTop: "var(--sp-6)", marginBottom: 10 }}>
            <h3 style={{ fontSize: "var(--fs-h3)", margin: 0 }}>Loan-level preview</h3>
            <span className="t-caption">
              {loanCount.toLocaleString()} loan{loanCount === 1 ? "" : "s"}
              {periodLabel ? ` · ${periodLabel}` : ""}
            </span>
          </div>
          <div className="tabs" role="tablist" aria-label="Segment">
            {segments.map((name) => (
              <button
                key={name}
                type="button"
                className="tab"
                role="tab"
                aria-selected={activeSegment === name}
                onClick={() => handleSegment(name)}
              >
                {name}
              </button>
            ))}
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
        </>
      ) : null}

      {preview.loans.length > 0 && activePreview && (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <PdTermStructureCard
            key={activePreview.segment}
            segment={activePreview}
            periodLabel={periodLabel ?? undefined}
            onDownload={
              token && tenantId && runId && !preview.isMock
                ? () => downloadPdExport(token, tenantId, runId)
                : undefined
            }
          />
        </div>
      )}

      <div className="preview-note">
        <Info className="ic" size={14} aria-hidden="true" />
        <span>
          Preview only — nothing is saved until you confirm and compute the run.
        </span>
      </div>
    </div>
  );
}
