# Claude OAuth Provider Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Claude (OAuth)" provider to the dashboard that authenticates with claude.ai via PKCE authorization code flow, so users with Claude Pro/Max subscriptions can use Auxiora without a separate API key.

**Architecture:** Three layers: (1) pure PKCE + token exchange functions in `claude-oauth.ts`, (2) two dashboard API routes that manage the OAuth state machine, (3) a special OAuth card in the Provider settings UI. Tokens are stored in the vault under `ANTHROPIC_OAUTH_TOKEN` (already read by runtime) and in the Claude CLI credentials file format (enables auto-refresh).

**Tech Stack:** Node.js crypto for PKCE, existing Anthropic OAuth endpoints, React dashboard UI, Express routes

---

### Task 1: Add PKCE + Token Exchange to claude-oauth.ts

**Files:**
- Modify: `packages/providers/src/claude-oauth.ts`
- Test: `packages/providers/tests/claude-oauth.test.ts`

**Step 1: Write the failing tests**

Create `packages/providers/tests/claude-oauth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  generatePKCE,
  buildAuthorizationUrl,
} from '../src/claude-oauth.js';

describe('PKCE generation', () => {
  it('generates a verifier of 43-128 chars using unreserved chars', () => {
    const { verifier } = generatePKCE();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('generates a base64url-encoded SHA-256 challenge', () => {
    const { challenge } = generatePKCE();
    // base64url: no +, /, or = padding
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge.length).toBe(43); // SHA-256 = 32 bytes = 43 base64url chars
  });

  it('generates unique values each call', () => {
    const a = generatePKCE();
    const b = generatePKCE();
    expect(a.verifier).not.toBe(b.verifier);
  });
});

describe('buildAuthorizationUrl', () => {
  it('includes all required OAuth parameters', () => {
    const url = buildAuthorizationUrl('test-challenge-value');
    const parsed = new URL(url);

    expect(parsed.origin).toBe('https://claude.ai');
    expect(parsed.pathname).toBe('/oauth/authorize');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBeTruthy();
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://console.anthropic.com/oauth/code/callback'
    );
    expect(parsed.searchParams.get('scope')).toContain('user:inference');
    expect(parsed.searchParams.get('code_challenge')).toBe('test-challenge-value');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && pnpm vitest run packages/providers/tests/claude-oauth.test.ts`
Expected: FAIL — `generatePKCE` and `buildAuthorizationUrl` not exported

**Step 3: Implement PKCE + auth URL + exchange functions**

Add to `packages/providers/src/claude-oauth.ts` (append before `resolveAnthropicApiKey`):

```typescript
import { createHash, randomBytes } from 'node:crypto';

// OAuth PKCE constants
const CLAUDE_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const CLAUDE_OAUTH_AUTH_URL = 'https://claude.ai/oauth/authorize';
const CLAUDE_OAUTH_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const CLAUDE_OAUTH_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
const CLAUDE_OAUTH_SCOPES = 'org:create_api_key user:profile user:inference';

/**
 * Generate PKCE code verifier and challenge for OAuth.
 * RFC 7636: verifier is 43-128 chars of unreserved characters,
 * challenge is base64url(SHA-256(verifier)).
 */
export function generatePKCE(): { verifier: string; challenge: string } {
  // 64 random bytes → 86 base64url chars (within 43-128 range)
  const verifier = randomBytes(64)
    .toString('base64url');

  const challenge = createHash('sha256')
    .update(verifier)
    .digest('base64url');

  return { verifier, challenge };
}

/**
 * Build the authorization URL for Claude OAuth.
 * User opens this in a browser to authorize Auxiora.
 */
export function buildAuthorizationUrl(codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLAUDE_OAUTH_CLIENT_ID,
    redirect_uri: CLAUDE_OAUTH_REDIRECT_URI,
    scope: CLAUDE_OAUTH_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${CLAUDE_OAUTH_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<TokenRefreshResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: CLAUDE_OAUTH_CLIENT_ID,
    redirect_uri: CLAUDE_OAUTH_REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  const response = await fetch(CLAUDE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
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

  const expiresAt =
    typeof expiresIn === 'number'
      ? Date.now() + expiresIn * 1000
      : Date.now() + 3600 * 1000;

  return {
    accessToken,
    refreshToken: typeof refreshToken === 'string' ? refreshToken : '',
    expiresAt,
  };
}
```

