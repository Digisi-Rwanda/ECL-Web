import { redirect } from "next/navigation";
import { InviteForm } from "@/components/auth/InviteForm";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthLogo } from "@/components/auth/AuthLogo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accept invite — Ledgerline",
};

interface Props {
  searchParams: Promise<{ token?: string; org?: string; inviter?: string }>;
}

export default async function InvitePage({ searchParams }: Props) {
  const params = await searchParams;

  if (!params.token) {
    redirect("/auth/error?reason=expired");
  }

  return (
    <AuthLayout wide>
      <AuthLogo />
      <InviteForm
        token={params.token}
        orgName={params.org ?? "Ledgerline"}
        inviterName={params.inviter ?? "your administrator"}
      />
    </AuthLayout>
  );
}
