import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { getBackendUrl } from "./env";
import { cookies } from "next/headers";

/** Decode a JWT payload and return the `exp` claim as milliseconds, or undefined. */
function decodeTokenExp(token: string): number | undefined {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return undefined;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    return typeof payload.exp === "number" ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Called from the NextAuth jwt callback when the stored access token is expired.
 * Reads the ecl_refresh cookie server-side, calls the backend refresh endpoint
 * directly (Vercel → Render), stores the rotated refresh cookie, and returns
 * the new access token string — or null if the refresh failed.
 */
async function serverRefreshToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const refreshValue = cookieStore.get("ecl_refresh")?.value;
    if (!refreshValue) return null;

    const res = await fetch(`${getBackendUrl()}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `ecl_refresh=${refreshValue}` },
    });
    if (!res.ok) return null;

    const body = (await res.json()) as { data?: { access_token?: string } };
    const newAccessToken = body?.data?.access_token ?? null;
    if (!newAccessToken) return null;

    // Persist the rotated ecl_refresh cookie so subsequent server-side requests
    // still have a valid refresh token. The cookie is writable here because the
    // NextAuth jwt callback runs inside a Route Handler context (/api/auth/*).
    const setCookieHeader = res.headers.get("set-cookie");
    if (setCookieHeader) {
      const valueMatch = setCookieHeader.match(/ecl_refresh=([^;]+)/);
      const maxAgeMatch = setCookieHeader.match(/max-age=(\d+)/i);
      if (valueMatch) {
        cookieStore.set("ecl_refresh", valueMatch[1], {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          ...(maxAgeMatch ? { maxAge: parseInt(maxAgeMatch[1]) } : {}),
        });
      }
    }

    return newAccessToken;
  } catch {
    return null;
  }
}

function buildUserFromAuthData(data: {
  access_token: string;
  user: Record<string, unknown>;
}) {
  const { access_token, user } = data;
  return {
    id: user.id as string,
    email: user.email as string,
    name: user.name as string,
    accessToken: access_token,
    tenantId: (user.tenant_id ?? user.tenantId) as string,
    tenantName: (user.tenant_name ?? user.tenantName) as string,
    role: user.role as string,
    currency: (user.currency as string) ?? "USD",
    isEmailVerified: (user.is_email_verified ?? user.isEmailVerified) as boolean,
    isPlatformAdmin: (user.is_platform_admin ?? user.isPlatformAdmin ?? false) as boolean,
  };
}

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        remember: { label: "Remember", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const res = await fetch(`${getBackendUrl()}/api/v1/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
              remember: credentials.remember === "true",
            }),
          });

          if (!res.ok) return null;

          // Forward the ecl_refresh cookie from Render to the browser.
          // The login fetch is server-side (Vercel → Render directly), so the
          // Set-Cookie header is received by Vercel's server and silently dropped.
          // Without this, the browser never gets a refresh token and is logged out
          // after the 15-minute access token expires.
          const rawSetCookie = res.headers.get("set-cookie");
          if (rawSetCookie) {
            try {
              const semiIdx = rawSetCookie.indexOf(";");
              const pair = semiIdx === -1 ? rawSetCookie : rawSetCookie.substring(0, semiIdx);
              const eqIdx = pair.indexOf("=");
              const cookieName = pair.substring(0, eqIdx);
              const cookieValue = pair.substring(eqIdx + 1);

              const maxAgePart = rawSetCookie
                .split(";")
                .map((s) => s.trim())
                .find((s) => /^max-age=/i.test(s));
              const maxAge = maxAgePart ? parseInt(maxAgePart.split("=")[1]) : undefined;

              const cookieStore = await cookies();
              cookieStore.set(cookieName, cookieValue, {
                httpOnly: true,
                secure: true,
                sameSite: "lax",
                path: "/",
                ...(maxAge !== undefined ? { maxAge } : {}),
              });
            } catch {
              // cookies() unavailable in this context — non-fatal
            }
          }

          const body = await res.json();

          if (body.mfa_required || body.data?.mfa_required) {
            const challenge = body.challenge_token ?? body.data?.challenge_token ?? "";
            throw new Error(`MFA_REQUIRED:${challenge}`);
          }

          return buildUserFromAuthData(body.data);
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("MFA_REQUIRED:")) throw e;
          return null;
        }
      },
    }),
    Credentials({
      id: "post-registration",
      credentials: {
        preAuthData: { label: "Pre-Auth Data", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.preAuthData) return null;
        try {
          const data = JSON.parse(credentials.preAuthData as string) as {
            access_token: string;
            user: Record<string, unknown>;
          };
          return buildUserFromAuthData(data);
        } catch {
          return null;
        }
      },
    }),
    Credentials({
      id: "mfa-credentials",
      credentials: {
        challengeToken: { label: "Challenge Token", type: "text" },
        code: { label: "MFA Code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.challengeToken || !credentials?.code) return null;
        try {
          const res = await fetch(`${getBackendUrl()}/api/v1/auth/mfa/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              challenge_token: credentials.challengeToken,
              code: credentials.code,
            }),
          });
          if (!res.ok) return null;
          const body = await res.json();
          return buildUserFromAuthData(body.data);
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      if (trigger === "update" && session) {
        const s = session as Record<string, unknown>;
        if (typeof s.accessToken === "string") {
          token.accessToken = s.accessToken;
          token.accessTokenExpiresAt = decodeTokenExp(s.accessToken);
        }
        if (typeof s.tenantId === "string") token.tenantId = s.tenantId;
        if (typeof s.tenantName === "string") token.tenantName = s.tenantName;
        if (typeof s.role === "string") token.role = s.role;
        if (typeof s.currency === "string") token.currency = s.currency;
        if (typeof s.isEmailVerified === "boolean") token.isEmailVerified = s.isEmailVerified;
      }
      if (user) {
        const u = user as Record<string, unknown>;
        token.accessToken = u.accessToken as string;
        token.accessTokenExpiresAt = decodeTokenExp(u.accessToken as string);
        token.tenantId = u.tenantId as string;
        token.tenantName = u.tenantName as string;
        token.role = u.role as string;
        token.currency = (u.currency as string) ?? "USD";
        token.isEmailVerified = u.isEmailVerified as boolean;
        token.isPlatformAdmin = u.isPlatformAdmin as boolean;
      }

      // Server-side proactive refresh: if the access token is expired (or expiring
      // within 30 s), refresh it directly from the server using the ecl_refresh cookie.
      // This prevents RSC page renders from receiving a stale token and showing the
      // "Access token has expired" error in the UI before client-side hydration.
      // Skip on sign-in / explicit update — those tokens are always freshly issued.
      const expiresAt = token.accessTokenExpiresAt as number | undefined;
      if (expiresAt && !user && trigger !== "update" && Date.now() > expiresAt - 30_000) {
        const newToken = await serverRefreshToken();
        if (newToken) {
          token.accessToken = newToken;
          token.accessTokenExpiresAt = decodeTokenExp(newToken);
        }
      }

      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      if (session.user) {
        session.user.tenantId = token.tenantId as string;
        session.user.tenantName = token.tenantName as string;
        session.user.role = token.role as string;
        session.user.currency = (token.currency as string) ?? "USD";
        session.user.isEmailVerified = token.isEmailVerified as boolean;
        session.user.isPlatformAdmin = token.isPlatformAdmin as boolean;
      }
      return session;
    },
  },
});