Also update the existing `import { createHash } from 'node:crypto';` at the top to use `import { createHash, randomBytes } from 'node:crypto';` (note: the file currently uses `import fs` and `import path` and `import os` — `crypto` is new, add it).

**Step 4: Export the new functions**

Add to `packages/providers/src/index.ts`:

```typescript
export {
  // ... existing exports ...
  generatePKCE,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
} from './claude-oauth.js';
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && pnpm vitest run packages/providers/tests/claude-oauth.test.ts`
Expected: PASS (3 tests)

**Step 6: Commit**

```bash
git add packages/providers/src/claude-oauth.ts packages/providers/src/index.ts packages/providers/tests/claude-oauth.test.ts
git commit -m "feat(providers): add PKCE generation and OAuth authorization URL builder"
```

---

### Task 2: Add Dashboard API Routes for OAuth Flow

**Files:**
- Modify: `packages/dashboard/src/router.ts`

**Step 1: Add the PKCE state map and routes**

Find the line `const VALID_PROVIDERS = [...]` in `router.ts` (around line 837). After the VALID_PROVIDERS array, add `'claudeOAuth'` to it. Then find the `router.post('/provider/configure', ...)` route. Before that route, add:

```typescript
  // --- Claude OAuth PKCE flow ---
  // In-memory map: sessionId → { verifier, createdAt }
  const pkceStates = new Map<string, { verifier: string; createdAt: number }>();
  const PKCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  // Clean expired PKCE states periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, state] of pkceStates) {
      if (now - state.createdAt > PKCE_TTL_MS) {
        pkceStates.delete(key);
      }
    }
  }, 60_000);

  router.post('/provider/claude-oauth/start', async (req: Request, res: Response) => {
    const { generatePKCE, buildAuthorizationUrl } = await import('@auxiora/providers');

    const { verifier, challenge } = generatePKCE();

    // Store verifier keyed by session (from cookie)
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[COOKIE_NAME];
    if (!sessionId) {
      res.status(401).json({ error: 'No session' });
      return;
    }

    pkceStates.set(sessionId, { verifier, createdAt: Date.now() });

    const authUrl = buildAuthorizationUrl(challenge);
    void audit('settings.provider', { provider: 'claudeOAuth', action: 'oauth-start' });
    res.json({ authUrl });
  });

  router.post('/provider/claude-oauth/callback', async (req: Request, res: Response) => {
    const { code } = req.body as { code?: string };
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[COOKIE_NAME];
    if (!sessionId) {
      res.status(401).json({ error: 'No session' });
      return;
    }

    const pkceState = pkceStates.get(sessionId);
    if (!pkceState) {
      res.status(400).json({ error: 'No pending OAuth flow. Click "Connect" to start again.' });
      return;
    }

    // Check TTL
    if (Date.now() - pkceState.createdAt > PKCE_TTL_MS) {
      pkceStates.delete(sessionId);
      res.status(400).json({ error: 'OAuth flow expired. Click "Connect" to start again.' });
      return;
    }

    pkceStates.delete(sessionId);

    try {
      const { exchangeCodeForTokens, writeClaudeCliCredentials } = await import('@auxiora/providers');
      const tokens = await exchangeCodeForTokens(code, pkceState.verifier);

      // Store access token in vault (runtime reads ANTHROPIC_OAUTH_TOKEN)
      await deps.vault.add('ANTHROPIC_OAUTH_TOKEN', tokens.accessToken);

      // Also write to Claude CLI credentials format for auto-refresh
      writeClaudeCliCredentials(tokens);

      // Re-initialize providers to pick up the new token
      if (setup?.onSetupComplete) {
        await setup.onSetupComplete();
      }

      void audit('settings.provider', { provider: 'claudeOAuth', action: 'oauth-complete' });
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Token exchange failed';
      logger.error(new Error(`Claude OAuth callback failed: ${msg}`));
      res.status(400).json({ error: msg });
    }
  });

  router.post('/provider/claude-oauth/disconnect', async (req: Request, res: Response) => {
    try {
      // Remove from vault
      await deps.vault.add('ANTHROPIC_OAUTH_TOKEN', '');

      // Re-initialize providers
      if (setup?.onSetupComplete) {
        await setup.onSetupComplete();
      }

      void audit('settings.provider', { provider: 'claudeOAuth', action: 'disconnect' });
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Disconnect failed';
      res.status(500).json({ error: msg });
    }
  });

  router.get('/provider/claude-oauth/status', (_req: Request, res: Response) => {
    const hasToken = deps.vault.has('ANTHROPIC_OAUTH_TOKEN') &&
                     deps.vault.get('ANTHROPIC_OAUTH_TOKEN') !== '';
    res.json({ connected: hasToken });
  });
```

