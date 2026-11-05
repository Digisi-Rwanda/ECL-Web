import type { Metadata } from "next";
import { CloseListView } from "@/components/leases/views/CloseView";

export const metadata: Metadata = { title: "Period close — Leases — Ledgerline" };

export default function Page() {
  return <CloseListView />;
}
