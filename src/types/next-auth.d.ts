import "@auth/core/types";
import "@auth/core/jwt";

declare module "@auth/core/types" {
  interface Session {
    accessToken: string;
    user: {
      id: string;
      email: string;
      name: string;
      tenantId: string;
      tenantName: string;
      role: string;
      currency: string;
      isEmailVerified: boolean;
      isPlatformAdmin: boolean;
    };
  }

  interface User {
    accessToken?: string;
    tenantId?: string;
    tenantName?: string;
    role?: string;
    currency?: string;
    isEmailVerified?: boolean;
    isPlatformAdmin?: boolean;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    accessToken?: string;
    accessTokenExpiresAt?: number;
    tenantId?: string;
    tenantName?: string;
    role?: string;
    currency?: string;
    isEmailVerified?: boolean;
    isPlatformAdmin?: boolean;
  }
}
