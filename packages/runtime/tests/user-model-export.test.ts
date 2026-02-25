import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  UserModelExporter,
  type MemoryStatsSource,
  type PreferenceSource,
  type DecisionSource,
  type DomainProfile,
} from '../src/user-model-export.js';

describe('UserModelExporter', () => {
  let exporter: UserModelExporter;

  beforeEach(() => {
    exporter = new UserModelExporter();
  });

  it('build with no sources returns sensible defaults', async () => {
    const model = await exporter.build({});

    expect(model.displayName).toBeUndefined();
    expect(model.communication).toEqual({
      preferredStyle: 'balanced',
      preferredTone: 'friendly',
      technicalDepth: 'intermediate',
    });
    expect(model.domains).toEqual([]);
    expect(model.preferences).toEqual([]);
    expect(model.recentDecisions).toEqual([]);
    expect(model.satisfaction).toEqual({
      overallScore: 0,
      recentTrend: 'stable',
      lastFeedbackAt: 0,
    });
    expect(model.memoryStats).toEqual({
      totalMemories: 0,
      byCategory: {},
      oldestMemoryAt: 0,
      newestMemoryAt: 0,
    });
  });

  it('build with memory stats populates memory section', async () => {
    const memoryStats: MemoryStatsSource = {
      getStats: vi.fn().mockResolvedValue({
        totalMemories: 42,
        oldestMemory: 1000,
        newestMemory: 2000,
        averageImportance: 0.7,
        topTags: [{ tag: 'coding', count: 10 }],
      }),
      getByCategory: vi.fn().mockImplementation((cat: string) => {
        const counts: Record<string, number> = { preference: 5, fact: 10, context: 3, relationship: 2, pattern: 8, personality: 1 };
        return Promise.resolve(Array.from({ length: counts[cat] ?? 0 }, () => ({ category: cat })));
      }),
    };

    const model = await exporter.build({ memoryStats });

    expect(model.memoryStats.totalMemories).toBe(42);
    expect(model.memoryStats.oldestMemoryAt).toBe(1000);
    expect(model.memoryStats.newestMemoryAt).toBe(2000);
    expect(model.memoryStats.byCategory).toEqual({
      preference: 5,
      fact: 10,
      context: 3,
      relationship: 2,
      pattern: 8,
      personality: 1,
    });
  });

  it('build with preferences populates preference list', async () => {
    const preferences: PreferenceSource = {
      getAll: vi.fn().mockReturnValue([
        { key: 'theme', value: 'dark', source: 'explicit', confidence: 0.95, updatedAt: 1500 },
        { key: 'language', value: 'typescript', source: 'inferred', confidence: 0.8, updatedAt: 1600 },
      ]),
    };

    const model = await exporter.build({ preferences });

    expect(model.preferences).toHaveLength(2);
    expect(model.preferences[0]).toEqual({
      key: 'theme',
      value: 'dark',
      source: 'explicit',
      confidence: 0.95,
      updatedAt: 1500,
    });
    expect(model.preferences[1].key).toBe('language');
  });

  it('build with decisions populates decision list', async () => {
    const decisions: DecisionSource = {
      getRecent: vi.fn().mockReturnValue([
        { id: 'd1', summary: 'Migrate to ESM', status: 'active', createdAt: 1000, followUpAt: 3000 },
        { id: 'd2', summary: 'Add tests', status: 'completed', createdAt: 900 },
      ]),
    };

    const model = await exporter.build({ decisions });

    expect(model.recentDecisions).toHaveLength(2);
    expect(model.recentDecisions[0]).toEqual({
      id: 'd1',
      summary: 'Migrate to ESM',
      status: 'active',
      createdAt: 1000,
      followUpAt: 3000,
    });
    expect(model.recentDecisions[1].followUpAt).toBeUndefined();
    expect(decisions.getRecent).toHaveBeenCalledWith(10);
  });

  it('build with communication prefs overrides defaults', async () => {
    const model = await exporter.build({
      communicationPrefs: { style: 'concise', tone: 'formal', depth: 'expert' },
    });

    expect(model.communication).toEqual({
      preferredStyle: 'concise',
      preferredTone: 'formal',
      technicalDepth: 'expert',
    });
  });

  it('build with partial communication prefs fills missing with defaults', async () => {
    const model = await exporter.build({
      communicationPrefs: { style: 'verbose' },
    });

    expect(model.communication.preferredStyle).toBe('verbose');
    expect(model.communication.preferredTone).toBe('friendly');
    expect(model.communication.technicalDepth).toBe('intermediate');
  });

  it('build with domains populates domain list', async () => {
    const domains: DomainProfile[] = [
      { name: 'TypeScript', expertise: 'expert', interactionCount: 150, lastActive: 2000 },
      { name: 'Python', expertise: 'intermediate', interactionCount: 30, lastActive: 1800 },
    ];

    const model = await exporter.build({ domains });

    expect(model.domains).toHaveLength(2);
    expect(model.domains[0].name).toBe('TypeScript');
    expect(model.domains[0].expertise).toBe('expert');
  });

  it('build with satisfaction metrics populates satisfaction', async () => {
    const model = await exporter.build({
      satisfaction: { score: 0.85, trend: 'improving', lastFeedbackAt: 5000 },
    });

    expect(model.satisfaction).toEqual({
      overallScore: 0.85,
      recentTrend: 'improving',
      lastFeedbackAt: 5000,
    });
  });

  it('build with display name sets displayName', async () => {
    const model = await exporter.build({ displayName: 'Alice' });

    expect(model.displayName).toBe('Alice');
  });

  it('handles memory stats errors gracefully', async () => {
    const memoryStats: MemoryStatsSource = {
      getStats: vi.fn().mockRejectedValue(new Error('DB connection lost')),
      getByCategory: vi.fn(),
    };

    const model = await exporter.build({ memoryStats });

    expect(model.memoryStats.totalMemories).toBe(0);
    expect(model.memoryStats.byCategory).toEqual({});
  });

  it('lastUpdatedAt is a recent timestamp', async () => {
    const before = Date.now();
    const model = await exporter.build({});
    const after = Date.now();

    expect(model.lastUpdatedAt).toBeGreaterThanOrEqual(before);
    expect(model.lastUpdatedAt).toBeLessThanOrEqual(after);
  });
});
