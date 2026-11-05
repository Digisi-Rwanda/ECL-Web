import type { Metadata } from "next";
import { SetupView } from "@/components/leases/views/SetupView";

export const metadata: Metadata = { title: "Setup — Leases — Ledgerline" };

export default function Page() {
  return <SetupView />;
}
