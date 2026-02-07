# Memory System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give Auxiora persistent long-term memory so it remembers facts, preferences, and context across conversations.

**Architecture:** New `packages/memory/` package with `MemoryStore` (CRUD over JSON file), `MemoryRetriever` (relevance scoring + prompt formatting), `MemoryExtractor` (post-response fact extraction), and memory tools registered with `toolRegistry`. The runtime appends relevant memories to the system prompt before each provider call and runs extraction after each response.

**Tech Stack:** Node.js `node:fs`, existing `toolRegistry` from `@auxiora/tools`, existing provider for extraction calls

---

## Context for implementers

**Monorepo layout:** `packages/*` auto-discovered by pnpm. TypeScript strict ESM with `.js` extensions on all imports. Type imports use `import type { ... }`.

**Key files you'll modify:**
- `packages/config/src/index.ts` — Add `MemoryConfigSchema`
- `packages/config/tests/config.test.ts` — Add memory config tests
- `packages/audit/src/index.ts` — Add memory audit event types
- `packages/tools/src/index.ts` — Register memory tools + export
- `packages/tools/src/memory.ts` — Memory tool definitions (new file)
- `packages/dashboard/src/types.ts` — Add `getMemories` to `DashboardDeps`
- `packages/dashboard/src/router.ts` — Add `GET /memories` endpoint
- `packages/dashboard/tests/router.test.ts` — Add memory endpoint test
- `packages/runtime/src/index.ts` — Wire memory system into message handlers
- `packages/runtime/package.json` — Add `@auxiora/memory` dependency

**Existing patterns to follow:**
- `BehaviorStore` in `packages/behaviors/src/store.ts` — JSON file CRUD (readFile/writeFile pattern)
- `setBehaviorManager()` in `packages/tools/src/behaviors.ts` — dependency injection for tool → manager wiring
- `Tool` interface in `packages/tools/src/index.ts:47-54` — name, description, parameters, execute, getPermission
- `ToolPermission` enum — AUTO_APPROVE for read ops, USER_APPROVAL for destructive ops
- `getMemoryDir()` already exists in `packages/core/src/index.ts:114-116` — returns `~/.auxiora/workspace/memory`

---

### Task 1: Add memory config, audit events

**Files:**
- Modify: `packages/config/src/index.ts`
- Modify: `packages/config/tests/config.test.ts`
- Modify: `packages/audit/src/index.ts`

**Step 1: Add MemoryConfigSchema to config**

In `packages/config/src/index.ts`, after `PluginsConfigSchema` (line 109), add:

```typescript
const MemoryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  autoExtract: z.boolean().default(true),
  maxEntries: z.number().int().positive().default(500),
});
```

Then add `memory: MemoryConfigSchema.default({})` to `ConfigSchema` after `plugins` (line 123).

**Step 2: Add memory config tests**

In `packages/config/tests/config.test.ts`, add after the plugins config describe block:

```typescript
describe('memory config', () => {
  it('should default memory to enabled with auto-extract', () => {
    const config = ConfigSchema.parse({});
    expect(config.memory.enabled).toBe(true);
    expect(config.memory.autoExtract).toBe(true);
    expect(config.memory.maxEntries).toBe(500);
  });

  it('should accept custom memory config', () => {
    const config = ConfigSchema.parse({
      memory: { enabled: false, autoExtract: false, maxEntries: 100 },
    });
    expect(config.memory.enabled).toBe(false);
    expect(config.memory.autoExtract).toBe(false);
    expect(config.memory.maxEntries).toBe(100);
  });
});
```

**Step 3: Add memory audit events**

In `packages/audit/src/index.ts`, add before `| 'system.error'` (line 64):

```typescript
  | 'memory.saved'
  | 'memory.deleted'
  | 'memory.extracted'
```

**Step 4: Run tests and commit**

Run: `pnpm test -- --run packages/config/ packages/audit/`

```bash
git add packages/config/ packages/audit/src/index.ts
git commit -m "feat(core): add memory config, audit events"
```

---

### Task 2: Build MemoryStore and MemoryRetriever

