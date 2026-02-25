import { describe, it, expect } from 'vitest';
import { AmbientAwarenessCollector } from '../src/ambient-awareness-collector.js';
import type { CollectionContext } from '@auxiora/self-awareness';

const stubContext: CollectionContext = {
  userId: 'u1',
  sessionId: 's1',
  chatId: 'c1',
  currentMessage: 'hello',
  recentMessages: [],
};

describe('AmbientAwarenessCollector', () => {
  it('returns empty when no data has been updated', async () => {
    const collector = new AmbientAwarenessCollector();
    const signals = await collector.collect(stubContext);
    expect(signals).toEqual([]);
  });

  it('emits ambient-patterns signal for high-confidence patterns', async () => {
    const collector = new AmbientAwarenessCollector();
    collector.updatePatterns([
      { id: 'p1', type: 'schedule', description: 'standup at 9', confidence: 0.9, evidence: [], detectedAt: 0, lastConfirmedAt: 0, occurrences: 5 },
      { id: 'p2', type: 'preference', description: 'low conf', confidence: 0.2, evidence: [], detectedAt: 0, lastConfirmedAt: 0, occurrences: 1 },
      { id: 'p3', type: 'correlation', description: 'A then B', confidence: 0.8, evidence: [], detectedAt: 0, lastConfirmedAt: 0, occurrences: 3 },
      { id: 'p4', type: 'schedule', description: 'lunch at 12', confidence: 0.7, evidence: [], detectedAt: 0, lastConfirmedAt: 0, occurrences: 4 },
    ]);
    const signals = await collector.collect(stubContext);
    const patternSignal = signals.find(s => s.dimension === 'ambient-patterns');
    expect(patternSignal).toBeDefined();
    expect(patternSignal!.priority).toBe(0.5);
    // Top 3 by confidence, excluding low-conf
    expect(patternSignal!.data.count).toBe(3);
  });

  it('emits ambient-anticipations signal for upcoming predictions', async () => {
    const collector = new AmbientAwarenessCollector();
    const oneHour = Date.now() + 60 * 60 * 1000;
    collector.updateAnticipations([
      { id: 'a1', description: 'standup prep', expectedAt: oneHour - 1000, confidence: 0.8, sourcePatterns: ['p1'] },
    ]);
    const signals = await collector.collect(stubContext);
    const antSignal = signals.find(s => s.dimension === 'ambient-anticipations');
    expect(antSignal).toBeDefined();
    expect(antSignal!.priority).toBe(0.7);
  });

  it('emits ambient-activity signal when event data is provided', async () => {
    const collector = new AmbientAwarenessCollector();
    collector.updateActivity({ eventRate: 12, activeBehaviors: 3 });
    const signals = await collector.collect(stubContext);
    const actSignal = signals.find(s => s.dimension === 'ambient-activity');
    expect(actSignal).toBeDefined();
    expect(actSignal!.priority).toBe(0.3);
    expect(actSignal!.data.eventRate).toBe(12);
  });

  it('filters anticipations beyond 1 hour', async () => {
    const collector = new AmbientAwarenessCollector();
    const twoHours = Date.now() + 2 * 60 * 60 * 1000;
    collector.updateAnticipations([
      { id: 'a2', description: 'too far', expectedAt: twoHours, confidence: 0.9, sourcePatterns: [] },
    ]);
    const signals = await collector.collect(stubContext);
    const antSignal = signals.find(s => s.dimension === 'ambient-anticipations');
    expect(antSignal).toBeUndefined();
  });

  it('implements SignalCollector interface (name and enabled)', () => {
    const collector = new AmbientAwarenessCollector();
    expect(collector.name).toBe('ambient');
    expect(collector.enabled).toBe(true);
  });
});
