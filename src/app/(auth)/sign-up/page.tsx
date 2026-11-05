import { SignUpForm } from "@/components/auth/SignUpForm";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthLogo } from "@/components/auth/AuthLogo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create workspace — Ledgerline",
};

export default function SignUpPage() {
  return (
    <AuthLayout wide>
      <AuthLogo />
      <SignUpForm />
    </AuthLayout>
  );
}