**Files:**
- Create: `packages/memory/package.json`
- Create: `packages/memory/tsconfig.json`
- Create: `packages/memory/src/types.ts`
- Create: `packages/memory/src/store.ts`
- Create: `packages/memory/src/retriever.ts`
- Create: `packages/memory/src/index.ts`
- Create: `packages/memory/tests/store.test.ts`
- Create: `packages/memory/tests/retriever.test.ts`

**Step 1: Create package.json**

```json
{
  "name": "@auxiora/memory",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "dependencies": {
    "@auxiora/logger": "workspace:*",
    "@auxiora/audit": "workspace:*",
    "@auxiora/core": "workspace:*"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../logger" },
    { "path": "../audit" },
    { "path": "../core" }
  ]
}
```

**Step 3: Create types.ts**

```typescript
export interface MemoryEntry {
  id: string;
  content: string;
  category: 'preference' | 'fact' | 'context';
  source: 'extracted' | 'explicit';
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  tags: string[];
}

export type MemoryCategory = MemoryEntry['category'];
export type MemorySource = MemoryEntry['source'];
```

**Step 4: Create store.ts**

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import { getMemoryDir } from '@auxiora/core';
import type { MemoryEntry, MemoryCategory } from './types.js';

const logger = getLogger('memory:store');

export class MemoryStore {
  private filePath: string;
  private maxEntries: number;

  constructor(options?: { dir?: string; maxEntries?: number }) {
    const dir = options?.dir ?? getMemoryDir();
    this.filePath = path.join(dir, 'memories.json');
    this.maxEntries = options?.maxEntries ?? 500;
  }

  async add(content: string, category: MemoryCategory, source: 'extracted' | 'explicit'): Promise<MemoryEntry> {
    const memories = await this.readFile();
    const tags = this.extractTags(content);

    // Dedup: check for >50% tag overlap with existing entries
    const existing = this.findOverlap(memories, tags);
    if (existing) {
      existing.content = content;
      existing.updatedAt = Date.now();
      existing.tags = tags;
      await this.writeFile(memories);
      logger.debug('Updated existing memory (dedup)', { id: existing.id });
      return existing;
    }

    const entry: MemoryEntry = {
      id: `mem-${crypto.randomUUID().slice(0, 8)}`,
      content,
      category,
      source,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessCount: 0,
      tags,
    };

    memories.push(entry);

    // Enforce max entries: remove oldest by updatedAt
    if (memories.length > this.maxEntries) {
      memories.sort((a, b) => b.updatedAt - a.updatedAt);
      memories.length = this.maxEntries;
    }

    await this.writeFile(memories);
    void audit('memory.saved', { id: entry.id, category, source });
    logger.debug('Saved memory', { id: entry.id, category });
    return entry;
  }

  async remove(id: string): Promise<boolean> {
    const memories = await this.readFile();
    const filtered = memories.filter(m => m.id !== id);
    if (filtered.length === memories.length) return false;
    await this.writeFile(filtered);
    void audit('memory.deleted', { id });
    logger.debug('Removed memory', { id });
    return true;
  }

  async update(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'category'>>): Promise<MemoryEntry | undefined> {
    const memories = await this.readFile();
    const entry = memories.find(m => m.id === id);
    if (!entry) return undefined;

    if (updates.content !== undefined) {
      entry.content = updates.content;
      entry.tags = this.extractTags(updates.content);
    }
    if (updates.category !== undefined) entry.category = updates.category;
    entry.updatedAt = Date.now();

    await this.writeFile(memories);
    return entry;
  }

  async getAll(): Promise<MemoryEntry[]> {
    return this.readFile();
  }

