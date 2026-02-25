import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthManager } from '../src/auth-manager.js';
import type { AuthConfig } from '../src/types.js';
import type { AuthManagerVault } from '../src/auth-manager.js';

function createMockVault(data: Record<string, string> = {}): AuthManagerVault {
  const store = new Map(Object.entries(data));
  return {
    get: (name: string) => store.get(name),
    has: (name: string) => store.has(name),
    add: async (name: string, value: string) => { store.set(name, value); },
  };
}

describe('AuthManager', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    authManager = new AuthManager();
  });

  it('should authenticate with api_key', async () => {
    const config: AuthConfig = { type: 'api_key' };
    const token = await authManager.authenticate('inst-1', config, { apiKey: 'sk-123' });
    expect(token.accessToken).toBe('sk-123');
    expect(token.tokenType).toBe('api_key');
  });

  it('should authenticate with oauth2', async () => {
    const config: AuthConfig = {
      type: 'oauth2',
      oauth2: { authUrl: 'https://auth.example.com', tokenUrl: 'https://token.example.com', scopes: ['read'] },
    };
    const token = await authManager.authenticate('inst-2', config, {
      accessToken: 'at-abc',
      refreshToken: 'rt-xyz',
    });
    expect(token.accessToken).toBe('at-abc');
    expect(token.refreshToken).toBe('rt-xyz');
    expect(token.scopes).toEqual(['read']);
  });

  it('should authenticate with token', async () => {
    const config: AuthConfig = { type: 'token' };
    const token = await authManager.authenticate('inst-3', config, { token: 'tok-456' });
    expect(token.accessToken).toBe('tok-456');
    expect(token.tokenType).toBe('Bearer');
  });

  it('should throw on missing api key', async () => {
    const config: AuthConfig = { type: 'api_key' };
    await expect(authManager.authenticate('inst-4', config, {})).rejects.toThrow('apiKey');
  });

  it('should throw on missing oauth2 access token', async () => {
    const config: AuthConfig = { type: 'oauth2' };
    await expect(authManager.authenticate('inst-5', config, {})).rejects.toThrow('accessToken');
  });

  it('should throw on missing token', async () => {
    const config: AuthConfig = { type: 'token' };
    await expect(authManager.authenticate('inst-6', config, {})).rejects.toThrow('token');
  });

  it('should get stored token', async () => {
    const config: AuthConfig = { type: 'api_key' };
    await authManager.authenticate('inst-1', config, { apiKey: 'sk-123' });
    const token = authManager.getToken('inst-1');
    expect(token?.accessToken).toBe('sk-123');
  });

  it('should return undefined for unknown instance', () => {
    expect(authManager.getToken('unknown')).toBeUndefined();
  });

  it('should revoke token', async () => {
    const config: AuthConfig = { type: 'api_key' };
    await authManager.authenticate('inst-1', config, { apiKey: 'sk-123' });
    expect(authManager.hasToken('inst-1')).toBe(true);
    await authManager.revokeToken('inst-1');
    expect(authManager.hasToken('inst-1')).toBe(false);
  });

  it('should detect expired tokens', async () => {
    const config: AuthConfig = { type: 'oauth2' };
    await authManager.authenticate('inst-exp', config, {
      accessToken: 'at-exp',
      expiresAt: String(Date.now() - 1000),
    });
    expect(authManager.isTokenExpired('inst-exp')).toBe(true);
  });

  it('should refresh oauth2 token', async () => {
    // refreshToken now makes a real HTTP call, so we mock fetch and provide vault credentials
    const vault = createMockVault({
      'connectors.inst-ref.credentials': JSON.stringify({ clientId: 'cid', clientSecret: 'csecret' }),
    });
    const mgr = new AuthManager(vault);
    const config: AuthConfig = {
      type: 'oauth2',
      oauth2: { authUrl: 'https://auth.example.com', tokenUrl: 'https://token.example.com', scopes: ['read'] },
    };
    await mgr.authenticate('inst-ref', config, {
      accessToken: 'at-old',
      refreshToken: 'rt-xyz',
    });

    // Mock the global fetch to return a fake token response
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'at-new', expires_in: 3600 }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as any;
    try {
      const refreshed = await mgr.refreshToken('inst-ref', config);
      expect(refreshed.accessToken).toBe('at-new');
      expect(refreshed.expiresAt).toBeGreaterThan(Date.now());
      expect(refreshed.refreshToken).toBe('rt-xyz');
      expect(mockFetch).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should throw when refreshing non-oauth2 token', async () => {
    const config: AuthConfig = { type: 'api_key' };
    await authManager.authenticate('inst-api', config, { apiKey: 'key' });
    await expect(authManager.refreshToken('inst-api', config)).rejects.toThrow('OAuth2');
  });

  it('should throw when refreshing unknown instance', async () => {
    const config: AuthConfig = { type: 'oauth2' };
    await expect(authManager.refreshToken('unknown', config)).rejects.toThrow('No token found');
  });
});
