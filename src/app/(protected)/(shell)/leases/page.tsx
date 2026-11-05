import type { Metadata } from "next";
import { OverviewView } from "@/components/leases/views/OverviewView";

export const metadata: Metadata = { title: "Leases — Ledgerline" };

export default function Page() {
  return <OverviewView />;
}
