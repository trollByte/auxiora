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

describe('BrowserManager Actions', () => {
  let mockBrowser: ReturnType<typeof createMockBrowser>;
  let mockPage: ReturnType<typeof createMockPage>;
  let browserFactory: ReturnType<typeof vi.fn>;
  let manager: BrowserManager;

  beforeEach(async () => {
    mockBrowser = createMockBrowser();
    mockPage = mockBrowser._mockContext._mockPage;
    browserFactory = vi.fn().mockResolvedValue(mockBrowser);
    manager = new BrowserManager({
      browserFactory,
      config: { screenshotDir: '' } as any,
    });
  });

  describe('navigate', () => {
    it('should return page info after navigation', async () => {
      const result = await manager.navigate('s1', 'https://example.com');
      expect(result.url).toBe('https://example.com');
      expect(result.title).toBe('Test Page');
      expect(result.content).toBeDefined();
      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', { waitUntil: 'domcontentloaded' });
    });

    it('should reject blocked URLs', async () => {
      await expect(
        manager.navigate('s1', 'https://evil.com', )
      ).resolves.toBeDefined(); // not blocked by default

      const blockedManager = new BrowserManager({
        browserFactory,
        config: { blockedUrls: ['evil.com'], screenshotDir: '' } as any,
      });
      await expect(
        blockedManager.navigate('s1', 'https://evil.com')
      ).rejects.toThrow('blocked');
    });

    it('should reject private IPs', async () => {
      await expect(
        manager.navigate('s1', 'http://127.0.0.1')
      ).rejects.toThrow('private');
    });
  });

  describe('click', () => {
    it('should call page.click with selector and timeout', async () => {
      await manager.click('s1', '#btn');
      expect(mockPage.click).toHaveBeenCalledWith('#btn', expect.objectContaining({ timeout: expect.any(Number) }));
    });
  });

  describe('type', () => {
    it('should fill input with text', async () => {
      await manager.type('s1', '#input', 'hello');
      expect(mockPage.fill).toHaveBeenCalledWith('#input', 'hello');
      expect(mockPage.keyboard.press).not.toHaveBeenCalled();
    });

    it('should press Enter when requested', async () => {
      await manager.type('s1', '#input', 'hello', true);
      expect(mockPage.fill).toHaveBeenCalledWith('#input', 'hello');
      expect(mockPage.keyboard.press).toHaveBeenCalledWith('Enter');
    });
  });

  describe('extract', () => {
    it('should return elements by selector', async () => {
      const mockElements = [
        { text: 'Hello', tagName: 'h1', attributes: { class: 'title' } },
      ];
      mockPage.$$eval.mockResolvedValue(mockElements);

      const result = await manager.extract('s1', 'h1');
      expect(result.selector).toBe('h1');
      expect(result.elements).toEqual(mockElements);
    });
  });

  describe('wait', () => {
    it('should wait for selector', async () => {
      await manager.wait('s1', '.loaded');
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('.loaded', expect.objectContaining({ timeout: expect.any(Number) }));
    });

    it('should wait for fixed delay', async () => {
      const start = Date.now();
      await manager.wait('s1', 50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40); // allow small timing margin
    });
  });

  describe('runScript', () => {
    it('should return JSON result', async () => {
      mockPage.evaluate.mockResolvedValue({ answer: 42 });
      const result = await manager.runScript('s1', 'document.title');
      expect(result).toBe('{"answer":42}');
    });

    it('should reject oversized results', async () => {
      const bigObj = { data: 'x'.repeat(200_000) };
      mockPage.evaluate.mockResolvedValue(bigObj);
      await expect(manager.runScript('s1', 'big()')).rejects.toThrow('Result too large');
    });
  });

  describe('screenshot', () => {
    it('should capture full-page screenshot as base64', async () => {
      const fakeBuffer = Buffer.from('png-data');
      mockPage.screenshot.mockResolvedValue(fakeBuffer);

      const result = await manager.screenshot('s1');
      expect(result.base64).toBe(fakeBuffer.toString('base64'));
      expect(mockPage.screenshot).toHaveBeenCalledWith(expect.objectContaining({ fullPage: true, type: 'png' }));
    });
  });

  describe('browse', () => {
    it('should return mutation message for write tasks', async () => {
      const result = await manager.browse('s1', 'Click the login button');
      expect(result.result).toContain('interactions');
      expect(result.steps).toEqual([]);
    });

    it('should handle read tasks', async () => {
      const result = await manager.browse('s1', 'Find the pricing information');
      expect(result.result).toContain('Browse task queued');
    });
  });
});
