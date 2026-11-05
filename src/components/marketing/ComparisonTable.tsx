"use client";

import { Check, X } from "lucide-react";
import { motion } from "framer-motion";

const rows = [
  {
    feature: "Cost",
    spreadsheet: "Low upfront",
    ecl: "Predictable monthly",
    enterprise: "High licence + implementation",
  },
  {
    feature: "Time to deploy",
    spreadsheet: "Days (but breaks)",
    ecl: "< 1 day",
    enterprise: "3 – 12 months",
  },
  {
    feature: "Audit trail",
    spreadsheet: false,
    ecl: true,
    enterprise: "Partial",
  },
  {
    feature: "Multi-user isolation",
    spreadsheet: false,
    ecl: true,
    enterprise: true,
  },
  {
    feature: "On-premise option",
    spreadsheet: true,
    ecl: false,
    enterprise: true,
  },
  {
    feature: "Deterministic output",
    spreadsheet: false,
    ecl: true,
    enterprise: "Varies",
  },
  {
    feature: "Dedicated support",
    spreadsheet: false,
    ecl: true,
    enterprise: true,
  },
];

function Cell({ val }: { val: string | boolean }) {
  if (val === true)
    return <Check className="size-4 mx-auto" style={{ color: "var(--success)" }} />;
  if (val === false)
    return <X className="size-4 mx-auto" style={{ color: "var(--text-subtle)" }} />;
  return <span style={{ color: "var(--text-muted)" }}>{val}</span>;
}

export function ComparisonTable() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      style={{ padding: "clamp(56px, 8vw, 104px) 0", background: "var(--surface-sunken)" }}
    >
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "0 var(--gutter)" }}>
        <div className="text-center mb-10">
          <p
            className="text-xs uppercase tracking-widest font-medium mb-3.5"
            style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", letterSpacing: "0.18em" }}
          >
            Why Ledgerline
          </p>
          <h2
            className="font-semibold"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.6rem, 1.2rem + 1.6vw, 2.2rem)",
              letterSpacing: "-0.02em",
              lineHeight: 1.12,
              color: "var(--text)",
            }}
          >
            Better than spreadsheets.
            <br />
            Leaner than enterprise.
          </h2>
        </div>

        <div className="overflow-x-auto cmp-wrap">
          <table
            className="w-full border-collapse rounded-md overflow-hidden"
            style={{ border: "1px solid var(--border)", minWidth: 560 }}
          >
            <thead>
              <tr>
                <th
                  className="p-3.5 text-left text-xs font-semibold uppercase tracking-wide"
                  style={{ background: "var(--surface-sunken)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                >
                  Feature
                </th>
                {["Spreadsheets / Notebooks", "Ledgerline", "Enterprise Suites"].map((h) => (
                  <th
                    key={h}
                    className="p-3.5 text-center text-xs font-semibold uppercase tracking-wide"
                    style={{
                      background: h === "Ledgerline" ? "var(--accent-subtle)" : "var(--surface-sunken)",
                      color: h === "Ledgerline" ? "var(--accent)" : "var(--text-muted)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.feature}>
                  <td
                    className="p-3.5 font-medium"
                    style={{
                      color: "var(--text)",
                      border: "1px solid var(--border)",
                      borderBottom: i === rows.length - 1 ? 0 : "1px solid var(--border)",
                      fontSize: "var(--fs-body)",
                    }}
                  >
                    {row.feature}
                  </td>
                  <td className="p-3.5 text-center" style={{ border: "1px solid var(--border)", fontSize: "var(--fs-body)" }}>
                    <Cell val={row.spreadsheet} />
                  </td>
                  <td
                    className="p-3.5 text-center font-medium"
                    style={{
                      background: "color-mix(in srgb, var(--accent-subtle) 55%, transparent)",
                      border: "1px solid var(--border)",
                      fontSize: "var(--fs-body)",
                    }}
                  >
                    <Cell val={row.ecl} />
                  </td>
                  <td className="p-3.5 text-center" style={{ border: "1px solid var(--border)", fontSize: "var(--fs-body)" }}>
                    <Cell val={row.enterprise} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.section>
  );
}
