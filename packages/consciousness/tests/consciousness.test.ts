import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Consciousness } from '../src/consciousness.js';
import type { ConsciousnessDeps } from '../src/consciousness.js';

function makeVault(): ConsciousnessDeps['vault'] {
  const store = new Map<string, string>();
  return {
    add: vi.fn(async (name: string, value: string) => { store.set(name, value); }),
    get: vi.fn((name: string) => store.get(name)),
    has: vi.fn((name: string) => store.has(name)),
    list: vi.fn(() => [...store.keys()]),
    remove: vi.fn(async (name: string) => store.delete(name)),
  };
}

function makeDeps(overrides?: Partial<ConsciousnessDeps>): ConsciousnessDeps {
  return {
    vault: makeVault(),
    healthMonitor: {
      getHealthState: vi.fn(() => ({
        overall: 'healthy' as const,
        subsystems: [{ name: 'core', status: 'healthy', lastCheck: new Date().toISOString() }],
        issues: [],
        lastCheck: new Date().toISOString(),
      })),
    },
    feedbackStore: {
      getInsights: vi.fn(() => ({
        suggestedAdjustments: {},
        weakDomains: [],
        trend: 'stable' as const,
        totalFeedback: 5,
      })),
    },
    correctionStore: {
      getStats: vi.fn(() => ({
        totalCorrections: 0,
        topMisclassifications: [],
        correctionRate: {},
      })),
    },
    preferenceHistory: {
      detectConflicts: vi.fn(() => []),
    },
    getResourceMetrics: vi.fn(() => ({
      memoryUsageMb: 128,
      cpuPercent: 10,
      activeConnections: 2,
      uptimeSeconds: 600,
    })),
    getCapabilityMetrics: vi.fn(() => ({
      totalCapabilities: 5,
      healthyCapabilities: 5,
      degradedCapabilities: [],
    })),
    actionExecutor: vi.fn(async () => 'ok'),
    onNotify: vi.fn(),
    onApprovalRequest: vi.fn(async () => true),
    decisionLog: {
      query: vi.fn(() => []),
      getDueFollowUps: vi.fn(() => []),
    },
    version: '1.0.0-test',
    monitorIntervalMs: 1000,
    ...overrides,
  };
}

describe('Consciousness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes journal, monitor, repair, and model submodules', () => {
    const c = new Consciousness(makeDeps());
    expect(c.journal).toBeDefined();
    expect(c.monitor).toBeDefined();
    expect(c.repair).toBeDefined();
    expect(c.model).toBeDefined();
  });

  it('initialize() starts the monitor so getPulse returns a non-zero timestamp', async () => {
    const c = new Consciousness(makeDeps());
    // Before init, pulse timestamp is 0 (default empty pulse)
    expect(c.monitor.getPulse().timestamp).toBe(0);

    vi.setSystemTime(new Date('2025-06-01T00:00:00Z'));
    await c.initialize();

    expect(c.monitor.getPulse().timestamp).toBeGreaterThan(0);
    c.shutdown();
  });

  it('shutdown() stops the monitor so no further ticks occur', async () => {
    const deps = makeDeps();
    const c = new Consciousness(deps);

    vi.setSystemTime(new Date('2025-06-01T00:00:00Z'));
    await c.initialize();

    const callCountAfterInit = (deps.healthMonitor.getHealthState as ReturnType<typeof vi.fn>).mock.calls.length;

    c.shutdown();

    // Advance well past the interval; no new ticks should fire
    vi.advanceTimersByTime(5000);

    const callCountAfterShutdown = (deps.healthMonitor.getHealthState as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callCountAfterShutdown).toBe(callCountAfterInit);
  });

  it('journal integration: can record and retrieve entries', async () => {
    const c = new Consciousness(makeDeps());
    await c.initialize();

    const id = await c.journal.record({
      sessionId: 'sess-1',
      type: 'message',
      message: { role: 'user', content: 'hello world' },
      context: { domains: ['general'] },
      selfState: { health: 'healthy', activeProviders: [], uptime: 100 },
      summary: 'greeting',
    });

    expect(id).toBeTruthy();

    const entries = await c.journal.getSession('sess-1');
    expect(entries).toHaveLength(1);
    expect(entries[0].message?.content).toBe('hello world');

    c.shutdown();
  });

  it('model integration: synthesize() returns a SelfModelSnapshot', async () => {
    const c = new Consciousness(makeDeps());
    vi.setSystemTime(new Date('2025-06-01T12:00:00Z'));
    await c.initialize();

    const snapshot = await c.model.synthesize();
    expect(snapshot.generatedAt).toBeGreaterThan(0);
    expect(snapshot.identity.version).toBe('1.0.0-test');
    expect(snapshot.identity.name).toBe('Auxiora');
    expect(snapshot.health.overall).toBe('healthy');
    expect(typeof snapshot.selfNarrative).toBe('string');

    c.shutdown();
  });

  it('repair integration: can diagnose an anomaly', () => {
    const c = new Consciousness(makeDeps());

    const diagnosis = c.repair.diagnose({
      subsystem: 'vault',
      severity: 'high',
      description: 'unknown failure',
      detectedAt: Date.now(),
    });

    expect(diagnosis.id).toBeTruthy();
    expect(diagnosis.rootCause).toBeTruthy();
    expect(typeof diagnosis.confidence).toBe('number');
  });

  it('repair integration: can execute a repair action', async () => {
    const deps = makeDeps();
    const c = new Consciousness(deps);
    await c.initialize();

    const log = await c.repair.executeAction(
      {
        id: 'action-1',
        tier: 'auto',
        description: 'restart subsystem',
        command: 'restart vault',
        estimatedImpact: 'low',
      },
      'diag-1',
    );

    expect(log.status).toBe('executed');
    expect(deps.actionExecutor).toHaveBeenCalledWith('restart vault');

    c.shutdown();
  });

  it('monitor ticks periodically after initialize', async () => {
    const deps = makeDeps();
    const c = new Consciousness(deps);

    vi.setSystemTime(new Date('2025-06-01T00:00:00Z'));
    await c.initialize();

    const callsBefore = (deps.healthMonitor.getHealthState as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callsBefore).toBe(1); // initial tick on start()

    vi.advanceTimersByTime(1000); // one interval
    const callsAfter = (deps.healthMonitor.getHealthState as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callsAfter).toBe(2);

    vi.advanceTimersByTime(1000); // another interval
    const callsFinal = (deps.healthMonitor.getHealthState as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callsFinal).toBe(3);

    c.shutdown();
  });
});
