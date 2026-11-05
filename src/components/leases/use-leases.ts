"use client";
import { useCallback, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { getState, subscribe, LeaseError } from "@/lib/leases/store";
import { member } from "@/lib/leases/model";
import { toast } from "@/components/ll/toast";
import type { LeasesState } from "@/lib/leases/types";

/** Current leases workspace (null until the layout has loaded it). */
export function useLeasesState(): LeasesState | null {
  return useSyncExternalStore(subscribe, getState, () => null);
}

export function useMe() {
  const s = useLeasesState();
  return s ? member(s) : null;
}

/** Wraps a mutation: pending flag, toast on error, optional success toast. */
export function useAction() {
  const [pending, setPending] = useState<string | null>(null);
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setPending(key);
    try {
      const out = await fn();
      if (success) toast("success", success);
      // undefined means "failed" to callers, so a void success is reported as true
      return (out === undefined ? true : out) as T;
    } catch (e) {
      const msg = e instanceof LeaseError || e instanceof Error ? e.message : "Something went wrong.";
      toast("danger", msg);
      return undefined;
    } finally {
      setPending(null);
    }
  }, []);
  return { run, pending };
}

/** Read/write one query-string parameter (filters, tabs, sort live in the URL). */
export function useQueryParam(key: string, fallback = ""): [string, (v: string) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const value = sp.get(key) ?? fallback;
  const set = useCallback((v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (!v || v === fallback) next.delete(key);
    else next.set(key, v);
    const qs = next.toString();
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  }, [sp, router, path, key, fallback]);
  return [value, set];
}

export function can(role: string | undefined, action: "prepare" | "review" | "admin") {
  if (action === "prepare") return role === "administrator" || role === "analyst";
  if (action === "review") return role === "administrator" || role === "reviewer";
  return role === "administrator";
}
