import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notionConnector } from '../src/connector.js';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Notion Connector', () => {
  it('should have correct metadata', () => {
    expect(notionConnector.id).toBe('notion');
    expect(notionConnector.name).toBe('Notion');
    expect(notionConnector.category).toBe('productivity');
  });

  it('should use OAuth2 authentication', () => {
    expect(notionConnector.auth.type).toBe('oauth2');
    expect(notionConnector.auth.oauth2).toBeDefined();
  });

  it('should define page actions', () => {
    const pageActions = notionConnector.actions.filter((a) => a.id.startsWith('pages-'));
    expect(pageActions.length).toBe(5);
    expect(pageActions.map((a) => a.id)).toContain('pages-create');
    expect(pageActions.map((a) => a.id)).toContain('pages-archive');
  });

  it('should define database actions', () => {
    const dbActions = notionConnector.actions.filter((a) => a.id.startsWith('databases-'));
    expect(dbActions.length).toBe(2);
  });

  it('should define search action', () => {
    const searchAction = notionConnector.actions.find((a) => a.id === 'search');
    expect(searchAction).toBeDefined();
    expect(searchAction!.sideEffects).toBe(false);
  });

  it('should define block actions', () => {
    const blockActions = notionConnector.actions.filter((a) => a.id.startsWith('blocks-'));
    expect(blockActions.length).toBe(2);
  });

  it('should define page-updated trigger', () => {
    expect(notionConnector.triggers).toHaveLength(1);
    expect(notionConnector.triggers[0].id).toBe('page-updated');
  });

  it('should define entities', () => {
    expect(notionConnector.entities).toHaveLength(3);
    const entityIds = notionConnector.entities.map((e) => e.id);
    expect(entityIds).toContain('page');
    expect(entityIds).toContain('database');
    expect(entityIds).toContain('block');
  });

  it('should execute pages-create action', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'page-1',
        object: 'page',
        properties: {
          title: {
            type: 'title',
            title: [{ plain_text: 'Test Page' }],
          },
        },
        url: 'https://notion.so/page-1',
      }),
    });
    const result = await notionConnector.executeAction(
      'pages-create',
      { parentId: 'db-1', title: 'Test Page' },
      'token',
    ) as any;
    expect(result.id).toBe('page-1');
    expect(result.object).toBe('page');
  });

  it('should execute search action', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        results: [],
        has_more: false,
      }),
    });
    const result = await notionConnector.executeAction(
      'search',
      { query: 'test' },
      'token',
    ) as any;
    expect(result.results).toEqual([]);
  });

  it('should throw for unknown action', async () => {
    await expect(notionConnector.executeAction('unknown', {}, 'token')).rejects.toThrow('Unknown action');
  });
});
