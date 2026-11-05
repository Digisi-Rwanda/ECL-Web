import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportView } from "@/components/leases/views/ReportsView";

export const metadata: Metadata = { title: "Report — Leases — Ledgerline" };

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <Suspense><ReportView report={key} /></Suspense>;
}
