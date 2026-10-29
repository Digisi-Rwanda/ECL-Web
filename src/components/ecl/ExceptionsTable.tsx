"use client";

import { useMemo, useState } from "react";
import { PagedTable } from "./PagedTable";
import type { EclException } from "@/lib/new-run-types";

const CATEGORIES = ["Input Validation", "PD Match", "ECL Cap", "Reconciliation"];

/** Spec 12.2 Exception Report, filterable by category. */
export function ExceptionsTable({ items, total }: { items: EclException[]; total?: number }) {
  const [category, setCategory] = useState<string | null>(null);
  const rows = useMemo(() => (category ? items.filter((e) => e.category === category) : items), [items, category]);
  if (items.length === 0) {
    return <p className="pdts-muted">No exceptions.</p>;
  }
  return (
    <div>
      <div className="pdts-chips" role="group" aria-label="Exception category">
        {[null, ...CATEGORIES].map((c) => (
          <button key={String(c)} type="button" className="pdts-chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
            {c ?? "All"}
          </button>
        ))}
      </div>
      <PagedTable
        label="Exception Report"
        rows={rows}
        rowKey={(_, i) => String(i)}
        footnote={total && total > items.length ? `first ${items.length.toLocaleString()} of ${total.toLocaleString()} shown; the workbook has all` : undefined}
        columns={[
          { key: "cat", label: "Category", render: (e) => e.category },
          { key: "ds", label: "Dataset", render: (e) => e.dataset },
          { key: "loan", label: "Loan ID", render: (e) => <span className="mono">{e.loanId || "—"}</span> },
          { key: "cust", label: "Customer ID", render: (e) => e.customerId || "—" },
          { key: "field", label: "Field", render: (e) => e.field },
          { key: "value", label: "Value", render: (e) => <span className="mono">{e.value || "—"}</span> },
          { key: "issue", label: "Issue", render: (e) => e.issue },
          { key: "action", label: "Action taken", render: (e) => <b>{e.action}</b> },
        ]}
      />
    </div>
  );
}
