"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

const sections = [
  {
    id: "encryption",
    title: "Encryption",
    content: `All data is encrypted at rest using AES-256 and in transit using TLS 1.3. Database backups are independently encrypted. Encryption keys are managed using a dedicated key management service with automatic annual rotation. No customer data is stored in plaintext at any layer of the stack.`,
  },
  {
    id: "residency",
    title: "Data Residency",
    content: `By default, all customer data is stored within the primary region selected at account creation. Enterprise customers can request custom data residency arrangements including single-region isolation and on-premise deployment options. Currency and timezone settings are locked after initial setup to comply with IFRS 9 audit requirements.`,
  },
  {
    id: "auth",
    title: "Authentication",
    content: `All user sessions are protected by signed, short-lived JWT tokens with automatic refresh. Password requirements enforce a minimum of 12 characters with complexity rules. Multi-factor authentication (TOTP) is available for all plans and mandatory for Admin and Reviewer roles on the Growth and Enterprise tiers. SSO via SAML 2.0 is available on Enterprise.`,
  },
  {
    id: "audit",
    title: "Audit Trail",
    content: `Every ECL run produces an immutable, cryptographically hashed record stored for a minimum of 7 years — the IFRS 9 mandated retention period. Hash verification allows external auditors to confirm that exported results match the original computation without accessing the platform. All user actions (file uploads, parameter changes, user management) are logged with timestamps and actor identifiers.`,
  },
  {
    id: "backups",
    title: "Backups",
    content: `Database backups are performed hourly with 30-day point-in-time recovery. Backups are stored in a geographically separate region from primary data. Recovery time objective (RTO) is 4 hours; recovery point objective (RPO) is 1 hour. Backup restoration is tested quarterly.`,
  },
  {
    id: "compliance",
    title: "Compliance",
    content: `Ledgerline is designed for IFRS 9 and IFRS 16 compliance. Our SOC 2 Type II assessment is in progress. Contact us for our latest penetration test executive summary and current compliance status. We are aligned with OWASP Top 10 mitigations and conduct annual third-party security reviews.`,
  },
  {
    id: "incident",
    title: "Incident Response",
    content: `We maintain a documented incident response plan with defined severity levels and escalation paths. Customers affected by a security incident will be notified within 72 hours of detection, consistent with GDPR Article 33 obligations. A post-incident report is provided for all Severity 1 and Severity 2 events.`,
  },
  {
    id: "subproc",
    title: "Sub-processors",
    content: `We use a limited number of carefully vetted sub-processors for infrastructure and operational purposes. All sub-processors are contractually bound to our data protection standards. The current list of sub-processors is available on request and updated when changes are made. Customers on Enterprise plans receive advance notice of sub-processor changes.`,
  },
];

export function SecurityDoc() {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    function onScroll() {
      let active: string | null = null;
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top < 140) {
          active = s.id;
        }
      }
      setActiveId(active);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section style={{ padding: "clamp(56px, 8vw, 104px) 0" }}>
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "0 var(--gutter)" }}>
        {/* Page header */}
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="size-6" style={{ color: "var(--accent)" }} />
          <h1
            className="font-semibold"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(1.6rem, 1.2rem + 1.6vw, 2.2rem)",
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            Security &amp; Trust
          </h1>
        </div>
        <p style={{ color: "var(--text-muted)", marginBottom: 40 }}>
          Last updated May 2026 · Version 2.1
        </p>

        <div className="flex gap-12 items-start sec-layout">
          {/* TOC sidebar */}
          <nav
            className="toc-sidebar flex-none flex flex-col gap-0.5"
            style={{ width: 175, position: "sticky", top: 96, alignSelf: "start" }}
            aria-label="Table of contents"
          >
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="py-1.5 pl-3 text-sm no-underline transition-colors duration-120"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                style={{
                  borderLeft: `2px solid ${activeId === s.id ? "var(--accent)" : "var(--border)"}`,
                  color: activeId === s.id ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                {s.title}
              </a>
            ))}
          </nav>

          {/* Main content */}
          <div className="flex-1 min-w-0" style={{ maxWidth: 680 }}>
            {/* Callout */}
            <div
              className="p-4 rounded-md mb-8 flex gap-3"
              style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}
            >
              <ShieldCheck className="size-4 flex-none mt-0.5" style={{ color: "var(--accent)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                <strong style={{ color: "var(--text)" }}>Security questions?</strong> Contact us at{" "}
                <span style={{ color: "var(--accent)" }}>security@eclplatform.io</span> for our latest
                penetration-test summary and SOC 2 status.
              </p>
            </div>

            {sections.map((s) => (
              <div key={s.id} className="mb-10">
                <h2
                  id={s.id}
                  className="font-semibold mb-3"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "var(--fs-h2)",
                    color: "var(--text)",
                    scrollMarginTop: 90,
                  }}
                >
                  {s.title}
                </h2>
                <p style={{ color: "var(--text-muted)", lineHeight: 1.7, fontSize: "var(--fs-body)" }}>
                  {s.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 980px) {
          .toc-sidebar { display: none !important; }
          .sec-layout { flex-direction: column !important; }
        }
      `}</style>
    </section>
  );
}
