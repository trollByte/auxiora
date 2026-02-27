import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteVecStore } from '../src/sqlite-vec-store.js';

const dims = 3;

describe('SqliteVecStore', () => {
  let store: SqliteVecStore;

  afterEach(() => {
    try {
      store.close();
    } catch {
      // already closed
    }
  });

  function createStore(overrides: Partial<{ maxEntries: number }> = {}) {
    store = new SqliteVecStore({
      dimensions: dims,
      dbPath: ':memory:',
      ...overrides,
    });
    return store;
  }

  describe('add', () => {
    it('should add an entry and return it', () => {
      createStore();
      const entry = store.add('a', [1, 0, 0], 'hello');
      expect(entry.id).toBe('a');
      expect(entry.vector).toEqual([1, 0, 0]);
      expect(entry.content).toBe('hello');
      expect(entry.metadata).toEqual({});
      expect(entry.createdAt).toBeGreaterThan(0);
    });

    it('should add an entry with metadata', () => {
      createStore();
      const entry = store.add('a', [1, 0, 0], 'hello', { key: 'value' });
      expect(entry.metadata).toEqual({ key: 'value' });
    });

    it('should reject wrong dimensions', () => {
      createStore();
      expect(() => store.add('a', [1, 0], 'hello')).toThrow(
        /Expected vector of 3 dimensions, got 2/,
      );
    });

    it('should enforce maxEntries', () => {
      createStore({ maxEntries: 2 });
      store.add('a', [1, 0, 0], 'a');
      store.add('b', [0, 1, 0], 'b');
      expect(() => store.add('c', [0, 0, 1], 'c')).toThrow(/full/);
    });

    it('should allow updating existing entry within maxEntries', () => {
      createStore({ maxEntries: 1 });
      store.add('a', [1, 0, 0], 'a');
      const updated = store.add('a', [0, 1, 0], 'updated');
      expect(updated.content).toBe('updated');
    });
  });

  describe('search', () => {
    it('should return results sorted by similarity descending', () => {
      createStore();
      store.add('x', [1, 0, 0], 'x-axis');
      store.add('y', [0, 1, 0], 'y-axis');
      store.add('xy', [0.707, 0.707, 0], 'diagonal');

      const results = store.search([1, 0, 0]);
      expect(results[0].entry.id).toBe('x');
      expect(results[0].score).toBeCloseTo(1);
    });

    it('should respect limit', () => {
      createStore();
      store.add('x', [1, 0, 0], 'x-axis');
      store.add('y', [0, 1, 0], 'y-axis');
      store.add('xy', [0.707, 0.707, 0], 'diagonal');

      const results = store.search([1, 0, 0], 1);
      expect(results).toHaveLength(1);
    });

    it('should respect minScore', () => {
      createStore();
      store.add('x', [1, 0, 0], 'x-axis');
      store.add('y', [0, 1, 0], 'y-axis');
      store.add('xy', [0.707, 0.707, 0], 'diagonal');

      const results = store.search([1, 0, 0], 10, 0.5);
      expect(results.every((r) => r.score >= 0.5)).toBe(true);
      expect(results.find((r) => r.entry.id === 'y')).toBeUndefined();
    });

    it('should reject wrong query dimensions', () => {
      createStore();
      expect(() => store.search([1, 0])).toThrow(/dimensions/);
    });
  });

  describe('get', () => {
    it('should return entry by id', () => {
      createStore();
      store.add('a', [1, 0, 0], 'hello');
      expect(store.get('a')?.content).toBe('hello');
    });

    it('should return undefined for missing id', () => {
      createStore();
      expect(store.get('missing')).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('should remove entry and return true', () => {
      createStore();
      store.add('a', [1, 0, 0], 'hello');
      expect(store.remove('a')).toBe(true);
      expect(store.get('a')).toBeUndefined();
      expect(store.size()).toBe(0);
    });

    it('should return false for missing id', () => {
      createStore();
      expect(store.remove('missing')).toBe(false);
    });
  });

  describe('update', () => {
    it('should update vector and content', () => {
      createStore();
      store.add('a', [1, 0, 0], 'old');
      const updated = store.update('a', [0, 1, 0], 'new');
      expect(updated.vector).toEqual([0, 1, 0]);
      expect(updated.content).toBe('new');
    });

    it('should preserve content when not provided', () => {
      createStore();
      store.add('a', [1, 0, 0], 'keep');
      const updated = store.update('a', [0, 1, 0]);
      expect(updated.content).toBe('keep');
    });

    it('should throw for missing entry', () => {
      createStore();
      expect(() => store.update('missing', [1, 0, 0])).toThrow(/not found/);
    });

    it('should reject wrong dimensions', () => {
      createStore();
      store.add('a', [1, 0, 0], 'hello');
      expect(() => store.update('a', [1, 0])).toThrow(/dimensions/);
    });
  });

  describe('size', () => {
    it('should return number of entries', () => {
      createStore();
      expect(store.size()).toBe(0);
      store.add('a', [1, 0, 0], 'a');
      expect(store.size()).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      createStore();
      store.add('a', [1, 0, 0], 'a');
      store.add('b', [0, 1, 0], 'b');
      store.clear();
      expect(store.size()).toBe(0);
    });
  });

  describe('persistence', () => {
    it('should persist entries across close and reopen', () => {
      const dir = mkdtempSync(join(tmpdir(), 'sqlite-vec-test-'));
      const dbPath = join(dir, 'test.db');

      try {
        const store1 = new SqliteVecStore({ dimensions: dims, dbPath });
        store1.add('a', [1, 0, 0], 'hello', { foo: 'bar' });
        store1.add('b', [0, 1, 0], 'world');
        store1.close();

        // Reopen with same path — assign to outer `store` so afterEach cleans up
        store = new SqliteVecStore({ dimensions: dims, dbPath });
        expect(store.size()).toBe(2);
        expect(store.get('a')?.content).toBe('hello');
        expect(store.get('a')?.metadata).toEqual({ foo: 'bar' });
        expect(store.get('b')?.content).toBe('world');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('FTS5 keyword search', () => {
    it('should find entries by exact keyword match', () => {
      createStore();
      store.add('doc1', [1, 0, 0], 'TypeError: Cannot read property foo of undefined');
      store.add('doc2', [0, 1, 0], 'The weather is sunny today');
      store.add('doc3', [0, 0, 1], 'TypeError: foo is not a function');

      const results = store.keywordSearch('TypeError foo', 10);
      expect(results.length).toBe(2);
      expect(results.map(r => r.entry.id)).toContain('doc1');
      expect(results.map(r => r.entry.id)).toContain('doc3');
    });

    it('should return empty array when no match', () => {
      createStore();
      store.add('doc1', [1, 0, 0], 'hello world');

      const results = store.keywordSearch('nonexistent', 10);
      expect(results.length).toBe(0);
    });

    it('should respect limit', () => {
      createStore();
      store.add('doc1', [1, 0, 0], 'error in module A');
      store.add('doc2', [0, 1, 0], 'error in module B');
      store.add('doc3', [0, 0, 1], 'error in module C');

      const results = store.keywordSearch('error', 2);
      expect(results.length).toBe(2);
    });

    it('should handle quotes in query safely', () => {
      createStore();
      store.add('doc1', [1, 0, 0], 'some "quoted" text');

      const results = store.keywordSearch('"quoted"', 10);
      expect(results.length).toBe(1);
      expect(results[0].entry.id).toBe('doc1');
    });

    it('should keep FTS index in sync after remove', () => {
      createStore();
      store.add('doc1', [1, 0, 0], 'unique keyword here');
      store.remove('doc1');

      const results = store.keywordSearch('unique', 10);
      expect(results.length).toBe(0);
    });

    it('should keep FTS index in sync after clear', () => {
      createStore();
      store.add('doc1', [1, 0, 0], 'searchable content');
      store.clear();

      const results = store.keywordSearch('searchable', 10);
      expect(results.length).toBe(0);
    });
  });

  describe('hybrid search', () => {
    it('should merge vector and keyword results via RRF', () => {
      createStore();
      store.add('doc1', [0.9, 0.1, 0], 'fix the TypeError in auth module');
      store.add('doc2', [0.8, 0.2, 0], 'repair the authentication bug');
      store.add('doc3', [0, 0, 1], 'TypeError: network timeout');

      const results = store.hybridSearch([1, 0, 0], 'TypeError', { limit: 10 });
      expect(results.length).toBe(3);
      // doc1 should rank highest (strong in both vector + keyword)
      expect(results[0].entry.id).toBe('doc1');
    });

    it('should support searchMode option', () => {
      createStore();
      store.add('a', [1, 0, 0], 'hello world');

      const vectorOnly = store.hybridSearch([1, 0, 0], 'hello', { mode: 'vector' });
      expect(vectorOnly.length).toBe(1);

      const keywordOnly = store.hybridSearch([1, 0, 0], 'hello', { mode: 'keyword' });
      expect(keywordOnly.length).toBe(1);
    });

    it('should respect limit', () => {
      createStore();
      store.add('a', [1, 0, 0], 'alpha search term');
      store.add('b', [0.9, 0.1, 0], 'beta search term');
      store.add('c', [0.8, 0.2, 0], 'gamma search term');

      const results = store.hybridSearch([1, 0, 0], 'search', { limit: 2 });
      expect(results.length).toBe(2);
    });

    it('should default to hybrid mode', () => {
      createStore();
      store.add('vec', [1, 0, 0], 'unrelated content');
      store.add('kw', [0, 0, 1], 'specific keyword match');

      const results = store.hybridSearch([1, 0, 0], 'specific keyword');
      // Both should appear: vec from vector similarity, kw from keyword match
      expect(results.length).toBe(2);
      expect(results.map(r => r.entry.id)).toContain('vec');
      expect(results.map(r => r.entry.id)).toContain('kw');
    });
  });

  describe('close', () => {
    it('should close without error', () => {
      createStore();
      expect(() => store.close()).not.toThrow();
    });
  });
});
