"use client";

import { Check } from "lucide-react";
import { motion } from "framer-motion";

const modules = [
  {
    tag: "CREDIT LOSS · IFRS 9",
    title: "Expected Credit Loss",
    desc: "PD, LGD and EAD engines combine into one stage-level ECL figure for banks and MFIs, with a reproducible run for every reporting date.",
    features: [
      "Stage 1/2/3 classification and SICR",
      "Collateral-aware LGD with haircuts",
      "EAD with credit conversion factors",
      "Loan, segment and portfolio results",
    ],
  },
  {
    tag: "LEASES · IFRS 16",
    title: "Lease Accounting",
    desc: "A lease register with dated cash flows, liability and right-of-use schedules, and remeasurements that never overwrite history.",
    features: [
      "Present value on actual payment dates",
      "CPI, term changes, modifications, terminations",
      "Balanced journals for every event",
      "Maturity analysis and roll-forwards",
    ],
  },
  {
    tag: "CLOSE & AUDIT",
    title: "Controls built in",
    desc: "Every number traces back to an approved version, its inputs and the person who approved it, across every module.",
    features: [
      "Maker-checker approvals",
      "Period close with lock and reopen log",
      "Immutable audit log and CSV export",
      "Tenant-isolated workspaces",
    ],
  },
];

export function ModulesSection() {
  return (
    <section
      id="modules"
      style={{
        padding: "clamp(56px, 8vw, 104px) 0",
        background: "var(--surface-sunken)",
      }}
    >
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "0 var(--gutter)" }}>
        {/* Header */}
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <p
            className="text-xs uppercase tracking-widest font-medium mb-3.5 mx-auto"
            style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", letterSpacing: "0.18em" }}
          >
            The Modules
          </p>
          <h2
            className="font-semibold mx-auto"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.6rem, 1.2rem + 1.6vw, 2.2rem)",
              letterSpacing: "-0.02em",
              lineHeight: 1.12,
              color: "var(--text)",
            }}
          >
            Two standards. One ledger of record.
          </h2>
          <p
            className="mt-3 mx-auto max-w-[52ch]"
            style={{ color: "var(--text-muted)", fontSize: "var(--fs-h3)" }}
          >
            Each module runs on its own, sharing one workspace, one approval model and one audit trail.
          </p>
        </motion.div>

        {/* Feature cards */}
        <div className="grid gap-4 modules-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {modules.map((mod, i) => (
            <motion.div
              key={mod.tag}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="p-7 rounded-md flex flex-col gap-3 transition-all duration-180 group"
              style={{ border: "1px solid var(--border)", background: "var(--surface)", cursor: "default" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-hover)";
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "";
                (e.currentTarget as HTMLElement).style.boxShadow = "";
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
              }}
            >
              <span
                className="text-[11px] uppercase tracking-widest"
                style={{ color: "var(--text-subtle)", fontFamily: "var(--font-mono)" }}
              >
                {mod.tag}
              </span>

              <h3
                className="font-semibold"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--fs-h2)",
                  color: "var(--text)",
                }}
              >
                {mod.title}
              </h3>

              <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-body)", lineHeight: 1.6 }}>
                {mod.desc}
              </p>

              {/* Feature list */}
              <ul className="flex flex-col gap-2.5 mt-1">
                {mod.features.map((f) => (
                  <li key={f} className="flex gap-2.5 items-start text-sm">
                    <Check
                      className="size-3.5 mt-0.5 flex-none"
                      style={{ color: "var(--accent)" }}
                    />
                    <span style={{ color: "var(--text-muted)" }}>{f}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 980px) {
          .modules-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
