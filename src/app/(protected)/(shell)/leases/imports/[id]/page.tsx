import type { Metadata } from "next";
import { ImportBatchView } from "@/components/leases/views/ImportsView";

export const metadata: Metadata = { title: "Import — Leases — Ledgerline" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ImportBatchView id={id} />;
}
