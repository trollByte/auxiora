import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { MemoryStore } from '../src/store.js';

describe('Memory Provenance', () => {
  let store: MemoryStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mem-prov-'));
    store = new MemoryStore({ dir: tmpDir });
  });

  it('should store provenance when provided', async () => {
    const entry = await store.add('User likes TypeScript', 'preference', 'extracted', {
      provenance: {
        origin: 'extracted',
        sessionId: 'sess-123',
        createdBy: 'memory-extractor',
        sourceExcerpt: 'I really love TypeScript for its type safety',
        extractionConfidence: 0.9,
      },
    });

    expect(entry.provenance).toBeDefined();
    expect(entry.provenance!.origin).toBe('extracted');
    expect(entry.provenance!.sessionId).toBe('sess-123');
    expect(entry.provenance!.extractionConfidence).toBe(0.9);
  });

  it('should work without provenance (backward compatible)', async () => {
    const entry = await store.add('User likes coffee', 'preference', 'explicit');
    expect(entry.provenance).toBeUndefined();
  });

  it('should persist provenance through read/write cycle', async () => {
    await store.add('User likes Rust', 'preference', 'extracted', {
      provenance: {
        origin: 'user_stated',
        createdBy: 'user',
      },
    });

    // Create new store instance pointing to same dir
    const store2 = new MemoryStore({ dir: tmpDir });
    const memories = await store2.getAll();
    expect(memories[0].provenance?.origin).toBe('user_stated');
  });

  it('should auto-set provenance on merge', async () => {
    const m1 = await store.add('User likes Python', 'preference', 'extracted');
    const m2 = await store.add('User codes in Python daily', 'fact', 'observed');

    const merged = await store.merge(m1.id, m2.id, 'User is a daily Python developer');
    expect(merged.provenance).toBeDefined();
    expect(merged.provenance!.origin).toBe('merged');
    expect(merged.provenance!.derivedFrom).toContain(m1.id);
    expect(merged.provenance!.derivedFrom).toContain(m2.id);
  });
});
