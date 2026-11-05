import { LeasesProvider } from "@/components/leases/LeasesProvider";

export default function LeasesLayout({ children }: { children: React.ReactNode }) {
  return <LeasesProvider>{children}</LeasesProvider>;
}
