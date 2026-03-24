/**
 * OpenAI Codex OAuth (PKCE) flow.
 *
 * Authenticates against OpenAI's auth infrastructure using the same OAuth
 * flow that the Codex CLI uses. This lets ChatGPT Plus/Pro subscribers
 * use their subscription for API access via chatgpt.com/backend-api
 * instead of paying per-token on api.openai.com.
 *
 * Flow: PKCE authorization → local callback server → token exchange → JWT parsing
 */

import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('providers:openai-codex-oauth');

// OpenAI Codex OAuth constants (same client ID as Codex CLI)
const OPENAI_CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_AUTH_URL = 'https://auth.openai.com/oauth/authorize';
const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const OPENAI_CALLBACK_PORT = 1455;
const OPENAI_REDIRECT_URI = `http://localhost:${OPENAI_CALLBACK_PORT}/auth/callback`;
const OPENAI_SCOPES = 'openid profile email offline_access';

export interface OpenAICodexTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountId: string;
}

/**
 * Generate a PKCE verifier/challenge pair for the OAuth flow.
 */
export function generateOpenAICodexPKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/**
 * Build the OpenAI authorization URL for the browser.
 */
export function buildOpenAICodexAuthUrl(codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OPENAI_CODEX_CLIENT_ID,
    redirect_uri: OPENAI_REDIRECT_URI,
    scope: OPENAI_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
  });
  return `${OPENAI_AUTH_URL}?${params.toString()}`;
}

/**
 * Extract the accountId from an OpenAI JWT access token.
 * The account ID lives in the `https://api.openai.com/auth` claim.
 */
function extractAccountId(accessToken: string): string {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return '';
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf-8'));
    const authClaim = payload['https://api.openai.com/auth'];
    if (authClaim && typeof authClaim === 'object') {
      return authClaim.chatgpt_account_id ?? authClaim.account_id ?? '';
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeOpenAICodexCode(
  code: string,
  codeVerifier: string,
): Promise<OpenAICodexTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: OPENAI_CODEX_CLIENT_ID,
    code,
    redirect_uri: OPENAI_REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  const response = await fetch(OPENAI_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI Codex token exchange failed: ${response.status} ${text}`);
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

  const accountId = extractAccountId(accessToken);

  return {
    accessToken,
    refreshToken: typeof refreshToken === 'string' ? refreshToken : '',
    expiresAt,
    accountId,
  };
}

/**
 * Refresh an OpenAI Codex OAuth token.
 */
export async function refreshOpenAICodexToken(
  refreshToken: string,
): Promise<OpenAICodexTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: OPENAI_CODEX_CLIENT_ID,
    refresh_token: refreshToken,
  });

  const response = await fetch(OPENAI_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI Codex token refresh failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const accessToken = data.access_token;
  const newRefreshToken = data.refresh_token;
  const expiresIn = data.expires_in;

  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('Invalid refresh response: missing access_token');
  }

  const expiresAt = typeof expiresIn === 'number'
    ? Date.now() + expiresIn * 1000
    : Date.now() + 3600 * 1000;

  const accountId = extractAccountId(accessToken);

  return {
    accessToken,
    refreshToken: typeof newRefreshToken === 'string' ? newRefreshToken : refreshToken,
    expiresAt,
    accountId,
  };
}

/**
 * Start a local HTTP server to receive the OAuth callback.
 * Returns a promise that resolves with the authorization code.
 *
 * @param state - The state parameter to validate
 * @param timeoutMs - How long to wait before timing out (default 5 minutes)
 */
export function startCallbackServer(
  state: string,
  timeoutMs = 300_000,
): { promise: Promise<string>; server: Server } {
  let resolvePromise: (code: string) => void;
  let rejectPromise: (err: Error) => void;

  const promise = new Promise<string>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${OPENAI_CALLBACK_PORT}`);

    if (url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Authentication failed</h2><p>You can close this tab.</p></body></html>');
        rejectPromise!(new Error(`OAuth error: ${error}`));
        server.close();
        return;
      }

      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Invalid state</h2><p>Please try again.</p></body></html>');
        rejectPromise!(new Error('OAuth state mismatch'));
        server.close();
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Missing code</h2><p>Please try again.</p></body></html>');
        rejectPromise!(new Error('No authorization code received'));
        server.close();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Authentication successful!</h2><p>You can close this tab and return to Auxiora.</p></body></html>');
      resolvePromise!(code);
      server.close();
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(OPENAI_CALLBACK_PORT, '127.0.0.1', () => {
    logger.info(`OAuth callback server listening on port ${OPENAI_CALLBACK_PORT}`);
  });

  // Timeout
  const timeout = setTimeout(() => {
    server.close();
    rejectPromise!(new Error('OAuth callback timed out'));
  }, timeoutMs);

  // Clean up timeout when promise resolves/rejects
  promise.finally(() => clearTimeout(timeout));

  return { promise, server };
}
