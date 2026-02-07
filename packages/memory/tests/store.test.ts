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

  // === New field defaults ===

  it('should set default values for new fields', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const entry = await store.add('Default fields test', 'fact', 'explicit');

    expect(entry.importance).toBe(0.5);
    expect(entry.confidence).toBe(0.8);
    expect(entry.sentiment).toBe('neutral');
    expect(entry.encrypted).toBe(false);
    expect(entry.expiresAt).toBeUndefined();
    expect(entry.relatedMemories).toBeUndefined();
  });

  it('should accept custom values for new fields', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const entry = await store.add('Custom fields test', 'relationship', 'observed', {
      importance: 0.9,
      confidence: 0.6,
      sentiment: 'positive',
      expiresAt: Date.now() + 100000,
      encrypted: true,
      relatedMemories: ['mem-abc'],
    });

    expect(entry.importance).toBe(0.9);
    expect(entry.confidence).toBe(0.6);
    expect(entry.sentiment).toBe('positive');
    expect(entry.expiresAt).toBeGreaterThan(0);
    expect(entry.encrypted).toBe(true);
    expect(entry.relatedMemories).toEqual(['mem-abc']);
  });

  // === getByCategory ===

  it('should filter memories by category', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    await store.add('User likes TypeScript', 'preference', 'explicit');
    await store.add('Works at Acme Corp', 'fact', 'extracted');
    await store.add('Shared a joke about recursion', 'relationship', 'observed');
    await store.add('User prefers concise responses', 'pattern', 'observed');

    const prefs = await store.getByCategory('preference');
    expect(prefs).toHaveLength(1);
    expect(prefs[0].category).toBe('preference');

    const rels = await store.getByCategory('relationship');
    expect(rels).toHaveLength(1);
    expect(rels[0].category).toBe('relationship');

    const patterns = await store.getByCategory('pattern');
    expect(patterns).toHaveLength(1);

    const empty = await store.getByCategory('personality');
    expect(empty).toHaveLength(0);
  });

  // === accessCount persistence fix ===

  it('should persist accessCount after search', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    await store.add('User prefers dark mode', 'preference', 'explicit');

    await store.search('dark mode');

    // Read from a fresh store to verify persistence
    const store2 = new MemoryStore({ dir: tmpDir });
    const all = await store2.getAll();
    expect(all[0].accessCount).toBe(1);

    // Search again
    await store2.search('dark mode');

    const store3 = new MemoryStore({ dir: tmpDir });
    const all3 = await store3.getAll();
    expect(all3[0].accessCount).toBe(2);
  });

  // === cleanExpired ===

  it('should clean expired memories', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const past = Date.now() - 1000;
    const future = Date.now() + 100000;

    await store.add('Expired memory about alpha', 'context', 'explicit', { expiresAt: past });
    await store.add('Valid memory about beta', 'fact', 'explicit', { expiresAt: future });
    await store.add('No expiry memory about gamma', 'preference', 'explicit');

    const removed = await store.cleanExpired();
    expect(removed).toBe(1);

    const all = await store.getAll();
    expect(all).toHaveLength(2);
    expect(all.every(m => m.content !== 'Expired memory about alpha')).toBe(true);
  });

  it('should return 0 when no expired memories exist', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    await store.add('Memory without expiry about alpha', 'fact', 'explicit');

    const removed = await store.cleanExpired();
    expect(removed).toBe(0);
  });

  // === getExpired ===

  it('should return expired memories', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const past = Date.now() - 1000;

    await store.add('Expired one about alpha', 'context', 'explicit', { expiresAt: past });
    await store.add('Not expired about beta', 'fact', 'explicit');

    const expired = await store.getExpired();
    expect(expired).toHaveLength(1);
    expect(expired[0].content).toContain('alpha');
  });

  // === merge ===

  it('should merge two memories', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const e1 = await store.add('User likes TypeScript', 'preference', 'explicit', { importance: 0.7 });
    const e2 = await store.add('User works at Acme Corp', 'fact', 'extracted', { importance: 0.9 });

    const merged = await store.merge(e1.id, e2.id, 'User likes TypeScript at Acme Corp');
    expect(merged.id).toBe(e1.id);
    expect(merged.content).toBe('User likes TypeScript at Acme Corp');
    expect(merged.accessCount).toBe(e1.accessCount + e2.accessCount);
    expect(merged.importance).toBe(0.9); // max of both

    const all = await store.getAll();
    expect(all).toHaveLength(1);
  });

  it('should throw when merging nonexistent memory', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const e1 = await store.add('Test about alpha', 'fact', 'explicit');

    await expect(store.merge(e1.id, 'nonexistent', 'merged')).rejects.toThrow('Memory not found');
    await expect(store.merge('nonexistent', e1.id, 'merged')).rejects.toThrow('Memory not found');
  });

  // === getStats ===

  it('should return correct stats', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    await store.add('User likes TypeScript', 'preference', 'explicit', { importance: 0.8 });
    await store.add('User works at Acme Corp', 'fact', 'extracted', { importance: 0.6 });

    const stats = await store.getStats();
    expect(stats.totalMemories).toBe(2);
    expect(stats.oldestMemory).toBeGreaterThan(0);
    expect(stats.newestMemory).toBeGreaterThanOrEqual(stats.oldestMemory);
    expect(stats.averageImportance).toBe(0.7);
    expect(stats.topTags.length).toBeGreaterThan(0);
  });

  it('should return zero stats when empty', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const stats = await store.getStats();
    expect(stats.totalMemories).toBe(0);
    expect(stats.averageImportance).toBe(0);
    expect(stats.topTags).toHaveLength(0);
  });

  // === exportAll / importAll ===

  it('should export and import memories', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    await store.add('User likes TypeScript', 'preference', 'explicit');
    await store.add('User works at Acme Corp', 'fact', 'extracted');

    const exported = await store.exportAll();
    expect(exported.version).toBe('1.0');
    expect(exported.memories).toHaveLength(2);
    expect(exported.exportedAt).toBeGreaterThan(0);

    // Import into a new store
    const newDir = path.join(tmpDir, 'import-target');
    await fs.mkdir(newDir, { recursive: true });
    const store2 = new MemoryStore({ dir: newDir });

    const result = await store2.importAll(exported);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);

    const all = await store2.getAll();
    expect(all).toHaveLength(2);
  });

  it('should skip duplicate ids on import', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const entry = await store.add('User likes TypeScript', 'preference', 'explicit');

    const result = await store.importAll({
      memories: [entry, { ...entry, id: 'mem-new', content: 'New memory about delta' }],
    });
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);

    const all = await store.getAll();
    expect(all).toHaveLength(2);
  });

  // === setImportance ===

  it('should set importance', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const entry = await store.add('Test about alpha', 'fact', 'explicit');

    await store.setImportance(entry.id, 0.95);

    const all = await store.getAll();
    expect(all[0].importance).toBe(0.95);
  });

  it('should reject invalid importance values', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const entry = await store.add('Test about alpha', 'fact', 'explicit');

    await expect(store.setImportance(entry.id, 1.5)).rejects.toThrow('Importance must be between 0 and 1');
    await expect(store.setImportance(entry.id, -0.1)).rejects.toThrow('Importance must be between 0 and 1');
  });

  // === linkMemories ===

  it('should link two memories bidirectionally', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const e1 = await store.add('User likes TypeScript', 'preference', 'explicit');
    const e2 = await store.add('User works at Acme Corp', 'fact', 'extracted');

    await store.linkMemories(e1.id, e2.id);

    const all = await store.getAll();
    const m1 = all.find(m => m.id === e1.id)!;
    const m2 = all.find(m => m.id === e2.id)!;

    expect(m1.relatedMemories).toContain(e2.id);
    expect(m2.relatedMemories).toContain(e1.id);
  });

  it('should not duplicate links', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const e1 = await store.add('User likes TypeScript', 'preference', 'explicit');
    const e2 = await store.add('User works at Acme Corp', 'fact', 'extracted');

    await store.linkMemories(e1.id, e2.id);
    await store.linkMemories(e1.id, e2.id);

    const all = await store.getAll();
    const m1 = all.find(m => m.id === e1.id)!;
    expect(m1.relatedMemories!.filter(id => id === e2.id)).toHaveLength(1);
  });

  // === Legacy backward compatibility ===

  it('should apply defaults when reading legacy entries', async () => {
    // Write a legacy entry without new fields
    const filePath = path.join(tmpDir, 'memories.json');
    const legacy = [{
      id: 'mem-legacy',
      content: 'Legacy entry',
      category: 'fact',
      source: 'explicit',
      createdAt: 1000,
      updatedAt: 2000,
      accessCount: 5,
      tags: ['legacy'],
    }];
    await fs.writeFile(filePath, JSON.stringify(legacy), 'utf-8');

    const store = new MemoryStore({ dir: tmpDir });
    const all = await store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].importance).toBe(0.5);
    expect(all[0].confidence).toBe(0.8);
    expect(all[0].sentiment).toBe('neutral');
    expect(all[0].encrypted).toBe(false);
  });

  // === update with new fields ===

  it('should update new fields via update()', async () => {
    const store = new MemoryStore({ dir: tmpDir });
    const entry = await store.add('Test about alpha', 'fact', 'explicit');

    const updated = await store.update(entry.id, {
      importance: 0.9,
      confidence: 0.95,
      sentiment: 'positive',
    });

    expect(updated?.importance).toBe(0.9);
    expect(updated?.confidence).toBe(0.95);
    expect(updated?.sentiment).toBe('positive');
  });
});
