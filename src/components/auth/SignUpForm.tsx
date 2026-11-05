"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthFormError } from "@/components/auth/AuthFormError";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { TermsCheckbox } from "@/components/auth/TermsCheckbox";
import { signUpAction, type AuthFormState } from "@/app/actions/auth";
import { scorePassword } from "@/lib/use-password-strength";

export function SignUpForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signUpAction,
    undefined
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [termsChecked, setTermsChecked] = useState(false);
  const [name, setName] = useState("");

  const { score, rules } = scorePassword(password, [
    name.split(/\s+/)[0],
    "ecl",
    "platform",
  ]);
  const mismatch = confirm.length > 0 && password !== confirm;
  const submitReady =
    score >= 3 &&
    rules.len8 &&
    rules.mix &&
    password === confirm &&
    termsChecked &&
    !pending;

  return (
    <AuthCard>
      <h2
        className="font-semibold"
        style={{ fontSize: "var(--fs-h1)", letterSpacing: "-0.01em", color: "var(--text)" }}
      >
        Create your workspace
      </h2>
      <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
        Set up Ledgerline for your institution.
      </p>

      <form action={action} className="flex flex-col gap-4 mt-6">
        <AuthFormError message={state?.error} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="companyName" style={{ fontWeight: 500, color: "var(--text)" }}>
            Company name
          </Label>
          <Input
            id="companyName"
            name="companyName"
            placeholder="Savanna Bank PLC"
            autoComplete="organization"
            disabled={pending}
            required={false}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" style={{ fontWeight: 500, color: "var(--text)" }}>
            Work email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@savannabank.co.ke"
            autoComplete="email"
            disabled={pending}
            required={false}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name" style={{ fontWeight: 500, color: "var(--text)" }}>
            Your full name
          </Label>
          <Input
            id="name"
            name="name"
            placeholder="Tendai Mwangi"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            required={false}
          />
        </div>

        <div className="flex flex-col gap-1">
          <PasswordInput
            id="password"
            name="password"
            label="Password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
          />
          <PasswordStrength
            password={password}
            forbidden={[name.split(/\s+/)[0], "ecl", "platform"]}
            showRules
          />
        </div>

        <PasswordInput
          id="confirm"
          name="confirm"
          label="Confirm password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={pending}
          error={mismatch ? "Passwords do not match" : undefined}
        />

        <TermsCheckbox onCheckedChange={setTermsChecked} />

        <Button
          type="submit"
          size="lg"
          disabled={!submitReady}
          className="w-full mt-1"
        >
          {pending ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Creating workspace…
            </>
          ) : (
            "Create workspace"
          )}
        </Button>
      </form>

      <p className="text-center mt-5 text-sm" style={{ color: "var(--text-muted)" }}>
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="font-medium no-underline hover:underline"
          style={{ color: "var(--accent)" }}
        >
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
