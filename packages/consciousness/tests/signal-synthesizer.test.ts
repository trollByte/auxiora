import { describe, it, expect, vi } from 'vitest';
import { SignalSynthesizer } from '../src/monitor/signal-synthesizer.js';
import type {
  SignalSynthesizerDeps,
  HealthMonitorLike,
  FeedbackStoreLike,
  CorrectionStoreLike,
  PreferenceHistoryLike,
} from '../src/monitor/signal-synthesizer.js';
import type { ResourceMetrics, CapabilityMetrics } from '../src/monitor/monitor-types.js';

function makeHealthMonitor(
  overrides: Partial<ReturnType<HealthMonitorLike['getHealthState']>> = {},
): HealthMonitorLike {
  return {
    getHealthState: vi.fn(() => ({
      overall: 'healthy' as const,
      subsystems: [
        { name: 'channels', status: 'healthy', lastCheck: '2026-01-15T10:00:00.000Z' },
      ],
      issues: [],
      lastCheck: '2026-01-15T10:00:00.000Z',
      ...overrides,
    })),
  };
}

function makeFeedbackStore(
  overrides: Partial<ReturnType<FeedbackStoreLike['getInsights']>> = {},
): FeedbackStoreLike {
  return {
    getInsights: vi.fn(() => ({
      suggestedAdjustments: {},
      weakDomains: [],
      trend: 'stable' as const,
      totalFeedback: 10,
      ...overrides,
    })),
  };
}

function makeCorrectionStore(
  overrides: Partial<ReturnType<CorrectionStoreLike['getStats']>> = {},
): CorrectionStoreLike {
  return {
    getStats: vi.fn(() => ({
      totalCorrections: 0,
      topMisclassifications: [],
      correctionRate: {},
      ...overrides,
    })),
  };
}

function makePreferenceHistory(conflicts: unknown[] = []): PreferenceHistoryLike {
  return { detectConflicts: vi.fn(() => conflicts) };
}

function makeResources(overrides: Partial<ResourceMetrics> = {}): ResourceMetrics {
  return {
    memoryUsageMb: 256,
    cpuPercent: 12,
    activeConnections: 3,
    uptimeSeconds: 7200,
    ...overrides,
  };
}

function makeCapabilities(overrides: Partial<CapabilityMetrics> = {}): CapabilityMetrics {
  return {
    totalCapabilities: 15,
    healthyCapabilities: 14,
    degradedCapabilities: ['email-channel'],
    ...overrides,
  };
}

function makeDeps(overrides: Partial<SignalSynthesizerDeps> = {}): SignalSynthesizerDeps {
  return {
    healthMonitor: makeHealthMonitor(),
    feedbackStore: makeFeedbackStore(),
    correctionStore: makeCorrectionStore(),
    preferenceHistory: makePreferenceHistory(),
    getResourceMetrics: vi.fn(() => makeResources()),
    getCapabilityMetrics: vi.fn(() => makeCapabilities()),
    ...overrides,
  };
}

