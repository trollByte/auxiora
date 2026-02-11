import type { BraveSearchResponse, BraveWebResult } from './types.js';

const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
const USER_AGENT = 'Auxiora/1.0 (Research Engine)';

export interface BraveSearchOptions {
  apiKey: string;
  searchTimeout?: number;
  fetchTimeout?: number;
}

export class BraveSearchClient {
  private readonly apiKey: string;
  private readonly searchTimeout: number;
  private readonly fetchTimeout: number;

  constructor(options: BraveSearchOptions) {
    this.apiKey = options.apiKey;
    this.searchTimeout = options.searchTimeout ?? 10_000;
    this.fetchTimeout = options.fetchTimeout ?? 15_000;
  }

  async search(query: string, count = 5): Promise<BraveWebResult[]> {
    const url = new URL(BRAVE_SEARCH_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(count));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.searchTimeout);

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': this.apiKey,
          'User-Agent': USER_AGENT,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as BraveSearchResponse;
      return (data.web?.results ?? []).map((r) => ({
        ...r,
        description: stripHtml(r.description),
        extra_snippets: r.extra_snippets?.map(stripHtml),
      }));
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchPage(url: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.fetchTimeout);

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
        redirect: 'follow',
      });

      if (!response.ok) {
        return '';
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
        return '';
      }

      const html = await response.text();
      const maxLength = 15_000;
      return htmlToMarkdown(html).slice(0, maxLength);
    } catch {
      return '';
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Strip HTML tags and decode entities from short text (e.g. Brave snippets). */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Simple HTML to markdown conversion.
 * Local copy to avoid circular dependency with @auxiora/tools.
 */
function htmlToMarkdown(html: string): string {
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
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
