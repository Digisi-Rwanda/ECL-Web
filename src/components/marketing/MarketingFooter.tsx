"use client";

import Link from "next/link";
import { Grid3X3 } from "lucide-react";
import { useDemo } from "./DemoContext";

const footerLinks = {
  Product: [
    { label: "How it works", href: "/#how" },
    { label: "Modules", href: "/#modules" },
    { label: "Pricing", href: "/pricing" },
  ],
  Company: [
    { label: "Security", href: "/security" },
  ],
};

export function MarketingFooter() {
  const { openDemo } = useDemo();

  return (
    <footer
      style={{
        background: "#0B0C1A",
        color: "rgba(236,237,245,0.7)",
        padding: "clamp(48px,7vw,72px) 0 32px",
      }}
    >
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "0 var(--gutter)" }}>
        {/* Grid */}
        <div className="grid gap-8 f-grid" style={{ gridTemplateColumns: "1.6fr 1fr 1fr" }}>
          {/* Brand column */}
          <div className="flex flex-col gap-4 max-sm:col-span-full">
            <div className="flex items-center gap-2 font-semibold text-base" style={{ color: "#fff" }}>
              <span
                className="size-7 rounded-lg flex items-center justify-center"
                style={{ background: "#fff", color: "var(--accent)" }}
              >
                <Grid3X3 className="size-3.5" />
              </span>
              <span>Ledgerline</span>
            </div>
            <p className="text-sm max-w-[240px]" style={{ lineHeight: 1.6 }}>
              Deterministic IFRS 9 Expected Credit Loss calculations for
              mid-tier banks and MFIs. Auditable by design.
            </p>
          </div>

          {/* Product + Company link columns */}
          {(Object.entries(footerLinks) as [string, { label: string; href: string }[]][]).map(
            ([heading, links]) => (
              <div key={heading} className="flex flex-col gap-1 max-sm:col-span-full">
                <h5
                  className="text-xs font-medium uppercase tracking-widest mb-2"
                  style={{ color: "#fff", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-mono)" }}
                >
                  {heading}
                </h5>
                {links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-sm py-1 no-underline transition-colors duration-120 hover:!text-white"
                    style={{ color: "rgba(236,237,245,0.6)", display: "block" }}
                  >
                    {link.label}
                  </Link>
                ))}
                {heading === "Company" && (
                  <button
                    onClick={openDemo}
                    className="text-sm py-1 text-left transition-colors duration-120 hover:!text-white"
                    style={{ color: "rgba(236,237,245,0.6)", background: "none", border: "none", padding: "4px 0", cursor: "pointer" }}
                  >
                    Request a demo
                  </button>
                )}
              </div>
            )
          )}
        </div>

        {/* Bottom bar */}
        <div
          className="flex items-center justify-between flex-wrap gap-3 mt-12 pt-6 text-xs"
          style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
        >
          <span>© 2026 Ledgerline. All rights reserved.</span>
          <span style={{ color: "rgba(236,237,245,0.4)" }}>
            Engine v1.3.0 · IFRS 9 (IFRS 9:2014)
          </span>
        </div>
      </div>

      {/* Responsive styles via style tag */}
      <style>{`
        @media (max-width: 980px) {
          .f-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 640px) {
          .f-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </footer>
  );
}
