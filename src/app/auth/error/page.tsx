import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthLogo } from "@/components/auth/AuthLogo";
import { AuthCard } from "@/components/auth/AuthCard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Link expired — Ledgerline",
};

interface Props {
  searchParams: Promise<{ reason?: string; error?: string }>;
}

export default async function AuthErrorPage({ searchParams }: Props) {
  const params = await searchParams;
  const isExpired =
    params.reason === "expired" || params.error === "Configuration";

  return (
    <AuthLayout>
      <AuthLogo />
      <AuthCard>
        <div className="flex flex-col items-center text-center">
          <div
            className="size-12 rounded-xl flex items-center justify-center mb-5"
            style={{ background: "var(--warning-subtle)", color: "var(--warning)" }}
          >
            <AlertTriangle className="size-6" />
          </div>

          <h2
            className="font-semibold"
            style={{ fontSize: "var(--fs-h1)", letterSpacing: "-0.01em", color: "var(--text)" }}
          >
            {isExpired ? "This link has expired" : "Authentication error"}
          </h2>

          <p className="mt-2 text-sm max-w-[32ch]" style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
            {isExpired
              ? "For security, password reset and invite links expire after 1 hour."
              : "Something went wrong with your sign-in. Please try again."}
          </p>

          <div className="flex flex-col gap-3 w-full mt-6">
            <Button asChild size="lg" className="w-full">
              <Link href="/forgot-password">Request a new reset link</Link>
            </Button>

            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Were you invited?{" "}
              <a
                href="mailto:security@eclplatform.io"
                className="font-medium no-underline hover:underline"
                style={{ color: "var(--accent)" }}
              >
                Ask for a new invite
              </a>
            </p>
          </div>
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
