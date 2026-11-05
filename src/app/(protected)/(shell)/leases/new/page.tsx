import type { Metadata } from "next";
import { Suspense } from "react";
import { WizardView } from "@/components/leases/views/WizardView";

export const metadata: Metadata = { title: "New lease — Leases — Ledgerline" };

export default function Page() {
  return <Suspense><WizardView /></Suspense>;
}
