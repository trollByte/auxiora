const BASE = '/api/v1/dashboard';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 401) {
    window.location.href = '/dashboard/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  checkAuth: () => fetchApi<{ authenticated: boolean }>('/auth/check'),
  login: (pw: string) =>
    fetchApi<{ success: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password: pw }),
    }),
  logout: () => fetchApi<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  getBehaviors: () => fetchApi<{ data: any[] }>('/behaviors'),
  patchBehavior: (id: string, updates: Record<string, unknown>) =>
    fetchApi<{ data: any }>(`/behaviors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  deleteBehavior: (id: string) =>
    fetchApi<{ data: any }>(`/behaviors/${id}`, { method: 'DELETE' }),
  getWebhooks: () => fetchApi<{ data: any[] }>('/webhooks'),
  patchWebhook: (id: string, updates: Record<string, unknown>) =>
    fetchApi<{ data: any }>(`/webhooks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  deleteWebhook: (id: string) =>
    fetchApi<{ data: any }>(`/webhooks/${id}`, { method: 'DELETE' }),
  getSessions: () => fetchApi<{ data: any[] }>('/sessions'),
  getAudit: (params?: { type?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.type) query.set('type', params.type);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return fetchApi<{ data: any[] }>(`/audit${qs ? `?${qs}` : ''}`);
  },
  getStatus: () => fetchApi<{ data: any }>('/status'),
  getSetupStatus: () =>
    fetchApi<{ needsSetup: boolean; completedSteps: string[]; vaultUnlocked: boolean; dashboardPasswordSet: boolean }>('/setup/status'),
  setupVault: (password: string) =>
    fetchApi<{ success: boolean }>('/setup/vault', { method: 'POST', body: JSON.stringify({ password }) }),
  setupDashboardPassword: (password: string) =>
    fetchApi<{ success: boolean }>('/setup/dashboard-password', { method: 'POST', body: JSON.stringify({ password }) }),
  setupIdentity: (name: string, pronouns: string) =>
    fetchApi<{ success: boolean }>('/setup/identity', { method: 'POST', body: JSON.stringify({ name, pronouns }) }),
  getSetupTemplates: () =>
    fetchApi<{ data: Array<{ id: string; name: string; description: string; preview: string }> }>('/setup/templates'),
  setupPersonality: (template: string) =>
    fetchApi<{ success: boolean }>('/setup/personality', { method: 'POST', body: JSON.stringify({ template }) }),
  setupProvider: (provider: string, apiKey?: string, endpoint?: string) =>
    fetchApi<{ success: boolean }>('/setup/provider', { method: 'POST', body: JSON.stringify({ provider, apiKey, endpoint }) }),
  setupChannels: (channels: Array<{ type: string; enabled: boolean; credentials?: Record<string, string> }>) =>
    fetchApi<{ success: boolean }>('/setup/channels', { method: 'POST', body: JSON.stringify({ channels }) }),
  completeSetup: () =>
    fetchApi<{ success: boolean }>('/setup/complete', { method: 'POST' }),

  // Settings API
  getModels: () => fetchApi<{ providers: any[]; routing: any; cost: any }>('/models'),
  getIdentity: () => fetchApi<{ data: { name: string; pronouns: string } }>('/identity'),
  updateIdentity: (name: string, pronouns: string) =>
    fetchApi<{ success: boolean }>('/identity', {
      method: 'POST',
      body: JSON.stringify({ name, pronouns }),
    }),
  getTemplates: () =>
    fetchApi<{ data: Array<{ id: string; name: string; description: string; preview: string }> }>('/personality/templates'),
  updatePersonality: (template: string) =>
    fetchApi<{ success: boolean }>('/personality', {
      method: 'POST',
      body: JSON.stringify({ template }),
    }),
  updateProvider: (provider: string, apiKey?: string, endpoint?: string) =>
    fetchApi<{ success: boolean }>('/provider', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey, endpoint }),
    }),
  configureProvider: (provider: string, apiKey?: string, endpoint?: string) =>
    fetchApi<{ success: boolean }>('/provider/configure', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey, endpoint }),
    }),
  updateRouting: (primary: string, fallback?: string) =>
    fetchApi<{ success: boolean }>('/provider/routing', {
      method: 'POST',
      body: JSON.stringify({ primary, fallback }),
    }),
  setProviderModel: (provider: string, model: string) =>
    fetchApi<{ success: boolean }>('/provider/model', {
      method: 'POST',
      body: JSON.stringify({ provider, model }),
    }),
  getSessionMessages: () =>
    fetchApi<{ data: Array<{ id: string; role: string; content: string; timestamp: number }> }>('/session/messages'),
  getChannels: () => fetchApi<{ data: { connected: string[]; configured: Array<{ type: string; enabled: boolean }> } }>('/channels'),
  updateChannels: (channels: Array<{ type: string; enabled: boolean; credentials?: Record<string, string> }>) =>
    fetchApi<{ success: boolean }>('/channels', {
      method: 'POST',
      body: JSON.stringify({ channels }),
    }),
  changeDashboardPassword: (oldPassword: string, newPassword: string) =>
    fetchApi<{ success: boolean }>('/security/dashboard-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    }),
  changeVaultPassword: (newPassword: string) =>
    fetchApi<{ success: boolean }>('/security/vault-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),
};
