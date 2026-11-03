"use server";

import { signIn } from "@/lib/auth";
import {
  LoginSchema,
  SignUpSchema,
  ForgotSchema,
  ResetSchema,
  InviteSchema,
} from "@/lib/auth-schema";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { getBackendUrl } from "@/lib/env";

export type AuthFormState =
  | { error?: string; success?: boolean; email?: string; challengeToken?: string }
  | undefined;

// Helper: parse checkbox value from FormData (value is "on" or null)
function parseBool(val: FormDataEntryValue | null): boolean {
  return val === "on" || val === "true";
}

export async function loginAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
    remember: parseBool(formData.get("remember")),
  };

  const validated = LoginSchema.safeParse(raw);
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Invalid credentials." };
  }

  try {
    await signIn("credentials", {
      email: validated.data.email,
      password: validated.data.password,
      remember: String(validated.data.remember),
      redirectTo: "/dashboard",
    });
  } catch (e) {
    // NextAuth v5 beta may not always pass instanceof AuthError across
    // module boundaries — use the type property as the primary discriminator.
    const errType =
      e != null && typeof e === "object" && "type" in e
        ? (e as { type: string }).type
        : "";

    if (e instanceof AuthError || errType) {
      if (errType === "CallbackRouteError") {
        const cause = (e as unknown as { cause?: { err?: Error } }).cause?.err;
        const msg = cause?.message ?? "";
        if (msg.startsWith("MFA_REQUIRED:")) {
          return { error: "MFA_REQUIRED", challengeToken: msg.slice("MFA_REQUIRED:".length) };
        }
        return { error: "Sign-in failed. Please try again." };
      }
      if (errType === "CredentialsSignin") {
        return { error: "Email or password incorrect." };
      }
      return { error: "Something went wrong. Please try again." };
    }
    throw e;
  }
}

export async function mfaAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const challengeToken = formData.get("challengeToken") as string | null;
  const code = formData.get("code") as string | null;
  if (!challengeToken || !code) return { error: "Invalid request." };

  try {
    await signIn("mfa-credentials", {
      challengeToken,
      code,
      redirectTo: "/dashboard",
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: "Invalid or expired code. Try again." };
    }
    throw e;
  }
}

export async function signUpAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const raw = {
    companyName: formData.get("companyName"),
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
    terms: parseBool(formData.get("terms")),
  };

  const validated = SignUpSchema.safeParse(raw);
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Please check your inputs." };
  }

  const res = await fetch(`${getBackendUrl()}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company_name: validated.data.companyName,
      email: validated.data.email,
      name: validated.data.name,
      password: validated.data.password,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, string>;
    const code = err.code ?? "";
    const field = err.field ?? "";
    if (code === "EMAIL_TAKEN" || field === "email") {
      return { error: "An account with this email already exists." };
    }
    if (code === "SLUG_TAKEN" || field === "company_name") {
      return { error: "A workspace with this company name already exists." };
    }
    if (code === "PASSWORD_PWNED") {
      return { error: "That password has appeared in a data breach. Please choose a different one." };
    }
    if (code === "PASSWORD_MISSING_MIX") {
      return { error: "Password must contain both letters and numbers." };
    }
    if (code === "PASSWORD_TOO_SHORT") {
      return { error: "Password must be at least 8 characters." };
    }
    if (code === "PASSWORD_CONTAINS_FORBIDDEN") {
      return { error: "Password cannot contain your name or company name." };
    }
    return { error: err.detail ?? "Registration failed. Please try again." };
  }

  // Use tokens from the registration response directly — avoids a second login API
  // call that would race the uncommitted registration transaction.
  const body = await res.json() as { data: { access_token: string; user: Record<string, unknown> } };

  try {
    await signIn("post-registration", {
      preAuthData: JSON.stringify(body.data),
      redirectTo: `/verify-email-pending?email=${encodeURIComponent(validated.data.email)}`,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: "Registration succeeded but sign-in failed. Please log in." };
    }
    throw e;
  }
}

export async function forgotAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const raw = { email: formData.get("email") };
  const validated = ForgotSchema.safeParse(raw);
  if (!validated.success) {
    return { error: "Please enter a valid email address." };
  }

  await fetch(`${getBackendUrl()}/api/v1/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: validated.data.email }),
  }).catch(() => {});

  // Always succeed — do not reveal email existence
  return { success: true, email: validated.data.email };
}

export async function resetAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const raw = {
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  };

  const validated = ResetSchema.safeParse(raw);
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Please check your inputs." };
  }

  const res = await fetch(`${getBackendUrl()}/api/v1/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: validated.data.token, password: validated.data.password }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, string>;
    if (err.code === "INVALID_RESET_TOKEN") {
      return { error: "This reset link is invalid, already used or expired. Request a new one." };
    }
    if (res.status === 429) {
      return { error: "Too many attempts. Wait 15 minutes, then try again." };
    }
    // Password rule violations (contains your name, found in a data breach, …)
    // come back with a user-facing detail; show it instead of a generic error.
    return { error: err.detail || "Password reset failed. Please try again." };
  }

  return { success: true };
}

export async function inviteAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const raw = {
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
    terms: parseBool(formData.get("terms")),
  };

  const validated = InviteSchema.safeParse(raw);
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Please check your inputs." };
  }

  // Validate the invite token first
  const validateRes = await fetch(
    `${getBackendUrl()}/api/v1/invites/validate/${encodeURIComponent(validated.data.token)}`,
  );
  if (!validateRes.ok) {
    return { error: "Invalid or expired invite link." };
  }

  // Accept the invite (creates account)
  const acceptRes = await fetch(`${getBackendUrl()}/api/v1/invites/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: validated.data.token,
      name: validated.data.name,
      password: validated.data.password,
    }),
  });

  if (!acceptRes.ok) {
    const err = await acceptRes.json().catch(() => ({}));
    return { error: (err as Record<string, string>).detail ?? "Failed to activate your account. Please try again." };
  }

  redirect("/sign-in?activated=1");
}

export async function verifyEmailAction(token: string): Promise<AuthFormState> {
  const res = await fetch(
    `${getBackendUrl()}/api/v1/auth/verify-email/${encodeURIComponent(token)}`
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, string>;
    if (err.code === "INVALID_VERIFY_TOKEN") {
      return { error: "This verification link has expired. Please request a new one." };
    }
    return { error: err.detail || "Verification failed. Please try again." };
  }
  return { success: true };
}

export async function resendVerificationAction(email: string): Promise<AuthFormState> {
  const res = await fetch(`${getBackendUrl()}/api/v1/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    if (res.status === 429) {
      return { error: "Too many requests. Please wait before requesting another email." };
    }
    return { error: "Could not resend verification email. Please try again." };
  }

  return { success: true };
}
