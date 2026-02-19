import { describe, it, expect, vi, afterEach } from 'vitest';
import { SelfMonitor } from '../src/monitor/self-monitor.js';
import type { SystemPulse, Anomaly } from '../src/monitor/monitor-types.js';
import type { SignalSynthesizer } from '../src/monitor/signal-synthesizer.js';

function makeHealthyPulse(overrides: Partial<SystemPulse> = {}): SystemPulse {
  return {
    timestamp: Date.now(),
    overall: 'healthy',
    subsystems: [{ name: 'channels', status: 'up', lastCheck: Date.now() }],
    anomalies: [],
    reasoning: { avgResponseQuality: 0.85, domainAccuracy: 1, preferenceStability: 1 },
    resources: { memoryUsageMb: 128, cpuPercent: 12, activeConnections: 2, uptimeSeconds: 3600 },
    capabilities: { totalCapabilities: 5, healthyCapabilities: 5, degradedCapabilities: [] },
    ...overrides,
  };
}

function makeDegradedPulse(anomalies: Anomaly[]): SystemPulse {
  return makeHealthyPulse({ overall: 'degraded', anomalies });
}

function makeSynthesizer(impl: () => SystemPulse): SignalSynthesizer {
  return { synthesize: vi.fn(impl) } as unknown as SignalSynthesizer;
}

describe('SelfMonitor', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty/default pulse before start', () => {
    const synth = makeSynthesizer(() => makeHealthyPulse());
    const monitor = new SelfMonitor(synth, { intervalMs: 1000 });

    const pulse = monitor.getPulse();
    expect(pulse.overall).toBe('healthy');
    expect(pulse.timestamp).toBe(0);
    expect(pulse.subsystems).toEqual([]);
    expect(pulse.anomalies).toEqual([]);
    expect(pulse.reasoning.avgResponseQuality).toBe(0);
    expect(pulse.resources.memoryUsageMb).toBe(0);
    expect(pulse.capabilities.totalCapabilities).toBe(0);
  });

  it('getPulse returns latest pulse after start', () => {
    vi.useFakeTimers();
    const healthy = makeHealthyPulse();
    const synth = makeSynthesizer(() => healthy);
    const monitor = new SelfMonitor(synth, { intervalMs: 1000 });

    monitor.start();
    const pulse = monitor.getPulse();
    expect(pulse).toBe(healthy);
    expect(pulse.overall).toBe('healthy');
    monitor.stop();
  });

  it('updates pulse on each tick', () => {
    vi.useFakeTimers();
    const synth = makeSynthesizer(() => makeHealthyPulse());
    const monitor = new SelfMonitor(synth, { intervalMs: 1000 });

    monitor.start();
    // 1 immediate call
    expect(synth.synthesize).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(synth.synthesize).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1000);
    expect(synth.synthesize).toHaveBeenCalledTimes(3);

    monitor.stop();
  });

  it('stop prevents further ticks', () => {
    vi.useFakeTimers();
    const synth = makeSynthesizer(() => makeHealthyPulse());
    const monitor = new SelfMonitor(synth, { intervalMs: 1000 });

    monitor.start();
    expect(synth.synthesize).toHaveBeenCalledTimes(1);

    monitor.stop();

    vi.advanceTimersByTime(5000);
    expect(synth.synthesize).toHaveBeenCalledTimes(1);
  });

  it('emits anomaly when new anomaly appears', () => {
    vi.useFakeTimers();
    const anomaly: Anomaly = {
      subsystem: 'channels',
      severity: 'high',
      description: 'connection lost',
      detectedAt: Date.now(),
    };

    let callCount = 0;
    const synth = makeSynthesizer(() => {
      callCount++;
      if (callCount === 1) return makeHealthyPulse();
      return makeDegradedPulse([anomaly]);
    });

    const monitor = new SelfMonitor(synth, { intervalMs: 1000 });
    const handler = vi.fn();
    monitor.onAnomaly(handler);

    monitor.start();
    // First tick: healthy, no anomalies
    expect(handler).not.toHaveBeenCalled();

    // Second tick: degraded with anomaly
    vi.advanceTimersByTime(1000);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(anomaly);

    monitor.stop();
  });

  it('does NOT re-emit same anomaly on consecutive ticks', () => {
    vi.useFakeTimers();
    const anomaly: Anomaly = {
      subsystem: 'channels',
      severity: 'high',
      description: 'connection lost',
      detectedAt: Date.now(),
    };

    let callCount = 0;
    const synth = makeSynthesizer(() => {
      callCount++;
      if (callCount === 1) return makeHealthyPulse();
      return makeDegradedPulse([anomaly]);
    });

    const monitor = new SelfMonitor(synth, { intervalMs: 1000 });
    const handler = vi.fn();
    monitor.onAnomaly(handler);

    monitor.start();

    // Second tick: anomaly appears
    vi.advanceTimersByTime(1000);
    expect(handler).toHaveBeenCalledTimes(1);

    // Third tick: same anomaly still present, should NOT re-emit
    vi.advanceTimersByTime(1000);
    expect(handler).toHaveBeenCalledTimes(1);

    monitor.stop();
  });

  it('re-emits anomaly if it disappears and reappears', () => {
    vi.useFakeTimers();
    const anomaly: Anomaly = {
      subsystem: 'channels',
      severity: 'high',
      description: 'connection lost',
      detectedAt: Date.now(),
    };

    let callCount = 0;
    const synth = makeSynthesizer(() => {
      callCount++;
      // tick 1: healthy, tick 2: anomaly, tick 3: healthy, tick 4: anomaly again
      if (callCount % 2 === 0) return makeDegradedPulse([anomaly]);
      return makeHealthyPulse();
    });

    const monitor = new SelfMonitor(synth, { intervalMs: 1000 });
    const handler = vi.fn();
    monitor.onAnomaly(handler);

    monitor.start(); // tick 1: healthy

    vi.advanceTimersByTime(1000); // tick 2: anomaly
    expect(handler).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000); // tick 3: healthy (anomaly gone)
    expect(handler).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000); // tick 4: anomaly reappears
    expect(handler).toHaveBeenCalledTimes(2);

    monitor.stop();
  });
});
