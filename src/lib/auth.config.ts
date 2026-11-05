import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/sign-in",
    error: "/auth/error",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const protectedPrefixes = [
        "/dashboard",
        "/ecl",
        "/leases",
        "/admin",
        "/settings",
        "/platform",
        "/account",
      ];

      if (nextUrl.pathname.startsWith("/platform")) {
        const isPlatformAdmin = (auth?.user as Record<string, unknown> | undefined)
          ?.isPlatformAdmin as boolean | undefined;
        if (!isPlatformAdmin) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
      }

      if (nextUrl.pathname.startsWith("/admin")) {
        const role = ((auth?.user as Record<string, unknown> | undefined)?.role as string | undefined)?.toLowerCase();
        if (role === "reviewer") {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
      }
      const isProtected = protectedPrefixes.some((p) =>
        nextUrl.pathname.startsWith(p)
      );

      if (isProtected && !isLoggedIn) return false;

      const isEmailVerified = (auth?.user as Record<string, unknown> | undefined)
        ?.isEmailVerified as boolean | undefined;
      const onVerifyEmailPage = nextUrl.pathname.startsWith("/verify-email");

      // Email not verified → block protected routes, send to pending page
      if (isLoggedIn && isProtected && isEmailVerified === false && !onVerifyEmailPage) {
        const email = encodeURIComponent(
          (auth?.user as { email?: string } | undefined)?.email ?? ""
        );
        return Response.redirect(new URL(`/verify-email-pending?email=${email}`, nextUrl));
      }

      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
