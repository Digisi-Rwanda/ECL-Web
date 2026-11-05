import type { Metadata } from "next";
import { CloseView } from "@/components/leases/views/CloseView";

export const metadata: Metadata = { title: "Period close — Leases — Ledgerline" };

export default async function Page({ params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;
  return <CloseView period={period} />;
}