**Step 2: Export new functions from providers package**

Make sure `writeClaudeCliCredentials` and `exchangeCodeForTokens` are exported from `packages/providers/src/index.ts` (already handled in Task 1 for `exchangeCodeForTokens`; `writeClaudeCliCredentials` is already exported).

**Step 3: Build and verify TypeScript compiles**

Run: `cd /home/ai-work/git/auxiora && pnpm -r --filter @auxiora/dashboard build`
Expected: Successful compilation

**Step 4: Commit**

```bash
git add packages/dashboard/src/router.ts
git commit -m "feat(dashboard): add Claude OAuth PKCE start/callback/disconnect routes"
```

---

### Task 3: Add API Client Methods

**Files:**
- Modify: `packages/dashboard/ui/src/api.ts`

**Step 1: Add the four OAuth API methods**

Add to the `api` object in `api.ts`, after the `configureProvider` method:

```typescript
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
```

**Step 2: Build UI to verify**

Run: `cd /home/ai-work/git/auxiora && pnpm -r --filter @auxiora/dashboard-ui build`
Expected: Success

**Step 3: Commit**

```bash
git add packages/dashboard/ui/src/api.ts
git commit -m "feat(dashboard): add Claude OAuth API client methods"
```

---

### Task 4: Add Claude OAuth Card to Provider Settings UI

**Files:**
- Modify: `packages/dashboard/ui/src/pages/settings/Provider.tsx`

**Step 1: Add Claude OAuth to the KNOWN_PROVIDERS list**

In `Provider.tsx`, add a new entry to `KNOWN_PROVIDERS` array (add it as the second item, right after the `anthropic` entry):

```typescript
  { id: 'claudeOAuth', label: 'Claude (OAuth)', needsKey: false, needsOAuth: true },
```

Update the type to allow the `needsOAuth` field — change the `KNOWN_PROVIDERS` declaration to use `as const` or add the field. Since this is a simple array of objects, just add the property:

```typescript
const KNOWN_PROVIDERS: Array<{
  id: string;
  label: string;
  needsKey: boolean;
  needsEndpoint?: boolean;
  needsOAuth?: boolean;
}> = [
  { id: 'anthropic', label: 'Anthropic (Claude)', needsKey: true },
  { id: 'claudeOAuth', label: 'Claude (OAuth)', needsKey: false, needsOAuth: true },
  // ... rest unchanged
];
```

**Step 2: Add OAuth-specific state and handlers**

Add these state variables near the other state declarations:

