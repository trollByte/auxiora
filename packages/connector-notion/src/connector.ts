import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

const NOTION_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

async function notionFetch(token: string, path: string, options?: { method?: string; body?: unknown }) {
  const res = await fetch(`${NOTION_BASE}${path}`, {
    method: options?.method ?? 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(`Notion API error: ${res.status} ${err.message ?? res.statusText}`);
  }
  return res.json();
}

/** Convert plain text content into Notion paragraph blocks (split by newlines). */
function contentToBlocks(content: string): Array<Record<string, unknown>> {
  return content.split('\n').map(line => ({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: line } }],
    },
  }));
}

/** Extract a plain-text title from a Notion page object. */
function extractTitle(page: Record<string, unknown>): string {
  const props = page.properties as Record<string, unknown> | undefined;
  if (!props) return '';
  for (const val of Object.values(props)) {
    const prop = val as Record<string, unknown>;
    if (prop.type === 'title') {
      const titleArr = prop.title as Array<{ plain_text?: string }> | undefined;
      return titleArr?.[0]?.plain_text ?? '';
    }
  }
  return '';
}

export const notionConnector = defineConnector({
  id: 'notion',
  name: 'Notion',
  description: 'Integration with Notion for pages, databases, search, and blocks',
  version: '1.0.0',
  category: 'productivity',
  icon: 'notion',

  auth: {
    type: 'oauth2',
    oauth2: {
      authUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: 'https://api.notion.com/v1/oauth/token',
      scopes: [],
    },
    instructions: 'Create an integration at notion.so/my-integrations and share pages with it.',
  },

  actions: [
    // --- Pages ---
    {
      id: 'pages-list',
      name: 'List Pages',
      description: 'Search for pages in Notion',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        query: { type: 'string', description: 'Search query' },
        maxResults: { type: 'number', description: 'Max results', default: 10 },
      },
    },
    {
      id: 'pages-get',
      name: 'Get Page',
      description: 'Get a specific Notion page',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        pageId: { type: 'string', description: 'Page ID', required: true },
      },
    },
    {
      id: 'pages-create',
      name: 'Create Page',
      description: 'Create a new Notion page',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        parentId: { type: 'string', description: 'Parent page or database ID', required: true },
        title: { type: 'string', description: 'Page title', required: true },
        content: { type: 'string', description: 'Page content in markdown' },
        properties: { type: 'object', description: 'Page properties (for database items)' },
      },
    },
    {
      id: 'pages-update',
      name: 'Update Page',
      description: 'Update a Notion page',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        pageId: { type: 'string', description: 'Page ID', required: true },
        properties: { type: 'object', description: 'Updated properties' },
      },
    },
    {
      id: 'pages-archive',
      name: 'Archive Page',
      description: 'Archive a Notion page',
      trustMinimum: 3,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        pageId: { type: 'string', description: 'Page ID', required: true },
      },
    },
    // --- Databases ---
    {
      id: 'databases-list',
      name: 'List Databases',
      description: 'List accessible Notion databases',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {},
    },
    {
      id: 'databases-query',
      name: 'Query Database',
      description: 'Query items in a Notion database',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        databaseId: { type: 'string', description: 'Database ID', required: true },
        filter: { type: 'object', description: 'Filter conditions' },
        sorts: { type: 'array', description: 'Sort conditions' },
      },
    },
    // --- Search ---
    {
      id: 'search',
      name: 'Search Notion',
      description: 'Search across all Notion content',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        query: { type: 'string', description: 'Search query', required: true },
        filter: { type: 'object', description: 'Filter by object type (page or database)' },
      },
    },
    // --- Blocks ---
    {
      id: 'blocks-get-children',
      name: 'Get Block Children',
      description: 'Get child blocks of a block or page',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        blockId: { type: 'string', description: 'Block or page ID', required: true },
      },
    },
    {
      id: 'blocks-append',
      name: 'Append Block',
      description: 'Append content blocks to a page',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        blockId: { type: 'string', description: 'Parent block or page ID', required: true },
        children: { type: 'array', description: 'Block children to append', required: true },
      },
    },
  ],

  triggers: [
    {
      id: 'page-updated',
      name: 'Page Updated',
      description: 'Triggered when a page is updated',
      type: 'poll',
      pollIntervalMs: 120_000,
    },
  ],

  entities: [
    {
      id: 'page',
      name: 'Page',
      description: 'A Notion page',
      fields: { id: 'string', title: 'string', url: 'string', lastEditedTime: 'string' },
    },
    {
      id: 'database',
      name: 'Database',
      description: 'A Notion database',
      fields: { id: 'string', title: 'string', properties: 'object' },
    },
    {
      id: 'block',
      name: 'Block',
      description: 'A Notion block',
      fields: { id: 'string', type: 'string', content: 'string' },
    },
  ],

  async executeAction(actionId: string, params: Record<string, unknown>, token: string): Promise<unknown> {
    switch (actionId) {
      case 'pages-list': {
        const body: Record<string, unknown> = {
          filter: { property: 'object', value: 'page' },
          page_size: (params.maxResults as number | undefined) ?? 10,
        };
        if (params.query) body.query = params.query;
        return notionFetch(token, '/search', { method: 'POST', body });
      }

      case 'pages-get':
        return notionFetch(token, `/pages/${params.pageId as string}`);

      case 'pages-create': {
        const parentId = params.parentId as string;
        const title = params.title as string;
        const content = params.content as string | undefined;
        const properties = params.properties as Record<string, unknown> | undefined;

        const body: Record<string, unknown> = {
          parent: parentId.includes('-')
            ? { page_id: parentId }
            : { database_id: parentId },
          properties: properties ?? {
            title: [{ text: { content: title } }],
          },
        };
        if (content) {
          body.children = contentToBlocks(content);
        }
        return notionFetch(token, '/pages', { method: 'POST', body });
      }

      case 'pages-update':
        return notionFetch(token, `/pages/${params.pageId as string}`, {
          method: 'PATCH',
          body: { properties: params.properties },
        });

      case 'pages-archive':
        return notionFetch(token, `/pages/${params.pageId as string}`, {
          method: 'PATCH',
          body: { archived: true },
        });

      case 'databases-list':
        return notionFetch(token, '/search', {
          method: 'POST',
          body: { filter: { property: 'object', value: 'database' } },
        });

      case 'databases-query': {
        const dbBody: Record<string, unknown> = {};
        if (params.filter) dbBody.filter = params.filter;
        if (params.sorts) dbBody.sorts = params.sorts;
        return notionFetch(token, `/databases/${params.databaseId as string}/query`, {
          method: 'POST',
          body: dbBody,
        });
      }

      case 'search': {
        const searchBody: Record<string, unknown> = { query: params.query };
        if (params.filter) searchBody.filter = params.filter;
        return notionFetch(token, '/search', { method: 'POST', body: searchBody });
      }

      case 'blocks-get-children':
        return notionFetch(token, `/blocks/${params.blockId as string}/children`);

      case 'blocks-append':
        return notionFetch(token, `/blocks/${params.blockId as string}/children`, {
          method: 'PATCH',
          body: { children: params.children },
        });

      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, token: string, lastPollAt?: number): Promise<TriggerEvent[]> {
    if (triggerId !== 'page-updated') return [];

    const result = await notionFetch(token, '/search', {
      method: 'POST',
      body: {
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 10,
      },
    }) as { results?: Array<Record<string, unknown>> };

    if (!result.results) return [];

    const cutoff = lastPollAt ?? 0;

    return result.results
      .filter(page => {
        const editedAt = new Date(page.last_edited_time as string).getTime();
        return editedAt > cutoff;
      })
      .map(page => ({
        triggerId: 'page-updated',
        connectorId: 'notion',
        data: {
          pageId: page.id as string,
          title: extractTitle(page),
          lastEditedTime: page.last_edited_time as string,
        },
        timestamp: new Date(page.last_edited_time as string).getTime(),
      }));
  },
});
