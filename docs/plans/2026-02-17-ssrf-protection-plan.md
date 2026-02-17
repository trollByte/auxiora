# SSRF Protection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract URL validation into a shared `packages/ssrf-guard/` package and apply it to all user-controlled fetch sites to prevent Server-Side Request Forgery attacks.

**Architecture:** A new `@auxiora/ssrf-guard` package containing the existing `validateUrl()` logic (currently in browser package) plus a `safeFetch()` convenience wrapper that validates before fetching. The browser package re-exports from the new package. Media providers, web tool, and research engine import `safeFetch` or `validateUrl` to guard user-controlled URLs.

**Tech Stack:** TypeScript strict ESM, Node >=22, vitest

---

## Codebase Context

**Existing validator** (`packages/browser/src/url-validator.ts`): ~198 lines. Exports `validateUrl(url, options?)` which returns `null` if safe, error string if blocked. Covers: protocol checks, numeric IP bypass detection (decimal/hex/octal), IPv6 private ranges, IPv4-mapped IPv6, localhost, allowlist/blocklist.

**Existing tests** (`packages/browser/tests/url-validator.test.ts`): 20 tests covering valid URLs, blocked protocols, private IPs, SSRF bypass prevention, invalid URLs, allowlist/blocklist.

**Blocked protocols constant** (`packages/browser/src/types.ts:21`): `BLOCKED_PROTOCOLS = ['file:', 'javascript:', 'data:', 'blob:']`

**Critical fetch sites (user-controlled URLs, NO validation):**
- `packages/media/src/providers/file-extractor.ts:34` — `fetch(attachment.url)`
- `packages/media/src/providers/whisper.ts:32` — `fetch(attachment.url)`
- `packages/media/src/providers/vision.ts:38` — `fetch(attachment.url)`

**High-priority fetch sites (user-influenced URLs):**
- `packages/tools/src/web.ts:193` — `fetch(url)` with only format validation
- `packages/research/src/brave-search.ts:61` — `fetchPage(url)` with no validation

---

## Task 1: SSRF Guard Package (Types + Validator + Tests)

**Files:**
- Create: `packages/ssrf-guard/package.json`
- Create: `packages/ssrf-guard/tsconfig.json`
- Create: `packages/ssrf-guard/src/types.ts`
- Create: `packages/ssrf-guard/src/validate.ts`
- Create: `packages/ssrf-guard/src/safe-fetch.ts`
- Create: `packages/ssrf-guard/src/index.ts`
- Create: `packages/ssrf-guard/tests/validate.test.ts`
- Create: `packages/ssrf-guard/tests/safe-fetch.test.ts`

**Step 1: Create package.json**

Create `packages/ssrf-guard/package.json`:

```json
{
  "name": "@auxiora/ssrf-guard",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/ssrf-guard/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 3: Create types**

Create `packages/ssrf-guard/src/types.ts`:

```typescript
export interface ValidatorOptions {
  allowedUrls?: string[];
  blockedUrls?: string[];
}

export const BLOCKED_PROTOCOLS = ['file:', 'javascript:', 'data:', 'blob:'];

export class SSRFError extends Error {
  readonly url: string;
  readonly reason: string;

  constructor(url: string, reason: string) {
    super(`SSRF blocked: ${reason} (${url})`);
    this.name = 'SSRFError';
    this.url = url;
    this.reason = reason;
  }
}
```

**Step 4: Create validate.ts**

Create `packages/ssrf-guard/src/validate.ts` — this is the existing `url-validator.ts` logic from the browser package, adapted to use local types:

```typescript
import { isIP } from 'node:net';
import { BLOCKED_PROTOCOLS, type ValidatorOptions } from './types.js';

/**
 * Check if an IP address (v4 or v6) falls within private/internal ranges.
 * Uses numeric comparison instead of string prefix matching to prevent
 * bypass via decimal, hex, or octal IP encodings.
 */
