import type { AuthConfig, StoredToken } from './types.js';

/** In-memory token store with vault-like interface for connector auth tokens. */
export class AuthManager {
  private tokens = new Map<string, StoredToken>();

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

    // In a real implementation, this would call the token endpoint.
    // For now, mark the token as refreshed with a new expiry.
    const refreshed: StoredToken = {
      ...existing,
      expiresAt: Date.now() + 3600_000,
    };
    this.tokens.set(instanceId, refreshed);
    return refreshed;
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
    return this.tokens.delete(instanceId);
  }

  /** Check whether a connector instance has a stored token. */
  hasToken(instanceId: string): boolean {
    return this.tokens.has(instanceId);
  }
}
