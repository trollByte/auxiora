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
