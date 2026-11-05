import type { Metadata } from "next";
import { DashboardLoader } from "@/components/dashboard/DashboardLoader";

export const metadata: Metadata = {
  title: "Home — Ledgerline",
};

export default function DashboardPage() {
  return <DashboardLoader />;
}
