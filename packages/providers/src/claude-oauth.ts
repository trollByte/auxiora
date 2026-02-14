/**
 * Claude OAuth credential handling.
 *
 * Supports two modes:
 * 1. Setup tokens (sk-ant-oat01-*) - Used directly as API keys
 * 2. OAuth credentials from Claude CLI - Access token + refresh token
 */

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Setup token prefix from Claude CLI
const ANTHROPIC_SETUP_TOKEN_PREFIX = 'sk-ant-oat01-';
const ANTHROPIC_SETUP_TOKEN_MIN_LENGTH = 80;

// Claude CLI credentials file location
const CLAUDE_CLI_CREDENTIALS_RELATIVE_PATH = '.claude/.credentials.json';

// Token refresh endpoint (must match real Claude Code)
const ANTHROPIC_TOKEN_REFRESH_URL = 'https://platform.claude.com/v1/oauth/token';

// OAuth client ID from Claude Code
const CLAUDE_CODE_CLIENT_ID = '22422756-60c9-4084-8eb7-27705fd5cf9a';

// Required OAuth scopes
const CLAUDE_CODE_SCOPES = 'user:inference user:profile user:sessions:claude_code user:mcp_servers';

export interface ClaudeOAuthCredentials {
  type: 'oauth' | 'token';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface TokenRefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Check if a token is a setup token (sk-ant-oat01-*).
 */
export function isSetupToken(token: string): boolean {
  const trimmed = token.trim();
  return (
    trimmed.startsWith(ANTHROPIC_SETUP_TOKEN_PREFIX) &&
    trimmed.length >= ANTHROPIC_SETUP_TOKEN_MIN_LENGTH
  );
}

/**
 * Validate a setup token format.
 */
export function validateSetupToken(token: string): string | undefined {
  const trimmed = token.trim();
  if (!trimmed) {
    return 'Token is required';
  }
  if (!trimmed.startsWith(ANTHROPIC_SETUP_TOKEN_PREFIX)) {
    return `Expected token starting with ${ANTHROPIC_SETUP_TOKEN_PREFIX}`;
  }
  if (trimmed.length < ANTHROPIC_SETUP_TOKEN_MIN_LENGTH) {
    return 'Token looks too short; use the full setup-token';
  }
  return undefined;
}

/**
 * Get the path to Claude CLI credentials file.
 */
export function getClaudeCredentialsPath(homeDir?: string): string {
  const baseDir = homeDir ?? os.homedir();
  return path.join(baseDir, CLAUDE_CLI_CREDENTIALS_RELATIVE_PATH);
}

/**
 * Read OAuth credentials from Claude CLI's credentials file.
 */
export function readClaudeCliCredentials(homeDir?: string): ClaudeOAuthCredentials | null {
  const credPath = getClaudeCredentialsPath(homeDir);

  try {
    if (!fs.existsSync(credPath)) {
      return null;
    }

    const content = fs.readFileSync(credPath, 'utf-8');
    const data = JSON.parse(content) as Record<string, unknown>;
    const claudeOauth = data.claudeAiOauth as Record<string, unknown> | undefined;

    if (!claudeOauth || typeof claudeOauth !== 'object') {
      return null;
    }

    const accessToken = claudeOauth.accessToken;
    const refreshToken = claudeOauth.refreshToken;
    const expiresAt = claudeOauth.expiresAt;

    if (typeof accessToken !== 'string' || !accessToken) {
      return null;
    }
    if (typeof expiresAt !== 'number' || expiresAt <= 0) {
      return null;
    }

    if (typeof refreshToken === 'string' && refreshToken) {
      return {
        type: 'oauth',
        accessToken,
        refreshToken,
        expiresAt,
      };
    }

    // Token without refresh - treat as simple token
    return {
      type: 'token',
      accessToken,
      expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Check if OAuth credentials are expired.
 */
export function isCredentialsExpired(credentials: ClaudeOAuthCredentials): boolean {
  if (!credentials.expiresAt) {
    return false;
  }
  // Consider expired if less than 5 minutes remaining
  return Date.now() >= credentials.expiresAt - 5 * 60 * 1000;
}

/**
 * Refresh an OAuth token using the refresh token.
 * Uses the Claude Code CLI's OAuth client by default.
 * For tokens obtained via the dashboard PKCE flow, use refreshPKCEOAuthToken instead.
 */
export async function refreshOAuthToken(
  refreshToken: string
): Promise<TokenRefreshResult> {
  return doTokenRefresh(refreshToken, {
    clientId: CLAUDE_CODE_CLIENT_ID,
    tokenUrl: ANTHROPIC_TOKEN_REFRESH_URL,
    scope: CLAUDE_CODE_SCOPES,
  });
}

/**
 * Refresh an OAuth token obtained via the dashboard's PKCE flow.
 * Uses the same client ID and endpoint that issued the original token.
 * Omits scope — the server uses the originally granted scopes.
 */
export async function refreshPKCEOAuthToken(
  refreshToken: string
): Promise<TokenRefreshResult> {
  return doTokenRefresh(refreshToken, {
    clientId: CLAUDE_OAUTH_CLIENT_ID,
    tokenUrl: CLAUDE_OAUTH_TOKEN_URL,
  });
}

/**
 * Internal: perform a token refresh against the given OAuth endpoint.
 */
async function doTokenRefresh(
  refreshToken: string,
  opts: { clientId: string; tokenUrl: string; scope?: string },
): Promise<TokenRefreshResult> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: opts.clientId,
  });
  if (opts.scope) {
    body.set('scope', opts.scope);
  }

  const response = await fetch(opts.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  const accessToken = data.access_token;
  const newRefreshToken = data.refresh_token;
  const expiresIn = data.expires_in;

  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('Invalid token refresh response: missing access_token');
  }

  const expiresAt =
    typeof expiresIn === 'number'
      ? Date.now() + expiresIn * 1000
      : Date.now() + 3600 * 1000; // Default 1 hour

  return {
    accessToken,
    refreshToken: typeof newRefreshToken === 'string' ? newRefreshToken : refreshToken,
    expiresAt,
  };
}

/**
 * Write updated credentials back to Claude CLI credentials file.
 */
export function writeClaudeCliCredentials(
  credentials: TokenRefreshResult,
  homeDir?: string
): boolean {
  const credPath = getClaudeCredentialsPath(homeDir);

  try {
    if (!fs.existsSync(credPath)) {
      return false;
    }

    const content = fs.readFileSync(credPath, 'utf-8');
    const data = JSON.parse(content) as Record<string, unknown>;
    const existingOauth = data.claudeAiOauth as Record<string, unknown> | undefined;

    if (!existingOauth || typeof existingOauth !== 'object') {
      return false;
    }

    data.claudeAiOauth = {
      ...existingOauth,
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      expiresAt: credentials.expiresAt,
    };

    fs.writeFileSync(credPath, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a valid access token, refreshing if necessary.
 * Returns the access token to use for API calls.
 */
export async function getValidAccessToken(
  credentials: ClaudeOAuthCredentials,
  homeDir?: string
): Promise<string> {
  // If not expired, return current token
  if (!isCredentialsExpired(credentials)) {
    return credentials.accessToken;
  }

  // If no refresh token, can't refresh
  if (!credentials.refreshToken) {
    throw new Error(
      'OAuth token expired and no refresh token available. Please re-authenticate with `claude setup-token`.'
    );
  }

  // Refresh the token
  const refreshed = await refreshOAuthToken(credentials.refreshToken);

  // Try to write back to credentials file
  writeClaudeCliCredentials(refreshed, homeDir);

  return refreshed.accessToken;
}

// OAuth PKCE constants
const CLAUDE_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const CLAUDE_OAUTH_AUTH_URL = 'https://claude.ai/oauth/authorize';
const CLAUDE_OAUTH_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const CLAUDE_OAUTH_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
const CLAUDE_OAUTH_SCOPES = 'org:create_api_key user:profile user:inference';

export function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(64).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthorizationUrl(codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLAUDE_OAUTH_CLIENT_ID,
    redirect_uri: CLAUDE_OAUTH_REDIRECT_URI,
    scope: CLAUDE_OAUTH_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${CLAUDE_OAUTH_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  state: string
): Promise<TokenRefreshResult> {
  const response = await fetch(CLAUDE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      state,
      client_id: CLAUDE_OAUTH_CLIENT_ID,
      redirect_uri: CLAUDE_OAUTH_REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const accessToken = data.access_token;
  const refreshToken = data.refresh_token;
  const expiresIn = data.expires_in;

  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('Invalid token response: missing access_token');
  }

  const expiresAt = typeof expiresIn === 'number'
    ? Date.now() + expiresIn * 1000
    : Date.now() + 3600 * 1000;

  return {
    accessToken,
    refreshToken: typeof refreshToken === 'string' ? refreshToken : '',
    expiresAt,
  };
}

/**
 * Resolve an Anthropic API key from various sources.
 *
 * Priority:
 * 1. Provided oauthToken (if it's a setup token, use directly)
 * 2. Provided oauthToken (if it's an access token)
 * 3. Claude CLI credentials file
 * 4. Provided apiKey
 *
 * Returns the API key to use with the Anthropic SDK.
 */
export async function resolveAnthropicApiKey(options: {
  apiKey?: string;
  oauthToken?: string;
  useCliCredentials?: boolean;
  homeDir?: string;
}): Promise<{ apiKey: string; mode: 'api-key' | 'setup-token' | 'oauth' }> {
  // Check for setup token first (sk-ant-oat01-*)
  if (options.oauthToken && isSetupToken(options.oauthToken)) {
    return {
      apiKey: options.oauthToken.trim(),
      mode: 'setup-token',
    };
  }

  // Check for OAuth token (access token from Claude CLI)
  if (options.oauthToken && !isSetupToken(options.oauthToken)) {
    return {
      apiKey: options.oauthToken.trim(),
      mode: 'oauth',
    };
  }

  // Try Claude CLI credentials if enabled
  if (options.useCliCredentials !== false) {
    const cliCreds = readClaudeCliCredentials(options.homeDir);
    if (cliCreds) {
      const token = await getValidAccessToken(cliCreds, options.homeDir);
      return {
        apiKey: token,
        mode: cliCreds.type === 'oauth' ? 'oauth' : 'setup-token',
      };
    }
  }

  // Fall back to regular API key
  if (options.apiKey) {
    return {
      apiKey: options.apiKey.trim(),
      mode: 'api-key',
    };
  }

  throw new Error(
    'No Anthropic credentials found. Provide an apiKey, oauthToken, or authenticate with `claude setup-token`.'
  );
}
