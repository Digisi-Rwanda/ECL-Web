import { ForgotForm } from "@/components/auth/ForgotForm";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthLogo } from "@/components/auth/AuthLogo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password — Ledgerline",
};

export default function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <AuthLogo />
      <ForgotForm />
    </AuthLayout>
  );
}
