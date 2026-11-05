import type { Metadata } from "next";
import { Suspense } from "react";
import { InboxView } from "@/components/leases/views/InboxView";

export const metadata: Metadata = { title: "Inbox — Leases — Ledgerline" };

export default function Page() {
  return <Suspense><InboxView /></Suspense>;
}
