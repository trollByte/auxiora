import { describe, it, expect } from 'vitest';
import { CapacityMonitor } from '../../src/collectors/capacity-monitor.js';
import type { CollectionContext } from '../../src/types.js';

function ctx(): CollectionContext {
  return { userId: 'u1', sessionId: 's1', chatId: 'c1', currentMessage: 'hello', recentMessages: [] };
}

describe('CapacityMonitor', () => {
  it('returns signals with capacity data', async () => {
    const collector = new CapacityMonitor();
    const signals = await collector.collect(ctx());
    expect(signals.length).toBe(1);
    expect(signals[0].dimension).toBe('capacity-monitor');
    expect(signals[0].priority).toBeGreaterThanOrEqual(0.4);
  });

  it('includes memory usage in data', async () => {
    const collector = new CapacityMonitor();
    const signals = await collector.collect(ctx());
    expect(signals[0].data.heapUsedMB).toBeDefined();
    expect(typeof signals[0].data.heapUsedMB).toBe('number');
  });

  it('includes Memory in text', async () => {
    const collector = new CapacityMonitor();
    const signals = await collector.collect(ctx());
    expect(signals[0].text).toContain('Memory:');
  });

  it('priority is at least 0.4', async () => {
    const collector = new CapacityMonitor();
    const signals = await collector.collect(ctx());
    expect(signals[0].priority).toBeGreaterThanOrEqual(0.4);
    expect(signals[0].priority).toBeLessThanOrEqual(1.0);
  });

  it('has no afterResponse hook', () => {
    const collector = new CapacityMonitor();
    expect(collector.afterResponse).toBeUndefined();
  });
});
