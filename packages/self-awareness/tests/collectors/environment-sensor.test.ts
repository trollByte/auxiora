import { describe, it, expect } from 'vitest';
import { EnvironmentSensor } from '../../src/collectors/environment-sensor.js';
import type { CollectionContext } from '../../src/types.js';

function ctx(): CollectionContext {
  return { userId: 'u1', sessionId: 's1', chatId: 'c1', currentMessage: 'hello', recentMessages: [] };
}

describe('EnvironmentSensor', () => {
  it('returns environment signal', async () => {
    const collector = new EnvironmentSensor();
    const signals = await collector.collect(ctx());
    expect(signals.length).toBe(1);
    expect(signals[0].dimension).toBe('environment-sensor');
  });

  it('includes time in text', async () => {
    const collector = new EnvironmentSensor();
    const signals = await collector.collect(ctx());
    expect(signals[0].text).toMatch(/\d{1,2}:\d{2}/);
  });

  it('includes platform in data', async () => {
    const collector = new EnvironmentSensor();
    const signals = await collector.collect(ctx());
    expect(signals[0].data.platform).toBeDefined();
  });

  it('has low priority', async () => {
    const collector = new EnvironmentSensor();
    const signals = await collector.collect(ctx());
    expect(signals[0].priority).toBe(0.3);
  });

  it('has no afterResponse hook', () => {
    const collector = new EnvironmentSensor();
    expect(collector.afterResponse).toBeUndefined();
  });
});
