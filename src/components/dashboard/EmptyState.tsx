"use client";

import Link from "next/link";
import { Zap, Upload, ChevronRight } from "lucide-react";
import { useApiSession } from "@/hooks/use-api-session";

export function EmptyState() {
  const { role } = useApiSession();
  const canCreateRun = role !== "reviewer";
  return (
    <div className="dash-empty">
      {/* Grid motif background */}
      <div className="de-motif" aria-hidden="true" />

      <div className="de-inner">
        {/* Icon */}
        <div className="de-ic" aria-hidden="true">
          <Zap size={24} />
        </div>

        <h2>Ready for your first run</h2>
        <p>
          Your workspace is set up. Upload this month&apos;s PD, LGD and EAD
          workbooks to compute your first Expected Credit Loss.
        </p>

        {/* Step flow */}
        <div className="de-steps">
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: "var(--r-full)",
              background: "var(--surface-sunken)",
              border: "1px solid var(--border)",
              fontSize: "var(--fs-caption)",
              color: "var(--text-muted)",
            }}
          >
            <Upload size={12} />
            Upload
          </span>

          <ChevronRight
            size={13}
            style={{ color: "var(--text-subtle)", alignSelf: "center" }}
          />

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: "var(--r-full)",
              background: "var(--surface-sunken)",
              border: "1px solid var(--border)",
              fontSize: "var(--fs-caption)",
              color: "var(--text-muted)",
            }}
          >
            <Zap size={12} />
            Compute
          </span>

          <ChevronRight
            size={13}
            style={{ color: "var(--text-subtle)", alignSelf: "center" }}
          />

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: "var(--r-full)",
              background: "var(--surface-sunken)",
              border: "1px solid var(--border)",
              fontSize: "var(--fs-caption)",
              color: "var(--text-muted)",
            }}
          >
            Reconcile
          </span>
        </div>

        {/* CTA */}
        {canCreateRun && (
          <Link
            href="/ecl/runs/new"
            style={{
              marginTop: 18,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 44,
              padding: "0 20px",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--r-sm)",
              fontFamily: "var(--font-ui)",
              fontSize: "var(--fs-h3)",
              fontWeight: "var(--fw-medium)" as React.CSSProperties["fontWeight"],
              cursor: "pointer",
              transition: "background var(--t-micro)",
              textDecoration: "none",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLAnchorElement).style.background = "var(--accent-hover)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLAnchorElement).style.background = "var(--accent)")
            }
          >
            Start your first run
          </Link>
        )}

        <a
          href="#"
          className="link-accent"
          style={{ marginTop: 6, fontSize: "var(--fs-caption)" }}
        >
          Download the file templates
        </a>
      </div>
    </div>
  );
}
