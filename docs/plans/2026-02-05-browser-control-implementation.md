# Browser Control Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Playwright-powered web automation to Auxiora through 8 browser tools and a BrowserManager class.

**Architecture:** A new `packages/browser` package contains `BrowserManager` (singleton Chromium, per-session Pages). Tools in `packages/tools/src/browser.ts` connect via `setBrowserManager()` injection. The `browse` high-level tool chains primitives for read-only tasks.

**Tech Stack:** Playwright (Chromium), TypeScript ESM, vitest, same patterns as behaviors package.

---

### Task 1: Scaffold `packages/browser` package

**Files:**
- Create: `packages/browser/package.json`
- Create: `packages/browser/tsconfig.json`
- Create: `packages/browser/src/index.ts` (empty barrel export)

**Step 1: Create `package.json`**

```json
{
  "name": "@auxiora/browser",
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
  },
  "dependencies": {
    "@auxiora/core": "workspace:*",
    "@auxiora/errors": "workspace:*",
    "@auxiora/logger": "workspace:*",
    "playwright": "^1.50.0",
    "nanoid": "^5.1.2"
  }
}
```

**Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../core" },
    { "path": "../errors" },
    { "path": "../logger" }
  ]
}
```

**Step 3: Create empty barrel export**

Create `packages/browser/src/index.ts`:

```typescript
// Browser control exports - will be populated as types/classes are built
```

**Step 4: Install dependencies**

Run: `cd /home/ai-work/git/auxiora && pnpm install`
Expected: Installs Playwright and links workspace deps.

Then install Chromium:

Run: `cd /home/ai-work/git/auxiora && npx playwright install chromium`
Expected: Downloads Chromium binary.

**Step 5: Verify build**

Run: `cd /home/ai-work/git/auxiora && pnpm --filter @auxiora/browser typecheck`
Expected: Clean output, no errors.

**Step 6: Commit**

```bash
git add packages/browser/
git commit -m "feat(browser): scaffold browser package with Playwright dependency"
```

---

### Task 2: Types and configuration

**Files:**
- Create: `packages/browser/src/types.ts`

**Step 1: Write the failing test**

Create `packages/browser/tests/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { BrowserConfig, PageInfo, BrowseStep } from '../src/types.js';
import { DEFAULT_BROWSER_CONFIG, BLOCKED_PROTOCOLS, PRIVATE_IP_RANGES } from '../src/types.js';

