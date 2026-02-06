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
};
