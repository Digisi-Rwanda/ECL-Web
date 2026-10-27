import type {
  DrillLevel,
  ExplorerFilter,
  LoanDetail,
  LoanRow,
  SegmentData,
} from "./results-types";

function escapeCsv(value: string | number): string {
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function triggerCsvDownload(filename: string, rows: (string | number)[][]): void {
  const content = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function filterLoans(loans: LoanRow[], filter: ExplorerFilter): LoanRow[] {
  return loans.filter((loan) => {
    const stageOk = filter.stageFilters[loan.stage - 1];
    const query = filter.search.toLowerCase();
    const searchOk =
      !query ||
      loan.id.toLowerCase().includes(query) ||
      loan.customer.toLowerCase().includes(query);
    return stageOk && searchOk;
  });
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ExportCurrentViewInput {
  level: DrillLevel;
  runId: string;
  currency: string;
  segments: SegmentData[];
  segmentName?: string;
  loans: LoanRow[];
  loan: LoanDetail | null;
  filter: ExplorerFilter;
}

export function exportCurrentViewCsv(input: ExportCurrentViewInput): void {
  const { level, runId, currency, segments, segmentName, loans, loan, filter } = input;
  const date = stamp();

  if (level === "portfolio") {
    triggerCsvDownload(`ECL_${runId}_portfolio_${date}.csv`, [
      [
        "Segment",
        "Stage 1 %",
        "Stage 2 %",
        "Stage 3 %",
        `ECL (${currency})`,
        `Outstanding (${currency})`,
        "Coverage",
        "Loans",
        "Delta vs prior %",
      ],
      ...segments.map((segment) => [
        segment.name,
        segment.mix[0],
        segment.mix[1],
        segment.mix[2],
        segment.ecl,
        segment.outstanding,
        segment.coverage,
        segment.loans,
        segment.delta,
      ]),
    ]);
    return;
  }

  if (level === "segment") {
    const filtered = filterLoans(loans, filter);
    const label = (segmentName ?? "segment").replace(/[^\w.-]+/g, "_");
    triggerCsvDownload(`ECL_${runId}_${label}_${date}.csv`, [
      [
        "Loan ID",
        "Customer",
        "Stage",
        "PD 12m %",
        "LGD %",
        `EAD (${currency})`,
        `ECL (${currency})`,
      ],
      ...filtered.map((row) => [
        row.id,
        row.customer,
        row.stage,
        row.pd,
        row.lgd,
        row.ead,
        row.ecl,
      ]),
    ]);
    return;
  }

  if (level === "loan" && loan) {
    triggerCsvDownload(`ECL_${runId}_loan_${loan.id}_${date}.csv`, [
      ["Field", "Value"],
      ["Loan ID", loan.id],
      ["Customer", loan.customer],
      ["Segment", loan.segment],
      ["Stage", loan.stage],
      ["PD 12m %", loan.pd],
      ["LGD %", loan.lgd],
      [`EAD (${currency})`, loan.ead],
      [`ECL (${currency})`, loan.ecl],
      [`Outstanding (${currency})`, loan.outstanding],
      [`Collateral (${currency})`, loan.collateralValue],
      ["Maturity", loan.maturity],
      [],
      ["Month", "Marginal PD %", "Cumulative PD %", `EAD (${currency})`, `ECL (${currency})`],
      ...loan.rundown.map((row) => [
        row.month,
        row.marginalPd,
        row.cumulativePd,
        row.ead,
        row.ecl,
      ]),
    ]);
  }
}
