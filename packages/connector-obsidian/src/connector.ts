import { defineConnector } from '@auxiora/connectors';
import type { TriggerEvent } from '@auxiora/connectors';

const OBSIDIAN_DEFAULT_BASE = 'https://localhost:27124';

async function obsidianFetch(path: string, token: string, options: RequestInit = {}): Promise<Response> {
  // token format: "{apiKey}" or "{baseUrl}|{apiKey}"
  let baseUrl = OBSIDIAN_DEFAULT_BASE;
  let apiKey = token;
  if (token.includes('|')) {
    const parts = token.split('|');
    baseUrl = parts[0];
    apiKey = parts[1];
  }
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Obsidian API error ${res.status}: ${body}`);
  }
  return res;
}

async function obsidianJson<T = unknown>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await obsidianFetch(path, token, options);
  return res.json() as Promise<T>;
}

async function obsidianText(path: string, token: string, options: RequestInit = {}): Promise<string> {
  const res = await obsidianFetch(path, token, options);
  return res.text();
}

export const obsidianConnector = defineConnector({
  id: 'obsidian',
  name: 'Obsidian',
  description: 'Integration with Obsidian for notes, search, and daily notes via the Local REST API plugin',
  version: '1.0.0',
  category: 'productivity',
  icon: 'obsidian',

  auth: {
    type: 'api_key',
    instructions: 'Install the Obsidian Local REST API plugin, enable it, and copy the API key. Optionally prefix with base URL: "https://host:port|your-api-key".',
  },

  actions: [
    {
      id: 'note-read',
      name: 'Read Note',
      description: 'Read the content of a note by its vault-relative path',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        path: { type: 'string', description: 'Vault-relative path to the note (e.g. "Daily/2026-02-22.md")', required: true },
      },
    },
    {
      id: 'note-write',
      name: 'Write Note',
      description: 'Overwrite the content of an existing note',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        path: { type: 'string', description: 'Vault-relative path to the note', required: true },
        content: { type: 'string', description: 'New content for the note', required: true },
      },
    },
    {
      id: 'note-append',
      name: 'Append to Note',
      description: 'Append content to an existing note',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: true,
      params: {
        path: { type: 'string', description: 'Vault-relative path to the note', required: true },
        content: { type: 'string', description: 'Content to append', required: true },
      },
    },
    {
      id: 'note-create',
      name: 'Create Note',
      description: 'Create a new note (fails if the note already exists)',
      trustMinimum: 2,
      trustDomain: 'integrations',
      reversible: true,
      sideEffects: true,
      params: {
        path: { type: 'string', description: 'Vault-relative path for the new note', required: true },
        content: { type: 'string', description: 'Initial content for the note', required: true },
      },
    },
    {
      id: 'notes-list',
      name: 'List Notes',
      description: 'List notes in the vault or a specific folder',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        folder: { type: 'string', description: 'Vault-relative folder path (lists entire vault if omitted)' },
      },
    },
    {
      id: 'notes-search',
      name: 'Search Notes',
      description: 'Full-text search across vault notes',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        query: { type: 'string', description: 'Full-text search query', required: true },
      },
    },
    {
      id: 'daily-note',
      name: 'Get/Create Daily Note',
      description: 'Get or create a daily note for a specific date (defaults to today)',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (defaults to today)' },
      },
    },
    {
      id: 'tags-list',
      name: 'List Tags',
      description: 'List all tags used across vault notes',
      trustMinimum: 1,
      trustDomain: 'integrations',
      reversible: false,
      sideEffects: false,
      params: {},
    },
  ],

  triggers: [
    {
      id: 'note-modified',
      name: 'Note Modified',
      description: 'Triggered when a note in the vault is modified',
      type: 'poll',
      pollIntervalMs: 30_000,
    },
  ],

  entities: [
    {
      id: 'note',
      name: 'Note',
      description: 'An Obsidian note',
      fields: { path: 'string', content: 'string', tags: 'array' },
    },
    {
      id: 'folder',
      name: 'Folder',
      description: 'A vault folder',
      fields: { path: 'string', children: 'array' },
    },
  ],

  async executeAction(actionId: string, params: Record<string, unknown>, token: string): Promise<unknown> {
    switch (actionId) {
      case 'note-read': {
        const notePath = encodeURIComponent(params.path as string);
        return obsidianText(`/vault/${notePath}`, token);
      }

      case 'note-write': {
        const notePath = encodeURIComponent(params.path as string);
        await obsidianFetch(`/vault/${notePath}`, token, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/markdown' },
          body: params.content as string,
        });
        return { success: true };
      }

      case 'note-append': {
        const notePath = encodeURIComponent(params.path as string);
        await obsidianFetch(`/vault/${notePath}`, token, {
          method: 'POST',
          headers: { 'Content-Type': 'text/markdown' },
          body: params.content as string,
        });
        return { success: true };
      }

      case 'note-create': {
        const notePath = encodeURIComponent(params.path as string);
        await obsidianFetch(`/vault/${notePath}`, token, {
          method: 'PUT',
          headers: {
            'Content-Type': 'text/markdown',
            'If-None-Match': '*',
          },
          body: params.content as string,
        });
        return { success: true };
      }

      case 'notes-list': {
        const folder = params.folder as string | undefined;
        const listPath = folder ? `/vault/${encodeURIComponent(folder)}/` : '/vault/';
        return obsidianJson(listPath, token);
      }

      case 'notes-search': {
        const query = encodeURIComponent(params.query as string);
        return obsidianJson(`/search/simple/?query=${query}`, token);
      }

      case 'daily-note': {
        const date = params.date as string | undefined;
        const dailyPath = date ? `/periodic/daily/${encodeURIComponent(date)}` : '/periodic/daily/';
        return obsidianText(dailyPath, token);
      }

      case 'tags-list':
        return obsidianJson('/tags/', token);

      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },

  async pollTrigger(triggerId: string, token: string, lastPollAt?: number): Promise<TriggerEvent[]> {
    if (triggerId !== 'note-modified') return [];

    const files = await obsidianJson<Array<{ path: string; mtime?: number }>>('/vault/', token);
    if (!Array.isArray(files)) return [];

    const cutoff = lastPollAt ?? 0;

    return files
      .filter(file => (file.mtime ?? 0) > cutoff)
      .map(file => ({
        triggerId: 'note-modified',
        connectorId: 'obsidian',
        data: {
          path: file.path,
          modifiedAt: file.mtime,
        },
        timestamp: file.mtime ?? Date.now(),
      }));
  },
});
