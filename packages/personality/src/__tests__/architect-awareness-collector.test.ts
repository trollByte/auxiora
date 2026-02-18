import { describe, it, expect } from 'vitest';
import { ArchitectAwarenessCollector } from '../architect-awareness-collector.js';
import type { CollectionContext } from '@auxiora/self-awareness';

function ctx(): CollectionContext {
  return { userId: 'u1', sessionId: 's1', chatId: 'c1', currentMessage: 'test', recentMessages: [] };
}

describe('ArchitectAwarenessCollector', () => {
  it('should return empty when no architect output set', async () => {
    const collector = new ArchitectAwarenessCollector();
    const signals = await collector.collect(ctx());
    expect(signals).toEqual([]);
  });

  it('should emit domain signal when domain is not general', async () => {
    const collector = new ArchitectAwarenessCollector();
    collector.updateOutput({
      detectedContext: { domain: 'security_review', emotionalRegister: 'neutral', stakes: 'high', complexity: 'moderate', detectionConfidence: 0.85 },
      emotionalTrajectory: 'stable',
    });
    const signals = await collector.collect(ctx());
    expect(signals).toHaveLength(1);
    expect(signals[0].dimension).toBe('architect-context');
    expect(signals[0].priority).toBe(0.6);
    expect(signals[0].text).toContain('security_review');
    expect(signals[0].text).toContain('0.85');
  });

  it('should emit emotional trajectory signal when not stable', async () => {
    const collector = new ArchitectAwarenessCollector();
    collector.updateOutput({
      detectedContext: { domain: 'general', emotionalRegister: 'stressed', stakes: 'medium', complexity: 'low' },
      emotionalTrajectory: 'escalating',
    });
    const signals = await collector.collect(ctx());
    expect(signals).toHaveLength(1);
    expect(signals[0].dimension).toBe('architect-emotion');
    expect(signals[0].priority).toBe(0.8);
    expect(signals[0].text).toContain('escalating');
  });

  it('should emit escalation alert signal with highest priority', async () => {
    const collector = new ArchitectAwarenessCollector();
    collector.updateOutput({
      detectedContext: { domain: 'crisis_management', emotionalRegister: 'stressed', stakes: 'critical', complexity: 'high', detectionConfidence: 0.95 },
      emotionalTrajectory: 'escalating',
      escalationAlert: true,
    });
    const signals = await collector.collect(ctx());
    expect(signals).toHaveLength(3);
    const escalation = signals.find(s => s.dimension === 'architect-escalation');
    expect(escalation).toBeDefined();
    expect(escalation!.priority).toBe(1.0);
    expect(escalation!.text).toContain('escalation detected');
  });

  it('should be named "architect-bridge"', () => {
    const collector = new ArchitectAwarenessCollector();
    expect(collector.name).toBe('architect-bridge');
    expect(collector.enabled).toBe(true);
  });
});