function isPrivateIP(ip: string): boolean {
  // IPv6 checks
  if (ip.includes(':')) {
    const normalized = normalizeIPv6(ip);
    if (normalized === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
    if (normalized === '0000:0000:0000:0000:0000:0000:0000:0000') return true;
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
        normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (normalized.startsWith('0000:0000:0000:0000:0000:ffff:')) {
      const lastTwo = normalized.slice(30);
      const hi = parseInt(lastTwo.slice(0, 4), 16);
      const lo = parseInt(lastTwo.slice(5, 9), 16);
      const ipv4 = ((hi << 16) | lo) >>> 0;
      return isPrivateIPv4Numeric(ipv4);
    }
    return false;
  }

  const num = parseIPv4ToNumber(ip);
  if (num === null) return false;
  return isPrivateIPv4Numeric(num);
}

function parseIPv4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

function isPrivateIPv4Numeric(ip: number): boolean {
  if ((ip >>> 24) === 127) return true;
  if ((ip >>> 24) === 10) return true;
  if ((ip >>> 20) === (172 << 4 | 1)) return true;
  if ((ip >>> 16) === (192 << 8 | 168)) return true;
  if ((ip >>> 16) === (169 << 8 | 254)) return true;
  if (ip === 0) return true;
  return false;
}

function normalizeIPv6(ip: string): string {
  const v4MappedMatch = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4MappedMatch) {
    const v4num = parseIPv4ToNumber(v4MappedMatch[1]);
    if (v4num !== null) {
      const hi = (v4num >>> 16) & 0xffff;
      const lo = v4num & 0xffff;
      return `0000:0000:0000:0000:0000:ffff:${hi.toString(16).padStart(4, '0')}:${lo.toString(16).padStart(4, '0')}`;
    }
  }

  let parts = ip.split(':');
  if (ip.includes('::')) {
    const before = ip.split('::')[0].split(':').filter(Boolean);
    const after = ip.split('::')[1].split(':').filter(Boolean);
    const missing = 8 - before.length - after.length;
    parts = [...before, ...Array(missing).fill('0'), ...after];
  }

  return parts.map((p) => (p || '0').padStart(4, '0').toLowerCase()).join(':');
}

function isNumericHostname(hostname: string): boolean {
  if (/^\d+$/.test(hostname)) return true;
  if (/^0x[0-9a-fA-F]+$/i.test(hostname)) return true;
  if (/^[0-7]+\./.test(hostname) && hostname.startsWith('0') && !hostname.startsWith('0.')) return true;
  return false;
}

/**
 * Validates a URL against SSRF attacks.
 * Returns null if valid, or an error message string.
 */
