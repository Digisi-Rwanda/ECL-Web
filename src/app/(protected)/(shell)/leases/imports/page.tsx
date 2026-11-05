import type { Metadata } from "next";
import { ImportsView } from "@/components/leases/views/ImportsView";

export const metadata: Metadata = { title: "Imports — Leases — Ledgerline" };

export default function Page() {
  return <ImportsView />;
}
