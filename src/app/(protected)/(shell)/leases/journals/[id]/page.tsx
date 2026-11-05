import type { Metadata } from "next";
import { JournalBatchView } from "@/components/leases/views/JournalsView";

export const metadata: Metadata = { title: "Journal batch — Leases — Ledgerline" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JournalBatchView id={id} />;
}