```typescript
  // Claude OAuth flow state
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [oauthCode, setOauthCode] = useState('');
  const [oauthWaitingForCode, setOauthWaitingForCode] = useState(false);
  const [oauthConnected, setOauthConnected] = useState(false);
```

Add a `useEffect` to check OAuth status on load:

```typescript
  useEffect(() => {
    api.getClaudeOAuthStatus().then(s => setOauthConnected(s.connected)).catch(() => {});
  }, []);
```

Add handler functions:

```typescript
  const handleStartOAuth = async () => {
    setOauthConnecting(true);
    setError('');
    try {
      const { authUrl } = await api.startClaudeOAuth();
      window.open(authUrl, '_blank');
      setOauthWaitingForCode(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setOauthConnecting(false);
    }
  };

  const handleCompleteOAuth = async () => {
    if (!oauthCode.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.completeClaudeOAuth(oauthCode.trim());
      setSuccess('Claude OAuth connected successfully');
      setOauthWaitingForCode(false);
      setOauthCode('');
      setOauthConnected(true);
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnectOAuth = async () => {
    setSaving(true);
    setError('');
    try {
      await api.disconnectClaudeOAuth();
      setSuccess('Claude OAuth disconnected');
      setOauthConnected(false);
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
```

**Step 3: Render OAuth-specific card content**

Inside the provider card rendering (the `{isExpanded && (...)}` block), add a branch for OAuth providers. Replace the expand block with:

```tsx
{isExpanded && (
  <div className="provider-expand" onClick={e => e.stopPropagation()}>
    {spec.needsOAuth ? (
      // Claude OAuth flow
      <>
        {oauthConnected ? (
          <>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              Connected via Claude OAuth. Your Claude Pro/Max subscription is being used.
            </p>
            {models.length > 0 && (
              <>
                <label>Default Model</label>
                <select value={cardModel} onChange={e => setCardModel(e.target.value)}>
                  <option value="">Keep current</option>
                  {models.map(m => (
                    <option key={m} value={m}>{friendlyModelName(m)}</option>
                  ))}
                </select>
              </>
            )}
            <div className="provider-actions">
              <button
                className="btn-save"
                onClick={handleDisconnectOAuth}
                disabled={saving}
                style={{ background: 'var(--error, #e74c3c)' }}
              >
                {saving ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          </>
        ) : oauthWaitingForCode ? (
          <>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              Authorize in the browser tab that opened, then paste the code below.
            </p>
            <label>Authorization Code</label>
            <input
              type="text"
              value={oauthCode}
              onChange={e => setOauthCode(e.target.value)}
              placeholder="Paste the code from claude.ai"
              autoFocus
            />
            <div className="provider-actions">
              <button
                className="btn-save"
                onClick={handleCompleteOAuth}
                disabled={saving || !oauthCode.trim()}
              >
                {saving ? 'Connecting...' : 'Complete Connection'}
              </button>
              <button
                onClick={() => { setOauthWaitingForCode(false); setOauthCode(''); }}
                style={{ marginLeft: '0.5rem' }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              Connect your Claude Pro or Max subscription. No API key needed.
            </p>
            <div className="provider-actions">
              <button
                className="btn-save"
                onClick={handleStartOAuth}
                disabled={oauthConnecting}
              >
                {oauthConnecting ? 'Opening...' : 'Connect with Claude'}
              </button>
            </div>
          </>
        )}
      </>
    ) : (
      // Original API key / endpoint form (unchanged)
      <>
        {spec.needsKey && (
          <>
            <label>API Key</label>
            <input
              type="password"
              value={cardApiKey}
              onChange={e => setCardApiKey(e.target.value)}
              placeholder={isConfigured ? '••••••••  (leave blank to keep)' : 'Enter API key'}
            />
          </>
        )}
        {spec.needsEndpoint && (
          <>
            <label>Endpoint URL</label>
            <input
              type="text"
              value={cardEndpoint}
              onChange={e => setCardEndpoint(e.target.value)}
              placeholder={spec.id === 'ollama' ? 'http://localhost:11434' : 'https://...'}
            />
          </>
        )}
        {models.length > 0 && (
          <>
            <label>Default Model</label>
            <select value={cardModel} onChange={e => setCardModel(e.target.value)}>
              <option value="">Keep current</option>
              {models.map(m => (
                <option key={m} value={m}>{friendlyModelName(m)}</option>
              ))}
            </select>
          </>
        )}
        <div className="provider-actions">
          <button
            className="btn-save"
            onClick={() => handleSaveProvider(spec.id)}
            disabled={saving || (!cardApiKey && spec.needsKey && !isConfigured && !spec.needsEndpoint)}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </>
    )}
  </div>
)}
```

