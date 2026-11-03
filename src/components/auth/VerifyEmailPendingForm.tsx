"use client";

import { useTransition, useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResendCountdown } from "@/components/auth/ResendCountdown";
import { resendVerificationAction } from "@/app/actions/auth";

interface Props {
  email: string;
}

export function VerifyEmailPendingForm({ email }: Props) {
  const [isPending, startTransition] = useTransition();
  const [resendKey, setResendKey] = useState(0);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);

  function handleResend() {
    if (!email) return;
    setResendError(null);
    setResendSuccess(false);
    startTransition(async () => {
      const result = await resendVerificationAction(email);
      if (result?.error) {
        setResendError(result.error);
        return;
      }
      setResendSuccess(true);
      setResendKey((k) => k + 1);
    });
  }

  return (
    <AuthCard>
      <div className="flex flex-col items-center text-center">
        <div
          className="size-12 rounded-xl flex items-center justify-center mb-5"
          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
        >
          <Mail className="size-6" />
        </div>

        <h2
          className="font-semibold"
          style={{ fontSize: "var(--fs-h1)", letterSpacing: "-0.01em", color: "var(--text)" }}
        >
          Check your email
        </h2>

        <p className="mt-2 text-sm max-w-[34ch]" style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
          We sent a verification link to{" "}
          {email ? (
            <strong style={{ color: "var(--text)" }}>{email}</strong>
          ) : (
            "your email address"
          )}
          . Click it to verify your account and continue to your dashboard.
        </p>

        <ResendCountdown key={resendKey} onResend={handleResend} />

        {isPending && (
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Sending…
          </p>
        )}

        {resendSuccess && !isPending && (
          <p className="mt-2 text-sm" style={{ color: "var(--success, #16a34a)" }}>
            Verification email sent. Check your inbox.
          </p>
        )}

        {resendError && (
          <p className="mt-2 text-sm" style={{ color: "var(--destructive, #dc2626)" }}>
            {resendError}
          </p>
        )}

        <Link
          href="/sign-in"
          className="inline-flex items-center gap-1.5 text-sm font-medium no-underline mt-5 hover:underline"
          style={{ color: "var(--text-muted)" }}
        >
          <ArrowLeft className="size-3.5" />
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}
