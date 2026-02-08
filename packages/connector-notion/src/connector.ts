import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

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

  async executeAction(actionId: string, params: Record<string, unknown>, _token: string): Promise<unknown> {
    switch (actionId) {
      case 'pages-list':
        return { pages: [], query: params.query };
      case 'pages-get':
        return { pageId: params.pageId, title: '', content: '' };
      case 'pages-create':
        return { pageId: `page_${Date.now()}`, status: 'created', title: params.title };
      case 'pages-update':
        return { pageId: params.pageId, status: 'updated' };
      case 'pages-archive':
        return { pageId: params.pageId, status: 'archived' };
      case 'databases-list':
        return { databases: [] };
      case 'databases-query':
        return { results: [], databaseId: params.databaseId };
      case 'search':
        return { results: [], query: params.query };
      case 'blocks-get-children':
        return { blocks: [], blockId: params.blockId };
      case 'blocks-append':
        return { blockId: params.blockId, status: 'appended' };
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(_triggerId: string, _token: string, _lastPollAt?: number): Promise<TriggerEvent[]> {
    return [];
  },
});
