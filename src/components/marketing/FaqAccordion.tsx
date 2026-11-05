"use client";

import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "Is the ECL output truly deterministic?",
    a: "Yes. Given identical inputs, the engine will always produce bit-for-bit identical output. Every run is hashed and the hash is stored in the audit trail. Your auditor can verify this at any time.",
  },
  {
    q: "Does Ledgerline use AI or machine learning?",
    a: "No. The engine is a pure implementation of the IFRS 9 standard — no neural networks, no black-box models. Every line of the computation is explainable and auditable. AI-based forward-looking overlays are on the roadmap for a later phase, and will be clearly labelled as such.",
  },
  {
    q: "Can we run the platform on our own servers (on-premise)?",
    a: "On-premise deployments are available on the Enterprise plan. Contact us to discuss your infrastructure requirements and data residency constraints.",
  },
  {
    q: "What file formats do you accept for upload?",
    a: "We accept Excel (.xlsx) and CSV. Downloadable templates are provided for each upload type so your team can map existing data with minimal effort.",
  },
  {
    q: "How is our data isolated from other tenants?",
    a: "Each institution is a separate tenant with its own encrypted workspace. There is no shared database layer between tenants. Analysts can only access the workspaces they have been explicitly invited to.",
  },
  {
    q: "How long does a typical ECL run take?",
    a: "For portfolios up to 10,000 loans, expect under 60 seconds end-to-end. Larger portfolios (50,000+) are batched and typically complete within 5 minutes.",
  },
  {
    q: "Do you support forward-looking overlay (macro scenarios)?",
    a: "A basic forward-looking overlay is on the product roadmap and is not included in the current release. All IFRS 9 base calculations (PD, LGD, EAD, staging) are fully supported today.",
  },
  {
    q: "Can we share run results with external auditors?",
    a: "Yes. Every completed run has a shareable PDF report and a machine-readable JSON export that includes the full audit trail hash. Auditors can verify the hash independently without accessing the platform.",
  },
];

export function FaqAccordion() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      style={{ padding: "clamp(56px, 8vw, 104px) 0", background: "var(--surface-sunken)" }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 var(--gutter)" }}>
        <div className="text-center mb-10">
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
            Frequently asked questions
          </h2>
        </div>

        <Accordion
          type="single"
          collapsible
          defaultValue="item-0"
          className="rounded-md overflow-hidden"
          style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
        >
          {faqs.map((faq, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              style={{ borderBottom: i < faqs.length - 1 ? "1px solid var(--border)" : "none" }}
            >
              <AccordionTrigger
                className="px-5 py-4.5 text-left font-medium hover:bg-[var(--surface-sunken)] transition-colors"
                style={{ fontSize: "var(--fs-h3)", color: "var(--text)" }}
              >
                {faq.q}
              </AccordionTrigger>
              <AccordionContent
                className="px-5 pb-5"
                style={{
                  color: "var(--text-muted)",
                  fontSize: "var(--fs-body)",
                  lineHeight: 1.6,
                }}
              >
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </motion.section>
  );
}