export function validateUrl(url: string, options?: ValidatorOptions): string | null {
  if (!url || typeof url !== 'string') {
    return 'URL must be a non-empty string';
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL format';
  }

  if (BLOCKED_PROTOCOLS.includes(parsed.protocol)) {
    return `Blocked protocol: ${parsed.protocol} — only http: and https: are allowed`;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Blocked protocol: ${parsed.protocol} — only http: and https: are allowed`;
  }

  const hostname = parsed.hostname;

  if (options?.blockedUrls?.some((pattern) => hostname.includes(pattern))) {
    return `URL blocked by blocklist: ${hostname}`;
  }

  const isAllowed = options?.allowedUrls?.some((pattern) => hostname.includes(pattern));
  if (isAllowed) {
    return null;
  }

  if (isNumericHostname(hostname)) {
    return `Blocked numeric IP encoding: ${hostname}`;
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return `Blocked private/internal address: ${hostname}`;
  }

  const ipVersion = isIP(hostname);
  if (ipVersion > 0) {
    if (isPrivateIP(hostname)) {
      return `Blocked private/internal address: ${hostname}`;
    }
  }

  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    const innerIP = hostname.slice(1, -1);
    if (isPrivateIP(innerIP)) {
      return `Blocked private/internal address: ${hostname}`;
    }
  }

  return null;
}

export { isPrivateIP, parseIPv4ToNumber, isNumericHostname, normalizeIPv6 };
```

**Step 5: Create safe-fetch.ts**

Create `packages/ssrf-guard/src/safe-fetch.ts`:

```typescript
import { SSRFError, type ValidatorOptions } from './types.js';
import { validateUrl } from './validate.js';

/**
 * Fetch a URL after validating it against SSRF attacks.
 * Throws SSRFError if the URL targets a private/internal address.
 */
export async function safeFetch(
  url: string,
  init?: RequestInit,
  options?: ValidatorOptions,
): Promise<Response> {
  const error = validateUrl(url, options);
  if (error) {
    throw new SSRFError(url, error);
  }
  return fetch(url, init);
}
```

**Step 6: Create barrel export**

Create `packages/ssrf-guard/src/index.ts`:

```typescript
export { validateUrl, isPrivateIP, parseIPv4ToNumber, isNumericHostname, normalizeIPv6 } from './validate.js';
export { safeFetch } from './safe-fetch.js';
export { SSRFError, BLOCKED_PROTOCOLS, type ValidatorOptions } from './types.js';
```

**Step 7: Write validator tests**

Create `packages/ssrf-guard/tests/validate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateUrl } from '../src/validate.js';

describe('validateUrl', () => {
  describe('valid URLs', () => {
    it('should allow https URLs', () => {
      expect(validateUrl('https://example.com')).toBeNull();
    });

    it('should allow http URLs', () => {
      expect(validateUrl('http://example.com')).toBeNull();
    });

    it('should allow URLs with paths and query params', () => {
      expect(validateUrl('https://example.com/path?q=1')).toBeNull();
    });
  });

  describe('blocked protocols', () => {
    it('should block file:// protocol', () => {
      expect(validateUrl('file:///etc/passwd')).toContain('protocol');
    });

    it('should block javascript: protocol', () => {
      expect(validateUrl('javascript:alert(1)')).toContain('protocol');
    });

    it('should block data: protocol', () => {
      expect(validateUrl('data:text/html,<script>alert(1)</script>')).toContain('protocol');
    });
  });

  describe('private IP blocking', () => {
    it('should block localhost', () => {
      expect(validateUrl('http://localhost:3000')).toContain('private');
    });

    it('should block 127.0.0.1', () => {
      expect(validateUrl('http://127.0.0.1')).toContain('private');
    });

    it('should block 10.x.x.x', () => {
      expect(validateUrl('http://10.0.0.1')).toContain('private');
    });

    it('should block 192.168.x.x', () => {
      expect(validateUrl('http://192.168.1.1')).toContain('private');
    });

    it('should block 169.254.x.x (cloud metadata)', () => {
      expect(validateUrl('http://169.254.169.254')).toContain('private');
    });

    it('should block 172.16-31.x.x', () => {
      expect(validateUrl('http://172.16.0.1')).toContain('private');
      expect(validateUrl('http://172.31.255.255')).toContain('private');
    });

    it('should allow 172.32.x.x (not private)', () => {
      expect(validateUrl('http://172.32.0.1')).toBeNull();
    });

    it('should block 0.0.0.0', () => {
      expect(validateUrl('http://0.0.0.0')).toContain('private');
    });
  });

  describe('SSRF bypass prevention', () => {
    it('should block decimal IP encoding (2130706433 = 127.0.0.1)', () => {
      expect(validateUrl('http://2130706433')).toBeTruthy();
    });

    it('should block hex IP encoding (0x7f000001 = 127.0.0.1)', () => {
      expect(validateUrl('http://0x7f000001')).toBeTruthy();
    });

    it('should block IPv6 loopback (::1)', () => {
      expect(validateUrl('http://[::1]')).toContain('private');
    });

    it('should block IPv6-mapped 127.0.0.1', () => {
      expect(validateUrl('http://[::ffff:127.0.0.1]')).toContain('private');
    });

    it('should block subdomain of localhost', () => {
      expect(validateUrl('http://foo.localhost:3000')).toContain('private');
    });
  });

  describe('invalid input', () => {
    it('should reject empty string', () => {
      expect(validateUrl('')).toBeTruthy();
    });

    it('should reject malformed URLs', () => {
      expect(validateUrl('not a url')).toBeTruthy();
    });
  });

  describe('allowlist/blocklist', () => {
    it('should allow private IPs when in allowlist', () => {
      expect(validateUrl('http://localhost:3000', { allowedUrls: ['localhost'] })).toBeNull();
    });

    it('should block URLs in blocklist', () => {
      expect(validateUrl('https://evil.com/page', { blockedUrls: ['evil.com'] })).toContain('blocked');
    });

    it('should let blocklist take priority over allowlist', () => {
      expect(validateUrl('https://evil.com', {
        allowedUrls: ['evil.com'],
        blockedUrls: ['evil.com'],
      })).toContain('blocked');
    });
  });
});
```

**Step 8: Write safe-fetch tests**

Create `packages/ssrf-guard/tests/safe-fetch.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { safeFetch } from '../src/safe-fetch.js';
import { SSRFError } from '../src/types.js';

describe('safeFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw SSRFError for private IPs', async () => {
    await expect(safeFetch('http://127.0.0.1/secret')).rejects.toThrow(SSRFError);
  });

  it('should throw SSRFError for localhost', async () => {
    await expect(safeFetch('http://localhost:8080')).rejects.toThrow(SSRFError);
  });

  it('should throw SSRFError with url and reason properties', async () => {
    try {
      await safeFetch('http://10.0.0.1/internal');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SSRFError);
      expect((e as SSRFError).url).toBe('http://10.0.0.1/internal');
      expect((e as SSRFError).reason).toContain('private');
    }
  });

  it('should call fetch for valid public URLs', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const result = await safeFetch('https://example.com/api');
    expect(result).toBe(mockResponse);
    expect(fetch).toHaveBeenCalledWith('https://example.com/api', undefined);

    vi.unstubAllGlobals();
  });

  it('should pass through RequestInit options', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const init = { method: 'POST', body: 'data' };
    await safeFetch('https://example.com/api', init);
    expect(fetch).toHaveBeenCalledWith('https://example.com/api', init);

    vi.unstubAllGlobals();
  });

  it('should respect allowlist', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const result = await safeFetch('http://localhost:11434/api', undefined, {
      allowedUrls: ['localhost'],
    });
    expect(result).toBe(mockResponse);

    vi.unstubAllGlobals();
  });
});
```

**Step 9: Install dependencies and run tests**

Run: `cd /home/ai-work/git/auxiora && pnpm install`
Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/ssrf-guard/tests/`
Expected: PASS (all tests — approximately 22 validate + 6 safe-fetch = 28 tests)

**Step 10: Commit**

```bash
git add packages/ssrf-guard/
git commit -m "feat(ssrf-guard): add shared SSRF protection package with validateUrl and safeFetch"
```

---

## Task 2: Refactor Browser Package to Use @auxiora/ssrf-guard

**Files:**
- Modify: `packages/browser/package.json`
- Modify: `packages/browser/src/url-validator.ts`
- Modify: `packages/browser/src/types.ts:21`
- Modify: `packages/browser/src/index.ts`

**Step 1: Add dependency**

In `packages/browser/package.json`, add to `"dependencies"`:
```json
"@auxiora/ssrf-guard": "workspace:*"
```

**Step 2: Replace url-validator.ts with re-export**

Replace the entire contents of `packages/browser/src/url-validator.ts` with:

```typescript
// Re-export from shared SSRF guard package
export { validateUrl, isPrivateIP, parseIPv4ToNumber, isNumericHostname, normalizeIPv6 } from '@auxiora/ssrf-guard';
```

**Step 3: Update types.ts to re-export BLOCKED_PROTOCOLS**

In `packages/browser/src/types.ts`, find line 21:
```typescript
export const BLOCKED_PROTOCOLS = ['file:', 'javascript:', 'data:', 'blob:'];
```
Replace with:
```typescript
export { BLOCKED_PROTOCOLS } from '@auxiora/ssrf-guard';
```

**Step 4: Run browser tests**

Run: `cd /home/ai-work/git/auxiora && pnpm install && npx vitest run packages/browser/tests/url-validator.test.ts`
Expected: PASS (all 20 existing tests still pass — same underlying logic)

**Step 5: Commit**

```bash
git add packages/browser/package.json packages/browser/src/url-validator.ts packages/browser/src/types.ts
git commit -m "refactor(browser): re-export URL validator from @auxiora/ssrf-guard"
```

---

## Task 3: Guard Media Pipeline Fetches

**Files:**
- Modify: `packages/media/package.json`
- Modify: `packages/media/src/providers/file-extractor.ts:34`
- Modify: `packages/media/src/providers/whisper.ts:32`
- Modify: `packages/media/src/providers/vision.ts:38`
- Modify: `packages/media/tests/file-extractor.test.ts`
- Modify: `packages/media/tests/whisper.test.ts`
- Modify: `packages/media/tests/vision.test.ts`

**Step 1: Add dependency**

In `packages/media/package.json`, add to `"dependencies"`:
```json
"@auxiora/ssrf-guard": "workspace:*"
```

**Step 2: Guard file-extractor.ts**

In `packages/media/src/providers/file-extractor.ts`, add import at top:
```typescript
import { safeFetch } from '@auxiora/ssrf-guard';
```

Replace line 34:
```typescript
        const response = await fetch(attachment.url);
```
With:
```typescript
        const response = await safeFetch(attachment.url);
```

**Step 3: Guard whisper.ts**

In `packages/media/src/providers/whisper.ts`, add import at top (after logger import):
```typescript
import { safeFetch } from '@auxiora/ssrf-guard';
```

Replace line 32:
```typescript
        const response = await fetch(attachment.url);
```
With:
```typescript
        const response = await safeFetch(attachment.url);
```

Note: Do NOT change the Whisper API call on line 56 (`fetch(this.apiUrl, ...)`). That's a hardcoded/config API endpoint, not a user-controlled URL.

**Step 4: Guard vision.ts**

In `packages/media/src/providers/vision.ts`, add import at top (after logger import):
```typescript
import { safeFetch } from '@auxiora/ssrf-guard';
```

Replace line 38:
```typescript
        const response = await fetch(attachment.url);
```
With:
```typescript
        const response = await safeFetch(attachment.url);
```

Note: Do NOT change the Anthropic/OpenAI API calls on lines 63 and 100. Those are hardcoded API endpoints.

**Step 5: Add SSRF test to file-extractor tests**

In `packages/media/tests/file-extractor.test.ts`, add a new test inside the `describe('FileExtractor', ...)` block:

```typescript
  it('should block SSRF attempts on private URLs', async () => {
    const attachment: Attachment = {
      type: 'file',
      url: 'http://169.254.169.254/latest/meta-data/',
      filename: 'metadata.txt',
      mimeType: 'text/plain',
    };
    const result = await extractor.processAttachment(attachment);
    expect(result.success).toBe(false);
    expect(result.error).toContain('SSRF');
  });
```

**Step 6: Add SSRF test to whisper tests**

In `packages/media/tests/whisper.test.ts`, add a new test inside the `describe('WhisperProvider', ...)` block:

```typescript
  it('should block SSRF attempts on private URLs', async () => {
    const provider = new WhisperProvider({ apiKey: 'test-key' });
    const attachment: Attachment = { type: 'audio', url: 'http://10.0.0.1/internal-audio' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(false);
    expect(result.error).toContain('SSRF');
  });
```

**Step 7: Add SSRF test to vision tests**

In `packages/media/tests/vision.test.ts`, add a new test inside the `describe('VisionProvider', ...)` block:

```typescript
  it('should block SSRF attempts on private URLs', async () => {
    const provider = new VisionProvider({ apiKey: 'test-key', provider: 'anthropic' });
    const attachment: Attachment = { type: 'image', url: 'http://192.168.1.1/camera' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(false);
    expect(result.error).toContain('SSRF');
  });
```

**Step 8: Run tests**

Run: `cd /home/ai-work/git/auxiora && pnpm install && npx vitest run packages/media/tests/`
Expected: PASS (all existing tests + 3 new SSRF tests)

**Step 9: Commit**

```bash
git add packages/media/package.json packages/media/src/providers/file-extractor.ts packages/media/src/providers/whisper.ts packages/media/src/providers/vision.ts packages/media/tests/file-extractor.test.ts packages/media/tests/whisper.test.ts packages/media/tests/vision.test.ts
git commit -m "feat(media): guard all attachment URL fetches with SSRF protection"
```

---

## Task 4: Guard Web Tool and Research Engine

**Files:**
- Modify: `packages/tools/src/web.ts:133-154,193`
- Modify: `packages/research/package.json`
- Modify: `packages/research/src/brave-search.ts:56-65`

**Step 1: Guard web tool**

The tools package already depends on `@auxiora/browser` which re-exports `validateUrl`. In `packages/tools/src/web.ts`, find the `validateParams` method (line 133-154). The current validation only checks URL format:

```typescript
    try {
      new URL(params.url);
    } catch {
      return 'url must be a valid URL';
    }
```

Replace that block with:

```typescript
    // SSRF protection: validate URL format AND block private/internal addresses
    const { validateUrl } = await import('@auxiora/ssrf-guard');
    const ssrfError = validateUrl(params.url);
    if (ssrfError) {
      return ssrfError;
    }
```

Wait — `validateParams` is synchronous, so we can't use dynamic import. Instead, add a static import at the top of the file and use it:

At the top of `packages/tools/src/web.ts`, add:
```typescript
import { validateUrl } from '@auxiora/ssrf-guard';
```

Then replace the URL format check in `validateParams` (lines 138-143):
```typescript
    try {
      new URL(params.url);
    } catch {
      return 'url must be a valid URL';
    }
```
With:
```typescript
    const ssrfError = validateUrl(params.url);
    if (ssrfError) {
      return ssrfError;
    }
```

This covers both format validation (validateUrl rejects malformed URLs) AND SSRF protection.

Also add `"@auxiora/ssrf-guard": "workspace:*"` to `packages/tools/package.json` dependencies.

**Step 2: Guard research engine**

In `packages/research/package.json`, add to `"dependencies"`:
```json
"@auxiora/ssrf-guard": "workspace:*"
```

In `packages/research/src/brave-search.ts`, add import:
```typescript
import { validateUrl } from '@auxiora/ssrf-guard';
```

In the `fetchPage` method (around line 56-65), add SSRF check before the fetch:

Find:
```typescript
  async fetchPage(url: string): Promise<string> {
    const controller = new AbortController();
```

Replace with:
```typescript
  async fetchPage(url: string): Promise<string> {
    const ssrfError = validateUrl(url);
    if (ssrfError) {
      return `[SSRF blocked: ${ssrfError}]`;
    }
    const controller = new AbortController();
```

**Step 3: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && pnpm install && npx vitest run`
Expected: PASS (all tests)

**Step 4: Commit**

```bash
git add packages/tools/package.json packages/tools/src/web.ts packages/research/package.json packages/research/src/brave-search.ts pnpm-lock.yaml
git commit -m "feat(tools,research): add SSRF protection to web tool and search page fetching"
```

---

## Test Summary

| Task | Component | Test File | New Tests |
|------|-----------|-----------|-----------|
| 1 | validateUrl + safeFetch | `validate.test.ts`, `safe-fetch.test.ts` | ~28 |
| 2 | Browser refactor | (existing tests) | 0 |
| 3 | Media providers | `file-extractor.test.ts`, `whisper.test.ts`, `vision.test.ts` | 3 |
| 4 | Web tool + research | (existing tests) | 0 |
| **Total** | | | **~31** |
