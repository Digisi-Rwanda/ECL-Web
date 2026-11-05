import { LoginForm } from "@/components/auth/LoginForm";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthLogo } from "@/components/auth/AuthLogo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in — Ledgerline",
};

export default function SignInPage() {
  return (
    <AuthLayout>
      <AuthLogo />
      <LoginForm />
    </AuthLayout>
  );
}
