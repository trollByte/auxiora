import { describe, it, expect, vi } from 'vitest';
import { AmbientPatternEngine, AmbientAwarenessCollector, AnticipationEngine } from '@auxiora/ambient';
import { evaluateConditions } from '@auxiora/behaviors';
import type { EventCondition, BehaviorEventTrigger } from '@auxiora/behaviors';
import type { TriggerEvent } from '@auxiora/connectors';

describe('ambient agent integration', () => {
  describe('Layer 1: Pattern persistence round-trip', () => {
    it('full cycle: observe -> detect -> serialize -> deserialize -> verify', () => {
      const engine = new AmbientPatternEngine();
      const base = Date.now();

      for (let i = 0; i < 7; i++) {
        const d = new Date(base);
        d.setHours(9, 0, 0, 0);
        d.setDate(d.getDate() - i);
        engine.observe({ type: 'standup', timestamp: d.getTime() });
      }

      const detected = engine.detectPatterns();
      expect(detected.length).toBeGreaterThan(0);

      const serialized = engine.serialize();
      const restored = AmbientPatternEngine.deserialize(serialized);

      expect(restored.getEventCount()).toBe(engine.getEventCount());
      expect(restored.getPatterns().length).toBe(engine.getPatterns().length);

      restored.observe({ type: 'standup', timestamp: base + 86400000 });
      expect(restored.getEventCount()).toBe(engine.getEventCount() + 1);
    });
  });

  describe('Layer 2: Awareness collector signals', () => {
    it('produces all 3 signal dimensions when data is available', async () => {
      const collector = new AmbientAwarenessCollector();

      collector.updatePatterns([
        { id: 'p1', type: 'schedule', description: 'standup at 9', confidence: 0.9, evidence: [], detectedAt: Date.now(), lastConfirmedAt: Date.now(), occurrences: 5 },
      ]);

      const fiftyMin = Date.now() + 50 * 60 * 1000;
      collector.updateAnticipations([
        { id: 'a1', description: 'upcoming standup', expectedAt: fiftyMin, confidence: 0.8, sourcePatterns: ['p1'] },
      ]);

      collector.updateActivity({ eventRate: 15, activeBehaviors: 4 });

      const signals = await collector.collect({
        userId: 'u1', sessionId: 's1', chatId: 'c1',
        currentMessage: 'test', recentMessages: [],
      });

      expect(signals).toHaveLength(3);
      expect(signals.map(s => s.dimension).sort()).toEqual([
        'ambient-activity',
        'ambient-anticipations',
        'ambient-patterns',
      ]);
    });
  });

  describe('Layer 3: Event-driven behavior triggers', () => {
    it('full routing: event -> condition match -> execution', async () => {
      const executeNow = vi.fn().mockResolvedValue({ success: true });

      const trigger: BehaviorEventTrigger = {
        source: 'github', event: 'push',
        conditions: [
          { field: 'ref', op: 'endsWith', value: '/main' },
          { field: 'forced', op: 'equals', value: false },
        ],
        combinator: 'and',
      };

      const event: TriggerEvent = {
        triggerId: 'push', connectorId: 'github',
        data: { ref: 'refs/heads/main', forced: false },
        timestamp: Date.now(),
      };

      if (trigger.source === event.connectorId && trigger.event === event.triggerId &&
          evaluateConditions(event.data, trigger.conditions, trigger.combinator)) {
        await executeNow('b1');
      }

      expect(executeNow).toHaveBeenCalledWith('b1');
    });

    it('does not fire when OR conditions all fail', () => {
      const conditions: EventCondition[] = [
        { field: 'action', op: 'equals', value: 'closed' },
        { field: 'action', op: 'equals', value: 'merged' },
      ];
      expect(evaluateConditions({ action: 'opened' }, conditions, 'or')).toBe(false);
    });
  });

  describe('Layer 4: Cross-layer data flow', () => {
    it('pattern engine feeds anticipation engine which feeds awareness', async () => {
      const patternEngine = new AmbientPatternEngine();
      const anticipationEngine = new AnticipationEngine();
      const collector = new AmbientAwarenessCollector();

      const base = Date.now();
      for (let i = 0; i < 5; i++) {
        const d = new Date(base);
        d.setHours(14, 0, 0, 0);
        d.setDate(d.getDate() - i);
        patternEngine.observe({ type: 'deploy', timestamp: d.getTime() });
      }

      patternEngine.detectPatterns();
      const storedPatterns = patternEngine.getPatterns();
      anticipationEngine.generateAnticipations(storedPatterns);

      collector.updatePatterns(storedPatterns);
      collector.updateAnticipations(anticipationEngine.getAnticipations());
      collector.updateActivity({ eventRate: patternEngine.getEventCount(), activeBehaviors: 0 });

      const signals = await collector.collect({
        userId: 'u1', sessionId: 's1', chatId: 'c1',
        currentMessage: 'test', recentMessages: [],
      });

      expect(signals.length).toBeGreaterThanOrEqual(2);
      expect(signals.some(s => s.dimension === 'ambient-patterns')).toBe(true);
      expect(signals.some(s => s.dimension === 'ambient-activity')).toBe(true);
    });
  });
});
