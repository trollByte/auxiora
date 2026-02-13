# Claude OAuth Provider Integration Design

**Date:** 2026-02-13
**Status:** Approved

## Problem

Auxiora needs a way to authenticate with Anthropic's Claude API using OAuth (Claude Pro/Max subscription) instead of requiring an API key. This is especially important in Docker where the user may not have a separate API key but does have a Claude subscription.

## Solution

Add a "Claude (OAuth)" provider option to the dashboard that uses the OAuth 2.0 Authorization Code Flow with PKCE to authenticate with claude.ai.

## User Flow

1. User expands the "Claude (OAuth)" card in Settings > Providers
2. Clicks "Connect with Claude" button
3. Server generates PKCE code verifier + challenge, returns authorization URL
4. Dashboard opens the URL in a new browser tab
5. User logs in at claude.ai and approves access
6. claude.ai redirects to Anthropic's callback page displaying the authorization code
7. User copies the code and pastes it into the dashboard text field
8. Server exchanges code + PKCE verifier for access/refresh tokens
9. Tokens stored in vault, Anthropic provider re-initializes with OAuth mode
10. Card shows green status dot + "(OAuth)" badge

## Architecture

### OAuth Constants

```
Client ID:       9d1c250a-e61b-44d9-88ed-5944d1962f5e
Auth URL:        https://claude.ai/oauth/authorize
Token URL:       https://console.anthropic.com/v1/oauth/token
Redirect URI:    https://console.anthropic.com/oauth/code/callback
Scopes:          org:create_api_key user:profile user:inference
PKCE Method:     S256
```

### Files to Modify

| File | Change |
|------|--------|
| `packages/providers/src/claude-oauth.ts` | Add PKCE generation, auth URL builder, code exchange |
| `packages/dashboard/src/router.ts` | Add `/provider/claude-oauth/start` and `/provider/claude-oauth/callback` routes |
| `packages/dashboard/ui/src/pages/settings/Provider.tsx` | Add Claude OAuth card with connect/disconnect UI |
| `packages/dashboard/ui/src/api.ts` | Add `startClaudeOAuth()` and `completeClaudeOAuth()` |
| `packages/providers/src/types.ts` | Add `claudeOAuth` to `ProviderConfig` |

### Data Flow

```
Dashboard UI                    Dashboard Server              Anthropic
──────────                      ────────────────              ─────────
Click "Connect"  ──────────►  Generate PKCE verifier+challenge
                               Store verifier in session map
                 ◄──────────  Return auth URL

Open auth URL    ──────────────────────────────────────────►  /oauth/authorize
                                                              User approves
                 ◄──────────────────────────────────────────  Shows auth code

Paste code       ──────────►  Exchange code + verifier  ───►  /v1/oauth/token
                               Store tokens in vault    ◄───  access + refresh tokens
                               Re-init Anthropic provider
                 ◄──────────  { success: true }
```

### Token Storage (Vault)

- `CLAUDE_OAUTH_ACCESS_TOKEN` — current access token
- `CLAUDE_OAUTH_REFRESH_TOKEN` — refresh token for renewal
- `CLAUDE_OAUTH_EXPIRES_AT` — expiry timestamp (string, epoch ms)

### PKCE State

Server-side in-memory `Map<sessionId, { verifier: string; createdAt: number }>`. Entries expire after 10 minutes. No database needed.

### Token Refresh

Uses existing `refreshOAuthToken()` in `claude-oauth.ts`. The `AnthropicProvider.ensureValidCredentials()` method handles automatic refresh before API calls. On refresh, updated tokens are written back to vault.

## Error Handling

- **Token expired:** Auto-refresh via `ensureValidCredentials()`
- **Refresh token revoked:** Surface error in dashboard, prompt re-authentication
- **Concurrent OAuth flows:** Last one wins (new PKCE state replaces previous)
- **User abandons auth:** Cancel button clears state
- **Docker networking:** Not an issue — user's browser handles auth, not the container

## Testing

- Unit: PKCE generation (verifier length, challenge hash correctness)
- Unit: Authorization URL construction (all required params present)
- Unit: Token exchange request format
- Integration: Full route flow with mocked Anthropic token endpoint
