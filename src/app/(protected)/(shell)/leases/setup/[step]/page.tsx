import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityStep, PeriodsStep, PolicyStep, RatesStep, GlStep } from "@/components/leases/views/SetupView";

const STEPS = { entity: EntityStep, periods: PeriodsStep, policy: PolicyStep, rates: RatesStep, gl: GlStep };

export const metadata: Metadata = { title: "Setup — Leases — Ledgerline" };

export default async function Page({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  const View = STEPS[step as keyof typeof STEPS];
  if (!View) notFound();
  return <View />;
}
