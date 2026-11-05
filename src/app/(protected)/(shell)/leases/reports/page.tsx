import type { Metadata } from "next";
import { ReportsView } from "@/components/leases/views/ReportsView";

export const metadata: Metadata = { title: "Reports — Leases — Ledgerline" };

export default function Page() {
  return <ReportsView />;
}
