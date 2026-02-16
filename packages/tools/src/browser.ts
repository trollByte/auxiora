import type { Tool, ToolParameter, ExecutionContext, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';

const logger = getLogger('tools:browser');

// Browser manager will be injected by the runtime
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

/**
 * Helper to resolve the session ID from context or params.
 * Params.sessionId takes precedence over context.sessionId.
 */
function getSessionId(context: ExecutionContext, params: any): string {
  return params.sessionId || context.sessionId || 'default';
}

// ─── 1. browser_navigate ────────────────────────────────────────────────────

export const BrowserNavigateTool: Tool = {
  name: 'browser_navigate',
  description:
    'Navigate a full browser (Playwright) to a URL. Only use this when you need JavaScript rendering or plan to interact with the page (clicking, typing, screenshots). For simple page reading, use web_browser instead — it is faster and always available.',

  parameters: [
    {
      name: 'url',
      type: 'string',
      description: 'The URL to navigate to (must be http or https)',
      required: true,
    },
    {
      name: 'sessionId',
      type: 'string',
      description: 'Browser session ID (defaults to context session)',
      required: false,
    },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.url || typeof params.url !== 'string') {
      return 'url is required and must be a string';
    }
    return null;
  },

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const sessionId = getSessionId(context, params);
      const info = await manager.navigate(sessionId, params.url);
      audit('browser.navigate', { sessionId, url: params.url, title: info.title });
      return {
        success: true,
        output: JSON.stringify(info),
        metadata: { sessionId },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

// ─── 2. browser_click ───────────────────────────────────────────────────────

export const BrowserClickTool: Tool = {
  name: 'browser_click',
  description:
    'Click an element on the current page. Requires a CSS selector. This action mutates page state and requires user approval.',

  parameters: [
    {
      name: 'selector',
      type: 'string',
      description: 'CSS selector for the element to click',
      required: true,
    },
    {
      name: 'sessionId',
      type: 'string',
      description: 'Browser session ID (defaults to context session)',
      required: false,
    },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.selector || typeof params.selector !== 'string') {
      return 'selector is required and must be a string';
    }
    return null;
  },

  getPermission(): ToolPermission {
    return ToolPermission.USER_APPROVAL;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const sessionId = getSessionId(context, params);
      await manager.click(sessionId, params.selector);
      audit('browser.click', { sessionId, selector: params.selector });
      return {
        success: true,
        output: `Clicked: ${params.selector}`,
        metadata: { sessionId },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

// ─── 3. browser_type ────────────────────────────────────────────────────────

export const BrowserTypeTool: Tool = {
  name: 'browser_type',
  description:
    'Type text into an input element. Requires a CSS selector and the text to type. Optionally press Enter after typing. This action mutates page state and requires user approval.',

  parameters: [
    {
      name: 'selector',
      type: 'string',
      description: 'CSS selector for the input element',
      required: true,
    },
    {
      name: 'text',
      type: 'string',
      description: 'Text to type into the element',
      required: true,
    },
    {
      name: 'pressEnter',
      type: 'boolean',
      description: 'Press Enter after typing (default: false)',
      required: false,
      default: false,
    },
    {
      name: 'sessionId',
      type: 'string',
      description: 'Browser session ID (defaults to context session)',
      required: false,
    },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.selector || typeof params.selector !== 'string') {
      return 'selector is required and must be a string';
    }
    if (params.text === undefined || params.text === null || typeof params.text !== 'string') {
      return 'text is required and must be a string';
    }
    return null;
  },

  getPermission(): ToolPermission {
    return ToolPermission.USER_APPROVAL;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const sessionId = getSessionId(context, params);
      await manager.type(sessionId, params.selector, params.text, params.pressEnter ?? false);
      audit('browser.type', { sessionId, selector: params.selector });
      return {
        success: true,
        output: `Typed into ${params.selector}: "${params.text}"${params.pressEnter ? ' [Enter]' : ''}`,
        metadata: { sessionId },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

// ─── 4. browser_screenshot ──────────────────────────────────────────────────

export const BrowserScreenshotTool: Tool = {
  name: 'browser_screenshot',
  description:
    'Take a screenshot of the current page or a specific element. Returns a base64-encoded PNG image.',

  parameters: [
    {
      name: 'fullPage',
      type: 'boolean',
      description: 'Capture the full scrollable page (default: true)',
      required: false,
      default: true,
    },
    {
      name: 'selector',
      type: 'string',
      description: 'CSS selector to screenshot a specific element instead of the page',
      required: false,
    },
    {
      name: 'sessionId',
      type: 'string',
      description: 'Browser session ID (defaults to context session)',
      required: false,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const sessionId = getSessionId(context, params);
      const result = await manager.screenshot(sessionId, {
        fullPage: params.fullPage ?? true,
        selector: params.selector,
      });
      audit('browser.screenshot', { sessionId, path: result.path });
      return {
        success: true,
        output: result.base64,
        metadata: { sessionId, path: result.path, type: 'image/png' },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

// ─── 5. browser_extract ─────────────────────────────────────────────────────

export const BrowserExtractTool: Tool = {
  name: 'browser_extract',
  description:
    'Extract structured data from the current page using a CSS selector. Returns matching elements with their text, attributes, and tag names.',

  parameters: [
    {
      name: 'selector',
      type: 'string',
      description: 'CSS selector for elements to extract',
      required: true,
    },
    {
      name: 'sessionId',
      type: 'string',
      description: 'Browser session ID (defaults to context session)',
      required: false,
    },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.selector || typeof params.selector !== 'string') {
      return 'selector is required and must be a string';
    }
    return null;
  },

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const sessionId = getSessionId(context, params);
      const result = await manager.extract(sessionId, params.selector);
      return {
        success: true,
        output: JSON.stringify(result),
        metadata: { sessionId, count: result.elements.length },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

// ─── 6. browser_wait ────────────────────────────────────────────────────────

export const BrowserWaitTool: Tool = {
  name: 'browser_wait',
  description:
    'Wait for a CSS selector to appear on the page, or wait a fixed number of milliseconds. Max wait time is 30 seconds.',

  parameters: [
    {
      name: 'selector',
      type: 'string',
      description: 'CSS selector to wait for',
      required: false,
    },
    {
      name: 'timeout',
      type: 'number',
      description: 'Milliseconds to wait (max 30000). Used if no selector is provided.',
      required: false,
    },
    {
      name: 'sessionId',
      type: 'string',
      description: 'Browser session ID (defaults to context session)',
      required: false,
    },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.selector && params.timeout === undefined) {
      return 'Either selector or timeout is required';
    }
    if (params.timeout !== undefined && (typeof params.timeout !== 'number' || params.timeout <= 0)) {
      return 'timeout must be a positive number';
    }
    return null;
  },

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const sessionId = getSessionId(context, params);
      const target = params.selector || params.timeout;
      await manager.wait(sessionId, target);
      return {
        success: true,
        output: params.selector
          ? `Element found: ${params.selector}`
          : `Waited ${params.timeout}ms`,
        metadata: { sessionId },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

// ─── 7. browser_evaluate ────────────────────────────────────────────────────

export const BrowserEvaluateTool: Tool = {
  name: 'browser_evaluate',
  description:
    'Execute JavaScript in the browser page context. Returns the JSON-serialized result. This can modify page state and requires user approval.',

  parameters: [
    {
      name: 'script',
      type: 'string',
      description: 'JavaScript code to execute in the browser context',
      required: true,
    },
    {
      name: 'sessionId',
      type: 'string',
      description: 'Browser session ID (defaults to context session)',
      required: false,
    },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.script || typeof params.script !== 'string') {
      return 'script is required and must be a string';
    }
    return null;
  },

  getPermission(): ToolPermission {
    return ToolPermission.USER_APPROVAL;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const sessionId = getSessionId(context, params);
      const result = await manager.runScript(sessionId, params.script);
      audit('browser.script', { sessionId, scriptLength: params.script.length });
      return {
        success: true,
        output: result,
        metadata: { sessionId },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

// ─── 8. browse ──────────────────────────────────────────────────────────────

export const BrowseTool: Tool = {
  name: 'browse',
  description:
    'High-level browsing orchestrator for multi-step interactive tasks. For simple page reading (articles, search results, documentation), use web_browser instead — it is faster and always available.',

  parameters: [
    {
      name: 'task',
      type: 'string',
      description: 'Natural language description of the browsing task',
      required: true,
    },
    {
      name: 'sessionId',
      type: 'string',
      description: 'Browser session ID (defaults to context session)',
      required: false,
    },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.task || typeof params.task !== 'string') {
      return 'task is required and must be a string';
    }
    return null;
  },

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    try {
      const manager = requireManager();
      const sessionId = getSessionId(context, params);
      const result = await manager.browse(sessionId, params.task);
      return {
        success: true,
        output: result.result,
        metadata: { sessionId, steps: result.steps },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
