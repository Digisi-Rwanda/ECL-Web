import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthLogo } from "@/components/auth/AuthLogo";
import { MfaForm } from "@/components/auth/MfaForm";

export const metadata: Metadata = {
  title: "Two-factor authentication — Ledgerline",
};

interface MfaPageProps {
  searchParams: Promise<{ t?: string }>;
}

export default async function MfaPage({ searchParams }: MfaPageProps) {
  const { t: challengeToken = "" } = await searchParams;
  return (
    <AuthLayout>
      <AuthLogo />
      <MfaForm challengeToken={challengeToken} />
    </AuthLayout>
  );
}
