import Link from "next/link";
import { Grid3X3 } from "lucide-react";

export function AuthLogo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 font-semibold text-base no-underline"
      style={{ color: "var(--text)" }}
    >
      <span
        className="size-8 rounded-lg flex items-center justify-center"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        <Grid3X3 className="size-4" />
      </span>
      <span>Ledgerline</span>
    </Link>
  );
}
