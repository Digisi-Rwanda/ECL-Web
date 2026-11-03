"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { CheckCircle, XCircle, ArrowLeft, Loader } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { verifyEmailAction } from "@/app/actions/auth";

interface Props {
  token: string;
}

type Status = "loading" | "success" | "error";

export function VerifyEmailHandler({ token }: Props) {
  const { data: session, update, status: sessionStatus } = useSession();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (sessionStatus === "loading") return;

    if (!token) {
      setErrorMessage("Missing verification token. Please use the link from your email.");
      setStatus("error");
      return;
    }

    let cancelled = false;

    async function verify() {
      const result = await verifyEmailAction(token);
      if (cancelled) return;

      if (result?.error) {
        setErrorMessage(result.error);
        setStatus("error");
        return;
      }

      setStatus("success");

      if (session?.user) {
        await update({ isEmailVerified: true });
        router.push("/dashboard");
        return;
      }

      router.push("/sign-in?verified=1");
    }

    void verify();
    return () => { cancelled = true; };
  }, [token, sessionStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === "loading") {
    return (
      <AuthCard>
        <div className="flex flex-col items-center text-center gap-4 py-4">
          <Loader
            className="size-8 animate-spin"
            style={{ color: "var(--accent)" }}
          />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Verifying your email…
          </p>
        </div>
      </AuthCard>
    );
  }

  if (status === "success") {
    return (
      <AuthCard>
        <div className="flex flex-col items-center text-center gap-3 py-2">
          <CheckCircle className="size-10" style={{ color: "var(--success, #16a34a)" }} />
          <h2
            className="font-semibold"
            style={{ fontSize: "var(--fs-h1)", letterSpacing: "-0.01em", color: "var(--text)" }}
          >
            Email verified
          </h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {session?.user
              ? "Redirecting you to your dashboard…"
              : "Sign in to continue to your dashboard."}
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="flex flex-col items-center text-center gap-3 py-2">
        <XCircle className="size-10" style={{ color: "var(--destructive, #dc2626)" }} />
        <h2
          className="font-semibold"
          style={{ fontSize: "var(--fs-h1)", letterSpacing: "-0.01em", color: "var(--text)" }}
        >
          Verification failed
        </h2>
        <p className="text-sm max-w-[32ch]" style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
          {errorMessage}
        </p>
        <Link
          href="/verify-email-pending"
          className="text-sm font-medium no-underline hover:underline"
          style={{ color: "var(--accent)" }}
        >
          Request a new verification link
        </Link>
        <Link
          href="/sign-in"
          className="inline-flex items-center gap-1.5 text-sm font-medium no-underline mt-2 hover:underline"
          style={{ color: "var(--text-muted)" }}
        >
          <ArrowLeft className="size-3.5" />
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}
