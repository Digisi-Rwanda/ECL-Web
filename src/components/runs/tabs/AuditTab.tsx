"use client";

import { Download } from "lucide-react";
import { motion } from "framer-motion";
import { AuditEventRow } from "../AuditEventRow";
import type { RunDetail } from "@/lib/runs-types";
import { triggerCsvDownload } from "@/lib/export-results-csv";

interface AuditTabProps {
  run: RunDetail;
}

export function AuditTab({ run }: AuditTabProps) {
  function exportCsv() {
    triggerCsvDownload(`ECL_${run.fullId}_audit.csv`, [
      ["Time (UTC)", "Event", "Details", "By"],
      ...run.auditEvents.map((e) => [e.time, e.title, e.description, e.who]),
    ]);
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--fw-semibold)", color: "var(--text)" }}>Audit trail</h3>
          <p style={{ fontSize: "var(--fs-caption)", color: "var(--text-muted)", marginTop: 2 }}>
            Immutable event log · all times UTC
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={run.auditEvents.length === 0}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            height: 28, padding: "0 10px",
            background: "var(--surface)", color: "var(--text)",
            border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)",
            fontSize: "var(--fs-caption)", fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
            cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          <Download size={12} />
          Export CSV
        </button>
      </div>

      {/* Timeline */}
      <div className="audit-timeline">
        {run.auditEvents.map((event, i) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: i * 0.035 }}
          >
            <AuditEventRow event={event} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
