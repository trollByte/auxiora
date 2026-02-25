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
const MAX_FETCH_CONTENT = 500_000; // 500KB
const FETCH_TIMEOUT = 15_000; // 15s
const USER_AGENT = 'Auxiora/1.0 (AI Assistant; +https://github.com/trollByte/auxiora)';

const INTERACTIVE_ERROR = 'Interactive browsing is not available (Playwright not installed). Navigation and page reading still work. To enable clicking, typing, and screenshots, install Playwright: npx playwright install --with-deps chromium';

export class BrowserManager {
  private config: BrowserConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages = new Map<string, Page>();
  private browserFactory: BrowserFactory;
  private fetchOnly = false;

  constructor(options: BrowserManagerOptions = {}) {
    this.config = { ...DEFAULT_BROWSER_CONFIG, ...options.config };
    this.browserFactory = options.browserFactory || defaultBrowserFactory;
  }

  /** Whether running in fetch-only fallback mode (no Playwright). */
  get isFetchOnly(): boolean {
    return this.fetchOnly;
  }

  async launch(): Promise<void> {
    if (this.fetchOnly) return;
    if (this.browser?.isConnected()) return;

    logger.info('Launching browser', { headless: this.config.headless });
    try {
      this.browser = await this.browserFactory(this.config);
      this.context = await this.browser.newContext();
      logger.info('Browser launched');
    } catch (error: any) {
      logger.warn('Playwright unavailable, falling back to fetch-only mode', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.fetchOnly = true;
      this.browser = null;
      this.context = null;
    }
  }

  private async ensureBrowser(): Promise<void> {
    if (this.fetchOnly) return;

    if (!this.browser || !this.browser.isConnected()) {
      this.pages.clear();
      this.context = null;
      this.browser = null;

      logger.warn('Browser disconnected, re-launching');
      await this.launch();
    }
  }

  async getPage(sessionId: string): Promise<Page> {
    if (this.fetchOnly) {
      throw new Error(INTERACTIVE_ERROR);
    }

    await this.ensureBrowser();

    const existing = this.pages.get(sessionId);
    if (existing && !existing.isClosed()) {
      return existing;
    }

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

  // ─── Navigation (works in both modes) ────────────────────────────────────

  async navigate(sessionId: string, url: string): Promise<PageInfo> {
    const validationError = validateUrl(url, {
      allowedUrls: this.config.allowedUrls,
      blockedUrls: this.config.blockedUrls,
    });
    if (validationError) {
      throw new Error(validationError);
    }

    if (this.fetchOnly) {
      return this.fetchNavigate(url);
    }

    const page = await this.getPage(sessionId);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const title = await page.title();
    const content = await this.getPageMarkdown(page);

    return { url: page.url(), title, content };
  }

  // ─── Interactive methods (Playwright only) ───────────────────────────────

  async click(sessionId: string, selector: string): Promise<void> {
    if (this.fetchOnly) throw new Error(INTERACTIVE_ERROR);
    const page = await this.getPage(sessionId);
    await page.click(selector, { timeout: this.config.actionTimeout });
  }

  async type(sessionId: string, selector: string, text: string, pressEnter?: boolean): Promise<void> {
    if (this.fetchOnly) throw new Error(INTERACTIVE_ERROR);
    const page = await this.getPage(sessionId);
    await page.fill(selector, text);
    if (pressEnter) {
      await page.keyboard.press('Enter');
    }
  }

  async screenshot(sessionId: string, options?: ScreenshotOptions): Promise<{ base64: string; path?: string }> {
    if (this.fetchOnly) throw new Error(INTERACTIVE_ERROR);
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

  async extract(sessionId: string, selector: string): Promise<ExtractResult> {
    if (this.fetchOnly) throw new Error(INTERACTIVE_ERROR);
    const page = await this.getPage(sessionId);

    const elements = await page.$$eval(selector, (els) =>
      els.map((el) => ({
        text: (el as any).innerText || el.textContent || '',
        tagName: el.tagName.toLowerCase(),
        attributes: Object.fromEntries(
          Array.from(el.attributes).map((attr: any) => [attr.name, attr.value])
        ),
      }))
    );

    return { selector, elements };
  }

  async wait(sessionId: string, selectorOrMs: string | number): Promise<void> {
    if (typeof selectorOrMs === 'number') {
      const delay = Math.min(selectorOrMs, 30_000);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return;
    }
    if (this.fetchOnly) throw new Error(INTERACTIVE_ERROR);
    const page = await this.getPage(sessionId);
    await page.waitForSelector(selectorOrMs, { timeout: this.config.actionTimeout });
  }

  async runScript(sessionId: string, script: string): Promise<string> {
    if (this.fetchOnly) throw new Error(INTERACTIVE_ERROR);
    const page = await this.getPage(sessionId);
    // Playwright's page API for running script in browser context
    const result = await page.evaluate(script);
    const json = JSON.stringify(result);

    if (json.length > MAX_RESULT_SIZE) {
      throw new Error(`Result too large (${json.length} bytes, max ${MAX_RESULT_SIZE})`);
    }

    return json;
  }

  async browse(sessionId: string, task: string): Promise<{ result: string; steps: BrowseStep[] }> {
    const mutationKeywords = ['click', 'type', 'fill', 'submit', 'login', 'sign in', 'purchase', 'buy', 'send', 'post', 'delete'];
    const needsMutation = mutationKeywords.some((kw) => task.toLowerCase().includes(kw));

    if (needsMutation) {
      const msg = this.fetchOnly
        ? `This task requires page interactions (clicking, typing) which are not available in fetch-only mode. ${INTERACTIVE_ERROR}`
        : 'This task requires page interactions (clicking, typing). Please use the primitive browser tools (browser_click, browser_type) for these actions, which require user approval for safety.';
      return { result: msg, steps: [] };
    }

    return {
      result: `Browse task queued: "${task}". Use browser_navigate to go to a page, then browser_extract to get data.`,
      steps: [],
    };
  }

  // ─── Fetch-only fallback ─────────────────────────────────────────────────

  private async fetchNavigate(url: string): Promise<PageInfo> {
    logger.info('Fetching URL (fetch-only mode)', { url });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      let text = await response.text();
      if (text.length > MAX_FETCH_CONTENT) {
        text = text.substring(0, MAX_FETCH_CONTENT);
      }

      const title = this.extractTitle(text);
      const content = this.htmlToMarkdown(text);

      return { url: response.url, title, content };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${FETCH_TIMEOUT}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>(.*?)<\/title>/is);
    return match ? match[1].replace(/\s+/g, ' ').trim() : '';
  }

  // ─── Shared helpers ──────────────────────────────────────────────────────

  private async processScreenshot(buffer: Buffer, sessionId: string): Promise<{ base64: string; path?: string }> {
    if (buffer.length > MAX_SCREENSHOT_SIZE) {
      logger.warn('Screenshot exceeds size limit', { size: buffer.length });
    }

    const base64 = buffer.toString('base64');

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
