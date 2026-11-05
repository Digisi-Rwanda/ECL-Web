"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { RefreshCw } from "lucide-react";
import { configure, load, refresh } from "@/lib/leases/store";
import { SkeletonPage, Btn, Banner } from "@/components/ll/Kit";
import { Toaster } from "@/components/ll/toast";
import { useLeasesState } from "./use-leases";

/** Loads the leases workspace from the API and keeps the bearer token current. */
export function LeasesProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const st = useLeasesState();
  const [error, setError] = useState<string | null>(null);
  const path = usePathname();
  const tenantId = session?.user?.tenantId;
  const token = session?.accessToken;

  useEffect(() => {
    if (status !== "authenticated" || !tenantId || !token) return;
    load(tenantId, token).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the leases workspace."));
  }, [status, tenantId, token]);

  // token rotates on refresh; keep the adapter's copy current
  useEffect(() => {
    if (tenantId && token) configure(tenantId, token);
  }, [tenantId, token]);

  // pick up other people's changes when coming back to the tab
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible" && st) void refresh().catch(() => {}); };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [st]);

  if (error) {
    return (
      <Banner tone="danger" title="Couldn't load Leases" action={<Btn size="sm" onClick={() => { setError(null); void refresh().catch((e) => setError(e.message)); }}><RefreshCw size={13} /> Retry</Btn>}>
        {error}
      </Banner>
    );
  }
  if (!st || st.tenantId !== tenantId) return <SkeletonPage />;

  return (
    <div className="ll-page">
      <div key={path} className="ll-page">{children}</div>
      <Toaster />
    </div>
  );
}
