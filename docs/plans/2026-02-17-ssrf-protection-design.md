# SSRF Protection Design

**Date**: 2026-02-17
**Status**: Approved
**Priority**: #9 (OpenClaw-inspired hardening)

---

## Problem

The media pipeline, web tool, research engine, and Home Assistant connector all fetch user-controlled URLs with no SSRF validation. An attacker could send a channel message with an attachment URL like `http://169.254.169.254/latest/meta-data/` (cloud metadata) or `http://localhost:8123/api/` (internal service) and the system would fetch it.

The browser package has a robust `validateUrl()` implementation with numeric IP bypass detection, IPv6 support, and private range blocking — but it's locked inside `@auxiora/browser` and only used for navigation.

## Solution

Extract URL validation into a new `packages/ssrf-guard/` package and apply it to all user-controlled fetch sites across the codebase.

## Architecture

### Package: `packages/ssrf-guard/`

| File | Purpose | ~Lines |
|------|---------|--------|
| `src/validate.ts` | `isPrivateIP`, `parseIPv4ToNumber`, `normalizeIPv6`, `isNumericHostname`, `validateUrl` | ~120 |
| `src/safe-fetch.ts` | `safeFetch()` — validates URL then calls native `fetch()` | ~30 |
| `src/types.ts` | `ValidatorOptions`, `SSRFError`, `BLOCKED_PROTOCOLS` | ~15 |
| `src/index.ts` | Barrel exports | ~5 |

### Exports

- **`validateUrl(url, options?)`** — Returns `null` if safe, error message string if blocked. Pure function, no side effects.
- **`safeFetch(url, init?, options?)`** — Validates URL, throws `SSRFError` on violation, otherwise calls native `fetch()`.
- **`SSRFError`** — Typed error class extending `Error` with `url` and `reason` properties.
- **`isPrivateIP(ip)`** — Exported for testing. Handles IPv4, IPv6, IPv4-mapped IPv6.

### ValidatorOptions

```typescript
interface ValidatorOptions {
  allowedUrls?: string[];   // Allowlist (skip private IP check)
  blockedUrls?: string[];   // Blocklist (takes priority)
}
```

### Protection Layers

1. **Protocol check** — Only `http:` and `https:` allowed. Blocks `file:`, `javascript:`, `data:`, `blob:`.
2. **Numeric IP bypass** — Detects decimal (`2130706433`), hex (`0x7f000001`), octal (`0177.0.0.1`) encodings.
3. **Localhost check** — Blocks `localhost` and `*.localhost`.
4. **Private IP ranges** — Blocks 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 0.0.0.0.
5. **IPv6 private** — Blocks ::1, ::, fe80::/10, fc00::/7, ::ffff:private.
6. **Allowlist/blocklist** — Per-call overrides for legitimate internal access (e.g., Ollama).

### Call Site Changes

**Critical (user-controlled URLs — media pipeline):**
- `packages/media/src/providers/file-extractor.ts` — `fetch(url)` → `safeFetch(url)`
- `packages/media/src/providers/whisper.ts` — `fetch(url)` → `safeFetch(url)`
- `packages/media/src/providers/vision.ts` — `fetch(url)` → `safeFetch(url)`

**High (user-influenced URLs):**
- `packages/tools/src/web.ts` — Add `validateUrl()` before fetch
- `packages/research/src/brave-search.ts` — Add `validateUrl()` before fetching pages

**Refactor (browser package):**
- `packages/browser/src/url-validator.ts` — Replace with re-export from `@auxiora/ssrf-guard`
- `packages/browser/package.json` — Add `@auxiora/ssrf-guard` dependency

### Error Handling

- Media providers already catch errors gracefully — SSRF violations are logged and skipped
- Web tool returns error message to user
- Research skips blocked URLs silently
- `SSRFError` carries `url` and `reason` for logging

## Testing Strategy

1. **Unit tests** for `validateUrl()` (~12): private IPs, numeric bypasses, IPv6, protocols, allowlist/blocklist, localhost
2. **Unit tests** for `safeFetch()` (~4): blocks private, allows public, throws SSRFError, passes options
3. **Browser URL validator tests** should pass after refactor (same underlying logic)

## Non-Goals

- No DNS pinning (would require async resolution before fetch — future enhancement)
- No redirect following validation (native fetch handles redirects; future enhancement)
- No per-package allowlist configuration (hardcoded for now, config later if needed)
- No rate limiting on fetch calls (separate concern)
