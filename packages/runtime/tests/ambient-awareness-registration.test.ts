import { describe, it, expect } from 'vitest';
import { AmbientAwarenessCollector } from '@auxiora/ambient';

describe('ambient awareness registration', () => {
  it('collector produces signals after pattern update', async () => {
    const collector = new AmbientAwarenessCollector();
    collector.updatePatterns([
      { id: 'p1', type: 'schedule', description: 'standup', confidence: 0.9, evidence: [], detectedAt: Date.now(), lastConfirmedAt: Date.now(), occurrences: 5 },
    ]);
    collector.updateActivity({ eventRate: 10, activeBehaviors: 2 });

    const signals = await collector.collect({
      userId: 'u1', sessionId: 's1', chatId: 'c1',
      currentMessage: 'test', recentMessages: [],
    });

    expect(signals.length).toBeGreaterThanOrEqual(2);
    expect(signals.some(s => s.dimension === 'ambient-patterns')).toBe(true);
    expect(signals.some(s => s.dimension === 'ambient-activity')).toBe(true);
  });
});
