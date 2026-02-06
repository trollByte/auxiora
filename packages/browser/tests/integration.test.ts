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
    expect(validateUrl('file:///etc/passwd')).not.toBeNull();
    expect(validateUrl('javascript:alert(1)')).not.toBeNull();
    expect(validateUrl('http://127.0.0.1')).not.toBeNull();
    expect(validateUrl('http://10.0.0.1:8080')).not.toBeNull();

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
