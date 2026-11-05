import type { Metadata } from "next";
import { JournalsView } from "@/components/leases/views/JournalsView";

export const metadata: Metadata = { title: "Journals — Leases — Ledgerline" };

export default function Page() {
  return <JournalsView />;
}
