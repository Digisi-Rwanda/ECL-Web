import type { Metadata } from "next";
import { RunsListLoader } from "@/components/runs/RunsListLoader";

export const metadata: Metadata = {
  title: "Runs — Credit Loss — Ledgerline",
};

export default function RunsPage() {
  return <RunsListLoader />;
}
