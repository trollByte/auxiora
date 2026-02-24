import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export interface MemoryEntry {
  id: string;
  content: string;
  category: string;
  importance: number;
  tags: string[];
  source: string;
  createdAt: number;
}

export interface ServerDeps {
  memoryStore?: {
    search(query: string): Promise<MemoryEntry[]>;
    getAll(): Promise<MemoryEntry[]>;
    add(content: string, category: string, source: string): Promise<MemoryEntry>;
    remove(id: string): Promise<boolean>;
  };
  getUserModel?: () => any | null;
  getPersonality?: () => Promise<any>;
  sendMessage?: (message: string) => Promise<string>;
}

export function createMcpServer(deps: ServerDeps): McpServer {
  const server = new McpServer({
    name: 'auxiora',
    version: '1.0.0',
  });

  // Tool: Search memories
  server.tool(
    'memory_search',
    'Search Auxiora memory store for relevant memories',
    { query: z.string().describe('Search query') },
    async ({ query }) => {
      if (!deps.memoryStore) {
        return { content: [{ type: 'text' as const, text: 'Memory store not available' }] };
      }
      const results = await deps.memoryStore.search(query);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  // Tool: List all memories
  server.tool(
    'memory_list',
    'List all stored memories',
    {},
    async () => {
      if (!deps.memoryStore) {
        return { content: [{ type: 'text' as const, text: 'Memory store not available' }] };
      }
      const all = await deps.memoryStore.getAll();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(all, null, 2) }],
      };
    },
  );

  // Tool: Add a memory
  server.tool(
    'memory_add',
    'Add a new memory to the store',
    {
      content: z.string().describe('Memory content'),
      category: z
        .enum(['preference', 'fact', 'context', 'relationship', 'pattern', 'personality'])
        .describe('Memory category'),
    },
    async ({ content, category }) => {
      if (!deps.memoryStore) {
        return { content: [{ type: 'text' as const, text: 'Memory store not available' }] };
      }
      const entry = await deps.memoryStore.add(content, category, 'explicit');
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(entry, null, 2) }],
      };
    },
  );

  // Tool: Delete a memory
  server.tool(
    'memory_delete',
    'Delete a memory by ID',
    { id: z.string().describe('Memory ID to delete') },
    async ({ id }) => {
      if (!deps.memoryStore) {
        return { content: [{ type: 'text' as const, text: 'Memory store not available' }] };
      }
      const removed = await deps.memoryStore.remove(id);
      return {
        content: [{ type: 'text' as const, text: removed ? 'Memory deleted' : 'Memory not found' }],
      };
    },
  );

  // Tool: Get user model
  server.tool(
    'user_model_get',
    'Get the synthesized user model with domain expertise, communication style, and satisfaction data',
    {},
    async () => {
      if (!deps.getUserModel) {
        return { content: [{ type: 'text' as const, text: 'User model not available' }] };
      }
      const model = deps.getUserModel();
      return {
        content: [
          { type: 'text' as const, text: model ? JSON.stringify(model, null, 2) : 'No user model data yet' },
        ],
      };
    },
  );

  // Tool: Get personality config
  server.tool(
    'personality_get',
    'Get current personality configuration',
    {},
    async () => {
      if (!deps.getPersonality) {
        return { content: [{ type: 'text' as const, text: 'Personality not available' }] };
      }
      const personality = await deps.getPersonality();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(personality, null, 2) }],
      };
    },
  );

  // Tool: Send a message
  server.tool(
    'send_message',
    'Send a message to Auxiora and get a response',
    { message: z.string().describe('Message to send') },
    async ({ message }) => {
      if (!deps.sendMessage) {
        return { content: [{ type: 'text' as const, text: 'Messaging not available' }] };
      }
      const response = await deps.sendMessage(message);
      return {
        content: [{ type: 'text' as const, text: response }],
      };
    },
  );

  return server;
}
