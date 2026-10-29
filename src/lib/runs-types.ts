import { z } from "zod";
import type { KpiData, SegmentBar } from "./dashboard-types";

// ── Run status (extends dashboard RunStatus with draft + deleted) ───────────

export const RunDetailStatusSchema = z.enum([
  "success",
  "failed",
  "running",
  "queued",
  "draft",
  "deleted",
]);
export type RunDetailStatus = z.infer<typeof RunDetailStatusSchema>;

// ── List item (one row in the runs table) ─────────────────────────────────

export const RunListItemSchema = z.object({
  id: z.string(),         // short truncated: "c81a…77fe"
  fullId: z.string(),     // full UUID for hash pill + URL slug
  name: z.string(),       // display name: "May 2026"
  period: z.string(),     // "May 2026"
  createdAt: z.string(),  // "30 May 14:22"
  byInitials: z.string(),
  byName: z.string(),
  status: RunDetailStatusSchema,
  eclAmount: z.number().nullable(),
  coverage: z.string().nullable(), // "2.41%" or null
  currency: z.string(),
});
export type RunListItem = z.infer<typeof RunListItemSchema>;

// ── Input file ────────────────────────────────────────────────────────────

export const RunInputFileSchema = z.object({
  type: z.enum(["PD", "LGD", "EAD"]),
  name: z.string(),
  size: z.string(),    // "2.4 MB"
  sheets: z.number(),
  validationStatus: z.enum(["ok", "warn", "error"]),
  warningCount: z.number().optional(),
  hash: z.string(),    // "a3f9…2c1b"
});
export type RunInputFile = z.infer<typeof RunInputFileSchema>;

// ── Audit event ───────────────────────────────────────────────────────────

export const AuditEventSchema = z.object({
  id: z.string(),
  kind: z.enum(["ok", "err", "accent", "default"]),
  iconName: z.string(), // Lucide icon name
  title: z.string(),
  description: z.string(),
  who: z.string(),     // person name or "system"
  time: z.string(),    // "14:22:18" or "5 May 09:12"
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

// ── Engine info ────────────────────────────────────────────────────────────

export const EngineInfoSchema = z.object({
  version: z.string(),
  releasedDate: z.string(),
  pdMethod: z.string(),
  lgdMethod: z.string(),
  eadMethod: z.string(),
  pdFilesCombined: z.boolean(),
  deterministic: z.boolean(),
});
export type EngineInfo = z.infer<typeof EngineInfoSchema>;

// ── Run detail (full page data) ────────────────────────────────────────────

export const RunDetailSchema = RunListItemSchema.extend({
  elapsed: z.string().optional(),
  kpis: z.array(z.any()),       // KpiData[]
  segments: z.array(z.any()),   // SegmentBar[]
  inputFiles: z.array(RunInputFileSchema),
  auditEvents: z.array(AuditEventSchema),
  engineInfo: EngineInfoSchema,
  failureDetails: z
    .object({ stage: z.string(), message: z.string(), ref: z.string() })
    .optional(),
  deletedBy: z.string().optional(),
  deletedAt: z.string().optional(),
  acceptedWarnings: z.number().optional(),
});
export type RunDetail = Omit<z.infer<typeof RunDetailSchema>, "kpis" | "segments"> & {
  kpis: KpiData[];
  segments: SegmentBar[];
};

// ── List filter state ──────────────────────────────────────────────────────

export interface RunListFilter {
  search: string;
  status: RunDetailStatus | "all";
  year: string | null;
  userId: string | null;
}

export const defaultRunListFilter: RunListFilter = {
  search: "",
  status: "all",
  year: null,
  userId: null,
};

// ── Tab IDs ────────────────────────────────────────────────────────────────

export type RunDetailTab = "overview" | "report" | "inputs" | "audit" | "engine";

export const TAB_CONFIG: {
  id: RunDetailTab;
  label: string;
  iconName: string;
}[] = [
  { id: "overview", label: "Overview", iconName: "BarChart3" },
  { id: "report", label: "ECL report", iconName: "ClipboardCheck" },
  { id: "inputs", label: "Inputs", iconName: "File" },
  { id: "audit", label: "Audit trail", iconName: "Clock" },
  { id: "engine", label: "Engine", iconName: "Cpu" },
];

// Which tabs are visible per status
export function getVisibleTabs(status: RunDetailStatus): RunDetailTab[] {
  if (status === "running") return ["inputs", "audit"];
  if (status === "failed") return ["inputs", "audit", "engine"];
  return ["overview", "report", "inputs", "audit", "engine"];
}

export function getDefaultTab(status: RunDetailStatus): RunDetailTab {
  if (status === "running") return "inputs";
  if (status === "failed") return "audit";
  return "overview";
}
