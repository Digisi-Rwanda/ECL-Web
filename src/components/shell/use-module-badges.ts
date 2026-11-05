"use client";

import type { ModuleId } from "./modules";
import { useLeasesState } from "@/components/leases/use-leases";
import { leaseBadges } from "@/components/leases/badges";

export interface Badge { n: number; tone: "neutral" | "action" }

export function useModuleBadges(id: ModuleId): Record<string, Badge> {
  const st = useLeasesState();
  if (id !== "leases" || !st) return {};
  return leaseBadges(st);
}
