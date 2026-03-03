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

const MARKETPLACE_BASE = '/api/v1/marketplace';

async function fetchMarketplace<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${MARKETPLACE_BASE}${path}`, {
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

interface PluginListing {
  name: string; version: string; description: string; author: string;
  license: string; permissions: string[]; keywords: string[];
  downloads: number; rating: number; createdAt: string; updatedAt: string;
  homepage?: string; repository?: string;
}

interface PersonalityListing {
  name: string; version: string; description: string; author: string;
  preview: string; tone: { warmth: number; humor: number; formality: number };
  keywords: string[]; downloads: number; rating: number;
  createdAt: string; updatedAt: string;
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
  getActiveAgents: () => fetchApi<{ data: Array<{ id: string; type: string; description: string; channelType?: string; startedAt: string }> }>('/status/agents'),
  getHealthState: () => fetchApi<{ data: any }>('/status/health'),
  getCapabilities: () => fetchApi<{ data: any }>('/status/capabilities'),
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
  setupProviders: (providers: Array<{ name: string; apiKey?: string; endpoint?: string }>) =>
    fetchApi<{ success: boolean; providers: string[]; primary: string }>('/setup/provider', { method: 'POST', body: JSON.stringify({ providers }) }),
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

  // Seal (auto-unseal) API
  getSealStatus: () =>
    fetchApi<{ sealed: boolean; pinRequired: boolean }>('/security/seal/status'),
  enableSeal: (password: string, pin?: string) =>
    fetchApi<{ success: boolean }>('/security/seal', {
      method: 'POST',
      body: JSON.stringify({ password, pin }),
    }),
  disableSeal: () =>
    fetchApi<{ success: boolean }>('/security/seal', {
      method: 'DELETE',
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

  // Personality engine toggle
  getPersonalityEngine: () =>
    fetchApi<{ data: { engine: string } }>('/personality/engine'),
  setPersonalityEngine: (engine: string) =>
    fetchApi<{ success: boolean }>('/personality/engine', {
      method: 'PUT',
      body: JSON.stringify({ engine }),
    }),
  updateChatPersonality: (chatId: string, personality: string) =>
    fetchApi<{ data: any }>(`/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ personality }),
    }),

  // Architect personality engine
  getArchitectPreferences: () =>
    fetchApi<{ data: any }>('/architect/preferences'),
  updateArchitectPreference: (key: string, value: unknown) =>
    fetchApi<{ success: boolean }>('/architect/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ key, value }),
    }),
  clearArchitectData: () =>
    fetchApi<{ success: boolean }>('/architect/data', { method: 'DELETE' }),
  exportArchitectData: () =>
    fetchApi<{ data: string }>('/architect/data/export'),

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

  // User Model
  getUserModel: () =>
    fetch('/api/v1/personality/user-model', { credentials: 'include' }).then(async r => {
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      return r.json() as Promise<any>;
    }),

  // Memory management
  getMemories: (category?: string) => {
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    return fetchApi<{ data: any[] }>(`/memories${qs}`);
  },
  searchMemories: (q: string) =>
    fetchApi<{ data: any[] }>(`/memories/search?q=${encodeURIComponent(q)}`),
  deleteMemory: (id: string) =>
    fetchApi<{ success: boolean }>(`/memories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  updateMemory: (id: string, updates: { content?: string; importance?: number; tags?: string[] }) =>
    fetchApi<{ data: any }>(`/memories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  exportMemories: () => fetchApi<any>('/memories/export'),
  forgetTopic: (topic: string) =>
    fetchApi<{ removed: { memories: number; decisions: number } }>('/forget', {
      method: 'POST',
      body: JSON.stringify({ topic }),
    }),
  exportPersonalization: () => fetchApi<any>('/export/personalization'),

  // Marketplace
  searchPlugins: (params: { q?: string; author?: string; keywords?: string; sort?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.author) qs.set('author', params.author);
    if (params.keywords) qs.set('keywords', params.keywords);
    if (params.sort) qs.set('sort', params.sort);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return fetchMarketplace<{ plugins: PluginListing[]; total: number; limit: number; offset: number }>(
      `/plugins/search${query ? `?${query}` : ''}`
    );
  },
  getPlugin: (name: string) => fetchMarketplace<PluginListing>(`/plugins/${encodeURIComponent(name)}`),
  installPlugin: (name: string, version?: string) =>
    fetchMarketplace<{ success: boolean; name: string; version: string }>('/plugins/install', {
      method: 'POST',
      body: JSON.stringify({ name, version }),
    }),
  searchPersonalities: (params: { q?: string; author?: string; sort?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.author) qs.set('author', params.author);
    if (params.sort) qs.set('sort', params.sort);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return fetchMarketplace<{ personalities: PersonalityListing[]; total: number; limit: number; offset: number }>(
      `/personalities/search${query ? `?${query}` : ''}`
    );
  },
  getMarketplacePersonality: (name: string) => fetchMarketplace<PersonalityListing>(`/personalities/${encodeURIComponent(name)}`),
  installPersonality: (name: string, version?: string) =>
    fetchMarketplace<{ success: boolean; name: string; version: string }>('/personalities/install', {
      method: 'POST',
      body: JSON.stringify({ name, version }),
    }),

  // Jobs
  getJobStats: () =>
    fetch('/api/v1/jobs/status', { credentials: 'include' }).then(r => r.json()) as Promise<{ pending: number; running: number; completed24h: number; failed24h: number; dead: number }>,
  getJobList: (params?: { status?: string; type?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.type) qs.set('type', params.type);
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return fetch(`/api/v1/jobs/list${query ? `?${query}` : ''}`, { credentials: 'include' }).then(r => r.json()) as Promise<{ data: Array<{ id: string; type: string; status: string; payload: unknown; result: unknown; attempt: number; maxAttempts: number; createdAt: number; updatedAt: number }> }>;
  },
  retryJob: (id: string) =>
    fetch(`/api/v1/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST', credentials: 'include' }).then(r => r.json()) as Promise<{ data: { originalId: string; newJobId: string } }>,

  // Darwin / Evolution
  getDarwinStatus: () =>
    fetch('/api/v1/darwin/status', { credentials: 'include' }).then(r => r.json()) as Promise<{ totalCycles: number; successfulCycles: number; failedCycles: number; archiveOccupancy: number; totalVariants: number; running: boolean }>,
  getDarwinArchive: () =>
    fetch('/api/v1/darwin/archive', { credentials: 'include' }).then(r => r.json()) as Promise<Array<{ niche: { domain: string; complexity: string }; variantId: string; benchmarkScore: number; lastEvaluated: number; staleness: number }>>,
  getDarwinVariant: (id: string) =>
    fetch(`/api/v1/darwin/variants/${encodeURIComponent(id)}`, { credentials: 'include' }).then(r => r.json()),
  getDarwinGovernor: () =>
    fetch('/api/v1/darwin/governor', { credentials: 'include' }).then(r => r.json()) as Promise<{ tokensUsedThisHour: number; variantsCreatedToday: number }>,
  getDarwinApprovals: () =>
    fetch('/api/v1/darwin/approvals', { credentials: 'include' }).then(r => r.json()) as Promise<Array<{ variantId: string; queuedAt: number }>>,
  approveDarwinVariant: (id: string) =>
    fetch(`/api/v1/darwin/approvals/${encodeURIComponent(id)}/approve`, { method: 'POST', credentials: 'include' }).then(r => r.json()),
  rejectDarwinVariant: (id: string) =>
    fetch(`/api/v1/darwin/approvals/${encodeURIComponent(id)}/reject`, { method: 'POST', credentials: 'include' }).then(r => r.json()),
  pauseDarwin: () =>
    fetch('/api/v1/darwin/pause', { method: 'POST', credentials: 'include' }).then(r => r.json()),
  resumeDarwin: () =>
    fetch('/api/v1/darwin/resume', { method: 'POST', credentials: 'include' }).then(r => r.json()),
};

// Resource orchestration
const ORCHESTRATION_BASE = '/api/v1/orchestration';

async function fetchOrchestration<T>(path: string): Promise<T> {
  const res = await fetch(`${ORCHESTRATION_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
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

export interface ResourceSnapshot {
  cpu: { cores: number; utilization: number; loadAvg1m: number };
  memory: { totalMB: number; freeMB: number; availableMB: number; usedPercent: number };
  swap: { usedPercent: number };
  timestamp: number;
}

export interface MachineProfile {
  machineClass: string;
  hasGpu: boolean;
  recommendedMaxAgents: number;
  cpuCeiling: number;
  ramCeiling: number;
}

export interface BreakerStatus {
  action: string;
  reasons: string[];
  snapshot: ResourceSnapshot;
}

export async function getResourceStatus(): Promise<{ snapshot: ResourceSnapshot; profile: MachineProfile }> {
  return fetchOrchestration('/resources');
}

export async function getBreakerStatus(): Promise<BreakerStatus> {
  return fetchOrchestration('/breakers');
}

export type { PluginListing, PersonalityListing };

export interface FeatureStatus {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  configured: boolean;
  active: boolean;
  missing?: string[];
  settingsPath?: string | null;
}

export async function getFeatureStatus(): Promise<{ features: FeatureStatus[] }> {
  const res = await fetch('/api/v1/features/status', { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
