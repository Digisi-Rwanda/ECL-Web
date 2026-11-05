"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Copy, Check, ArrowRight } from "lucide-react";
import Link from "next/link";
import { StatusPill } from "./shared/StatusPill";
import type { Run } from "@/lib/dashboard-types";

interface RunsTableProps {
  runs: Run[];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available
    }
  }

  return (
    <button
      onClick={handleCopy}
      aria-label="Copy run ID"
      style={{
        background: "none",
        border: 0,
        padding: 0,
        cursor: "pointer",
        color: copied ? "var(--success)" : "var(--text-subtle)",
        display: "inline-flex",
        alignItems: "center",
        transition: "color var(--t-micro)",
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function formatEcl(amount: number | null | undefined, currency: string): React.ReactNode {
  if (amount == null) return <span className="amount zero">—</span>;
  return (
    <span className="amount">
      {currency} {amount.toLocaleString("en-US")}
    </span>
  );
}

export function RunsTable({ runs }: RunsTableProps) {
  const router = useRouter();
  return (
    <>
      <div className="runs-head">
        <h2>Recent runs</h2>
        <Link
          href="/ecl/runs"
          className="link-accent"
          style={{ fontSize: "var(--fs-body)" }}
        >
          View all runs
          <ArrowRight size={13} />
        </Link>
      </div>

      <div className="tbl-wrap">
        <table className="tbl runs-table">
          <thead>
            <tr>
              <th>Run</th>
              <th className="hidden sm:table-cell">Period</th>
              <th className="hidden md:table-cell">By</th>
              <th>Status</th>
              <th className="num">Total ECL</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div
                    style={{
                      padding: "28px 0",
                      textAlign: "center",
                      color: "var(--text-subtle)",
                      fontSize: "var(--fs-body)",
                    }}
                  >
                    No runs yet.
                  </div>
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr
                  key={run.id}
                  onClick={() => router.push(`/ecl/runs/${run.fullId}`)}
                >
                  <td>
                    <span className="run-id">
                      {run.id}
                      <CopyButton text={run.id} />
                    </span>
                  </td>
                  <td className="hidden sm:table-cell">
                    <span style={{ color: "var(--text-muted)", fontSize: "var(--fs-body)" }}>
                      {run.period}
                    </span>
                  </td>
                  <td className="hidden md:table-cell">
                    <div className="by-cell">
                      <span className="avatar avatar-sm">{run.byInitials}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "var(--fs-caption)" }}>
                        {run.byName}
                      </span>
                    </div>
                  </td>
                  <td>
                    <StatusPill status={run.status} />
                  </td>
                  <td className="num">
                    {formatEcl(run.eclAmount, run.currency)}
                  </td>
                  <td>
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/ecl/runs/${run.fullId}`); }}
                      style={{
                        width: 32,
                        height: 32,
                        border: 0,
                        background: "none",
                        color: "var(--text-subtle)",
                        display: "grid",
                        placeItems: "center",
                        borderRadius: "var(--r-sm)",
                        cursor: "pointer",
                        transition: "background var(--t-micro), color var(--t-micro)",
                      }}
                      aria-label="View run details"
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          "var(--surface-sunken)";
                        (e.currentTarget as HTMLButtonElement).style.color =
                          "var(--text)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          "none";
                        (e.currentTarget as HTMLButtonElement).style.color =
                          "var(--text-subtle)";
                      }}
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
