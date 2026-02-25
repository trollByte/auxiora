import { describe, it, expect, beforeEach } from 'vitest';
import { ResponseProvenanceTracker, type ProvenanceEntry } from '../src/response-provenance.js';

function makeEntry(overrides: Partial<ProvenanceEntry> = {}): ProvenanceEntry {
  return {
    responseId: overrides.responseId ?? 'resp-1',
    sessionId: overrides.sessionId ?? 'sess-1',
    timestamp: overrides.timestamp ?? Date.now(),
    memoryIds: overrides.memoryIds ?? [],
    contextSignals: overrides.contextSignals ?? [],
    toolCalls: overrides.toolCalls ?? [],
    enrichmentStages: overrides.enrichmentStages ?? ['MemoryStage', 'ArchitectStage'],
    model: overrides.model ?? { provider: 'anthropic', model: 'claude-3' },
    tokenUsage: overrides.tokenUsage ?? { input: 100, output: 50 },
  };
}

describe('ResponseProvenanceTracker', () => {
  let tracker: ResponseProvenanceTracker;

  beforeEach(() => {
    tracker = new ResponseProvenanceTracker();
  });

  it('record stores an entry', () => {
    const entry = makeEntry();
    tracker.record(entry);

    expect(tracker.size).toBe(1);
    expect(tracker.get('resp-1')).toBe(entry);
  });

  it('get retrieves by responseId', () => {
    const entry = makeEntry({ responseId: 'resp-42' });
    tracker.record(entry);

    const retrieved = tracker.get('resp-42');
    expect(retrieved).toBeDefined();
    expect(retrieved!.responseId).toBe('resp-42');
  });

  it('get returns undefined for unknown id', () => {
    expect(tracker.get('nonexistent')).toBeUndefined();
  });

  it('explain returns human-readable summary', () => {
    tracker.record(makeEntry({
      memoryIds: ['mem-1'],
      toolCalls: [{ toolName: 'calculator', durationMs: 10, success: true }],
    }));

    const summary = tracker.explain('resp-1');
    expect(summary).toBeDefined();
    expect(summary!.explanation).toContain('informed by');
    expect(summary!.explanation).toContain('anthropic/claude-3');
  });

  it('explain includes memory sources', () => {
    tracker.record(makeEntry({
      memoryIds: ['mem-1', 'mem-2', 'mem-3'],
    }));

    const summary = tracker.explain('resp-1')!;
    const memorySrc = summary.sources.find(s => s.type === 'memory');
    expect(memorySrc).toBeDefined();
    expect(memorySrc!.label).toBe('3 memories');
    expect(memorySrc!.detail).toContain('mem-1');
    expect(memorySrc!.detail).toContain('mem-3');
  });

  it('explain includes tool call sources', () => {
    tracker.record(makeEntry({
      toolCalls: [
        { toolName: 'calculator', durationMs: 15, success: true },
        { toolName: 'file_read', durationMs: 30, success: false },
      ],
    }));

    const summary = tracker.explain('resp-1')!;
    const toolSources = summary.sources.filter(s => s.type === 'tool');
    expect(toolSources).toHaveLength(2);
    expect(toolSources[0].label).toBe('calculator');
    expect(toolSources[0].detail).toContain('15ms');
    expect(toolSources[1].label).toBe('file_read');
    expect(toolSources[1].detail).toBe('failed');
  });

  it('explain identifies grounded responses', () => {
    tracker.record(makeEntry({
      memoryIds: ['mem-1'],
      contextSignals: [{ name: 'time_of_day', type: 'temporal', value: 'morning' }],
    }));

    const summary = tracker.explain('resp-1')!;
    expect(summary.groundedInUserData).toBe(true);
  });

  it('explain identifies non-grounded responses', () => {
    tracker.record(makeEntry());

    const summary = tracker.explain('resp-1')!;
    expect(summary.groundedInUserData).toBe(false);
  });

  it('explain identifies external sources (web search)', () => {
    tracker.record(makeEntry({
      toolCalls: [{ toolName: 'web_search', durationMs: 200, success: true }],
    }));

    const summary = tracker.explain('resp-1')!;
    expect(summary.usedExternalSources).toBe(true);
  });

  it('explain reports no external sources for non-search tools', () => {
    tracker.record(makeEntry({
      toolCalls: [{ toolName: 'calculator', durationMs: 5, success: true }],
    }));

    const summary = tracker.explain('resp-1')!;
    expect(summary.usedExternalSources).toBe(false);
  });

  it('listBySession returns session-specific entries', () => {
    tracker.record(makeEntry({ responseId: 'r1', sessionId: 'sess-a' }));
    tracker.record(makeEntry({ responseId: 'r2', sessionId: 'sess-b' }));
    tracker.record(makeEntry({ responseId: 'r3', sessionId: 'sess-a' }));

    const sessA = tracker.listBySession('sess-a');
    expect(sessA).toEqual(['r1', 'r3']);

    const sessB = tracker.listBySession('sess-b');
    expect(sessB).toEqual(['r2']);
  });

  it('size property reflects entry count', () => {
    expect(tracker.size).toBe(0);
    tracker.record(makeEntry({ responseId: 'r1' }));
    expect(tracker.size).toBe(1);
    tracker.record(makeEntry({ responseId: 'r2' }));
    expect(tracker.size).toBe(2);
  });

  it('clear removes all entries', () => {
    tracker.record(makeEntry({ responseId: 'r1' }));
    tracker.record(makeEntry({ responseId: 'r2' }));
    expect(tracker.size).toBe(2);

    tracker.clear();
    expect(tracker.size).toBe(0);
    expect(tracker.get('r1')).toBeUndefined();
  });

  it('evicts oldest entry when max entries exceeded', () => {
    const small = new ResponseProvenanceTracker(3);

    small.record(makeEntry({ responseId: 'r1', timestamp: 1000 }));
    small.record(makeEntry({ responseId: 'r2', timestamp: 2000 }));
    small.record(makeEntry({ responseId: 'r3', timestamp: 3000 }));
    expect(small.size).toBe(3);

    // Adding a 4th should evict the oldest (r1, timestamp 1000)
    small.record(makeEntry({ responseId: 'r4', timestamp: 4000 }));
    expect(small.size).toBe(3);
    expect(small.get('r1')).toBeUndefined();
    expect(small.get('r2')).toBeDefined();
    expect(small.get('r4')).toBeDefined();
  });

  it('explain returns undefined for unknown id', () => {
    expect(tracker.explain('nonexistent')).toBeUndefined();
  });
});
