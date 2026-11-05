import type { Metadata } from "next";
import { ResultsExplorer } from "@/components/results/ResultsExplorer";

export const metadata: Metadata = {
  title: "Results — Credit Loss — Ledgerline",
};

interface ResultsPageProps {
  searchParams: Promise<{ run_id?: string }>;
}

export default async function ResultsPage({ searchParams }: ResultsPageProps) {
  const { run_id: runId } = await searchParams;
  return <ResultsExplorer initialRunId={runId} />;
}