**Step 4: Update the card status display**

In the provider card header area, update the status/model display to show OAuth status for the Claude OAuth card. Update the status dot to use `oauthConnected` for the `claudeOAuth` card:

In the `isConfigured` check, also consider `oauthConnected` for the Claude OAuth card:

```tsx
const isOAuthCard = spec.id === 'claudeOAuth';
const isActive = isOAuthCard ? oauthConnected : isConfigured;
```

Use `isActive` instead of `isConfigured` for the status dot and card class on that card.

**Step 5: Build and verify**

Run: `cd /home/ai-work/git/auxiora && pnpm -r --filter @auxiora/dashboard-ui build`
Expected: Success

**Step 6: Commit**

```bash
git add packages/dashboard/ui/src/pages/settings/Provider.tsx
git commit -m "feat(dashboard): add Claude OAuth card to provider settings"
```

---

### Task 5: Wire Up the Models Endpoint to Report Claude OAuth Status

**Files:**
- Modify: `packages/dashboard/src/router.ts` (the `/models` GET route)

**Step 1: Update the listProviders response**

Find the `router.get('/models', ...)` route. The `deps.models.listProviders()` call returns provider info. The Claude OAuth provider will show up as `anthropic` (since it uses the same AnthropicProvider under the hood). The `credentialSource` field already shows `'oauth'` when OAuth is active.

Check that the existing `listProviders()` implementation in the runtime marks the credential source correctly. If the Anthropic provider was initialized with `oauthToken`, the runtime should report `credentialSource: 'oauth'`.

Look at `packages/runtime/src/index.ts` around the `listProviders` method to verify. If not present, add the credential source detection:

```typescript
// In the models.listProviders() implementation
credentialSource: anthropicOAuthToken ? 'oauth' : hasCliCredentials ? 'claude-cli' : undefined,
```

**Step 2: Build and verify**

Run: `cd /home/ai-work/git/auxiora && pnpm -r --filter @auxiora/runtime build`
Expected: Success

**Step 3: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): report OAuth credential source in provider listing"
```

---

### Task 6: Build, Test, and Verify End-to-End

**Step 1: Run all existing tests**

Run: `cd /home/ai-work/git/auxiora && pnpm test`
Expected: All tests pass (200+ existing + new PKCE tests)

**Step 2: Build all packages**

Run: `cd /home/ai-work/git/auxiora && pnpm build`
Expected: Clean build

**Step 3: Rebuild and run Docker**

Run: `./docker-run.sh --down && ./docker-run.sh`
Verify: Dashboard loads, navigate to Settings > Providers, Claude (OAuth) card appears

**Step 4: Manual verification checklist**

- [ ] Claude (OAuth) card appears in provider list
- [ ] Clicking expand shows "Connect with Claude" button
- [ ] Button opens authorization URL in new tab
- [ ] Code paste field appears after clicking Connect
- [ ] Cancel button resets the flow
- [ ] After pasting code, "Complete Connection" submits it
- [ ] On success, card shows green dot and "(OAuth)" badge
- [ ] Disconnect button removes the connection

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Claude OAuth provider integration complete"
```
