/**
 * WebBrowserTool - Fetch and parse web pages
 *
 * Features:
 * - HTTP GET/POST requests
 * - HTML to markdown conversion
 * - Rate limiting per domain
 * - Timeout enforcement
 * - User-agent identification
 */

import type { Tool, ToolParameter, ExecutionContext, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { getLogger } from '@auxiora/logger';

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

    // Validate URL format
    try {
      new URL(params.url);
    } catch {
      return 'url must be a valid URL';
    }

    if (params.method && !['GET', 'POST'].includes(params.method.toUpperCase())) {
      return 'method must be GET or POST';
    }

    if (params.body && typeof params.body !== 'string') {
      return 'body must be a string';
    }

    return null;
  },

  getPermission(params: any, context: ExecutionContext): ToolPermission {
    const method = (params.method || 'GET').toUpperCase();

    // POST requests need approval
    if (method === 'POST') {
      return ToolPermission.USER_APPROVAL;
    }

    // GET requests are auto-approved
    return ToolPermission.AUTO_APPROVE;
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

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        // Fetch URL
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

        // Check response status
        if (!response.ok) {
          return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
            metadata: {
              url,
              status: response.status,
              statusText: response.statusText,
            },
          };
        }

        // Get content type
        const contentType = response.headers.get('content-type') || '';

        // Read response
        const text = await response.text();

        // Truncate if too long
        if (text.length > MAX_CONTENT_LENGTH) {
          const truncated = text.substring(0, MAX_CONTENT_LENGTH);
          return {
            success: true,
            output: truncated + `\n\n[... content truncated (${text.length - MAX_CONTENT_LENGTH} bytes omitted)]`,
            metadata: {
              url,
              contentType,
              contentLength: text.length,
              truncated: true,
            },
          };
        }

        // Convert HTML to markdown if it's HTML
        let output = text;
        if (contentType.includes('text/html')) {
          output = htmlToMarkdown(text);
        }

        logger.info('URL fetched successfully', {
          url,
          contentLength: text.length,
          contentType,
        });

        return {
          success: true,
          output,
          metadata: {
            url,
            contentType,
            contentLength: text.length,
            status: response.status,
          },
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: any) {
      logger.error('Failed to fetch URL', { url, error: error.message });

      // Handle abort (timeout)
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
