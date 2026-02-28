/**
 * WebBrowserTool - Fetch and parse web pages
 *
 * Features:
 * - Playwright-first browsing (renders JS, bypasses bot detection)
 * - Fallback to HTTP fetch when Playwright unavailable
 * - HTML to markdown conversion
 * - Rate limiting per domain
 * - Timeout enforcement
 * - User-agent identification
 */

import type { Tool, ToolParameter, ExecutionContext, ToolResult } from './index.js';
import { getLogger } from '@auxiora/logger';

// Use string constants matching ToolPermission enum values to avoid circular
// dependency with index.ts (which imports and registers these tools at module level).
const AUTO_APPROVE = 'auto_approve' as any;
const USER_APPROVAL = 'user_approval' as any;
import { validateUrl } from '@auxiora/ssrf-guard';

// BrowserManager injected by runtime (same instance as browser.ts tools)
let browserManager: any = null;

export function setWebBrowserManager(manager: any): void {
  browserManager = manager;
  logger.info('Playwright browser connected to web_browser tool');
}

const logger = getLogger('tools:web');

const DEFAULT_TIMEOUT = 10000; // 10 seconds
const MAX_CONTENT_LENGTH = 500000; // 500KB
const USER_AGENT = 'Auxiora/1.0 (AI Assistant; +https://github.com/trollByte/auxiora)';

/**
 * Simple rate limiter for web requests
 */
class RateLimiter {
  private requests = new Map<string, number[]>();
  private maxRequests = 10;
  private windowMs = 60000; // 1 minute

  async check(domain: string): Promise<boolean> {
    const now = Date.now();
    const requests = this.requests.get(domain) || [];

    // Remove old requests outside the window
    const recent = requests.filter((time) => now - time < this.windowMs);

    if (recent.length >= this.maxRequests) {
      return false; // Rate limited
    }

    recent.push(now);
    this.requests.set(domain, recent);
    return true;
  }
}

const rateLimiter = new RateLimiter();

/**
 * Extract domain from URL
 */
function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return 'invalid';
  }
}

/**
 * Simple HTML to markdown conversion
 */
function htmlToMarkdown(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Convert headings
  text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n');
  text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
  text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');

  // Convert links
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Convert lists
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

  // Convert paragraphs
  text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

  // Convert line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Remove all other HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Clean up excessive whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]{2,}/g, ' ');

  return text.trim();
}

/**
 * WebBrowserTool - Fetch web pages
 */
export const WebBrowserTool: Tool = {
  name: 'web_browser',
  description: 'PREFERRED tool for reading web pages. Use this for any read-only web task: searching, reading articles, looking up information, fetching documentation, getting news, etc. This is lightweight and works everywhere. Only use browser_navigate instead if you need JavaScript rendering or interactive features.',

  parameters: [
    {
      name: 'url',
      type: 'string',
      description: 'The URL to fetch',
      required: true,
    },
    {
      name: 'method',
      type: 'string',
      description: 'HTTP method (GET or POST)',
      required: false,
      default: 'GET',
    },
    {
      name: 'body',
      type: 'string',
      description: 'Request body for POST requests',
      required: false,
    },
  ] as ToolParameter[],

  validateParams(params: any): string | null {
    if (!params.url || typeof params.url !== 'string') {
      return 'url must be a non-empty string';
    }

    // Validate URL format and SSRF protection
    const ssrfError = validateUrl(params.url);
    if (ssrfError) {
      return ssrfError;
    }

    if (params.method && !['GET', 'POST'].includes(params.method.toUpperCase())) {
      return 'method must be GET or POST';
    }

    if (params.body && typeof params.body !== 'string') {
      return 'body must be a string';
    }

    return null;
  },

  getPermission(params: any, context: ExecutionContext) {
    const method = (params.method || 'GET').toUpperCase();

    // POST requests need approval
    if (method === 'POST') {
      return USER_APPROVAL;
    }

    // GET requests are auto-approved
    return AUTO_APPROVE;
  },

  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    const { url, method = 'GET', body } = params;
    const timeout = context.timeout || DEFAULT_TIMEOUT;

    logger.info('Fetching URL', { url, method });

    try {
      // Check rate limit
      const domain = getDomain(url);
      const allowed = await rateLimiter.check(domain);

      if (!allowed) {
        return {
          success: false,
          error: `Rate limit exceeded for domain: ${domain}. Please wait before retrying.`,
          metadata: { domain, rateLimited: true },
        };
      }

      // Try Playwright for GET requests — renders JS, uses real browser UA,
      // bypasses bot detection that blocks raw fetch
      if (browserManager && method.toUpperCase() === 'GET') {
        try {
          const sessionId = context.sessionId || 'web_browser';
          const pageInfo = await browserManager.navigate(sessionId, url);
          let output = pageInfo.content || '';

          // Truncate if too long
          if (output.length > MAX_CONTENT_LENGTH) {
            output = output.substring(0, MAX_CONTENT_LENGTH)
              + `\n\n[... content truncated]`;
          }

          logger.info('URL fetched via Playwright', {
            url,
            contentLength: output.length,
            title: pageInfo.title,
          });

          return {
            success: true,
            output: pageInfo.title ? `# ${pageInfo.title}\n\n${output}` : output,
            metadata: {
              url: pageInfo.url || url,
              contentLength: output.length,
              engine: 'playwright',
            },
          };
        } catch (playwrightErr: any) {
          // Playwright failed — fall through to fetch
          logger.warn('Playwright browse failed, falling back to fetch', {
            url,
            error: playwrightErr.message,
          });
        }
      }

      // Fallback: plain HTTP fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: method.toUpperCase(),
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            ...(body && { 'Content-Type': 'application/json' }),
          },
          body: body ? body : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
            metadata: { url, status: response.status, statusText: response.statusText },
          };
        }

        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();

        if (text.length > MAX_CONTENT_LENGTH) {
          const truncated = text.substring(0, MAX_CONTENT_LENGTH);
          return {
            success: true,
            output: truncated + `\n\n[... content truncated (${text.length - MAX_CONTENT_LENGTH} bytes omitted)]`,
            metadata: { url, contentType, contentLength: text.length, truncated: true },
          };
        }

        let output = text;
        if (contentType.includes('text/html')) {
          output = htmlToMarkdown(text);
        }

        // Detect SPAs that need JS rendering
        if (contentType.includes('text/html') && text.length > 512 && output.length < 100) {
          return {
            success: true,
            output: `This page appears to be a JavaScript-rendered application (SPA). The server returned ${text.length} bytes of HTML but almost no readable text content. To read this page, use the browser_navigate tool instead, which can execute JavaScript and render the full page.`,
            metadata: { url, contentType, contentLength: text.length, extractedLength: output.length, status: response.status, spaDetected: true },
          };
        }

        logger.info('URL fetched successfully', { url, contentLength: text.length, contentType });

        return {
          success: true,
          output,
          metadata: { url, contentType, contentLength: text.length, status: response.status, engine: 'fetch' },
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: any) {
      logger.error('Failed to fetch URL', { url, error: error.message });

      if (error.name === 'AbortError') {
        return {
          success: false,
          error: `Request timed out after ${timeout}ms`,
          metadata: { url, timeout },
        };
      }

      return {
        success: false,
        error: error.message,
        metadata: { url },
      };
    }
  },
};

/**
 * Export helper functions for testing
 */
export { htmlToMarkdown, getDomain };
