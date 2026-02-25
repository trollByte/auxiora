import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryGuard } from '../src/memory-guard.js';
import type { MemoryEntry } from '../src/types.js';

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: overrides.id ?? 'mem-1',
    content: overrides.content ?? 'Test memory',
    category: overrides.category ?? 'fact',
    source: overrides.source ?? 'extracted',
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    accessCount: overrides.accessCount ?? 0,
    tags: overrides.tags ?? ['test'],
    importance: overrides.importance ?? 0.5,
    confidence: overrides.confidence ?? 0.8,
    sentiment: overrides.sentiment,
    provenance: overrides.provenance,
    partitionId: overrides.partitionId,
    sourceUserId: overrides.sourceUserId,
  };
}

describe('MemoryGuard', () => {
  let guard: MemoryGuard;

  beforeEach(() => {
    guard = new MemoryGuard();
  });

  it('should return empty anomalies for a normal entry', () => {
    const entry = makeEntry();
    const anomalies = guard.check(entry, []);
    expect(anomalies).toEqual([]);
  });

  describe('bulk insertion detection', () => {
    it('should detect bulk insertions over threshold', () => {
      const smallGuard = new MemoryGuard({ bulkThreshold: 3, bulkWindowMs: 60_000 });
      smallGuard.recordInsertion();
      smallGuard.recordInsertion();
      smallGuard.recordInsertion();

      const entry = makeEntry();
      const anomalies = smallGuard.check(entry, []);

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].type).toBe('bulk_insertion');
      expect(anomalies[0].severity).toBe('high');
      expect(anomalies[0].block).toBe(true);
    });

    it('should not flag bulk below threshold', () => {
      const smallGuard = new MemoryGuard({ bulkThreshold: 5, bulkWindowMs: 60_000 });
      smallGuard.recordInsertion();
      smallGuard.recordInsertion();

      const entry = makeEntry();
      const anomalies = smallGuard.check(entry, []);

      expect(anomalies).toEqual([]);
    });

    it('should prune insertions outside the time window', () => {
      const smallGuard = new MemoryGuard({ bulkThreshold: 3, bulkWindowMs: 100 });
      smallGuard.recordInsertion();
      smallGuard.recordInsertion();
      smallGuard.recordInsertion();

      // Manually set old timestamps
      (smallGuard as any).recentInsertions = [Date.now() - 200, Date.now() - 200, Date.now() - 200];

      const entry = makeEntry();
      const anomalies = smallGuard.check(entry, []);
      expect(anomalies).toEqual([]);
    });
  });

  describe('contradiction detection', () => {
    it('should detect sentiment contradictions with tag overlap', () => {
      const existing = makeEntry({
        id: 'existing-1',
        tags: ['food', 'preference'],
        sentiment: 'positive',
        content: 'User likes pizza',
      });
      const newEntry = makeEntry({
        id: 'new-1',
        tags: ['food', 'preference'],
        sentiment: 'negative',
        content: 'User hates pizza',
      });

      const anomalies = guard.check(newEntry, [existing]);

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].type).toBe('contradiction');
      expect(anomalies[0].severity).toBe('medium');
      expect(anomalies[0].memoryId).toBe('existing-1');
      expect(anomalies[0].block).toBe(false);
    });

    it('should ignore contradictions with low tag overlap', () => {
      const existing = makeEntry({
        id: 'existing-1',
        tags: ['food', 'preference', 'italian'],
        sentiment: 'positive',
      });
      const newEntry = makeEntry({
        id: 'new-1',
        tags: ['music', 'hobby'],
        sentiment: 'negative',
      });

      const anomalies = guard.check(newEntry, [existing]);
      expect(anomalies).toEqual([]);
    });

    it('should not flag when sentiments are the same', () => {
      const existing = makeEntry({
        tags: ['food', 'preference'],
        sentiment: 'positive',
      });
      const newEntry = makeEntry({
        tags: ['food', 'preference'],
        sentiment: 'positive',
      });

      const anomalies = guard.check(newEntry, [existing]);
      expect(anomalies).toEqual([]);
    });

    it('should not flag when either sentiment is neutral', () => {
      const existing = makeEntry({
        tags: ['food', 'preference'],
        sentiment: 'neutral',
      });
      const newEntry = makeEntry({
        tags: ['food', 'preference'],
        sentiment: 'negative',
      });

      const anomalies = guard.check(newEntry, [existing]);
      expect(anomalies).toEqual([]);
    });

    it('should handle empty tags without errors', () => {
      const existing = makeEntry({ tags: [], sentiment: 'positive' });
      const newEntry = makeEntry({ tags: [], sentiment: 'negative' });

      const anomalies = guard.check(newEntry, [existing]);
      expect(anomalies).toEqual([]);
    });
  });

  describe('untrusted source detection', () => {
    it('should detect untrusted sources', () => {
      const guardWithTrust = new MemoryGuard({
        trustedSourceIds: ['user-1', 'user-2'],
      });

      const entry = makeEntry({ sourceUserId: 'attacker-1' });
      const anomalies = guardWithTrust.check(entry, []);

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].type).toBe('untrusted_source');
      expect(anomalies[0].severity).toBe('medium');
      expect(anomalies[0].block).toBe(false);
    });

    it('should trust all sources when trust list is empty', () => {
      const entry = makeEntry({ sourceUserId: 'anyone' });
      const anomalies = guard.check(entry, []);
      expect(anomalies).toEqual([]);
    });

    it('should allow trusted sources', () => {
      const guardWithTrust = new MemoryGuard({
        trustedSourceIds: ['user-1'],
      });

      const entry = makeEntry({ sourceUserId: 'user-1' });
      const anomalies = guardWithTrust.check(entry, []);
      expect(anomalies).toEqual([]);
    });
  });

  describe('confidence anomaly detection', () => {
    it('should detect confidence anomalies on inferred memories', () => {
      const entry = makeEntry({
        confidence: 0.99,
        provenance: { origin: 'inferred' },
      });

      const anomalies = guard.check(entry, []);

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].type).toBe('confidence_anomaly');
      expect(anomalies[0].severity).toBe('low');
      expect(anomalies[0].block).toBe(false);
    });

    it('should detect confidence anomalies on extracted memories', () => {
      const entry = makeEntry({
        confidence: 0.98,
        provenance: { origin: 'extracted' },
      });

      const anomalies = guard.check(entry, []);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].type).toBe('confidence_anomaly');
    });

    it('should not flag user_stated memories with high confidence', () => {
      const entry = makeEntry({
        confidence: 0.99,
        provenance: { origin: 'user_stated' },
      });

      const anomalies = guard.check(entry, []);
      expect(anomalies).toEqual([]);
    });

    it('should not flag memories below the confidence threshold', () => {
      const entry = makeEntry({
        confidence: 0.90,
        provenance: { origin: 'inferred' },
      });

      const anomalies = guard.check(entry, []);
      expect(anomalies).toEqual([]);
    });

    it('should respect custom confidence threshold', () => {
      const strictGuard = new MemoryGuard({ confidenceAnomalyThreshold: 0.8 });
      const entry = makeEntry({
        confidence: 0.85,
        provenance: { origin: 'inferred' },
      });

      const anomalies = strictGuard.check(entry, []);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].type).toBe('confidence_anomaly');
    });
  });

  describe('multiple anomalies', () => {
    it('should return multiple anomalies simultaneously', () => {
      const guardWithTrust = new MemoryGuard({
        trustedSourceIds: ['user-1'],
        bulkThreshold: 2,
      });

      // Trigger bulk
      guardWithTrust.recordInsertion();
      guardWithTrust.recordInsertion();

      const existing = makeEntry({
        id: 'existing-1',
        tags: ['food', 'preference'],
        sentiment: 'positive',
      });

      const entry = makeEntry({
        id: 'new-1',
        tags: ['food', 'preference'],
        sentiment: 'negative',
        sourceUserId: 'attacker',
        confidence: 0.99,
        provenance: { origin: 'inferred' },
      });

      const anomalies = guardWithTrust.check(entry, [existing]);

      const types = anomalies.map(a => a.type);
      expect(types).toContain('bulk_insertion');
      expect(types).toContain('contradiction');
      expect(types).toContain('untrusted_source');
      expect(types).toContain('confidence_anomaly');
      expect(anomalies).toHaveLength(4);
    });
  });

  describe('resetHistory', () => {
    it('should clear insertion tracking', () => {
      const smallGuard = new MemoryGuard({ bulkThreshold: 2 });
      smallGuard.recordInsertion();
      smallGuard.recordInsertion();

      // Would trigger before reset
      let anomalies = smallGuard.check(makeEntry(), []);
      expect(anomalies).toHaveLength(1);

      smallGuard.resetHistory();
      anomalies = smallGuard.check(makeEntry(), []);
      expect(anomalies).toEqual([]);
    });
  });
});
