import type { Metadata } from "next";
import { RunDetailLoader } from "@/components/runs/RunDetailLoader";

interface RunDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: RunDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Run ${id.slice(0, 8)} — Runs — Credit Loss — Ledgerline` };
}

export default async function RunDetailPage({ params }: RunDetailPageProps) {
  const { id } = await params;
  return <RunDetailLoader runId={id} />;
}
