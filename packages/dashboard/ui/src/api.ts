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
  createBehavior: (input: Record<string, unknown>) =>
    fetchApi<{ data: any }>('/behaviors', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getWebhooks: () => fetchApi<{ data: any[] }>('/webhooks'),
  patchWebhook: (id: string, updates: Record<string, unknown>) =>
    fetchApi<{ data: any }>(`/webhooks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  deleteWebhook: (id: string) =>
    fetchApi<{ data: any }>(`/webhooks/${id}`, { method: 'DELETE' }),
  createWebhook: (input: Record<string, unknown>) =>
    fetchApi<{ data: any }>('/webhooks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
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
    fetchApi<{ needsSetup: boolean; completedSteps: string[]; vaultUnlocked: boolean; dashboardPasswordSet: boolean; agentName: string }>('/setup/status'),
  setupVault: (password: string) =>
    fetchApi<{ success: boolean }>('/setup/vault', { method: 'POST', body: JSON.stringify({ password }) }),
  setupDashboardPassword: (password: string) =>
    fetchApi<{ success: boolean }>('/setup/dashboard-password', { method: 'POST', body: JSON.stringify({ password }) }),
  setupIdentity: (name: string, pronouns: string, vibe?: string) =>
    fetchApi<{ success: boolean }>('/setup/identity', { method: 'POST', body: JSON.stringify({ name, pronouns, vibe }) }),
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
  getPersonality: () =>
    fetchApi<{ data: { template: { id: string; name: string } | null } }>('/personality'),
  getTemplates: () =>
    fetchApi<{ data: Array<{ id: string; name: string; description: string; preview: string }> }>('/personality/templates'),
  updatePersonality: (template: string) =>
    fetchApi<{ success: boolean }>('/personality', {
      method: 'POST',
      body: JSON.stringify({ template }),
    }),
  getPersonalityFull: () =>
    fetchApi<{ data: {
      name: string; pronouns: string; avatar: string | null; vibe: string;
      tone: { warmth: number; directness: number; humor: number; formality: number };
      errorStyle: string; expertise: string[]; catchphrases: Record<string, string>;
      boundaries: { neverJokeAbout: string[]; neverAdviseOn: string[] };
      customInstructions: string; soulContent: string | null; activeTemplate: string | null;
    } }>('/personality/full'),
  updatePersonalityFull: (data: Record<string, unknown>) =>
    fetchApi<{ success: boolean }>('/personality/full', {
      method: 'PUT',
      body: JSON.stringify(data),
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
  // Claude OAuth
  startClaudeOAuth: () =>
    fetchApi<{ authUrl: string }>('/provider/claude-oauth/start', { method: 'POST' }),
  completeClaudeOAuth: (code: string) =>
    fetchApi<{ success: boolean }>('/provider/claude-oauth/callback', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  disconnectClaudeOAuth: () =>
    fetchApi<{ success: boolean }>('/provider/claude-oauth/disconnect', { method: 'POST' }),
  getClaudeOAuthStatus: () =>
    fetchApi<{ connected: boolean }>('/provider/claude-oauth/status'),
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

  // Connector OAuth API
  getConnectorStatus: (connectorId: string) =>
    fetchApi<{ data: { connectorId: string; hasCredentials: boolean; connected: boolean; expiresAt?: number } }>(
      `/connectors/${connectorId}/status`,
    ),
  saveConnectorCredentials: (connectorId: string, clientId: string, clientSecret: string) =>
    fetchApi<{ success: boolean; oauthUrl?: string }>(`/connectors/${connectorId}/credentials`, {
      method: 'POST',
      body: JSON.stringify({ clientId, clientSecret }),
    }),
  disconnectConnector: (connectorId: string) =>
    fetchApi<{ success: boolean }>(`/connectors/${connectorId}/disconnect`, {
      method: 'POST',
    }),

  // Ambient config
  getAmbientConfig: () =>
    fetchApi<{ data: any }>('/ambient/config'),
  updateAmbientConfig: (config: Record<string, unknown>) =>
    fetchApi<{ success: boolean }>('/ambient/config', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  // Appearance
  getAppearance: () =>
    fetchApi<{ data: { theme: string } }>('/appearance'),
  updateAppearance: (theme: string) =>
    fetchApi<{ success: boolean }>('/appearance', {
      method: 'POST',
      body: JSON.stringify({ theme }),
    }),

  // Chat management
  getChats: (archived?: boolean) => {
    const qs = archived ? '?archived=true' : '';
    return fetchApi<{ data: any[]; total: number }>(`/chats${qs}`);
  },
  createNewChat: (title?: string) =>
    fetchApi<{ data: any }>('/chats', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  getChatMessages: (chatId: string) =>
    fetchApi<{ data: Array<{ id: string; role: string; content: string; timestamp: number }> }>(`/chats/${chatId}/messages`),
  renameChat: (chatId: string, title: string) =>
    fetchApi<{ data: any }>(`/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  archiveChat: (chatId: string) =>
    fetchApi<{ data: any }>(`/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    }),
  deleteChatThread: (chatId: string) =>
    fetchApi<{ data: any }>(`/chats/${chatId}`, { method: 'DELETE' }),

  // Notifications
  getNotifications: () =>
    fetchApi<{ data: any[] }>('/notifications'),
  dismissNotification: (id: string) =>
    fetchApi<{ data: { dismissed: boolean } }>(`/notifications/${id}/dismiss`, {
      method: 'POST',
    }),
  getNotificationPreferences: () =>
    fetchApi<{ data: any }>('/notifications/preferences'),
  updateNotificationPreferences: (prefs: Record<string, unknown>) =>
    fetchApi<{ success: boolean }>('/notifications/preferences', {
      method: 'POST',
      body: JSON.stringify(prefs),
    }),
};
