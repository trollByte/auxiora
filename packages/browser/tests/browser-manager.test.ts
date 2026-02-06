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
});