describe('SignalSynthesizer', () => {
  it('produces a valid SystemPulse structure', () => {
    const synth = new SignalSynthesizer(makeDeps());
    const pulse = synth.synthesize();

    expect(pulse).toHaveProperty('timestamp');
    expect(pulse).toHaveProperty('overall');
    expect(pulse).toHaveProperty('subsystems');
    expect(pulse).toHaveProperty('anomalies');
    expect(pulse).toHaveProperty('reasoning');
    expect(pulse).toHaveProperty('resources');
    expect(pulse).toHaveProperty('capabilities');
    expect(typeof pulse.timestamp).toBe('number');
  });

  it('maps healthy overall to healthy', () => {
    const synth = new SignalSynthesizer(makeDeps({
      healthMonitor: makeHealthMonitor({ overall: 'healthy' }),
    }));
    expect(synth.synthesize().overall).toBe('healthy');
  });

  it('maps degraded overall to degraded', () => {
    const synth = new SignalSynthesizer(makeDeps({
      healthMonitor: makeHealthMonitor({ overall: 'degraded' }),
    }));
    expect(synth.synthesize().overall).toBe('degraded');
  });

  it('maps unhealthy overall to critical', () => {
    const synth = new SignalSynthesizer(makeDeps({
      healthMonitor: makeHealthMonitor({ overall: 'unhealthy' }),
    }));
    expect(synth.synthesize().overall).toBe('critical');
  });

  it('converts subsystem statuses correctly', () => {
    const synth = new SignalSynthesizer(makeDeps({
      healthMonitor: makeHealthMonitor({
        subsystems: [
          { name: 'channels', status: 'healthy', lastCheck: '2026-01-15T10:00:00.000Z' },
          { name: 'providers', status: 'degraded', lastCheck: '2026-01-15T10:01:00.000Z' },
          { name: 'vault', status: 'unhealthy', lastCheck: '2026-01-15T10:02:00.000Z' },
        ],
      }),
    }));
    const pulse = synth.synthesize();

    expect(pulse.subsystems).toHaveLength(3);
    expect(pulse.subsystems[0]).toMatchObject({ name: 'channels', status: 'up' });
    expect(pulse.subsystems[1]).toMatchObject({ name: 'providers', status: 'degraded' });
    expect(pulse.subsystems[2]).toMatchObject({ name: 'vault', status: 'down' });
    // lastCheck should be a numeric timestamp
    expect(pulse.subsystems[0].lastCheck).toBe(new Date('2026-01-15T10:00:00.000Z').getTime());
  });

  it('generates anomalies from health issues', () => {
    const synth = new SignalSynthesizer(makeDeps({
      healthMonitor: makeHealthMonitor({
        issues: [
          {
            id: 'i1',
            subsystem: 'providers',
            severity: 'critical',
            description: 'Provider 503',
            detectedAt: '2026-01-15T09:55:00.000Z',
            autoFixable: false,
          },
          {
            id: 'i2',
            subsystem: 'channels',
            severity: 'warning',
            description: 'High latency',
            detectedAt: '2026-01-15T09:56:00.000Z',
            autoFixable: true,
          },
        ],
      }),
    }));
    const pulse = synth.synthesize();

    expect(pulse.anomalies).toHaveLength(2);
    expect(pulse.anomalies[0]).toMatchObject({
      subsystem: 'providers',
      severity: 'high',
      description: 'Provider 503',
    });
    expect(pulse.anomalies[0].detectedAt).toBe(new Date('2026-01-15T09:55:00.000Z').getTime());
    expect(pulse.anomalies[1]).toMatchObject({
      subsystem: 'channels',
      severity: 'low',
      description: 'High latency',
    });
  });

  it('computes avgResponseQuality based on feedback trend', () => {
    const improving = new SignalSynthesizer(makeDeps({
      feedbackStore: makeFeedbackStore({ trend: 'improving', totalFeedback: 5 }),
    }));
    expect(improving.synthesize().reasoning.avgResponseQuality).toBe(0.85);

    const stable = new SignalSynthesizer(makeDeps({
      feedbackStore: makeFeedbackStore({ trend: 'stable', totalFeedback: 5 }),
    }));
    expect(stable.synthesize().reasoning.avgResponseQuality).toBe(0.7);

    const declining = new SignalSynthesizer(makeDeps({
      feedbackStore: makeFeedbackStore({ trend: 'declining', totalFeedback: 5 }),
    }));
    expect(declining.synthesize().reasoning.avgResponseQuality).toBe(0.5);
  });

  it('returns avgResponseQuality 0.5 when no feedback', () => {
    const synth = new SignalSynthesizer(makeDeps({
      feedbackStore: makeFeedbackStore({ totalFeedback: 0, trend: 'improving' }),
    }));
    expect(synth.synthesize().reasoning.avgResponseQuality).toBe(0.5);
  });

  it('computes domainAccuracy from correction rates', () => {
    // correctionRate { a: 0.2, b: 0.4 } => avg = 0.3 => accuracy = 0.7
    const synth = new SignalSynthesizer(makeDeps({
      correctionStore: makeCorrectionStore({ correctionRate: { a: 0.2, b: 0.4 } }),
    }));
    expect(synth.synthesize().reasoning.domainAccuracy).toBeCloseTo(0.7);

    // empty rates => accuracy = 1
    const empty = new SignalSynthesizer(makeDeps({
      correctionStore: makeCorrectionStore({ correctionRate: {} }),
    }));
    expect(empty.synthesize().reasoning.domainAccuracy).toBe(1);
  });

  it('computes preferenceStability from conflicts', () => {
    // 0 conflicts => 1
    const none = new SignalSynthesizer(makeDeps({
      preferenceHistory: makePreferenceHistory([]),
    }));
    expect(none.synthesize().reasoning.preferenceStability).toBe(1);

    // 3 conflicts => 1 - 0.45 = 0.55
    const some = new SignalSynthesizer(makeDeps({
      preferenceHistory: makePreferenceHistory([{}, {}, {}]),
    }));
    expect(some.synthesize().reasoning.preferenceStability).toBeCloseTo(0.55);

    // 10 conflicts => max(0, 1 - 1.5) = 0
    const many = new SignalSynthesizer(makeDeps({
      preferenceHistory: makePreferenceHistory(new Array(10).fill({})),
    }));
    expect(many.synthesize().reasoning.preferenceStability).toBe(0);
  });

  it('passes through resource and capability metrics', () => {
    const resources = makeResources({ memoryUsageMb: 512, cpuPercent: 80 });
    const capabilities = makeCapabilities({ totalCapabilities: 20, healthyCapabilities: 18 });
    const synth = new SignalSynthesizer(makeDeps({
      getResourceMetrics: vi.fn(() => resources),
      getCapabilityMetrics: vi.fn(() => capabilities),
    }));
    const pulse = synth.synthesize();

    expect(pulse.resources).toEqual(resources);
    expect(pulse.capabilities).toEqual(capabilities);
  });
});
