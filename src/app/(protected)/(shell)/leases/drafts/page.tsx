import type { Metadata } from "next";
import { Suspense } from "react";
import { RegisterView } from "@/components/leases/views/RegisterView";

export const metadata: Metadata = { title: "Drafts — Leases — Ledgerline" };

export default function Page() {
  return <Suspense><RegisterView drafts /></Suspense>;
}
