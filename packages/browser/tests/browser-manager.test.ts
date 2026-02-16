import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserManager } from '../src/browser-manager.js';

// --- Mock factories ---

function createMockPage(overrides: Record<string, any> = {}) {
  return {
    isClosed: vi.fn().mockReturnValue(false),
    close: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    title: vi.fn().mockResolvedValue('Test Page'),
    url: vi.fn().mockReturnValue('https://example.com'),
    content: vi.fn().mockResolvedValue('<html><body><h1>Hello</h1></body></html>'),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    $: vi.fn().mockResolvedValue(null),
    $$eval: vi.fn().mockResolvedValue([]),
    evaluate: vi.fn().mockResolvedValue({}),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    setDefaultNavigationTimeout: vi.fn(),
    setDefaultTimeout: vi.fn(),
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

function createMockContext(overrides: Record<string, any> = {}) {
  const mockPage = createMockPage();
  return {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
    _mockPage: mockPage,
    ...overrides,
  };
}

function createMockBrowser(overrides: Record<string, any> = {}) {
  const mockContext = createMockContext();
  return {
    isConnected: vi.fn().mockReturnValue(true),
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
    _mockContext: mockContext,
    ...overrides,
  };
}

// --- Tests ---

describe('BrowserManager', () => {
  let mockBrowser: ReturnType<typeof createMockBrowser>;
  let browserFactory: ReturnType<typeof vi.fn>;
  let manager: BrowserManager;

  beforeEach(() => {
    mockBrowser = createMockBrowser();
    browserFactory = vi.fn().mockResolvedValue(mockBrowser);
    manager = new BrowserManager({
      browserFactory,
      config: { screenshotDir: '' } as any,
    });
  });

  describe('launch and shutdown', () => {
    it('should launch browser on first use', async () => {
      await manager.launch();
      expect(browserFactory).toHaveBeenCalledTimes(1);
      expect(mockBrowser.newContext).toHaveBeenCalledTimes(1);
    });

    it('should not re-launch if already running', async () => {
      await manager.launch();
      await manager.launch();
      expect(browserFactory).toHaveBeenCalledTimes(1);
    });

    it('should close all pages and browser on shutdown', async () => {
      await manager.launch();
      const page = await manager.getPage('session-1');
      await manager.shutdown();

      expect(page.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
      expect(manager.getPageCount()).toBe(0);
    });
  });

  describe('page lifecycle', () => {
    it('should create new page for new session', async () => {
      const page = await manager.getPage('session-1');
      expect(page).toBeDefined();
      expect(page.setViewportSize).toHaveBeenCalled();
      expect(manager.getPageCount()).toBe(1);
    });

    it('should reuse existing page for same session', async () => {
      const page1 = await manager.getPage('session-1');
      const page2 = await manager.getPage('session-1');
      expect(page1).toBe(page2);
      expect(manager.getPageCount()).toBe(1);
    });

    it('should close a specific page', async () => {
      const page = await manager.getPage('session-1');
      await manager.closePage('session-1');
      expect(page.close).toHaveBeenCalled();
      expect(manager.getPageCount()).toBe(0);
    });

    it('should enforce max concurrent pages', async () => {
      const limitedManager = new BrowserManager({
        browserFactory,
        config: { maxConcurrentPages: 2, screenshotDir: '' } as any,
      });

      await limitedManager.getPage('s1');
      await limitedManager.getPage('s2');
      await expect(limitedManager.getPage('s3')).rejects.toThrow('Max concurrent pages');
    });
  });

  describe('crash recovery', () => {
    it('should re-launch browser if disconnected', async () => {
      await manager.getPage('session-1');
      expect(browserFactory).toHaveBeenCalledTimes(1);

      // Simulate browser crash
      mockBrowser.isConnected.mockReturnValue(false);

      // Create a new mock browser for re-launch
      const newMockBrowser = createMockBrowser();
      browserFactory.mockResolvedValue(newMockBrowser);

      await manager.getPage('session-2');
      expect(browserFactory).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetch-only fallback', () => {
    let fallbackManager: BrowserManager;

    beforeEach(() => {
      const failingFactory = vi.fn().mockRejectedValue(new Error('Executable doesn\'t exist'));
      fallbackManager = new BrowserManager({
        browserFactory: failingFactory,
        config: { screenshotDir: '' } as any,
      });
    });

    it('should enter fetch-only mode when browser launch fails', async () => {
      expect(fallbackManager.isFetchOnly).toBe(false);
      await fallbackManager.launch();
      expect(fallbackManager.isFetchOnly).toBe(true);
    });

    it('should navigate using fetch in fallback mode', async () => {
      await fallbackManager.launch();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        url: 'https://example.com',
        text: vi.fn().mockResolvedValue('<html><head><title>Example</title></head><body><h1>Hello</h1></body></html>'),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await fallbackManager.navigate('s1', 'https://example.com');
      expect(result.title).toBe('Example');
      expect(result.content).toContain('Hello');
      expect(result.url).toBe('https://example.com');

      vi.unstubAllGlobals();
    });

    it('should throw clear error for interactive methods in fallback mode', async () => {
      await fallbackManager.launch();

      await expect(fallbackManager.click('s1', 'button')).rejects.toThrow('Interactive browsing is not available');
      await expect(fallbackManager.type('s1', 'input', 'text')).rejects.toThrow('Interactive browsing is not available');
      await expect(fallbackManager.screenshot('s1')).rejects.toThrow('Interactive browsing is not available');
      await expect(fallbackManager.extract('s1', 'div')).rejects.toThrow('Interactive browsing is not available');
      await expect(fallbackManager.runScript('s1', '1+1')).rejects.toThrow('Interactive browsing is not available');
    });

    it('should allow timeout-based wait in fallback mode', async () => {
      await fallbackManager.launch();
      // Timeout wait should still work (no browser needed)
      await expect(fallbackManager.wait('s1', 10)).resolves.toBeUndefined();
    });

    it('should throw for selector-based wait in fallback mode', async () => {
      await fallbackManager.launch();
      await expect(fallbackManager.wait('s1', '.some-selector')).rejects.toThrow('Interactive browsing is not available');
    });

    it('should handle fetch errors gracefully', async () => {
      await fallbackManager.launch();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(fallbackManager.navigate('s1', 'https://example.com/missing')).rejects.toThrow('HTTP 404');

      vi.unstubAllGlobals();
    });
  });
});
