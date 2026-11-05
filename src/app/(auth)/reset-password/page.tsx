import { redirect } from "next/navigation";
import { ResetForm } from "@/components/auth/ResetForm";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthLogo } from "@/components/auth/AuthLogo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set new password — Ledgerline",
};

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const params = await searchParams;

  if (!params.token) {
    redirect("/auth/error?reason=expired");
  }

  return (
    <AuthLayout>
      <AuthLogo />
      <ResetForm token={params.token} />
    </AuthLayout>
  );
}
