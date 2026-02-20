import { describe, it, expect, beforeEach } from 'vitest';
import { VectorStore } from '../src/vector-store.js';
import type { VectorStoreOptions } from '../src/types.js';

const dims = 3;
const options: VectorStoreOptions = { dimensions: dims };

describe('VectorStore', () => {
  let store: VectorStore;

  beforeEach(() => {
    store = new VectorStore(options);
  });

  describe('add', () => {
    it('should add an entry and return it', () => {
      const entry = store.add('a', [1, 0, 0], 'hello');
      expect(entry.id).toBe('a');
      expect(entry.vector).toEqual([1, 0, 0]);
      expect(entry.content).toBe('hello');
      expect(entry.metadata).toEqual({});
      expect(entry.createdAt).toBeGreaterThan(0);
    });

    it('should add an entry with metadata', () => {
      const entry = store.add('a', [1, 0, 0], 'hello', { key: 'value' });
      expect(entry.metadata).toEqual({ key: 'value' });
    });

    it('should reject wrong dimensions', () => {
      expect(() => store.add('a', [1, 0], 'hello')).toThrow(
        /Expected vector of 3 dimensions, got 2/,
      );
    });

    it('should enforce maxEntries', () => {
      const small = new VectorStore({ dimensions: dims, maxEntries: 2 });
      small.add('a', [1, 0, 0], 'a');
      small.add('b', [0, 1, 0], 'b');
      expect(() => small.add('c', [0, 0, 1], 'c')).toThrow(/full/);
    });

    it('should allow updating existing entry within maxEntries', () => {
      const small = new VectorStore({ dimensions: dims, maxEntries: 1 });
      small.add('a', [1, 0, 0], 'a');
      const updated = small.add('a', [0, 1, 0], 'updated');
      expect(updated.content).toBe('updated');
    });
  });

  describe('search', () => {
    beforeEach(() => {
      store.add('x', [1, 0, 0], 'x-axis');
      store.add('y', [0, 1, 0], 'y-axis');
      store.add('xy', [0.707, 0.707, 0], 'diagonal');
    });

    it('should return results sorted by similarity descending', () => {
      const results = store.search([1, 0, 0]);
      expect(results[0].entry.id).toBe('x');
      expect(results[0].score).toBeCloseTo(1);
    });

    it('should respect limit', () => {
      const results = store.search([1, 0, 0], 1);
      expect(results).toHaveLength(1);
    });

    it('should respect minScore', () => {
      const results = store.search([1, 0, 0], 10, 0.5);
      expect(results.every((r) => r.score >= 0.5)).toBe(true);
      // y-axis is orthogonal (score ~0), should be filtered out
      expect(results.find((r) => r.entry.id === 'y')).toBeUndefined();
    });

    it('should reject wrong query dimensions', () => {
      expect(() => store.search([1, 0])).toThrow(/dimensions/);
    });
  });

  describe('get', () => {
    it('should return entry by id', () => {
      store.add('a', [1, 0, 0], 'hello');
      expect(store.get('a')?.content).toBe('hello');
    });

    it('should return undefined for missing id', () => {
      expect(store.get('missing')).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('should remove entry and return true', () => {
      store.add('a', [1, 0, 0], 'hello');
      expect(store.remove('a')).toBe(true);
      expect(store.get('a')).toBeUndefined();
      expect(store.size()).toBe(0);
    });

    it('should return false for missing id', () => {
      expect(store.remove('missing')).toBe(false);
    });
  });

  describe('update', () => {
    it('should update vector and content', () => {
      store.add('a', [1, 0, 0], 'old');
      const updated = store.update('a', [0, 1, 0], 'new');
      expect(updated.vector).toEqual([0, 1, 0]);
      expect(updated.content).toBe('new');
    });

    it('should preserve content when not provided', () => {
      store.add('a', [1, 0, 0], 'keep');
      const updated = store.update('a', [0, 1, 0]);
      expect(updated.content).toBe('keep');
    });

    it('should throw for missing entry', () => {
      expect(() => store.update('missing', [1, 0, 0])).toThrow(/not found/);
    });

    it('should reject wrong dimensions', () => {
      store.add('a', [1, 0, 0], 'hello');
      expect(() => store.update('a', [1, 0])).toThrow(/dimensions/);
    });
  });

  describe('size', () => {
    it('should return number of entries', () => {
      expect(store.size()).toBe(0);
      store.add('a', [1, 0, 0], 'a');
      expect(store.size()).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      store.add('a', [1, 0, 0], 'a');
      store.add('b', [0, 1, 0], 'b');
      store.clear();
      expect(store.size()).toBe(0);
    });
  });

  describe('serialization', () => {
    it('should round-trip via toJSON/fromJSON', () => {
      store.add('a', [1, 0, 0], 'hello', { foo: 'bar' });
      store.add('b', [0, 1, 0], 'world');

      const json = store.toJSON();
      const restored = VectorStore.fromJSON(json, options);

      expect(restored.size()).toBe(2);
      expect(restored.get('a')?.content).toBe('hello');
      expect(restored.get('a')?.metadata).toEqual({ foo: 'bar' });
      expect(restored.get('b')?.content).toBe('world');
    });

    it('should produce valid JSON', () => {
      store.add('a', [1, 0, 0], 'test');
      const json = store.toJSON();
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });
});
