/**
 * Tests for browser tools
 *
 * Validates:
 * - Permission levels for each tool
 * - Parameter validation
 * - Execution via mock BrowserManager
 * - Error handling when manager is not set
 */

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

// ─── Mock BrowserManager ────────────────────────────────────────────────────

function createMockManager() {
  return {
    navigate: vi.fn(async (_sid: string, url: string) => ({
      url,
      title: 'Mock Page',
      content: '# Mock content',
    })),
    click: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    screenshot: vi.fn(async () => ({
      base64: 'iVBORw0KGgo=',
      path: '/tmp/screenshot.png',
    })),
    extract: vi.fn(async () => ({
      selector: 'h1',
      elements: [{ text: 'Hello', tagName: 'h1', attributes: {} }],
    })),
    wait: vi.fn(async () => {}),
    runScript: vi.fn(async () => '{"result":42}'),
    browse: vi.fn(async () => ({
      result: 'Browse complete',
      steps: [],
    })),
  };
}

describe('Browser Tools', () => {
  let mockManager: ReturnType<typeof createMockManager>;

  beforeEach(() => {
    mockManager = createMockManager();
    setBrowserManager(mockManager);
  });

  // ─── Permission tests ──────────────────────────────────────────────────

  describe('Permissions', () => {
    it('browser_navigate should be AUTO_APPROVE', () => {
      expect(BrowserNavigateTool.getPermission({}, {})).toBe(ToolPermission.AUTO_APPROVE);
    });

    it('browser_click should be USER_APPROVAL', () => {
      expect(BrowserClickTool.getPermission({}, {})).toBe(ToolPermission.USER_APPROVAL);
    });

    it('browser_type should be USER_APPROVAL', () => {
      expect(BrowserTypeTool.getPermission({}, {})).toBe(ToolPermission.USER_APPROVAL);
    });

    it('browser_screenshot should be AUTO_APPROVE', () => {
      expect(BrowserScreenshotTool.getPermission({}, {})).toBe(ToolPermission.AUTO_APPROVE);
    });

    it('browser_extract should be AUTO_APPROVE', () => {
      expect(BrowserExtractTool.getPermission({}, {})).toBe(ToolPermission.AUTO_APPROVE);
    });

    it('browser_wait should be AUTO_APPROVE', () => {
      expect(BrowserWaitTool.getPermission({}, {})).toBe(ToolPermission.AUTO_APPROVE);
    });

    it('browser_evaluate should be USER_APPROVAL', () => {
      expect(BrowserEvaluateTool.getPermission({}, {})).toBe(ToolPermission.USER_APPROVAL);
    });

    it('browse should be AUTO_APPROVE', () => {
      expect(BrowseTool.getPermission({}, {})).toBe(ToolPermission.AUTO_APPROVE);
    });
  });

  // ─── Validation tests ─────────────────────────────────────────────────

  describe('Parameter validation', () => {
    it('browser_navigate requires url', () => {
      expect(BrowserNavigateTool.validateParams!({})).toBe('url is required and must be a string');
      expect(BrowserNavigateTool.validateParams!({ url: 'https://example.com' })).toBeNull();
    });

    it('browser_click requires selector', () => {
      expect(BrowserClickTool.validateParams!({})).toBe('selector is required and must be a string');
      expect(BrowserClickTool.validateParams!({ selector: '#btn' })).toBeNull();
    });

    it('browser_type requires selector and text', () => {
      expect(BrowserTypeTool.validateParams!({})).toBe('selector is required and must be a string');
      expect(BrowserTypeTool.validateParams!({ selector: '#input' })).toBe(
        'text is required and must be a string'
      );
      expect(BrowserTypeTool.validateParams!({ selector: '#input', text: 'hello' })).toBeNull();
    });

    it('browser_extract requires selector', () => {
      expect(BrowserExtractTool.validateParams!({})).toBe(
        'selector is required and must be a string'
      );
      expect(BrowserExtractTool.validateParams!({ selector: 'h1' })).toBeNull();
    });

    it('browser_wait requires selector or timeout', () => {
      expect(BrowserWaitTool.validateParams!({})).toBe('Either selector or timeout is required');
      expect(BrowserWaitTool.validateParams!({ selector: '.loaded' })).toBeNull();
      expect(BrowserWaitTool.validateParams!({ timeout: 1000 })).toBeNull();
      expect(BrowserWaitTool.validateParams!({ timeout: -1 })).toBe(
        'timeout must be a positive number'
      );
    });

    it('browser_evaluate requires script', () => {
      expect(BrowserEvaluateTool.validateParams!({})).toBe(
        'script is required and must be a string'
      );
      expect(BrowserEvaluateTool.validateParams!({ script: '1+1' })).toBeNull();
    });

    it('browse requires task', () => {
      expect(BrowseTool.validateParams!({})).toBe('task is required and must be a string');
      expect(BrowseTool.validateParams!({ task: 'find prices' })).toBeNull();
    });
  });

  // ─── Execution tests ──────────────────────────────────────────────────

  describe('Execution', () => {
    const ctx = { sessionId: 'test-session' };

    it('browser_navigate calls manager.navigate', async () => {
      const result = await BrowserNavigateTool.execute(
        { url: 'https://example.com' },
        ctx
      );
      expect(result.success).toBe(true);
      expect(mockManager.navigate).toHaveBeenCalledWith('test-session', 'https://example.com');
      const output = JSON.parse(result.output!);
      expect(output.title).toBe('Mock Page');
    });

    it('browser_click calls manager.click', async () => {
      const result = await BrowserClickTool.execute({ selector: '#btn' }, ctx);
      expect(result.success).toBe(true);
      expect(mockManager.click).toHaveBeenCalledWith('test-session', '#btn');
      expect(result.output).toContain('#btn');
    });

    it('browser_type calls manager.type', async () => {
      const result = await BrowserTypeTool.execute(
        { selector: '#input', text: 'hello', pressEnter: true },
        ctx
      );
      expect(result.success).toBe(true);
      expect(mockManager.type).toHaveBeenCalledWith('test-session', '#input', 'hello', true);
      expect(result.output).toContain('[Enter]');
    });

    it('browser_screenshot calls manager.screenshot', async () => {
      const result = await BrowserScreenshotTool.execute({}, ctx);
      expect(result.success).toBe(true);
      expect(mockManager.screenshot).toHaveBeenCalledWith('test-session', {
        fullPage: true,
        selector: undefined,
      });
      expect(result.output).toBe('iVBORw0KGgo=');
      expect(result.metadata?.type).toBe('image/png');
    });

    it('browser_extract calls manager.extract', async () => {
      const result = await BrowserExtractTool.execute({ selector: 'h1' }, ctx);
      expect(result.success).toBe(true);
      expect(mockManager.extract).toHaveBeenCalledWith('test-session', 'h1');
      const output = JSON.parse(result.output!);
      expect(output.elements).toHaveLength(1);
      expect(result.metadata?.count).toBe(1);
    });

    it('browser_wait calls manager.wait with selector', async () => {
      const result = await BrowserWaitTool.execute({ selector: '.loaded' }, ctx);
      expect(result.success).toBe(true);
      expect(mockManager.wait).toHaveBeenCalledWith('test-session', '.loaded');
      expect(result.output).toContain('.loaded');
    });

    it('browser_wait calls manager.wait with timeout', async () => {
      const result = await BrowserWaitTool.execute({ timeout: 500 }, ctx);
      expect(result.success).toBe(true);
      expect(mockManager.wait).toHaveBeenCalledWith('test-session', 500);
      expect(result.output).toContain('500ms');
    });

    it('browser_evaluate calls manager.runScript (not evaluate)', async () => {
      const result = await BrowserEvaluateTool.execute(
        { script: 'document.title' },
        ctx
      );
      expect(result.success).toBe(true);
      expect(mockManager.runScript).toHaveBeenCalledWith('test-session', 'document.title');
      expect(result.output).toBe('{"result":42}');
    });

    it('browse calls manager.browse', async () => {
      const result = await BrowseTool.execute(
        { task: 'find the latest news' },
        ctx
      );
      expect(result.success).toBe(true);
      expect(mockManager.browse).toHaveBeenCalledWith('test-session', 'find the latest news');
      expect(result.output).toBe('Browse complete');
    });
  });

  // ─── Session ID resolution ────────────────────────────────────────────

  describe('Session ID resolution', () => {
    it('uses params.sessionId when provided', async () => {
      await BrowserNavigateTool.execute(
        { url: 'https://example.com', sessionId: 'custom' },
        { sessionId: 'ctx-session' }
      );
      expect(mockManager.navigate).toHaveBeenCalledWith('custom', 'https://example.com');
    });

    it('falls back to context.sessionId', async () => {
      await BrowserNavigateTool.execute(
        { url: 'https://example.com' },
        { sessionId: 'ctx-session' }
      );
      expect(mockManager.navigate).toHaveBeenCalledWith('ctx-session', 'https://example.com');
    });

    it('falls back to "default" when no session', async () => {
      await BrowserNavigateTool.execute({ url: 'https://example.com' }, {});
      expect(mockManager.navigate).toHaveBeenCalledWith('default', 'https://example.com');
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────

  describe('Error handling', () => {
    it('returns error when manager is not set', async () => {
      setBrowserManager(null as any);
      // requireManager will throw
      const result = await BrowserNavigateTool.execute(
        { url: 'https://example.com' },
        {}
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Browser system not initialized');
    });

    it('returns error when manager method throws', async () => {
      mockManager.navigate.mockRejectedValueOnce(new Error('Navigation failed'));
      const result = await BrowserNavigateTool.execute(
        { url: 'https://bad.com' },
        {}
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('Navigation failed');
    });
  });

  // ─── Tool metadata ───────────────────────────────────────────────────

  describe('Tool metadata', () => {
    const tools = [
      BrowserNavigateTool,
      BrowserClickTool,
      BrowserTypeTool,
      BrowserScreenshotTool,
      BrowserExtractTool,
      BrowserWaitTool,
      BrowserEvaluateTool,
      BrowseTool,
    ];

    it('all tools have name, description, parameters, execute, getPermission', () => {
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(Array.isArray(tool.parameters)).toBe(true);
        expect(typeof tool.execute).toBe('function');
        expect(typeof tool.getPermission).toBe('function');
      }
    });

    it('all tool names start with "browser_" or are "browse"', () => {
      for (const tool of tools) {
        expect(tool.name === 'browse' || tool.name.startsWith('browser_')).toBe(true);
      }
    });
  });
});
