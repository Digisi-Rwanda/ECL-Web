import type { Metadata } from "next";
import { Suspense } from "react";
import { LeaseDetailView } from "@/components/leases/views/LeaseDetailView";

export const metadata: Metadata = { title: "Lease — Leases — Ledgerline" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense><LeaseDetailView id={id} /></Suspense>;
}
