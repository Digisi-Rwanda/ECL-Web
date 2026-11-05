"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { FlaskConical, RotateCcw } from "lucide-react";
import { load, reset, setPersona, getState, validateImportChunk, commitImportChunk } from "@/lib/leases/store";
import { seedLeases } from "@/lib/leases/seed";
import { SkeletonPage, Btn } from "@/components/ll/Kit";
import { Confirm } from "@/components/ll/Overlay";
import { Toaster, toast } from "@/components/ll/toast";
import { useLeasesState } from "./use-leases";
import type { ImportBatch } from "@/lib/leases/types";

function seeder(ctx: { currency: string; userName: string; tenantName: string }) {
  return (tenantId: string, mode: "sample" | "empty") => seedLeases(tenantId, mode, ctx);
}

/** Advances background jobs (import validation / commit) in small chunks so the UI stays responsive. */
function useJobRunner() {
  const st = useLeasesState();
  const running = st?.imports.find((b) => b.status === "validating" || b.status === "committing");
  const id = running?.id;
  const status = running?.status;
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const b = getState()?.imports.find((x) => x.id === id) as (ImportBatch & { retryOnly?: boolean }) | undefined;
      if (!b || (b.status !== "validating" && b.status !== "committing")) return;
      const chunk = 25;
      const from = Math.floor((b.progress / 100) * b.rows.length);
      const to = Math.min(b.rows.length, from + chunk);
      try {
        if (b.status === "validating") validateImportChunk(id, from, to);
        else commitImportChunk(id, from, to, b.retryOnly);
      } catch (e) {
        toast("danger", e instanceof Error ? e.message : "Import job failed");
        return;
      }
      setTimeout(tick, 220);
    };
    const t = setTimeout(tick, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [id, status]);
}

export function LeasesProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const st = useLeasesState();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"sample" | "empty" | null>(null);
  const path = usePathname();
  const tenantId = session?.user?.tenantId;
  const ctx = { currency: session?.user?.currency ?? "USD", userName: session?.user?.name ?? "You", tenantName: session?.user?.tenantName ?? "Workspace" };

  useEffect(() => {
    if (status !== "authenticated" || !tenantId) return;
    // yield a frame so the skeleton paints before the (one-off) sample seed runs
    const t = setTimeout(() => {
      load(tenantId, seeder(ctx)).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the leases workspace."));
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tenantId]);
  useJobRunner();

  if (error) return <div className="ll-banner danger" role="alert">{error}</div>;
  if (!st || st.tenantId !== tenantId) return <SkeletonPage />;

  return (
    <div className="ll-page">
      <div className="ll-demo" role="note">
        <FlaskConical size={14} aria-hidden="true" />
        <span><strong>Demo data</strong> — stored in this browser only.</span>
        <span className="ll-spacer" />
        <label className="ll-row" style={{ gap: 6 }}>
          <span>Acting as</span>
          <select
            className="select"
            value={st.personaId}
            onChange={(e) => {
              setPersona(e.target.value);
              const p = st.personas.find((x) => x.id === e.target.value);
              toast("info", `Now acting as ${p?.name} (${p?.role === "analyst" ? "preparer" : p?.role})`);
            }}
            aria-label="Acting as"
          >
            {st.personas.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role === "analyst" ? "Preparer" : p.role === "reviewer" ? "Reviewer" : "Admin"}</option>)}
          </select>
        </label>
        <Btn size="sm" variant="ghost" onClick={() => setConfirm(st.seededAs === "sample" ? "empty" : "sample")}>
          <RotateCcw size={13} /> {st.seededAs === "sample" ? "Start empty" : "Load sample"}
        </Btn>
        <Btn size="sm" variant="ghost" onClick={() => setConfirm(st.seededAs)}>Reset</Btn>
      </div>
      <div key={path} className="ll-page">{children}</div>
      <Toaster />
      <Confirm
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "empty" ? "Start with an empty workspace?" : "Reset the sample portfolio?"}
        consequences={[
          "Everything you created or changed in this browser's demo data is removed.",
          confirm === "empty" ? "You'll start at module setup, exactly like a new customer." : "The sample portfolio, history and open close are recreated.",
          "Nothing on the server is affected.",
        ]}
        confirmLabel="Reset demo data"
        tone="danger"
        onConfirm={() => { reset(seeder(ctx), confirm!); toast("success", "Demo data reset"); }}
      />
    </div>
  );
}
