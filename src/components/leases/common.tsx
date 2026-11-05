"use client";
import Link from "next/link";
import { Settings2, CalendarDays } from "lucide-react";
import { STATUS_META, currentPeriod, leaseStatus, periodLabel, member } from "@/lib/leases/model";
import { setupStatus } from "@/lib/leases/store";
import { StatusBadge, EmptyState, BtnLink, Person } from "@/components/ll/Kit";
import { useLeasesState } from "./use-leases";
import type { Lease, LeasesState, LeaseStatus } from "@/lib/leases/types";

export function LeaseStatusBadge({ lease, status }: { lease?: Lease; status?: LeaseStatus }) {
  const s = status ?? leaseStatus(lease!);
  const m = STATUS_META[s];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

export function PersonById({ st, id }: { st: LeasesState; id?: string }) {
  if (!id) return <span className="ll-subtle">—</span>;
  const p = member(st, id);
  return <Person name={p.name} initials={p.initials} />;
}

export function PeriodChip() {
  const st = useLeasesState();
  const p = st && currentPeriod(st);
  if (!p) return null;
  const tone = p.status === "closing" ? "warning" : "success";
  return (
    <Link href={`/leases/close/${p.key}`} style={{ textDecoration: "none" }} title="Current accounting period">
      <StatusBadge tone={tone}><CalendarDays size={12} /> {periodLabel(p.key)} · {p.status === "closing" ? "Closing" : "Open"}</StatusBadge>
    </Link>
  );
}

/** Blocks a page until module setup is complete; tells preparers who to ask. */
export function RequireSetup({ children, need = ["entity", "periods", "policy", "rates"] }: { children: React.ReactNode; need?: Array<keyof ReturnType<typeof setupStatus>> }) {
  const st = useLeasesState()!;
  const s = setupStatus(st);
  const missing = need.filter((k) => !s[k]);
  if (!missing.length) return <>{children}</>;
  const me = member(st);
  const admin = st.members.find((p) => p.role === "administrator");
  return (
    <div className="ll-card">
      <EmptyState
        icon={Settings2}
        title="Finish setup first"
        body={me.role === "administrator"
          ? `Complete ${missing.length} setup step${missing.length > 1 ? "s" : ""} (${missing.join(", ")}) before using this page.`
          : `${admin?.name ?? "Your administrator"} needs to finish Leases setup before you can use this page.`}
        actions={me.role === "administrator" ? <BtnLink href="/leases/setup" variant="primary">Go to setup</BtnLink> : undefined}
      />
    </div>
  );
}

export const CLASS_OPTIONS = [
  { value: "property", label: "Property" },
  { value: "vehicles", label: "Vehicles" },
  { value: "equipment", label: "Equipment" },
  { value: "it", label: "IT & data centre" },
  { value: "land", label: "Land" },
] as const;
