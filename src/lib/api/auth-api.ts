import { apiFetch } from "./client";

export interface SwitchTenantResult {
  access_token: string;
  expires_in: number;
  tenant_id: string;
  tenant_name: string;
  role: string;
  currency: string;
}

export async function switchTenant(token: string, tenantId: string): Promise<SwitchTenantResult> {
  return apiFetch<SwitchTenantResult>("/auth/switch-tenant", {
    method: "POST",
    token,
    body: JSON.stringify({ tenant_id: tenantId }),
  });
}
