import type { Tool, ToolParameter, ExecutionContext, ToolResult } from './index.js';
import { ToolPermission } from './index.js';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('tools:memory');

let memoryStore: any = null;

export function setMemoryStore(store: any): void {
  memoryStore = store;
  logger.info('Memory store connected to tools');
}

function requireStore(): any {
  if (!memoryStore) {
    throw new Error('Memory system not initialized');
  }
  return memoryStore;
}

export const SaveMemoryTool: Tool = {
  name: 'save_memory',
  description: 'Save a fact, preference, or piece of context about the user to long-term memory. Call this when the user shares personal information, preferences, or project context worth remembering across conversations.',

  parameters: [
    {
      name: 'content',
      type: 'string',
      description: 'The fact to remember (e.g., "User prefers dark mode")',
      required: true,
    },
    {
      name: 'category',
      type: 'string',
      description: 'Category: "preference" (likes/dislikes), "fact" (personal details), or "context" (project/situational)',
      required: false,
      default: 'fact',
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      const store = requireStore();
      const category = params.category || 'fact';
      const entry = await store.add(params.content, category, 'explicit');
      return {
        success: true,
        output: JSON.stringify({ id: entry.id, content: entry.content, category: entry.category }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const RecallMemoryTool: Tool = {
  name: 'recall_memory',
  description: 'Search long-term memory for facts about the user. Call this when you need to recall something the user mentioned in a previous conversation.',

  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Keywords to search for (e.g., "work company" or "favorite language")',
      required: true,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      const store = requireStore();
      const results = await store.search(params.query);
      const summary = results.map((m: any) => ({
        id: m.id,
        content: m.content,
        category: m.category,
      }));
      return {
        success: true,
        output: JSON.stringify(summary, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const ForgetMemoryTool: Tool = {
  name: 'forget_memory',
  description: 'Delete a specific memory by ID. Use when the user asks you to forget something.',

  parameters: [
    {
      name: 'id',
      type: 'string',
      description: 'Memory ID to delete (e.g., "mem-a3xK9m")',
      required: true,
    },
  ] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.USER_APPROVAL;
  },

  async execute(params: any): Promise<ToolResult> {
    try {
      const store = requireStore();
      const removed = await store.remove(params.id);
      if (!removed) {
        return { success: false, error: `Memory not found: ${params.id}` };
      }
      return {
        success: true,
        output: JSON.stringify({ deleted: true, id: params.id }),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

export const ListMemoriesTool: Tool = {
  name: 'list_memories',
  description: 'List all stored memories about the user, grouped by category.',

  parameters: [] as ToolParameter[],

  getPermission(): ToolPermission {
    return ToolPermission.AUTO_APPROVE;
  },

  async execute(): Promise<ToolResult> {
    try {
      const store = requireStore();
      const all = await store.getAll();
      const grouped = {
        preferences: all.filter((m: any) => m.category === 'preference'),
        facts: all.filter((m: any) => m.category === 'fact'),
        context: all.filter((m: any) => m.category === 'context'),
        total: all.length,
      };
      return {
        success: true,
        output: JSON.stringify(grouped, null, 2),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
