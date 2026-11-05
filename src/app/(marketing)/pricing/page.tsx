import { PricingSection } from "@/components/marketing/PricingSection";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Ledgerline",
  description:
    "Simple, transparent pricing for IFRS 9 Expected Credit Loss calculations. No hidden fees.",
};

export default function PricingPage() {
  return (
    <>
      <PricingSection />
      <FaqAccordion />
    </>
  );
}