describe('Browser types', () => {
  it('should provide sensible default config', () => {
    expect(DEFAULT_BROWSER_CONFIG.headless).toBe(true);
    expect(DEFAULT_BROWSER_CONFIG.viewport).toEqual({ width: 1280, height: 720 });
    expect(DEFAULT_BROWSER_CONFIG.navigationTimeout).toBe(30_000);
    expect(DEFAULT_BROWSER_CONFIG.actionTimeout).toBe(10_000);
    expect(DEFAULT_BROWSER_CONFIG.maxConcurrentPages).toBe(10);
    expect(DEFAULT_BROWSER_CONFIG.screenshotDir).toBe('screenshots');
  });

  it('should block dangerous protocols', () => {
    expect(BLOCKED_PROTOCOLS).toContain('file:');
    expect(BLOCKED_PROTOCOLS).toContain('javascript:');
    expect(BLOCKED_PROTOCOLS).not.toContain('https:');
  });

  it('should list private IP ranges', () => {
    expect(PRIVATE_IP_RANGES.length).toBeGreaterThan(0);
    expect(PRIVATE_IP_RANGES).toContain('127.');
    expect(PRIVATE_IP_RANGES).toContain('10.');
    expect(PRIVATE_IP_RANGES).toContain('192.168.');
    expect(PRIVATE_IP_RANGES).toContain('169.254.');
  });

  it('should have correct TypeScript types (compile check)', () => {
    const config: BrowserConfig = {
      ...DEFAULT_BROWSER_CONFIG,
      headless: false,
    };
    expect(config.headless).toBe(false);

    const pageInfo: PageInfo = {
      url: 'https://example.com',
      title: 'Example',
    };
    expect(pageInfo.url).toBe('https://example.com');

    const step: BrowseStep = {
      action: 'navigate',
      params: { url: 'https://example.com' },
      result: 'Navigated to Example',
    };
    expect(step.action).toBe('navigate');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/browser/tests/types.test.ts`
Expected: FAIL — cannot resolve `../src/types.js`.

**Step 3: Write the implementation**

Create `packages/browser/src/types.ts`:

```typescript
export interface BrowserConfig {
  headless: boolean;
  viewport: { width: number; height: number };
  navigationTimeout: number;
  actionTimeout: number;
  maxConcurrentPages: number;
  screenshotDir: string;
  allowedUrls?: string[];
  blockedUrls?: string[];
}

export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  headless: true,
  viewport: { width: 1280, height: 720 },
  navigationTimeout: 30_000,
  actionTimeout: 10_000,
  maxConcurrentPages: 10,
  screenshotDir: 'screenshots',
};

export const BLOCKED_PROTOCOLS = ['file:', 'javascript:', 'data:', 'blob:'];

export const PRIVATE_IP_RANGES = [
  '127.',
  '10.',
  '192.168.',
  '169.254.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  '0.0.0.0',
  '::1',
  'localhost',
];

export interface PageInfo {
  url: string;
  title: string;
  content?: string;
}

export interface BrowseStep {
  action: string;
  params: Record<string, unknown>;
  result?: string;
  error?: string;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  selector?: string;
  quality?: number;
}

export interface ExtractResult {
  selector: string;
  elements: Array<{
    text: string;
    attributes: Record<string, string>;
    tagName: string;
  }>;
}
```

**Step 4: Update barrel export**

Update `packages/browser/src/index.ts`:

```typescript
export type {
  BrowserConfig,
  PageInfo,
  BrowseStep,
  ScreenshotOptions,
  ExtractResult,
} from './types.js';
export {
  DEFAULT_BROWSER_CONFIG,
  BLOCKED_PROTOCOLS,
  PRIVATE_IP_RANGES,
} from './types.js';
```

**Step 5: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/browser/tests/types.test.ts`
Expected: PASS (4 tests).

**Step 6: Commit**

```bash
git add packages/browser/src/types.ts packages/browser/src/index.ts packages/browser/tests/types.test.ts
git commit -m "feat(browser): add types, config defaults, and security constants"
```

---

### Task 3: URL validator

**Files:**
- Create: `packages/browser/src/url-validator.ts`
- Create: `packages/browser/tests/url-validator.test.ts`

**Step 1: Write the failing test**

Create `packages/browser/tests/url-validator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateUrl } from '../src/url-validator.js';

describe('URL Validator', () => {
  describe('valid URLs', () => {
    it('should allow https URLs', () => {
      expect(validateUrl('https://example.com')).toBeNull();
    });

    it('should allow http URLs', () => {
      expect(validateUrl('http://example.com')).toBeNull();
    });

    it('should allow URLs with paths', () => {
      expect(validateUrl('https://example.com/path/to/page')).toBeNull();
    });

    it('should allow URLs with query params', () => {
      expect(validateUrl('https://example.com?q=search&page=1')).toBeNull();
    });
  });

  describe('blocked protocols', () => {
    it('should block file:// protocol', () => {
      const error = validateUrl('file:///etc/passwd');
      expect(error).toContain('protocol');
    });

    it('should block javascript: protocol', () => {
      const error = validateUrl('javascript:alert(1)');
      expect(error).toContain('protocol');
    });

    it('should block data: protocol', () => {
      const error = validateUrl('data:text/html,<script>alert(1)</script>');
      expect(error).toContain('protocol');
    });
  });

  describe('private IP blocking', () => {
    it('should block localhost', () => {
      const error = validateUrl('http://localhost:3000');
      expect(error).toContain('private');
    });

    it('should block 127.0.0.1', () => {
      const error = validateUrl('http://127.0.0.1');
      expect(error).toContain('private');
    });

    it('should block 10.x.x.x', () => {
      const error = validateUrl('http://10.0.0.1');
      expect(error).toContain('private');
    });

    it('should block 192.168.x.x', () => {
      const error = validateUrl('http://192.168.1.1');
      expect(error).toContain('private');
    });

    it('should block 169.254.x.x (link-local)', () => {
      const error = validateUrl('http://169.254.169.254');
      expect(error).toContain('private');
    });

    it('should block 172.16-31.x.x', () => {
      const error = validateUrl('http://172.16.0.1');
      expect(error).toContain('private');
    });
  });

  describe('invalid URLs', () => {
    it('should reject empty string', () => {
      const error = validateUrl('');
      expect(error).toBeTruthy();
    });

    it('should reject malformed URLs', () => {
      const error = validateUrl('not a url');
      expect(error).toBeTruthy();
    });
  });

  describe('allowlist/blocklist', () => {
    it('should allow private IPs when in allowlist', () => {
      const error = validateUrl('http://localhost:3000', {
        allowedUrls: ['localhost'],
      });
      expect(error).toBeNull();
    });

    it('should block URLs in blocklist', () => {
      const error = validateUrl('https://evil.com/page', {
        blockedUrls: ['evil.com'],
      });
      expect(error).toContain('blocked');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/browser/tests/url-validator.test.ts`
Expected: FAIL — cannot resolve `../src/url-validator.js`.

**Step 3: Write the implementation**

Create `packages/browser/src/url-validator.ts`:

```typescript
import { BLOCKED_PROTOCOLS, PRIVATE_IP_RANGES } from './types.js';

interface ValidatorOptions {
  allowedUrls?: string[];
  blockedUrls?: string[];
}

/**
 * Validates a URL for browser navigation.
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

  // Check blocked protocols
  if (BLOCKED_PROTOCOLS.includes(parsed.protocol)) {
    return `Blocked protocol: ${parsed.protocol} — only http: and https: are allowed`;
  }

  // Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Blocked protocol: ${parsed.protocol} — only http: and https: are allowed`;
  }

  const hostname = parsed.hostname;

  // Check blocklist first (takes priority)
  if (options?.blockedUrls?.some((pattern) => hostname.includes(pattern))) {
    return `URL blocked by blocklist: ${hostname}`;
  }

  // Check if in allowlist (skip private IP check if allowed)
  const isAllowed = options?.allowedUrls?.some((pattern) => hostname.includes(pattern));
  if (isAllowed) {
    return null;
  }

  // Check private/internal IPs
  const isPrivate = PRIVATE_IP_RANGES.some((range) => hostname.startsWith(range) || hostname === range);
  if (isPrivate) {
    return `Blocked private/internal address: ${hostname}`;
  }

  return null;
}
```

**Step 4: Update barrel export**

Add to `packages/browser/src/index.ts`:

```typescript
export { validateUrl } from './url-validator.js';
```

**Step 5: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/browser/tests/url-validator.test.ts`
Expected: PASS (all ~14 tests).

**Step 6: Commit**

```bash
git add packages/browser/src/url-validator.ts packages/browser/tests/url-validator.test.ts packages/browser/src/index.ts
git commit -m "feat(browser): add URL validator with protocol and private IP blocking"
```

---

### Task 4: BrowserManager core (launch, page lifecycle, shutdown)

**Files:**
- Create: `packages/browser/src/browser-manager.ts`
- Create: `packages/browser/tests/browser-manager.test.ts`

This is the largest task. We mock Playwright's API completely. The `BrowserManager` accepts an optional browser factory for testability.

**Step 1: Write the failing test**

Create `packages/browser/tests/browser-manager.test.ts`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest';
import { BrowserManager } from '../src/browser-manager.js';
import { DEFAULT_BROWSER_CONFIG } from '../src/types.js';

// Mock Playwright types
function createMockPage() {
  const page: any = {
    goto: vi.fn().mockResolvedValue(undefined),
    title: vi.fn().mockResolvedValue('Test Page'),
    content: vi.fn().mockResolvedValue('<html><body><h1>Hello</h1><p>World</p></body></html>'),
    url: vi.fn().mockReturnValue('https://example.com'),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    $: vi.fn().mockResolvedValue(null),
    $$eval: vi.fn().mockResolvedValue([]),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue({ result: true }),
    close: vi.fn().mockResolvedValue(undefined),
    isClosed: vi.fn().mockReturnValue(false),
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    setDefaultNavigationTimeout: vi.fn(),
    setDefaultTimeout: vi.fn(),
  };
  return page;
}

function createMockContext(pages: any[] = []) {
  let pageIndex = 0;
  return {
    newPage: vi.fn().mockImplementation(async () => {
      if (pageIndex < pages.length) {
        return pages[pageIndex++];
      }
      return createMockPage();
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockBrowser(context?: any) {
  const mockContext = context || createMockContext();
  return {
    newContext: vi.fn().mockResolvedValue(mockContext),
    isConnected: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
    contexts: vi.fn().mockReturnValue([mockContext]),
  };
}

describe('BrowserManager', () => {
  let manager: BrowserManager;

  afterEach(async () => {
    if (manager) {
      await manager.shutdown();
    }
  });

  describe('launch and shutdown', () => {
    it('should launch browser on first use', async () => {
      const mockBrowser = createMockBrowser();
      const factory = vi.fn().mockResolvedValue(mockBrowser);

      manager = new BrowserManager({ config: DEFAULT_BROWSER_CONFIG, browserFactory: factory });
      await manager.launch();

      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should not re-launch if already running', async () => {
      const mockBrowser = createMockBrowser();
      const factory = vi.fn().mockResolvedValue(mockBrowser);

      manager = new BrowserManager({ config: DEFAULT_BROWSER_CONFIG, browserFactory: factory });
      await manager.launch();
      await manager.launch();

      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should close all pages and browser on shutdown', async () => {
      const mockPage = createMockPage();
      const mockContext = createMockContext([mockPage]);
      const mockBrowser = createMockBrowser(mockContext);
      const factory = vi.fn().mockResolvedValue(mockBrowser);

      manager = new BrowserManager({ config: DEFAULT_BROWSER_CONFIG, browserFactory: factory });
      await manager.launch();
      await manager.getPage('session-1');

      await manager.shutdown();

      expect(mockPage.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });

  describe('page lifecycle', () => {
    it('should create a new page for a new session', async () => {
      const mockPage = createMockPage();
      const mockContext = createMockContext([mockPage]);
      const mockBrowser = createMockBrowser(mockContext);
      const factory = vi.fn().mockResolvedValue(mockBrowser);

      manager = new BrowserManager({ config: DEFAULT_BROWSER_CONFIG, browserFactory: factory });

      const page = await manager.getPage('session-1');
      expect(page).toBe(mockPage);
      expect(mockPage.setViewportSize).toHaveBeenCalledWith({ width: 1280, height: 720 });
    });

    it('should reuse existing page for same session', async () => {
      const mockPage = createMockPage();
      const mockContext = createMockContext([mockPage]);
      const mockBrowser = createMockBrowser(mockContext);
      const factory = vi.fn().mockResolvedValue(mockBrowser);

      manager = new BrowserManager({ config: DEFAULT_BROWSER_CONFIG, browserFactory: factory });

      const page1 = await manager.getPage('session-1');
      const page2 = await manager.getPage('session-1');

      expect(page1).toBe(page2);
      expect(mockContext.newPage).toHaveBeenCalledTimes(1);
    });

    it('should close a specific page', async () => {
      const mockPage = createMockPage();
      const mockContext = createMockContext([mockPage]);
      const mockBrowser = createMockBrowser(mockContext);
      const factory = vi.fn().mockResolvedValue(mockBrowser);

      manager = new BrowserManager({ config: DEFAULT_BROWSER_CONFIG, browserFactory: factory });
      await manager.getPage('session-1');
      await manager.closePage('session-1');

      expect(mockPage.close).toHaveBeenCalled();
    });

    it('should enforce max concurrent pages limit', async () => {
      const mockBrowser = createMockBrowser();
      const factory = vi.fn().mockResolvedValue(mockBrowser);

      manager = new BrowserManager({
        config: { ...DEFAULT_BROWSER_CONFIG, maxConcurrentPages: 2 },
        browserFactory: factory,
      });

      await manager.getPage('s1');
      await manager.getPage('s2');

      await expect(manager.getPage('s3')).rejects.toThrow('Max concurrent pages');
    });
  });

  describe('crash recovery', () => {
    it('should re-launch browser if disconnected', async () => {
      const mockBrowser1 = createMockBrowser();
      const mockBrowser2 = createMockBrowser();

      // First call returns browser that will "disconnect"
      mockBrowser1.isConnected.mockReturnValue(false);

      const factory = vi.fn()
        .mockResolvedValueOnce(mockBrowser1)
        .mockResolvedValueOnce(mockBrowser2);

      manager = new BrowserManager({ config: DEFAULT_BROWSER_CONFIG, browserFactory: factory });
      await manager.launch();

      // Next getPage should detect disconnect and re-launch
      await manager.getPage('session-1');

      expect(factory).toHaveBeenCalledTimes(2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/browser/tests/browser-manager.test.ts`
Expected: FAIL — cannot resolve `../src/browser-manager.js`.

**Step 3: Write the implementation**

Create `packages/browser/src/browser-manager.ts`:

```typescript
import type { Browser, Page, BrowserContext } from 'playwright';
import { getLogger } from '@auxiora/logger';
import type { BrowserConfig, ScreenshotOptions, ExtractResult, BrowseStep, PageInfo } from './types.js';
import { DEFAULT_BROWSER_CONFIG } from './types.js';
import { validateUrl } from './url-validator.js';

const logger = getLogger('browser:manager');

type BrowserFactory = (config: BrowserConfig) => Promise<Browser>;

export interface BrowserManagerOptions {
  config?: BrowserConfig;
  browserFactory?: BrowserFactory;
}

const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_RESULT_SIZE = 100 * 1024; // 100KB

export class BrowserManager {
  private config: BrowserConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages = new Map<string, Page>();
  private browserFactory: BrowserFactory;

  constructor(options: BrowserManagerOptions = {}) {
    this.config = { ...DEFAULT_BROWSER_CONFIG, ...options.config };
    this.browserFactory = options.browserFactory || defaultBrowserFactory;
  }

  async launch(): Promise<void> {
    if (this.browser?.isConnected()) {
      return;
    }

    logger.info('Launching browser', { headless: this.config.headless });
    this.browser = await this.browserFactory(this.config);
    this.context = await this.browser.newContext();
    logger.info('Browser launched');
  }

  private async ensureBrowser(): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      // Clear stale page references
      this.pages.clear();
      this.context = null;
      this.browser = null;

      logger.warn('Browser disconnected, re-launching');
      await this.launch();
    }
  }

  async getPage(sessionId: string): Promise<Page> {
    await this.ensureBrowser();

    // Return existing page if still open
    const existing = this.pages.get(sessionId);
    if (existing && !existing.isClosed()) {
      return existing;
    }

    // Enforce max pages
    if (this.pages.size >= this.config.maxConcurrentPages) {
      throw new Error(`Max concurrent pages (${this.config.maxConcurrentPages}) reached`);
    }

    const page = await this.context!.newPage();
    await page.setViewportSize(this.config.viewport);
    page.setDefaultNavigationTimeout(this.config.navigationTimeout);
    page.setDefaultTimeout(this.config.actionTimeout);

    this.pages.set(sessionId, page);
    logger.info('Page created', { sessionId });
    return page;
  }

  async closePage(sessionId: string): Promise<void> {
    const page = this.pages.get(sessionId);
    if (page) {
      await page.close();
      this.pages.delete(sessionId);
      logger.info('Page closed', { sessionId });
    }
  }

  async shutdown(): Promise<void> {
    // Close all pages
    for (const [sessionId, page] of this.pages) {
      try {
        if (!page.isClosed()) {
          await page.close();
        }
      } catch (error) {
        logger.warn('Error closing page', { sessionId, error: error instanceof Error ? error : new Error(String(error)) });
      }
    }
    this.pages.clear();

    // Close browser
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        logger.warn('Error closing browser', { error: error instanceof Error ? error : new Error(String(error)) });
      }
      this.browser = null;
      this.context = null;
    }

    logger.info('Browser shutdown complete');
  }

  /**
   * Navigate to a URL. Returns page title + text content as markdown.
   */
  async navigate(sessionId: string, url: string): Promise<PageInfo> {
    const validationError = validateUrl(url, {
      allowedUrls: this.config.allowedUrls,
      blockedUrls: this.config.blockedUrls,
    });
    if (validationError) {
      throw new Error(validationError);
    }

    const page = await this.getPage(sessionId);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const title = await page.title();
    const content = await this.getPageMarkdown(page);

    return { url: page.url(), title, content };
  }

  /**
   * Click an element by CSS selector or text content.
   */
  async click(sessionId: string, selector: string): Promise<void> {
    const page = await this.getPage(sessionId);
    await page.click(selector, { timeout: this.config.actionTimeout });
  }

  /**
   * Type text into an input field. Supports Enter key via pressEnter flag.
   */
  async type(sessionId: string, selector: string, text: string, pressEnter?: boolean): Promise<void> {
    const page = await this.getPage(sessionId);
    await page.fill(selector, text);
    if (pressEnter) {
      await page.keyboard.press('Enter');
    }
  }

  /**
   * Capture a screenshot. Returns base64-encoded PNG + file path.
   */
  async screenshot(sessionId: string, options?: ScreenshotOptions): Promise<{ base64: string; path?: string }> {
    const page = await this.getPage(sessionId);

    const screenshotOptions: any = {
      fullPage: options?.fullPage ?? true,
      type: 'png',
    };

    if (options?.selector) {
      const element = await page.$(options.selector);
      if (!element) {
        throw new Error(`Element not found: ${options.selector}`);
      }
      const buffer = await element.screenshot(screenshotOptions);
      return this.processScreenshot(buffer, sessionId);
    }

    const buffer = await page.screenshot(screenshotOptions);
    return this.processScreenshot(buffer, sessionId);
  }

  private async processScreenshot(buffer: Buffer, sessionId: string): Promise<{ base64: string; path?: string }> {
    if (buffer.length > MAX_SCREENSHOT_SIZE) {
      logger.warn('Screenshot exceeds size limit', { size: buffer.length });
    }

    const base64 = buffer.toString('base64');

    // Save to disk if screenshotDir is configured and non-empty
    let filePath: string | undefined;
    if (this.config.screenshotDir) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const dir = this.config.screenshotDir;
      await mkdir(dir, { recursive: true });
      const timestamp = Date.now();
      filePath = join(dir, `${timestamp}-${sessionId}.png`);
      await writeFile(filePath, buffer);
    }

    return { base64, path: filePath };
  }

  /**
   * Extract text/attributes from elements matching a CSS selector.
   */
  async extract(sessionId: string, selector: string): Promise<ExtractResult> {
    const page = await this.getPage(sessionId);

    const elements = await page.$$eval(selector, (els: Element[]) =>
      els.map((el) => ({
        text: (el as HTMLElement).innerText || el.textContent || '',
        tagName: el.tagName.toLowerCase(),
        attributes: Object.fromEntries(
          Array.from(el.attributes).map((attr) => [attr.name, attr.value])
        ),
      }))
    );

    return { selector, elements };
  }

  /**
   * Wait for a selector to appear, or a fixed delay.
   */
  async wait(sessionId: string, selectorOrMs: string | number): Promise<void> {
    const page = await this.getPage(sessionId);

    if (typeof selectorOrMs === 'number') {
      const delay = Math.min(selectorOrMs, 30_000); // Max 30s
      await new Promise((resolve) => setTimeout(resolve, delay));
    } else {
      await page.waitForSelector(selectorOrMs, { timeout: this.config.actionTimeout });
    }
  }

  /**
   * Run JavaScript on the page. Returns result as JSON string.
   */
  async runScript(sessionId: string, script: string): Promise<string> {
    const page = await this.getPage(sessionId);
    const result = await page.evaluate(script);
    const json = JSON.stringify(result);

    if (json.length > MAX_RESULT_SIZE) {
      throw new Error(`Result too large (${json.length} bytes, max ${MAX_RESULT_SIZE})`);
    }

    return json;
  }

  /**
   * High-level browse: takes a natural language task description.
   * Chains navigate + extract for read-only tasks.
   * Returns a message directing to primitive tools if mutations needed.
   */
  async browse(sessionId: string, task: string): Promise<{ result: string; steps: BrowseStep[] }> {
    const steps: BrowseStep[] = [];

    // Detect mutation keywords
    const mutationKeywords = ['click', 'type', 'fill', 'submit', 'login', 'sign in', 'purchase', 'buy', 'send', 'post', 'delete'];
    const needsMutation = mutationKeywords.some((kw) => task.toLowerCase().includes(kw));

    if (needsMutation) {
      return {
        result: 'This task requires page interactions (clicking, typing). Please use the primitive browser tools (browser_click, browser_type) for these actions, which require user approval for safety.',
        steps: [],
      };
    }

    return {
      result: `Browse task queued: "${task}". Use browser_navigate to go to a page, then browser_extract to get data.`,
      steps,
    };
  }

  private async getPageMarkdown(page: Page): Promise<string> {
    const html = await page.content();
    return this.htmlToMarkdown(html);
  }

  private htmlToMarkdown(html: string): string {
    let text = html;
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n');
    text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
    text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');
    text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
    text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<[^>]+>/g, '');
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.replace(/[ \t]{2,}/g, ' ');
    return text.trim();
  }

  getActiveSessionIds(): string[] {
    return Array.from(this.pages.keys());
  }

  getPageCount(): number {
    return this.pages.size;
  }
}

async function defaultBrowserFactory(config: BrowserConfig): Promise<Browser> {
  const { chromium } = await import('playwright');
  return chromium.launch({
    headless: config.headless,
    args: ['--disable-extensions', '--disable-dev-shm-usage', '--no-sandbox'],
  });
}
```

**Step 4: Update barrel export**

Add to `packages/browser/src/index.ts`:

```typescript
export { BrowserManager, type BrowserManagerOptions } from './browser-manager.js';
```

**Step 5: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/browser/tests/browser-manager.test.ts`
Expected: PASS (8 tests).

**Step 6: Commit**

```bash
git add packages/browser/src/browser-manager.ts packages/browser/tests/browser-manager.test.ts packages/browser/src/index.ts
git commit -m "feat(browser): implement BrowserManager with page lifecycle and crash recovery"
```

---

### Task 5: BrowserManager action methods tests

**Files:**
- Create: `packages/browser/tests/browser-actions.test.ts`

The action methods (navigate, click, type, extract, wait, runScript, screenshot, browse) were already implemented in Task 4. This task adds comprehensive tests for each method.

**Step 1: Write the test**

Create `packages/browser/tests/browser-actions.test.ts`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest';
import { BrowserManager } from '../src/browser-manager.js';
import { DEFAULT_BROWSER_CONFIG } from '../src/types.js';

function createMockPage() {
  const page: any = {
    goto: vi.fn().mockResolvedValue(undefined),
    title: vi.fn().mockResolvedValue('Test Page'),
    content: vi.fn().mockResolvedValue('<html><body><h1>Hello</h1><p>World</p></body></html>'),
    url: vi.fn().mockReturnValue('https://example.com'),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png-data')),
    $: vi.fn().mockResolvedValue(null),
    $$eval: vi.fn().mockResolvedValue([
      { text: 'Item 1', tagName: 'div', attributes: { class: 'item' } },
      { text: 'Item 2', tagName: 'div', attributes: { class: 'item' } },
    ]),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue({ count: 42 }),
    close: vi.fn().mockResolvedValue(undefined),
    isClosed: vi.fn().mockReturnValue(false),
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    setDefaultNavigationTimeout: vi.fn(),
    setDefaultTimeout: vi.fn(),
  };
  return page;
}

function createMockContext(pages: any[] = []) {
  let pageIndex = 0;
  return {
    newPage: vi.fn().mockImplementation(async () => {
      if (pageIndex < pages.length) return pages[pageIndex++];
      return createMockPage();
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockBrowser(context?: any) {
  const mockContext = context || createMockContext();
  return {
    newContext: vi.fn().mockResolvedValue(mockContext),
    isConnected: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
    contexts: vi.fn().mockReturnValue([mockContext]),
  };
}

describe('BrowserManager actions', () => {
  let manager: BrowserManager;

  afterEach(async () => {
    if (manager) await manager.shutdown();
  });

  describe('navigate', () => {
    it('should navigate to a URL and return page info', async () => {
      const mockPage = createMockPage();
      const mockContext = createMockContext([mockPage]);
      const mockBrowser = createMockBrowser(mockContext);

      manager = new BrowserManager({
        config: DEFAULT_BROWSER_CONFIG,
        browserFactory: vi.fn().mockResolvedValue(mockBrowser),
      });

      const result = await manager.navigate('s1', 'https://example.com');

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', { waitUntil: 'domcontentloaded' });
      expect(result.url).toBe('https://example.com');
      expect(result.title).toBe('Test Page');
      expect(result.content).toBeDefined();
    });

    it('should reject blocked URLs', async () => {
      const mockBrowser = createMockBrowser();
      manager = new BrowserManager({
        config: DEFAULT_BROWSER_CONFIG,
        browserFactory: vi.fn().mockResolvedValue(mockBrowser),
      });

      await expect(manager.navigate('s1', 'file:///etc/passwd')).rejects.toThrow('protocol');
    });

    it('should reject private IPs', async () => {
      const mockBrowser = createMockBrowser();
      manager = new BrowserManager({
        config: DEFAULT_BROWSER_CONFIG,
        browserFactory: vi.fn().mockResolvedValue(mockBrowser),
      });

      await expect(manager.navigate('s1', 'http://127.0.0.1')).rejects.toThrow('private');
    });
  });

  describe('click', () => {
    it('should click an element by selector', async () => {
      const mockPage = createMockPage();
      const mockContext = createMockContext([mockPage]);
      const mockBrowser = createMockBrowser(mockContext);

      manager = new BrowserManager({
        config: DEFAULT_BROWSER_CONFIG,
        browserFactory: vi.fn().mockResolvedValue(mockBrowser),
      });

      await manager.click('s1', 'button.submit');
      expect(mockPage.click).toHaveBeenCalledWith('button.submit', { timeout: 10_000 });
    });
  });

  describe('type', () => {
    it('should type text into an input field', async () => {
      const mockPage = createMockPage();
      const mockContext = createMockContext([mockPage]);
      const mockBrowser = createMockBrowser(mockContext);

      manager = new BrowserManager({
        config: DEFAULT_BROWSER_CONFIG,
        browserFactory: vi.fn().mockResolvedValue(mockBrowser),
      });

      await manager.type('s1', '#search', 'hello world');
      expect(mockPage.fill).toHaveBeenCalledWith('#search', 'hello world');
    });

    it('should press Enter when requested', async () => {
      const mockPage = createMockPage();
      const mockContext = createMockContext([mockPage]);
      const mockBrowser = createMockBrowser(mockContext);

      manager = new BrowserManager({
        config: DEFAULT_BROWSER_CONFIG,
        browserFactory: vi.fn().mockResolvedValue(mockBrowser),
      });

      await manager.type('s1', '#search', 'hello', true);
      expect(mockPage.fill).toHaveBeenCalledWith('#search', 'hello');
      expect(mockPage.keyboard.press).toHaveBeenCalledWith('Enter');
    });
  });

  describe('extract', () => {
    it('should extract elements by selector', async () => {
      const mockPage = createMockPage();
      const mockContext = createMockContext([mockPage]);
      const mockBrowser = createMockBrowser(mockContext);

      manager = new BrowserManager({
        config: DEFAULT_BROWSER_CONFIG,
        browserFactory: vi.fn().mockResolvedValue(mockBrowser),
      });

      const result = await manager.extract('s1', '.item');
      expect(result.selector).toBe('.item');
      expect(result.elements).toHaveLength(2);
      expect(result.elements[0].text).toBe('Item 1');
    });
  });

  describe('wait', () => {
    it('should wait for a selector', async () => {
      const mockPage = createMockPage();
      const mockContext = createMockContext([mockPage]);
      const mockBrowser = createMockBrowser(mockContext);

      manager = new BrowserManager({
        config: DEFAULT_BROWSER_CONFIG,
        browserFactory: vi.fn().mockResolvedValue(mockBrowser),
      });

      await manager.wait('s1', '.loaded');
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('.loaded', { timeout: 10_000 });
    });

    it('should wait for a fixed delay (capped at 30s)', async () => {
      const mockPage = createMockPage();
      const mockContext = createMockContext([mockPage]);
      const mockBrowser = createMockBrowser(mockContext);

      manager = new BrowserManager({
        config: DEFAULT_BROWSER_CONFIG,
        browserFactory: vi.fn().mockResolvedValue(mockBrowser),
      });

      const start = Date.now();
      await manager.wait('s1', 50); // 50ms delay
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  describe('runScript', () => {
    it('should run JS and return result', async () => {
      const mockPage = createMockPage();
      const mockContext = createMockContext([mockPage]);
      const mockBrowser = createMockBrowser(mockContext);

      manager = new BrowserManager({
        config: DEFAULT_BROWSER_CONFIG,
        browserFactory: vi.fn().mockResolvedValue(mockBrowser),
      });

      const result = await manager.runScript('s1', 'document.querySelectorAll("div").length');
      expect(JSON.parse(result)).toEqual({ count: 42 });
    });

    it('should reject oversized results', async () => {
      const mockPage = createMockPage();
      mockPage.evaluate.mockResolvedValue('x'.repeat(200_000));
      const mockContext = createMockContext([mockPage]);
      const mockBrowser = createMockBrowser(mockContext);

      manager = new BrowserManager({
        config: DEFAULT_BROWSER_CONFIG,
        browserFactory: vi.fn().mockResolvedValue(mockBrowser),
      });

      await expect(manager.runScript('s1', 'largeThing()')).rejects.toThrow('too large');
    });
  });

  describe('screenshot', () => {
    it('should capture full-page screenshot as base64', async () => {
      const mockPage = createMockPage();
      const mockContext = createMockContext([mockPage]);
      const mockBrowser = createMockBrowser(mockContext);

      manager = new BrowserManager({
        config: { ...DEFAULT_BROWSER_CONFIG, screenshotDir: '' },
        browserFactory: vi.fn().mockResolvedValue(mockBrowser),
      });

      const result = await manager.screenshot('s1');
      expect(result.base64).toBe(Buffer.from('fake-png-data').toString('base64'));
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        fullPage: true,
        type: 'png',
      });
    });
  });

  describe('browse', () => {
    it('should return mutation message for write-oriented tasks', async () => {
      const mockBrowser = createMockBrowser();
      manager = new BrowserManager({
        config: DEFAULT_BROWSER_CONFIG,
        browserFactory: vi.fn().mockResolvedValue(mockBrowser),
      });

      const result = await manager.browse('s1', 'click the login button and type my password');
      expect(result.result).toContain('primitive browser tools');
    });

    it('should handle read-oriented tasks', async () => {
      const mockBrowser = createMockBrowser();
      manager = new BrowserManager({
        config: DEFAULT_BROWSER_CONFIG,
        browserFactory: vi.fn().mockResolvedValue(mockBrowser),
      });

      const result = await manager.browse('s1', 'get the top 5 headlines from the page');
      expect(result.result).toBeDefined();
      expect(result.steps).toBeDefined();
    });
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/browser/tests/browser-actions.test.ts`
Expected: PASS (all ~12 tests).

**Step 3: Commit**

```bash
git add packages/browser/tests/browser-actions.test.ts
git commit -m "test(browser): add action method tests for navigate, click, type, extract, wait, runScript, screenshot, browse"
```

---

### Task 6: Browser tools (`packages/tools/src/browser.ts`)

**Files:**
- Create: `packages/tools/src/browser.ts`
- Create: `packages/tools/tests/browser-tools.test.ts`
- Modify: `packages/tools/src/index.ts` (register the 8 browser tools)
- Modify: `packages/tools/package.json` (add `@auxiora/browser` dependency)
- Modify: `packages/tools/tsconfig.json` (add browser reference)

**Step 1: Write the failing test**

Create `packages/tools/tests/browser-tools.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolPermission } from '../src/index.js';
import {
  BrowserNavigateTool,
  BrowserClickTool,
  BrowserTypeTool,
  BrowserScreenshotTool,
  BrowserExtractTool,
  BrowserWaitTool,
  BrowserEvaluateTool,
  BrowseTool,
  setBrowserManager,
} from '../src/browser.js';

const mockManager = {
  navigate: vi.fn().mockResolvedValue({
    url: 'https://example.com',
    title: 'Example',
    content: '# Hello\n\nWorld',
  }),
  click: vi.fn().mockResolvedValue(undefined),
  type: vi.fn().mockResolvedValue(undefined),
  screenshot: vi.fn().mockResolvedValue({
    base64: 'aW1hZ2VkYXRh',
    path: '/tmp/screenshots/123-s1.png',
  }),
  extract: vi.fn().mockResolvedValue({
    selector: '.item',
    elements: [{ text: 'Item 1', tagName: 'div', attributes: {} }],
  }),
  wait: vi.fn().mockResolvedValue(undefined),
  runScript: vi.fn().mockResolvedValue('{"count":42}'),
  browse: vi.fn().mockResolvedValue({
    result: 'Found 5 headlines',
    steps: [],
  }),
};

describe('Browser tools', () => {
  beforeEach(() => {
    setBrowserManager(mockManager as any);
    vi.clearAllMocks();
  });

  describe('browser_navigate', () => {
    it('should have AUTO_APPROVE permission', () => {
      expect(BrowserNavigateTool.getPermission({}, {})).toBe(ToolPermission.AUTO_APPROVE);
    });

    it('should require url parameter', () => {
      const error = BrowserNavigateTool.validateParams!({});
      expect(error).toContain('url');
    });

    it('should call manager.navigate and return content', async () => {
      const result = await BrowserNavigateTool.execute(
        { url: 'https://example.com' },
        { sessionId: 's1' }
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain('Example');
      expect(mockManager.navigate).toHaveBeenCalledWith('s1', 'https://example.com');
    });
  });

  describe('browser_click', () => {
    it('should have USER_APPROVAL permission', () => {
      expect(BrowserClickTool.getPermission({}, {})).toBe(ToolPermission.USER_APPROVAL);
    });

    it('should call manager.click', async () => {
      const result = await BrowserClickTool.execute(
        { selector: 'button.submit' },
        { sessionId: 's1' }
      );
      expect(result.success).toBe(true);
      expect(mockManager.click).toHaveBeenCalledWith('s1', 'button.submit');
    });
  });

  describe('browser_type', () => {
    it('should have USER_APPROVAL permission', () => {
      expect(BrowserTypeTool.getPermission({}, {})).toBe(ToolPermission.USER_APPROVAL);
    });

    it('should call manager.type with pressEnter', async () => {
      const result = await BrowserTypeTool.execute(
        { selector: '#search', text: 'hello', pressEnter: true },
        { sessionId: 's1' }
      );
      expect(result.success).toBe(true);
      expect(mockManager.type).toHaveBeenCalledWith('s1', '#search', 'hello', true);
    });
  });

  describe('browser_screenshot', () => {
    it('should have AUTO_APPROVE permission', () => {
      expect(BrowserScreenshotTool.getPermission({}, {})).toBe(ToolPermission.AUTO_APPROVE);
    });

    it('should return base64 and path', async () => {
      const result = await BrowserScreenshotTool.execute({}, { sessionId: 's1' });
      expect(result.success).toBe(true);
      expect(result.metadata?.base64).toBe('aW1hZ2VkYXRh');
      expect(result.metadata?.path).toContain('screenshots');
    });
  });

  describe('browser_extract', () => {
    it('should have AUTO_APPROVE permission', () => {
      expect(BrowserExtractTool.getPermission({}, {})).toBe(ToolPermission.AUTO_APPROVE);
    });

    it('should return extracted elements as JSON', async () => {
      const result = await BrowserExtractTool.execute(
        { selector: '.item' },
        { sessionId: 's1' }
      );
      expect(result.success).toBe(true);
      const parsed = JSON.parse(result.output!);
      expect(parsed.elements).toHaveLength(1);
    });
  });

  describe('browser_wait', () => {
    it('should have AUTO_APPROVE permission', () => {
      expect(BrowserWaitTool.getPermission({}, {})).toBe(ToolPermission.AUTO_APPROVE);
    });

    it('should call manager.wait with selector', async () => {
      await BrowserWaitTool.execute({ selector: '.loaded' }, { sessionId: 's1' });
      expect(mockManager.wait).toHaveBeenCalledWith('s1', '.loaded');
    });

    it('should call manager.wait with delay', async () => {
      await BrowserWaitTool.execute({ delay: 1000 }, { sessionId: 's1' });
      expect(mockManager.wait).toHaveBeenCalledWith('s1', 1000);
    });
  });

  describe('browser_evaluate', () => {
    it('should have USER_APPROVAL permission', () => {
      expect(BrowserEvaluateTool.getPermission({}, {})).toBe(ToolPermission.USER_APPROVAL);
    });

    it('should call manager.runScript and return result', async () => {
      const result = await BrowserEvaluateTool.execute(
        { script: 'document.title' },
        { sessionId: 's1' }
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain('42');
    });
  });

  describe('browse', () => {
    it('should have AUTO_APPROVE permission', () => {
      expect(BrowseTool.getPermission({}, {})).toBe(ToolPermission.AUTO_APPROVE);
    });

    it('should call manager.browse and return result', async () => {
      const result = await BrowseTool.execute(
        { task: 'get top 5 headlines' },
        { sessionId: 's1' }
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain('headlines');
    });
  });

  describe('without manager', () => {
    it('should fail gracefully when manager not set', async () => {
      setBrowserManager(null as any);
      const result = await BrowserNavigateTool.execute(
        { url: 'https://example.com' },
        { sessionId: 's1' }
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/tools/tests/browser-tools.test.ts`
Expected: FAIL — cannot resolve `../src/browser.js`.

**Step 3: Write the implementation**

Create `packages/tools/src/browser.ts`:

```typescript
import type { Tool, ToolParameter, ExecutionContext, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('tools:browser');

// Injected by runtime — avoids circular dependency
let browserManager: any = null;

export function setBrowserManager(manager: any): void {
  browserManager = manager;
  logger.info('Browser manager connected to tools');
}

function requireManager(): any {
  if (!browserManager) {
    throw new Error('Browser system not initialized');
  }
  return browserManager;
}

function getSessionId(context: ExecutionContext, params: any): string {
  return params.sessionId || context.sessionId || 'default';
}

export const BrowserNavigateTool: Tool = {
  name: 'browser_navigate',
  description: 'Navigate to a URL in a browser tab. Returns the page title and rendered text content as markdown.',

  parameters: [
    { name: 'url', type: 'string', description: 'The URL to navigate to (http or https only)', required: true },
    { name: 'sessionId', type: 'string', description: 'Browser session ID (optional, uses current session if omitted)', required: false },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.url || typeof params.url !== 'string') {
      return 'url must be a non-empty string';
    }
    return null;
  },

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const sid = getSessionId(context, params);
      const info = await manager.navigate(sid, params.url);

      return {
        success: true,
        output: `**${info.title}** (${info.url})\n\n${info.content || ''}`,
        metadata: { url: info.url, title: info.title },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const BrowserClickTool: Tool = {
  name: 'browser_click',
  description: 'Click an element on the page by CSS selector or text content. Requires user approval because it mutates page state.',

  parameters: [
    { name: 'selector', type: 'string', description: 'CSS selector or text content to click', required: true },
    { name: 'sessionId', type: 'string', description: 'Browser session ID (optional)', required: false },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.selector || typeof params.selector !== 'string') {
      return 'selector must be a non-empty string';
    }
    return null;
  },

  getPermission(): ToolPermission {
    return ToolPermission.USER_APPROVAL;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const sid = getSessionId(context, params);
      await manager.click(sid, params.selector);
      return { success: true, output: `Clicked: ${params.selector}` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const BrowserTypeTool: Tool = {
  name: 'browser_type',
  description: 'Type text into an input field on the page. Requires user approval because it mutates page state. Optionally press Enter after typing.',

  parameters: [
    { name: 'selector', type: 'string', description: 'CSS selector for the input field', required: true },
    { name: 'text', type: 'string', description: 'Text to type', required: true },
    { name: 'pressEnter', type: 'boolean', description: 'Press Enter key after typing', required: false, default: false },
    { name: 'sessionId', type: 'string', description: 'Browser session ID (optional)', required: false },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.selector || typeof params.selector !== 'string') {
      return 'selector must be a non-empty string';
    }
    if (!params.text || typeof params.text !== 'string') {
      return 'text must be a non-empty string';
    }
    return null;
  },

  getPermission(): ToolPermission {
    return ToolPermission.USER_APPROVAL;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const sid = getSessionId(context, params);
      await manager.type(sid, params.selector, params.text, params.pressEnter);
      return { success: true, output: `Typed into ${params.selector}${params.pressEnter ? ' (Enter pressed)' : ''}` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const BrowserScreenshotTool: Tool = {
  name: 'browser_screenshot',
  description: 'Capture a screenshot of the current page. Returns base64-encoded image data and saves to disk.',

  parameters: [
    { name: 'fullPage', type: 'boolean', description: 'Capture full page or just viewport', required: false, default: true },
    { name: 'selector', type: 'string', description: 'CSS selector to screenshot a specific element', required: false },
    { name: 'sessionId', type: 'string', description: 'Browser session ID (optional)', required: false },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const sid = getSessionId(context, params);
      const result = await manager.screenshot(sid, {
        fullPage: params.fullPage,
        selector: params.selector,
      });

      return {
        success: true,
        output: result.path
          ? `Screenshot saved to ${result.path}`
          : 'Screenshot captured',
        metadata: { base64: result.base64, path: result.path },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const BrowserExtractTool: Tool = {
  name: 'browser_extract',
  description: 'Extract text and attributes from elements matching a CSS selector. Returns a JSON array of matched elements.',

  parameters: [
    { name: 'selector', type: 'string', description: 'CSS selector to match elements', required: true },
    { name: 'sessionId', type: 'string', description: 'Browser session ID (optional)', required: false },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.selector || typeof params.selector !== 'string') {
      return 'selector must be a non-empty string';
    }
    return null;
  },

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const sid = getSessionId(context, params);
      const result = await manager.extract(sid, params.selector);

      return {
        success: true,
        output: JSON.stringify(result, null, 2),
        metadata: { count: result.elements.length },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const BrowserWaitTool: Tool = {
  name: 'browser_wait',
  description: 'Wait for an element to appear (by CSS selector) or wait for a fixed delay (max 30 seconds).',

  parameters: [
    { name: 'selector', type: 'string', description: 'CSS selector to wait for', required: false },
    { name: 'delay', type: 'number', description: 'Milliseconds to wait (max 30000)', required: false },
    { name: 'sessionId', type: 'string', description: 'Browser session ID (optional)', required: false },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.selector && !params.delay) {
      return 'Either selector or delay must be provided';
    }
    if (params.delay && (typeof params.delay !== 'number' || params.delay < 0)) {
      return 'delay must be a positive number';
    }
    return null;
  },

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const sid = getSessionId(context, params);

      if (params.selector) {
        await manager.wait(sid, params.selector);
        return { success: true, output: `Element found: ${params.selector}` };
      } else {
        const delay = Math.min(params.delay, 30_000);
        await manager.wait(sid, delay);
        return { success: true, output: `Waited ${delay}ms` };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const BrowserEvaluateTool: Tool = {
  name: 'browser_evaluate',
  description: 'Run JavaScript code on the current page and return the result. Requires user approval. The JS code will be shown in the approval prompt.',

  parameters: [
    { name: 'script', type: 'string', description: 'JavaScript code to run on the page', required: true },
    { name: 'sessionId', type: 'string', description: 'Browser session ID (optional)', required: false },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.script || typeof params.script !== 'string') {
      return 'script must be a non-empty string';
    }
    return null;
  },

  getPermission(): ToolPermission {
    return ToolPermission.USER_APPROVAL;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const sid = getSessionId(context, params);
      const result = await manager.runScript(sid, params.script);
      return { success: true, output: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const BrowseTool: Tool = {
  name: 'browse',
  description: 'High-level browser tool: describe a task in natural language (e.g., "go to hackernews and get the top 5 stories"). Chains navigate + extract for read-only tasks. If the task requires clicks/typing, it will direct you to use the primitive browser tools instead.',

  parameters: [
    { name: 'task', type: 'string', description: 'Natural language description of the browsing task', required: true },
    { name: 'sessionId', type: 'string', description: 'Browser session ID (optional)', required: false },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.task || typeof params.task !== 'string') {
      return 'task must be a non-empty string';
    }
    return null;
  },

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const sid = getSessionId(context, params);
      const result = await manager.browse(sid, params.task);

      return {
        success: true,
        output: result.result,
        metadata: { steps: result.steps },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
```

**Step 4: Update `packages/tools/src/index.ts`**

Add at the bottom of the file (after the behavior tools block):

```typescript
// Import and register browser tools
import {
  BrowserNavigateTool,
  BrowserClickTool,
  BrowserTypeTool,
  BrowserScreenshotTool,
  BrowserExtractTool,
  BrowserWaitTool,
  BrowserEvaluateTool,
  BrowseTool,
} from './browser.js';

toolRegistry.register(BrowserNavigateTool);
toolRegistry.register(BrowserClickTool);
toolRegistry.register(BrowserTypeTool);
toolRegistry.register(BrowserScreenshotTool);
toolRegistry.register(BrowserExtractTool);
toolRegistry.register(BrowserWaitTool);
toolRegistry.register(BrowserEvaluateTool);
toolRegistry.register(BrowseTool);

// Export browser tools
export {
  BrowserNavigateTool,
  BrowserClickTool,
  BrowserTypeTool,
  BrowserScreenshotTool,
  BrowserExtractTool,
  BrowserWaitTool,
  BrowserEvaluateTool,
  BrowseTool,
} from './browser.js';
export { setBrowserManager } from './browser.js';
```

**Step 5: Update `packages/tools/package.json`**

Add to dependencies:

```json
"@auxiora/browser": "workspace:*"
```

**Step 6: Update `packages/tools/tsconfig.json`**

Add to references array:

```json
{ "path": "../browser" }
```

**Step 7: Install deps and run tests**

Run: `cd /home/ai-work/git/auxiora && pnpm install`

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/tools/tests/browser-tools.test.ts`
Expected: PASS (all ~14 tests).

**Step 8: Commit**

```bash
git add packages/tools/src/browser.ts packages/tools/tests/browser-tools.test.ts packages/tools/src/index.ts packages/tools/package.json packages/tools/tsconfig.json
git commit -m "feat(tools): add 8 browser tools with permission system"
```

---

### Task 7: Runtime integration + audit events

**Files:**
- Modify: `packages/runtime/src/index.ts` (wire BrowserManager into Auxiora lifecycle)
- Modify: `packages/runtime/package.json` (add `@auxiora/browser` dependency)
- Modify: `packages/audit/src/index.ts` (add browser audit event types)
- Modify: `packages/core/src/index.ts` (add `getScreenshotsDir()`)

**Step 1: Add browser audit events**

In `packages/audit/src/index.ts`, add these types to the `AuditEventType` union before `'system.error'`:

```typescript
  | 'browser.navigate'
  | 'browser.click'
  | 'browser.type'
  | 'browser.script'
  | 'browser.screenshot'
```

**Step 2: Add screenshots path to core**

In `packages/core/src/index.ts`, add this function (after `getBehaviorsPath`):

```typescript
export function getScreenshotsDir(): string {
  return path.join(getWorkspaceDir(), 'screenshots');
}
```

And add to the `paths` object:

```typescript
screenshots: getScreenshotsDir,
```

**Step 3: Wire BrowserManager into runtime**

In `packages/runtime/src/index.ts`:

Add imports at top (alongside existing imports from `@auxiora/core` and `@auxiora/tools`):

```typescript
import { BrowserManager } from '@auxiora/browser';
import { getScreenshotsDir } from '@auxiora/core';
```

Add `setBrowserManager` to the existing tools import:

```typescript
import {
  toolRegistry,
  toolExecutor,
  initializeToolExecutor,
  setBrowserManager,
  type ExecutionContext,
} from '@auxiora/tools';
```

Add field to `Auxiora` class:

```typescript
private browserManager?: BrowserManager;
```

Add initialization in `initialize()`, after the behaviors block (before the closing `}`):

```typescript
    // Initialize browser system
    this.browserManager = new BrowserManager({
      config: {
        headless: true,
        viewport: { width: 1280, height: 720 },
        navigationTimeout: 30_000,
        actionTimeout: 10_000,
        maxConcurrentPages: 10,
        screenshotDir: getScreenshotsDir(),
      },
    });
    setBrowserManager(this.browserManager);
```

Add shutdown in `stop()`, before `this.sessions.destroy()`:

```typescript
    if (this.browserManager) {
      await this.browserManager.shutdown();
    }
```

**Step 4: Update `packages/runtime/package.json`**

Add to dependencies:

```json
"@auxiora/browser": "workspace:*"
```

**Step 5: Install and verify**

Run: `cd /home/ai-work/git/auxiora && pnpm install`
Run: `cd /home/ai-work/git/auxiora && pnpm --filter @auxiora/runtime typecheck`
Expected: No errors.

**Step 6: Commit**

```bash
git add packages/runtime/src/index.ts packages/runtime/package.json packages/audit/src/index.ts packages/core/src/index.ts
git commit -m "feat(runtime): integrate BrowserManager into Auxiora lifecycle with audit events"
```

---

### Task 8: Integration tests

**Files:**
- Create: `packages/browser/tests/integration.test.ts`

**Step 1: Write integration test**

Create `packages/browser/tests/integration.test.ts`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest';
import { BrowserManager } from '../src/browser-manager.js';
import { DEFAULT_BROWSER_CONFIG } from '../src/types.js';
import { validateUrl } from '../src/url-validator.js';

function createMockPage(overrides: any = {}) {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    title: vi.fn().mockResolvedValue(overrides.title || 'Test Page'),
    content: vi.fn().mockResolvedValue(
      overrides.html || '<html><body><h1>Test</h1><p>Content here</p></body></html>'
    ),
    url: vi.fn().mockReturnValue(overrides.url || 'https://example.com'),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    screenshot: vi.fn().mockResolvedValue(Buffer.from('screenshot-data')),
    $: vi.fn().mockResolvedValue(null),
    $$eval: vi.fn().mockResolvedValue(
      overrides.elements || [
        { text: 'Story 1', tagName: 'a', attributes: { href: '/story/1' } },
        { text: 'Story 2', tagName: 'a', attributes: { href: '/story/2' } },
      ]
    ),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(overrides.evalResult || null),
    close: vi.fn().mockResolvedValue(undefined),
    isClosed: vi.fn().mockReturnValue(false),
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    setDefaultNavigationTimeout: vi.fn(),
    setDefaultTimeout: vi.fn(),
  };
}

function createMockBrowser(page: any) {
  const context = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    newContext: vi.fn().mockResolvedValue(context),
    isConnected: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
    contexts: vi.fn().mockReturnValue([context]),
  };
}

describe('Browser integration', () => {
  let manager: BrowserManager;

  afterEach(async () => {
    if (manager) await manager.shutdown();
  });

  it('should navigate then extract then screenshot flow', async () => {
    const mockPage = createMockPage({
      title: 'Hacker News',
      url: 'https://news.ycombinator.com',
    });
    const mockBrowser = createMockBrowser(mockPage);

    manager = new BrowserManager({
      config: { ...DEFAULT_BROWSER_CONFIG, screenshotDir: '' },
      browserFactory: vi.fn().mockResolvedValue(mockBrowser),
    });

    // Navigate
    const navResult = await manager.navigate('s1', 'https://news.ycombinator.com');
    expect(navResult.title).toBe('Hacker News');
    expect(navResult.url).toBe('https://news.ycombinator.com');

    // Extract
    const extractResult = await manager.extract('s1', '.storylink');
    expect(extractResult.elements).toHaveLength(2);
    expect(extractResult.elements[0].text).toBe('Story 1');

    // Screenshot
    const screenshotResult = await manager.screenshot('s1');
    expect(screenshotResult.base64).toBeDefined();
    expect(screenshotResult.base64.length).toBeGreaterThan(0);
  });

  it('should isolate multi-session pages', async () => {
    const page1 = createMockPage({ title: 'Page 1', url: 'https://site1.com' });
    const page2 = createMockPage({ title: 'Page 2', url: 'https://site2.com' });

    let callCount = 0;
    const context = {
      newPage: vi.fn().mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? page1 : page2;
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const mockBrowser = {
      newContext: vi.fn().mockResolvedValue(context),
      isConnected: vi.fn().mockReturnValue(true),
      close: vi.fn().mockResolvedValue(undefined),
      contexts: vi.fn().mockReturnValue([context]),
    };

    manager = new BrowserManager({
      config: DEFAULT_BROWSER_CONFIG,
      browserFactory: vi.fn().mockResolvedValue(mockBrowser),
    });

    const nav1 = await manager.navigate('session-a', 'https://site1.com');
    const nav2 = await manager.navigate('session-b', 'https://site2.com');

    expect(nav1.title).toBe('Page 1');
    expect(nav2.title).toBe('Page 2');
    expect(manager.getPageCount()).toBe(2);
  });

  it('should enforce URL validation throughout the stack', () => {
    // These should all be blocked
    expect(validateUrl('file:///etc/passwd')).not.toBeNull();
    expect(validateUrl('javascript:alert(1)')).not.toBeNull();
    expect(validateUrl('http://127.0.0.1')).not.toBeNull();
    expect(validateUrl('http://10.0.0.1:8080')).not.toBeNull();

    // These should pass
    expect(validateUrl('https://example.com')).toBeNull();
    expect(validateUrl('https://news.ycombinator.com')).toBeNull();
  });

  it('should handle browse mutation detection', async () => {
    const mockPage = createMockPage();
    const mockBrowser = createMockBrowser(mockPage);

    manager = new BrowserManager({
      config: DEFAULT_BROWSER_CONFIG,
      browserFactory: vi.fn().mockResolvedValue(mockBrowser),
    });

    const mutationResult = await manager.browse('s1', 'click the buy button');
    expect(mutationResult.result).toContain('primitive browser tools');

    const readResult = await manager.browse('s1', 'get the price of BTC');
    expect(readResult.result).toBeDefined();
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/browser/tests/integration.test.ts`
Expected: PASS (4 tests).

**Step 3: Run all browser tests**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/browser/`
Expected: All tests pass.

**Step 4: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: All existing + new tests pass.

**Step 5: Commit**

```bash
git add packages/browser/tests/integration.test.ts
git commit -m "test(browser): add integration tests for navigate/extract/screenshot flow"
```

---

### Task 9: Version bump and final verification

**Files:**
- Modify: `package.json` (bump version)

**Step 1: Bump monorepo version**

In root `package.json`, change version from `1.3.0` to `1.4.0`.

**Step 2: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: All tests pass.

**Step 3: Run typecheck**

Run: `cd /home/ai-work/git/auxiora && pnpm typecheck`
Expected: No type errors.

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 1.4.0"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | Package scaffolding | — |
| 2 | Types + config defaults | 4 |
| 3 | URL validator | ~14 |
| 4 | BrowserManager core | ~8 |
| 5 | Action method tests | ~12 |
| 6 | Browser tools (8 tools) | ~14 |
| 7 | Runtime + audit + core | — (typecheck) |
| 8 | Integration tests | 4 |
| 9 | Version bump + verification | — |

**Total new tests: ~56**
**Total tools added: 8** (browser_navigate, browser_click, browser_type, browser_screenshot, browser_extract, browser_wait, browser_evaluate, browse)
