import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { obsidianConnector } from '../src/connector.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
  } as Response;
}

const TOKEN = 'test-api-key';
const BASE = 'https://localhost:27124';

describe('executeAction', () => {
  describe('note-read', () => {
    it('should GET /vault/{path} and return text', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('# Hello World'));
      const result = await obsidianConnector.executeAction('note-read', { path: 'Notes/hello.md' }, TOKEN);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE}/vault/${encodeURIComponent('Notes/hello.md')}`);
      expect(opts.method).toBeUndefined();
      expect(opts.headers).toMatchObject({ 'Authorization': `Bearer ${TOKEN}` });
      expect(result).toBe('# Hello World');
    });

    it('should throw on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Not Found', 404));
      await expect(
        obsidianConnector.executeAction('note-read', { path: 'missing.md' }, TOKEN),
      ).rejects.toThrow('Obsidian API error 404');
    });
  });

  describe('note-write', () => {
    it('should PUT /vault/{path} with content and text/markdown header', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(''));
      const result = await obsidianConnector.executeAction(
        'note-write',
        { path: 'Notes/hello.md', content: '# Updated' },
        TOKEN,
      );

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE}/vault/${encodeURIComponent('Notes/hello.md')}`);
      expect(opts.method).toBe('PUT');
      expect(opts.headers).toMatchObject({ 'Content-Type': 'text/markdown' });
      expect(opts.body).toBe('# Updated');
      expect(result).toEqual({ success: true });
    });
  });

  describe('note-append', () => {
    it('should POST /vault/{path} with content and text/markdown header', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(''));
      const result = await obsidianConnector.executeAction(
        'note-append',
        { path: 'Daily/today.md', content: '\n## New Section' },
        TOKEN,
      );

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE}/vault/${encodeURIComponent('Daily/today.md')}`);
      expect(opts.method).toBe('POST');
      expect(opts.headers).toMatchObject({ 'Content-Type': 'text/markdown' });
      expect(opts.body).toBe('\n## New Section');
      expect(result).toEqual({ success: true });
    });
  });

  describe('note-create', () => {
    it('should PUT /vault/{path} with If-None-Match header', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(''));
      const result = await obsidianConnector.executeAction(
        'note-create',
        { path: 'Projects/new.md', content: '# New Project' },
        TOKEN,
      );

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE}/vault/${encodeURIComponent('Projects/new.md')}`);
      expect(opts.method).toBe('PUT');
      expect(opts.headers).toMatchObject({
        'Content-Type': 'text/markdown',
        'If-None-Match': '*',
      });
      expect(opts.body).toBe('# New Project');
      expect(result).toEqual({ success: true });
    });
  });

  describe('notes-list', () => {
    it('should GET /vault/ when no folder given', async () => {
      const files = [{ path: 'a.md' }, { path: 'b.md' }];
      mockFetch.mockResolvedValueOnce(mockResponse(files));
      const result = await obsidianConnector.executeAction('notes-list', {}, TOKEN);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE}/vault/`);
      expect(result).toEqual(files);
    });

    it('should GET /vault/{folder}/ when folder is specified', async () => {
      const files = [{ path: 'Daily/a.md' }];
      mockFetch.mockResolvedValueOnce(mockResponse(files));
      const result = await obsidianConnector.executeAction('notes-list', { folder: 'Daily' }, TOKEN);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE}/vault/${encodeURIComponent('Daily')}/`);
      expect(result).toEqual(files);
    });
  });

  describe('notes-search', () => {
    it('should GET /search/simple/?query={q}', async () => {
      const results = [{ path: 'a.md', matches: ['hello'] }];
      mockFetch.mockResolvedValueOnce(mockResponse(results));
      const result = await obsidianConnector.executeAction('notes-search', { query: 'hello world' }, TOKEN);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE}/search/simple/?query=${encodeURIComponent('hello world')}`);
      expect(result).toEqual(results);
    });
  });

  describe('daily-note', () => {
    it('should GET /periodic/daily/ when no date given', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('# Today'));
      const result = await obsidianConnector.executeAction('daily-note', {}, TOKEN);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE}/periodic/daily/`);
      expect(result).toBe('# Today');
    });

    it('should GET /periodic/daily/{date} when date is specified', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('# Feb 22'));
      const result = await obsidianConnector.executeAction('daily-note', { date: '2026-02-22' }, TOKEN);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE}/periodic/daily/${encodeURIComponent('2026-02-22')}`);
      expect(result).toBe('# Feb 22');
    });
  });

  describe('tags-list', () => {
    it('should GET /tags/', async () => {
      const tags = { tags: ['#project', '#daily'] };
      mockFetch.mockResolvedValueOnce(mockResponse(tags));
      const result = await obsidianConnector.executeAction('tags-list', {}, TOKEN);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE}/tags/`);
      expect(result).toEqual(tags);
    });
  });

  describe('unknown action', () => {
    it('should throw on unknown actionId', async () => {
      await expect(
        obsidianConnector.executeAction('nonexistent', {}, TOKEN),
      ).rejects.toThrow('Unknown action: nonexistent');
    });
  });

  describe('custom base URL via token', () => {
    it('should use custom base URL from pipe-delimited token', async () => {
      const customToken = 'https://my-host:8080|my-secret-key';
      mockFetch.mockResolvedValueOnce(mockResponse('content'));
      await obsidianConnector.executeAction('note-read', { path: 'test.md' }, customToken);

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(`https://my-host:8080/vault/${encodeURIComponent('test.md')}`);
      expect(opts.headers).toMatchObject({ 'Authorization': 'Bearer my-secret-key' });
    });
  });
});

describe('pollTrigger', () => {
  describe('note-modified', () => {
    it('should return modified files since lastPollAt', async () => {
      const files = [
        { path: 'a.md', mtime: 1000 },
        { path: 'b.md', mtime: 2000 },
        { path: 'c.md', mtime: 3000 },
      ];
      mockFetch.mockResolvedValueOnce(mockResponse(files));

      const events = await obsidianConnector.pollTrigger('note-modified', TOKEN, 1500);

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        triggerId: 'note-modified',
        connectorId: 'obsidian',
        data: { path: 'b.md', modifiedAt: 2000 },
        timestamp: 2000,
      });
      expect(events[1]).toEqual({
        triggerId: 'note-modified',
        connectorId: 'obsidian',
        data: { path: 'c.md', modifiedAt: 3000 },
        timestamp: 3000,
      });
    });

    it('should return all files when lastPollAt is undefined', async () => {
      const files = [{ path: 'a.md', mtime: 500 }];
      mockFetch.mockResolvedValueOnce(mockResponse(files));

      const events = await obsidianConnector.pollTrigger('note-modified', TOKEN);

      expect(events).toHaveLength(1);
      expect(events[0].data).toEqual({ path: 'a.md', modifiedAt: 500 });
    });

    it('should return empty array for non-array response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'unexpected' }));

      const events = await obsidianConnector.pollTrigger('note-modified', TOKEN);

      expect(events).toEqual([]);
    });
  });

  it('should return empty for unknown trigger', async () => {
    const events = await obsidianConnector.pollTrigger('unknown-trigger', TOKEN);
    expect(events).toEqual([]);
  });
});
