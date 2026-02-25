import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryEditor } from '../src/memory-editor.js';
import type { MemoryStoreLike } from '../src/memory-editor.js';
import type { MemoryEntry, MemoryCategory } from '../src/types.js';

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: overrides.id ?? 'mem-1',
    content: overrides.content ?? 'Test memory',
    category: overrides.category ?? 'fact',
    source: overrides.source ?? 'extracted',
    createdAt: overrides.createdAt ?? 1000,
    updatedAt: overrides.updatedAt ?? 2000,
    accessCount: overrides.accessCount ?? 0,
    tags: overrides.tags ?? ['test'],
    importance: overrides.importance ?? 0.5,
    confidence: overrides.confidence ?? 0.8,
    sentiment: overrides.sentiment,
    relatedMemories: overrides.relatedMemories,
    provenance: overrides.provenance,
    partitionId: overrides.partitionId,
    sourceUserId: overrides.sourceUserId,
  };
}

function createMockStore(entries: MemoryEntry[] = []): MemoryStoreLike {
  const data = [...entries];
  return {
    getAll: vi.fn(async () => [...data]),
    search: vi.fn(async (_query: string) => [...data]),
    getByCategory: vi.fn(async (category: MemoryCategory) =>
      data.filter(e => e.category === category),
    ),
    update: vi.fn(async (id: string, updates: Partial<MemoryEntry>) => {
      const entry = data.find(e => e.id === id);
      if (!entry) return undefined;
      Object.assign(entry, updates, { updatedAt: Date.now() });
      return entry;
    }),
    remove: vi.fn(async (id: string) => {
      const idx = data.findIndex(e => e.id === id);
      if (idx === -1) return false;
      data.splice(idx, 1);
      return true;
    }),
  };
}

describe('MemoryEditor', () => {
  let editor: MemoryEditor;
  let store: MemoryStoreLike;
  const entries = [
    makeEntry({ id: 'mem-1', content: 'Likes dark mode', category: 'preference', importance: 0.8, provenance: { origin: 'user_stated' } }),
    makeEntry({ id: 'mem-2', content: 'Works at Acme', category: 'fact', importance: 0.6, provenance: { origin: 'extracted' } }),
    makeEntry({ id: 'mem-3', content: 'Prefers TypeScript', category: 'preference', importance: 0.9 }),
  ];

  beforeEach(() => {
    store = createMockStore(entries.map(e => makeEntry(e)));
    editor = new MemoryEditor(store);
  });

  describe('listAll', () => {
    it('should return all memories as views', async () => {
      const views = await editor.listAll();
      expect(views).toHaveLength(3);
      expect(store.getAll).toHaveBeenCalled();
    });
  });

  describe('listByCategory', () => {
    it('should return filtered views by category', async () => {
      const views = await editor.listByCategory('preference');
      expect(views).toHaveLength(2);
      expect(views.every(v => v.category === 'preference')).toBe(true);
    });
  });

  describe('search', () => {
    it('should return matching views', async () => {
      const views = await editor.search('dark mode');
      expect(views.length).toBeGreaterThan(0);
      expect(store.search).toHaveBeenCalledWith('dark mode');
    });
  });

  describe('edit', () => {
    it('should update a memory and record history', async () => {
      const result = await editor.edit('mem-1', { content: 'Likes light mode' });
      expect(result.success).toBe(true);
      expect(result.operation).toBe('update');
      expect(result.memoryId).toBe('mem-1');
      expect(store.update).toHaveBeenCalledWith('mem-1', { content: 'Likes light mode' });

      const history = editor.getEditHistory();
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('update');
      expect(history[0].memoryId).toBe('mem-1');
      expect(history[0].updates).toEqual({ content: 'Likes light mode' });
    });

    it('should return error for missing memory', async () => {
      const result = await editor.edit('nonexistent', { content: 'nope' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Memory not found');
      expect(editor.getEditHistory()).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('should remove a memory and record history', async () => {
      const result = await editor.delete('mem-2');
      expect(result.success).toBe(true);
      expect(result.operation).toBe('delete');
      expect(result.memoryId).toBe('mem-2');
      expect(store.remove).toHaveBeenCalledWith('mem-2');

      const history = editor.getEditHistory();
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('delete');
    });

    it('should return error for missing memory', async () => {
      const result = await editor.delete('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Memory not found');
      expect(editor.getEditHistory()).toHaveLength(0);
    });
  });

  describe('deleteByCategory', () => {
    it('should remove all memories in a category', async () => {
      const result = await editor.deleteByCategory('preference');
      expect(result.deleted).toBe(2);
      expect(result.failed).toBe(0);
      expect(editor.getEditHistory()).toHaveLength(2);
    });
  });

  describe('getEditHistory', () => {
    it('should return a copy of operations', async () => {
      await editor.edit('mem-1', { importance: 1.0 });
      await editor.delete('mem-2');

      const history = editor.getEditHistory();
      expect(history).toHaveLength(2);
      expect(history[0].type).toBe('update');
      expect(history[1].type).toBe('delete');

      // Verify it returns a copy
      history.push({ type: 'delete', memoryId: 'fake', timestamp: 0 });
      expect(editor.getEditHistory()).toHaveLength(2);
    });
  });

  describe('clearHistory', () => {
    it('should empty the history', async () => {
      await editor.edit('mem-1', { importance: 0.9 });
      expect(editor.getEditHistory()).toHaveLength(1);

      editor.clearHistory();
      expect(editor.getEditHistory()).toHaveLength(0);
    });
  });

  describe('history cap', () => {
    it('should cap edit history at maxHistory', async () => {
      const smallStore = createMockStore([makeEntry({ id: 'mem-x' })]);
      const smallEditor = new MemoryEditor(smallStore, { maxHistory: 3 });

      for (let i = 0; i < 5; i++) {
        await smallEditor.edit('mem-x', { importance: i / 10 });
      }

      const history = smallEditor.getEditHistory();
      expect(history).toHaveLength(3);
      // Oldest entries should have been evicted; remaining should be the last 3
      expect(history[0].updates).toEqual({ importance: 0.2 });
      expect(history[2].updates).toEqual({ importance: 0.4 });
    });
  });

  describe('toView', () => {
    it('should strip internal fields and map provenance to source', async () => {
      const views = await editor.listAll();
      const view = views.find(v => v.id === 'mem-1')!;

      expect(view).toBeDefined();
      expect(view.source).toBe('user_stated');
      expect(view.content).toBe('Likes dark mode');
      expect(view.category).toBe('preference');
      expect(view.importance).toBe(0.8);
      expect(view.tags).toBeDefined();

      // Internal fields should not be present
      expect((view as Record<string, unknown>)['accessCount']).toBeUndefined();
      expect((view as Record<string, unknown>)['encrypted']).toBeUndefined();
      expect((view as Record<string, unknown>)['provenance']).toBeUndefined();
      expect((view as Record<string, unknown>)['relatedMemories']).toBeUndefined();
    });

    it('should handle missing provenance gracefully', async () => {
      const views = await editor.listAll();
      const view = views.find(v => v.id === 'mem-3')!;
      expect(view.source).toBeUndefined();
    });
  });
});
