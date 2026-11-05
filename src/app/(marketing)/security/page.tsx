import { SecurityDoc } from "@/components/marketing/SecurityDoc";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security & Trust — Ledgerline",
  description:
    "How Ledgerline keeps your loan data encrypted, isolated, and auditable. AES-256, TLS 1.3, SOC 2 in progress.",
};

export default function SecurityPage() {
  return <SecurityDoc />;
}
