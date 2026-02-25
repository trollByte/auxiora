/** Cloud signup request body */
export interface CloudSignupRequest {
  email: string;
  name: string;
  password: string;
  plan?: string;
}

/** Cloud login request body */
export interface CloudLoginRequest {
  email: string;
  password: string;
}

/** Cloud tenant plan change request */
export interface CloudPlanChangeRequest {
  plan: string;
}

/** Cloud payment method request */
export interface CloudPaymentMethodRequest {
  token: string;
}

/** Cloud tenant response */
export interface CloudTenantResponse {
  id: string;
  name: string;
  email: string;
  plan: string;
  status: string;
  createdAt: string;
}

/** Cloud usage response */
export interface CloudUsageResponse {
  usage: Record<string, number>;
  quotas: Record<string, number>;
}

/** Cloud billing response */
export interface CloudBillingResponse {
  plan: string;
  invoices: Array<{
    id: string;
    amount: number;
    status: string;
    created: string;
  }>;
}

/** Cloud dependency interface for the dashboard router */
export interface CloudDeps {
  signup(email: string, name: string, password: string, plan?: string): Promise<{ tenantId: string; token: string }>;
  login(email: string, password: string): Promise<{ tenantId: string; token: string } | null>;
  getTenant(tenantId: string): Promise<CloudTenantResponse | null>;
  changePlan(tenantId: string, plan: string): Promise<{ success: boolean }>;
  getUsage(tenantId: string): Promise<CloudUsageResponse>;
  getBilling(tenantId: string): Promise<CloudBillingResponse>;
  addPaymentMethod(tenantId: string, token: string): Promise<{ success: boolean }>;
  exportData(tenantId: string): Promise<{ downloadUrl: string }>;
  deleteTenant(tenantId: string): Promise<{ success: boolean }>;
}
