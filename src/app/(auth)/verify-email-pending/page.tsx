import { VerifyEmailPendingForm } from "@/components/auth/VerifyEmailPendingForm";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthLogo } from "@/components/auth/AuthLogo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify your email — Ledgerline",
};

export default async function VerifyEmailPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email = "" } = await searchParams;
  return (
    <AuthLayout>
      <AuthLogo />
      <VerifyEmailPendingForm email={decodeURIComponent(email)} />
    </AuthLayout>
  );
}