  async search(query: string): Promise<MemoryEntry[]> {
    const memories = await this.readFile();
    const queryTags = this.extractTags(query);
    if (queryTags.length === 0) return memories;

    // Score by tag overlap
    const scored = memories.map(m => {
      const overlap = m.tags.filter(t => queryTags.includes(t)).length;
      return { entry: m, score: overlap };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => {
        s.entry.accessCount++;
        return s.entry;
      });
  }

  extractTags(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
      'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each',
      'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some',
      'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
      'just', 'about', 'also', 'that', 'this', 'it', 'its', 'i', 'my',
      'me', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them',
      'their', 'what', 'which', 'who', 'when', 'where', 'how', 'like',
      'user', 'prefers', 'uses', 'wants', 'likes',
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .filter((w, i, arr) => arr.indexOf(w) === i); // unique
  }

  private findOverlap(memories: MemoryEntry[], tags: string[]): MemoryEntry | undefined {
    if (tags.length === 0) return undefined;

    for (const m of memories) {
      const overlap = m.tags.filter(t => tags.includes(t)).length;
      const ratio = overlap / Math.max(m.tags.length, tags.length);
      if (ratio > 0.5) return m;
    }
    return undefined;
  }

  private async readFile(): Promise<MemoryEntry[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as MemoryEntry[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeFile(memories: MemoryEntry[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(memories, null, 2), 'utf-8');
  }
}
```

**Step 5: Create retriever.ts**

```typescript
import type { MemoryEntry } from './types.js';

const TOKEN_BUDGET = 500;
const CHARS_PER_TOKEN = 4; // rough approximation
const MAX_CHARS = TOKEN_BUDGET * CHARS_PER_TOKEN;
const MIN_SCORE = 0.1;

export class MemoryRetriever {
  /**
   * Select relevant memories and format them for system prompt injection.
   * Returns empty string if no memories are relevant.
   */
  retrieve(memories: MemoryEntry[], userMessage: string): string {
    if (memories.length === 0) return '';

    const queryTags = this.extractQueryTags(userMessage);
    const now = Date.now();

    // Score each memory
    const scored = memories.map(m => ({
      entry: m,
      score: this.scoreMemory(m, queryTags, now),
    }));

    // Filter and sort by score descending
    const relevant = scored
      .filter(s => s.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score);

    if (relevant.length === 0) return '';

    // Build output within token budget
    const lines: string[] = [];
    let totalChars = 0;

    for (const { entry } of relevant) {
      const line = `- ${entry.content} (${entry.category})`;
      if (totalChars + line.length > MAX_CHARS) break;
      lines.push(line);
      totalChars += line.length;
    }

    if (lines.length === 0) return '';

    return `\n\n---\n\n## What you know about the user\n\n${lines.join('\n')}`;
  }

  private scoreMemory(memory: MemoryEntry, queryTags: string[], now: number): number {
    // 1. Tag overlap (0-1, weight 0.6)
    let tagScore = 0;
    if (queryTags.length > 0 && memory.tags.length > 0) {
      const overlap = memory.tags.filter(t => queryTags.includes(t)).length;
      tagScore = overlap / Math.max(queryTags.length, 1);
    }

    // 2. Recency (0-1, weight 0.25) — within last 7 days scores highest
    const ageMs = now - memory.updatedAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - ageDays / 30); // decays over 30 days

    // 3. Access frequency (0-1, weight 0.15)
    const accessScore = Math.min(memory.accessCount / 10, 1);

    return tagScore * 0.6 + recencyScore * 0.25 + accessScore * 0.15;
  }

  private extractQueryTags(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
      'before', 'after', 'and', 'but', 'or', 'not', 'so', 'yet',
      'i', 'me', 'my', 'we', 'you', 'your', 'he', 'she', 'they', 'it',
      'what', 'which', 'who', 'when', 'where', 'how', 'that', 'this',
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .filter((w, i, arr) => arr.indexOf(w) === i);
  }
}
```

**Step 6: Create barrel exports**

```typescript
export type { MemoryEntry, MemoryCategory, MemorySource } from './types.js';
export { MemoryStore } from './store.js';
export { MemoryRetriever } from './retriever.js';
```

**Step 7: Write store tests**

Create `packages/memory/tests/store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { MemoryStore } from '../src/store.js';

let tmpDir: string;

describe('MemoryStore', () => {
  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `auxiora-memory-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should add and retrieve a memory', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const entry = await store.add('User likes TypeScript', 'preference', 'explicit');

    expect(entry.id).toMatch(/^mem-/);
    expect(entry.content).toBe('User likes TypeScript');
    expect(entry.category).toBe('preference');
    expect(entry.source).toBe('explicit');

    const all = await store.getAll();
    expect(all).toHaveLength(1);
  });

  it('should update a memory', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const entry = await store.add('Works at Acme', 'fact', 'extracted');

    const updated = await store.update(entry.id, { content: 'Works at Globex' });
    expect(updated?.content).toBe('Works at Globex');

    const all = await store.getAll();
    expect(all[0].content).toBe('Works at Globex');
  });

  it('should remove a memory', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const entry = await store.add('Test fact', 'fact', 'explicit');

    const removed = await store.remove(entry.id);
    expect(removed).toBe(true);

    const all = await store.getAll();
    expect(all).toHaveLength(0);
  });

  it('should search by tags', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    await store.add('User prefers dark mode', 'preference', 'explicit');
    await store.add('User works at Acme Corp', 'fact', 'explicit');
    await store.add('User likes TypeScript', 'preference', 'explicit');

    const results = await store.search('dark mode');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('dark');
  });

  it('should deduplicate on tag overlap', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    await store.add('User prefers dark mode in editors', 'preference', 'explicit');
    await store.add('User prefers dark mode in applications', 'preference', 'extracted');

    const all = await store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].content).toBe('User prefers dark mode in applications');
  });

  it('should respect maxEntries', async () => {
    const store = new MemoryStore({ dir: tmpDir, maxEntries: 3 });
    await store.add('Fact one about alpha', 'fact', 'explicit');
    await store.add('Fact two about beta', 'fact', 'explicit');
    await store.add('Fact three about gamma', 'fact', 'explicit');
    await store.add('Fact four about delta', 'fact', 'explicit');

    const all = await store.getAll();
    expect(all).toHaveLength(3);
  });

  it('should return empty for nonexistent file', async () => {
    const store = new MemoryStore({ dir: path.join(tmpDir, 'nonexistent') });
    const all = await store.getAll();
    expect(all).toHaveLength(0);
  });
});
```

**Step 8: Write retriever tests**

Create `packages/memory/tests/retriever.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MemoryRetriever } from '../src/retriever.js';
import type { MemoryEntry } from '../src/types.js';

function makeMemory(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'mem-test',
    content: 'Test memory',
    category: 'fact',
    source: 'explicit',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    accessCount: 0,
    tags: ['test', 'memory'],
    ...overrides,
  };
}

describe('MemoryRetriever', () => {
  const retriever = new MemoryRetriever();

  it('should return matching memories formatted for prompt', () => {
    const memories = [
      makeMemory({ content: 'Likes TypeScript', tags: ['typescript', 'programming'], category: 'preference' }),
      makeMemory({ content: 'Works at Acme', tags: ['acme', 'work', 'company'], category: 'fact' }),
    ];

    const result = retriever.retrieve(memories, 'Tell me about TypeScript');
    expect(result).toContain('Likes TypeScript');
    expect(result).toContain('What you know about the user');
  });

  it('should rank by tag overlap', () => {
    const memories = [
      makeMemory({ id: 'a', content: 'Likes Python', tags: ['python', 'programming'] }),
      makeMemory({ id: 'b', content: 'Loves TypeScript deeply', tags: ['typescript', 'programming', 'loves'] }),
    ];

    const result = retriever.retrieve(memories, 'typescript programming');
    // TypeScript memory should appear first (more tag overlap)
    const tsIndex = result.indexOf('TypeScript');
    const pyIndex = result.indexOf('Python');
    expect(tsIndex).toBeLessThan(pyIndex);
  });

  it('should respect token budget', () => {
    // Create many memories to exceed budget
    const memories = Array.from({ length: 100 }, (_, i) =>
      makeMemory({
        id: `mem-${i}`,
        content: `Memory item number ${i} with some extra text to fill space`,
        tags: ['matching', 'keyword'],
      })
    );

    const result = retriever.retrieve(memories, 'matching keyword');
    // Should not include all 100
    expect(result.length).toBeLessThan(100 * 60);
    expect(result).toContain('What you know about the user');
  });

  it('should return empty string when no memories match', () => {
    const memories = [
      makeMemory({ content: 'Likes cats', tags: ['cats', 'animals'] }),
    ];

    const result = retriever.retrieve(memories, 'quantum physics');
    expect(result).toBe('');
  });

  it('should return empty string for empty memory list', () => {
    const result = retriever.retrieve([], 'anything');
    expect(result).toBe('');
  });
});
```

**Step 9: Install and run tests**

```bash
pnpm install && pnpm test -- --run packages/memory/ packages/config/
```

Expected: ~12 tests pass (7 store + 5 retriever).

**Step 10: Commit**

```bash
git add packages/memory/ packages/config/ packages/audit/src/index.ts
git commit -m "feat(memory): implement MemoryStore and MemoryRetriever with tests"
```

---

### Task 3: Build memory tools

**Files:**
- Create: `packages/tools/src/memory.ts`
- Modify: `packages/tools/src/index.ts`

**Step 1: Create memory.ts**

Create `packages/tools/src/memory.ts` following the exact pattern in `packages/tools/src/behaviors.ts`:

```typescript
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
```

**Step 2: Register memory tools in index.ts**

In `packages/tools/src/index.ts`, after the webhook tools block (line 359), add:

```typescript
// Import and register memory tools
import { SaveMemoryTool, RecallMemoryTool, ForgetMemoryTool, ListMemoriesTool } from './memory.js';

toolRegistry.register(SaveMemoryTool);
toolRegistry.register(RecallMemoryTool);
toolRegistry.register(ForgetMemoryTool);
toolRegistry.register(ListMemoriesTool);

// Export memory tools
export { SaveMemoryTool, RecallMemoryTool, ForgetMemoryTool, ListMemoriesTool } from './memory.js';
export { setMemoryStore } from './memory.js';
```

**Step 3: Run tests and commit**

Run: `pnpm test -- --run packages/tools/`

All existing tool tests should still pass (the new tools just require `setMemoryStore()` before use).

```bash
git add packages/tools/
git commit -m "feat(tools): add save_memory, recall_memory, forget_memory, list_memories tools"
```

---

### Task 4: Add dashboard memories endpoint

**Files:**
- Modify: `packages/dashboard/src/types.ts`
- Modify: `packages/dashboard/src/router.ts`
- Modify: `packages/dashboard/tests/router.test.ts`

**Step 1: Add getMemories to DashboardDeps**

In `packages/dashboard/src/types.ts`, after `getPlugins?` (line 45), add:

```typescript
  getMemories?: () => Promise<Array<{
    id: string;
    content: string;
    category: string;
    source: string;
    createdAt: number;
    updatedAt: number;
    accessCount: number;
  }>>;
```

**Step 2: Add memories endpoint**

In `packages/dashboard/src/router.ts`, after the `/plugins` route and before `return { router, auth }`:

```typescript
  // Memories
  router.get('/memories', async (req: Request, res: Response) => {
    const memories = deps.getMemories ? await deps.getMemories() : [];
    res.json({ data: memories });
  });
```

**Step 3: Add test**

In `packages/dashboard/tests/router.test.ts`, add `getMemories` to `createMockDeps()` after `getPlugins`:

```typescript
    getMemories: vi.fn().mockResolvedValue([
      { id: 'mem-abc', content: 'Likes TypeScript', category: 'preference', source: 'explicit', createdAt: Date.now(), updatedAt: Date.now(), accessCount: 1 },
    ]),
```

Then add a new describe block after the `plugins API` block:

```typescript
  describe('memories API', () => {
    it('should list memories', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/memories')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].content).toBe('Likes TypeScript');
    });
  });
```

**Step 4: Run tests and commit**

Run: `pnpm test -- --run packages/dashboard/`

```bash
git add packages/dashboard/
git commit -m "feat(dashboard): add read-only memories endpoint to REST API"
```

---

### Task 5: Wire memory into runtime

**Files:**
- Modify: `packages/runtime/package.json`
- Modify: `packages/runtime/src/index.ts`

**Step 1: Add dependency**

In `packages/runtime/package.json`, add to `dependencies`:

```json
"@auxiora/memory": "workspace:*"
```

**Step 2: Add imports**

In `packages/runtime/src/index.ts`, after the `PluginLoader` import (line 36):

```typescript
import { MemoryStore, MemoryRetriever } from '@auxiora/memory';
import { setMemoryStore } from '@auxiora/tools';
```

**Step 3: Add fields to Auxiora class**

After `private pluginLoader?: PluginLoader;` (line 61):

```typescript
  private memoryStore?: MemoryStore;
  private memoryRetriever?: MemoryRetriever;
```

**Step 4: Add memory initialization**

In `initialize()`, after the plugin system block and before the closing `}` of `initialize()`:

```typescript
    // Initialize memory system (if enabled)
    if (this.config.memory?.enabled !== false) {
      this.memoryStore = new MemoryStore({
        maxEntries: this.config.memory?.maxEntries,
      });
      this.memoryRetriever = new MemoryRetriever();
      setMemoryStore(this.memoryStore);
      console.log('Memory system enabled');
    }
```

**Step 5: Wire getMemories into dashboard deps**

In `initialize()`, find the `createDashboardRouter` call and add `getMemories` to the `deps` object after `getPlugins`:

```typescript
          getMemories: async () => this.memoryStore?.getAll() ?? [],
```

**Step 6: Add memory injection to handleMessage**

In `handleMessage()`, find where the provider is called with `this.systemPrompt` (the `provider.stream` call around line 510). Before that call, add memory injection:

```typescript
      // Inject relevant memories into system prompt
      let enrichedPrompt = this.systemPrompt;
      if (this.memoryRetriever && this.memoryStore) {
        const memories = await this.memoryStore.getAll();
        const memorySection = this.memoryRetriever.retrieve(memories, content);
        if (memorySection) {
          enrichedPrompt = this.systemPrompt + memorySection;
        }
      }
```

Then change `systemPrompt: this.systemPrompt` to `systemPrompt: enrichedPrompt` in the `provider.stream()` call.

**Step 7: Add memory injection to handleChannelMessage**

Do the same for `handleChannelMessage()` — inject memories before `provider.complete()`. Use `inbound.content` as the user message for retrieval.

**Step 8: Add extraction after response**

In `handleMessage()`, after saving the assistant message (around line 537, the `sessions.addMessage` call for the assistant), add extraction:

```typescript
      // Extract memories from conversation (if auto-extract enabled)
      if (this.config.memory?.autoExtract !== false && this.memoryStore && this.providers && fullResponse && content.length > 20) {
        this.extractMemories(content, fullResponse).catch(err => {
          console.warn('Memory extraction failed:', err instanceof Error ? err.message : err);
        });
      }
```

Add the same pattern in `handleChannelMessage()` after the assistant response is saved, using `inbound.content` and `result.content`.

**Step 9: Add extractMemories method**

Add a new private method to the `Auxiora` class:

```typescript
  private async extractMemories(userMessage: string, assistantResponse: string): Promise<void> {
    if (!this.memoryStore || !this.providers) return;

    const extractionPrompt = `You are a fact extraction system. Given a conversation exchange, extract new facts about the user. Return a JSON array of objects with "content" (the fact) and "category" ("preference", "fact", or "context") fields. Return an empty array [] if there are no new facts worth remembering. Only extract concrete, specific facts — not vague observations.

User said: "${userMessage}"
Assistant said: "${assistantResponse}"

Respond with ONLY a JSON array, no other text.`;

    try {
      const provider = this.providers.getPrimaryProvider();
      const result = await provider.complete(
        [{ role: 'user', content: extractionPrompt }],
        { maxTokens: 200 }
      );

      const parsed = JSON.parse(result.content);
      if (!Array.isArray(parsed)) return;

      let count = 0;
      for (const fact of parsed) {
        if (fact.content && typeof fact.content === 'string') {
          await this.memoryStore.add(
            fact.content,
            fact.category || 'fact',
            'extracted'
          );
          count++;
        }
      }

      if (count > 0) {
        void audit('memory.extracted', { count });
      }
    } catch {
      // Extraction is best-effort — don't crash on parse errors
    }
  }
```

**Step 10: Install, run tests, commit**

```bash
pnpm install && pnpm test
```

All tests should pass.

```bash
git add packages/runtime/
git commit -m "feat(runtime): integrate memory system with prompt injection and auto-extraction"
```

---

### Task 6: Version bump to 1.9.0

**Files:**
- Modify: `package.json` (root)

**Step 1: Bump version**

In root `package.json`, change version from `"1.8.0"` to `"1.9.0"`.

**Step 2: Run full test suite**

Run: `pnpm test`

Expected: All ~332 tests pass.

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 1.9.0"
```
