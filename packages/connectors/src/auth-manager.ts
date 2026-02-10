import type { AuthConfig, StoredToken } from './types.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface AuthManagerVault {
  get(name: string): string | undefined;
  has(name: string): boolean;
  add(name: string, value: string): Promise<void>;
}

/** In-memory token store with vault-like interface for connector auth tokens. */
export class AuthManager {
  private tokens = new Map<string, StoredToken>();
  private vault?: AuthManagerVault;

  constructor(vault?: AuthManagerVault) {
    this.vault = vault;
  }

  /** Authenticate a connector instance with the given credentials. */
  async authenticate(
    instanceId: string,
    authConfig: AuthConfig,
    credentials: Record<string, string>,
  ): Promise<StoredToken> {
    let token: StoredToken;

    switch (authConfig.type) {
      case 'oauth2': {
        if (!credentials.accessToken) {
          throw new Error('OAuth2 authentication requires an accessToken');
        }
        token = {
          accessToken: credentials.accessToken,
          refreshToken: credentials.refreshToken,
          expiresAt: credentials.expiresAt ? parseInt(credentials.expiresAt, 10) : undefined,
          tokenType: credentials.tokenType ?? 'Bearer',
          scopes: authConfig.oauth2?.scopes,
        };
        break;
      }
      case 'api_key': {
        if (!credentials.apiKey) {
          throw new Error('API key authentication requires an apiKey');
        }
        token = {
          accessToken: credentials.apiKey,
          tokenType: 'api_key',
        };
        break;
      }
      case 'token': {
        if (!credentials.token) {
          throw new Error('Token authentication requires a token');
        }
        token = {
          accessToken: credentials.token,
          tokenType: 'Bearer',
        };
        break;
      }
      default:
        throw new Error(`Unsupported auth type: ${authConfig.type as string}`);
    }

    this.tokens.set(instanceId, token);

    // Persist tokens to vault if available
    if (this.vault) {
      await this.vault.add(`connectors.${instanceId}.tokens`, JSON.stringify(token));
    }

    return token;
  }

  /** Refresh an OAuth2 token for a connector instance. */
  async refreshToken(
    instanceId: string,
    authConfig: AuthConfig,
  ): Promise<StoredToken> {
    const existing = this.tokens.get(instanceId);
    if (!existing) {
      throw new Error(`No token found for instance "${instanceId}"`);
    }
    if (authConfig.type !== 'oauth2') {
      throw new Error('Token refresh is only supported for OAuth2');
    }
    if (!existing.refreshToken) {
      throw new Error('No refresh token available');
    }

    // Load client credentials from vault
    const credsJson = this.vault?.get(`connectors.${instanceId}.credentials`);
    if (!credsJson) {
      throw new Error(`No client credentials found for instance "${instanceId}"`);
    }
    const creds = JSON.parse(credsJson) as { clientId: string; clientSecret: string };

    // Call Google's token endpoint to refresh
    const body = new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: existing.refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Token refresh failed: ${response.status} ${errBody}`);
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };

    const refreshed: StoredToken = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? existing.refreshToken,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : Date.now() + 3600_000,
      tokenType: data.token_type ?? 'Bearer',
      scopes: existing.scopes,
    };

    this.tokens.set(instanceId, refreshed);

    // Persist updated tokens to vault
    if (this.vault) {
      await this.vault.add(`connectors.${instanceId}.tokens`, JSON.stringify(refreshed));
    }

    return refreshed;
  }

  /** Restore a token from vault into the in-memory store. */
  restoreToken(instanceId: string, token: StoredToken): void {
    this.tokens.set(instanceId, token);
  }

  /** Get the stored token for a connector instance. */
  getToken(instanceId: string): StoredToken | undefined {
    return this.tokens.get(instanceId);
  }

  /** Check if a token is expired. */
  isTokenExpired(instanceId: string): boolean {
    const token = this.tokens.get(instanceId);
    if (!token || !token.expiresAt) return false;
    return Date.now() >= token.expiresAt;
  }

  /** Revoke and remove a token for a connector instance. */
  async revokeToken(instanceId: string): Promise<boolean> {
    const deleted = this.tokens.delete(instanceId);
    if (deleted && this.vault) {
      try {
        await this.vault.add(`connectors.${instanceId}.tokens`, '');
      } catch {
        // Best-effort vault cleanup
      }
    }
    return deleted;
  }

  /** Check whether a connector instance has a stored token. */
  hasToken(instanceId: string): boolean {
    return this.tokens.has(instanceId);
  }
}
