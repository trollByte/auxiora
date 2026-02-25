import { describe, it, expect, beforeEach } from 'vitest';
import { PersonalizationExporter } from '../src/personalization-export.js';
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
    provenance: overrides.provenance,
    partitionId: overrides.partitionId,
    sourceUserId: overrides.sourceUserId,
  };
}

describe('PersonalizationExporter', () => {
  let exporter: PersonalizationExporter;

  beforeEach(() => {
    exporter = new PersonalizationExporter();
  });

  it('should export all memories grouped by category', () => {
    const memories = [
      makeEntry({ id: 'a', category: 'fact' }),
      makeEntry({ id: 'b', category: 'preference' }),
      makeEntry({ id: 'c', category: 'fact' }),
    ];
    const result = exporter.export(memories);
    expect(result.memories.fact).toHaveLength(2);
    expect(result.memories.preference).toHaveLength(1);
  });

  it('should filter by specific categories', () => {
    const memories = [
      makeEntry({ id: 'a', category: 'fact' }),
      makeEntry({ id: 'b', category: 'preference' }),
      makeEntry({ id: 'c', category: 'pattern' }),
    ];
    const result = exporter.export(memories, { categories: ['fact', 'pattern'] });
    expect(result.metadata.totalEntries).toBe(2);
    expect(result.memories.fact).toHaveLength(1);
    expect(result.memories.pattern).toHaveLength(1);
    expect(result.memories.preference).toBeUndefined();
  });

  it('should filter by partition', () => {
    const memories = [
      makeEntry({ id: 'a', partitionId: 'user-1' }),
      makeEntry({ id: 'b', partitionId: 'user-2' }),
      makeEntry({ id: 'c' }), // defaults to 'global'
    ];
    const result = exporter.export(memories, { partitionId: 'user-1' });
    expect(result.metadata.totalEntries).toBe(1);
    expect(result.memories.fact[0].id).toBe('a');
  });

  it('should filter by minimum importance', () => {
    const memories = [
      makeEntry({ id: 'a', importance: 0.3 }),
      makeEntry({ id: 'b', importance: 0.7 }),
      makeEntry({ id: 'c', importance: 0.9 }),
    ];
    const result = exporter.export(memories, { minImportance: 0.5 });
    expect(result.metadata.totalEntries).toBe(2);
  });

  it('should strip provenance when includeProvenance=false', () => {
    const memories = [
      makeEntry({
        id: 'a',
        provenance: { origin: 'user_stated', sessionId: 's1' },
      }),
    ];
    const result = exporter.export(memories, { includeProvenance: false });
    expect(result.memories.fact[0].provenance).toBeUndefined();
  });

  it('should redact content when redactContent=true', () => {
    const memories = [
      makeEntry({ id: 'a', content: 'secret stuff', tags: ['personal', 'finance'] }),
    ];
    const result = exporter.export(memories, { redactContent: true });
    expect(result.memories.fact[0].content).toBe('[redacted: personal, finance]');
  });

  it('should have correct counts by category and source in summary', () => {
    const memories = [
      makeEntry({ id: 'a', category: 'fact', source: 'extracted' }),
      makeEntry({ id: 'b', category: 'fact', source: 'explicit' }),
      makeEntry({ id: 'c', category: 'preference', source: 'extracted' }),
    ];
    const result = exporter.export(memories);
    expect(result.summary.byCategory).toEqual({ fact: 2, preference: 1 });
    expect(result.summary.bySource).toEqual({ extracted: 2, explicit: 1 });
  });

  it('should compute average importance and confidence', () => {
    const memories = [
      makeEntry({ importance: 0.4, confidence: 0.6 }),
      makeEntry({ importance: 0.8, confidence: 1.0 }),
    ];
    const result = exporter.export(memories);
    expect(result.summary.averageImportance).toBeCloseTo(0.6);
    expect(result.summary.averageConfidence).toBeCloseTo(0.8);
  });

  it('should include top tags in summary', () => {
    const memories = [
      makeEntry({ tags: ['alpha', 'beta'] }),
      makeEntry({ tags: ['alpha', 'gamma'] }),
      makeEntry({ tags: ['alpha'] }),
    ];
    const result = exporter.export(memories);
    expect(result.summary.topTags[0]).toEqual({ tag: 'alpha', count: 3 });
    expect(result.summary.topTags).toHaveLength(3);
  });

  it('should include date range in metadata', () => {
    const memories = [
      makeEntry({ createdAt: 100 }),
      makeEntry({ createdAt: 500 }),
      makeEntry({ createdAt: 300 }),
    ];
    const result = exporter.export(memories);
    expect(result.metadata.dateRange.earliest).toBe(100);
    expect(result.metadata.dateRange.latest).toBe(500);
  });

  it('should list all partitions in metadata', () => {
    const memories = [
      makeEntry({ partitionId: 'user-1' }),
      makeEntry({ partitionId: 'user-2' }),
      makeEntry({}), // no partitionId => 'global'
    ];
    const result = exporter.export(memories);
    expect(result.metadata.partitions).toContain('user-1');
    expect(result.metadata.partitions).toContain('user-2');
    expect(result.metadata.partitions).toContain('global');
  });

  it('should handle empty memory array', () => {
    const result = exporter.export([]);
    expect(result.metadata.totalEntries).toBe(0);
    expect(result.summary.totalMemories).toBe(0);
    expect(result.summary.averageImportance).toBe(0);
    expect(result.summary.averageConfidence).toBe(0);
    expect(result.metadata.dateRange.earliest).toBe(0);
    expect(result.metadata.dateRange.latest).toBe(0);
    expect(result.metadata.categories).toEqual([]);
    expect(result.metadata.partitions).toEqual([]);
  });

  it('should set version to 1.0', () => {
    const result = exporter.export([]);
    expect(result.version).toBe('1.0');
  });
});
