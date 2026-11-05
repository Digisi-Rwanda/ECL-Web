import type { Metadata } from "next";
import { NewRunWizard } from "@/components/runs/new/NewRunWizard";

export const metadata: Metadata = {
  title: "New Run — Credit Loss — Ledgerline",
};

export default function NewRunPage() {
  return <NewRunWizard />;
}
