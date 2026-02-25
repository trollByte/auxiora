import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelfModel } from '../src/model/self-model.js';
import type {
  SelfModelDeps,
  SessionJournalLike,
  SelfMonitorLike,
  SelfRepairEngineLike,
  DecisionLogLike,
  FeedbackStoreLike,
} from '../src/model/self-model.js';
import type { SystemPulse } from '../src/monitor/monitor-types.js';
import type { SessionSummary } from '../src/journal/journal-types.js';

function makePulse(overrides: Partial<SystemPulse> = {}): SystemPulse {
  return {
    timestamp: Date.now(),
    overall: 'healthy',
    subsystems: [],
    anomalies: [],
    reasoning: {
      avgResponseQuality: 0.85,
      domainAccuracy: 0.9,
      preferenceStability: 0.95,
    },
    resources: {
      memoryUsageMb: 256,
      cpuPercent: 12,
      activeConnections: 3,
      uptimeSeconds: 3600,
    },
    capabilities: {
      totalCapabilities: 10,
      healthyCapabilities: 10,
      degradedCapabilities: [],
    },
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: overrides.sessionId ?? 'sess-1',
    startTime: overrides.startTime ?? 1000,
    endTime: overrides.endTime ?? 2000,
    messageCount: overrides.messageCount ?? 5,
    domains: overrides.domains ?? ['code_engineering'],
    decisions: overrides.decisions ?? [],
    corrections: overrides.corrections ?? 0,
    satisfaction: overrides.satisfaction ?? 'positive',
    summary: overrides.summary ?? 'A session.',
  };
}

function createMockDeps(overrides: Partial<SelfModelDeps> = {}): SelfModelDeps {
  const journal: SessionJournalLike = {
    getRecentSessions: vi.fn(async () => [
      makeSession({ sessionId: 'sess-1', startTime: 1000, messageCount: 5, domains: ['code_engineering'] }),
      makeSession({ sessionId: 'sess-2', startTime: 2000, messageCount: 3, domains: ['debugging', 'security_review'] }),
    ]),
  };

  const monitor: SelfMonitorLike = {
    getPulse: vi.fn(() => makePulse()),
  };

  const repair: SelfRepairEngineLike = {
    getRepairHistory: vi.fn(() => [
      { actionId: 'r-1', executedAt: Date.now() - 1000 },
      { actionId: 'r-2', executedAt: Date.now() - 2 * 24 * 60 * 60 * 1000 },
    ]),
    getPendingApprovals: vi.fn(() => [{ id: 'pa-1' }]),
  };

  const decisionLog: DecisionLogLike = {
    query: vi.fn(() => [
      { id: 'd-1', status: 'active' },
      { id: 'd-2', status: 'active' },
    ]),
    getDueFollowUps: vi.fn(() => [{ id: 'fu-1' }]),
  };

  const feedbackStore: FeedbackStoreLike = {
    getInsights: vi.fn(() => ({
      weakDomains: ['sales_pitch'],
      trend: 'improving' as const,
      totalFeedback: 42,
    })),
  };

  return {
    journal: overrides.journal ?? journal,
    monitor: overrides.monitor ?? monitor,
    repair: overrides.repair ?? repair,
    decisionLog: overrides.decisionLog ?? decisionLog,
    feedbackStore: overrides.feedbackStore ?? feedbackStore,
    version: overrides.version ?? '1.5.0',
  };
}

describe('SelfModel', () => {
  let deps: SelfModelDeps;
  let model: SelfModel;

  beforeEach(() => {
    deps = createMockDeps();
    model = new SelfModel(deps);
  });

  describe('synthesize()', () => {
    it('returns a complete SelfModelSnapshot with all required fields', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot).toHaveProperty('generatedAt');
      expect(snapshot).toHaveProperty('identity');
      expect(snapshot).toHaveProperty('memory');
      expect(snapshot).toHaveProperty('health');
      expect(snapshot).toHaveProperty('performance');
      expect(snapshot).toHaveProperty('repair');
      expect(snapshot).toHaveProperty('selfNarrative');
      expect(typeof snapshot.generatedAt).toBe('number');
      expect(typeof snapshot.selfNarrative).toBe('string');
    });

    it('sets generatedAt to approximately now', async () => {
      const before = Date.now();
      const snapshot = await model.synthesize();
      const after = Date.now();

      expect(snapshot.generatedAt).toBeGreaterThanOrEqual(before);
      expect(snapshot.generatedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('identity', () => {
    it('has correct name, version, personality, and uptime', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot.identity.name).toBe('Auxiora');
      expect(snapshot.identity.version).toBe('1.5.0');
      expect(snapshot.identity.personality).toBe('The Architect');
      expect(snapshot.identity.uptime).toBe(3600);
    });

    it('reflects the version passed via deps', async () => {
      const customDeps = createMockDeps({ version: '2.0.0-beta' });
      const customModel = new SelfModel(customDeps);
      const snapshot = await customModel.synthesize();

      expect(snapshot.identity.version).toBe('2.0.0-beta');
    });
  });

  describe('memory', () => {
    it('aggregates session counts and message totals', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot.memory.totalSessions).toBe(2);
      expect(snapshot.memory.totalMessages).toBe(8); // 5 + 3
    });

    it('finds the oldest memory timestamp', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot.memory.oldestMemory).toBe(1000);
    });

    it('extracts unique domains as recent topics (max 5)', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot.memory.recentTopics).toContain('code_engineering');
      expect(snapshot.memory.recentTopics).toContain('debugging');
      expect(snapshot.memory.recentTopics).toContain('security_review');
      expect(snapshot.memory.recentTopics.length).toBeLessThanOrEqual(5);
    });

    it('counts active decisions from the decision log', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot.memory.activeDecisions).toBe(2);
      expect(deps.decisionLog.query).toHaveBeenCalledWith({ status: 'active' });
    });

    it('counts pending follow-ups', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot.memory.pendingFollowUps).toBe(1);
    });
  });

  describe('health', () => {
    it('includes the current system pulse', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot.health.overall).toBe('healthy');
      expect(snapshot.health.reasoning.avgResponseQuality).toBe(0.85);
      expect(snapshot.health.resources.uptimeSeconds).toBe(3600);
    });
  });

  describe('performance', () => {
    it('maps response quality and domain accuracy from pulse', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot.performance.responseQuality).toBe(0.85);
      expect(snapshot.performance.domainAccuracy).toBe(0.9);
    });

    it('maps feedback insights to satisfaction and weak domains', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot.performance.userSatisfaction).toBe('improving');
      expect(snapshot.performance.weakDomains).toEqual(['sales_pitch']);
    });
  });

  describe('repair', () => {
    it('counts recent actions from the last 24 hours', async () => {
      const snapshot = await model.synthesize();

      // r-1 is 1s ago (within 24h), r-2 is 2 days ago (outside 24h)
      expect(snapshot.repair.recentActions).toBe(1);
    });

    it('counts pending approvals', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot.repair.pendingApprovals).toBe(1);
    });

    it('sets lastRepairAt to the most recent repair timestamp', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot.repair.lastRepairAt).toBeGreaterThan(0);
      // lastRepairAt should be the more recent one (r-1)
      expect(snapshot.repair.lastRepairAt).toBeGreaterThan(
        Date.now() - 5000,
      );
    });
  });

  describe('selfNarrative', () => {
    it('contains identity information', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot.selfNarrative).toContain('I am Auxiora v1.5.0');
      expect(snapshot.selfNarrative).toContain('The Architect personality framework');
    });

    it('contains memory summary with session and message counts', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot.selfNarrative).toContain('I remember 2 conversations with 8 messages');
    });

    it('contains health status', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot.selfNarrative).toContain('My systems are healthy');
    });

    it('contains user satisfaction trend', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot.selfNarrative).toContain('User satisfaction is improving');
    });

    it('includes active decisions and pending approvals when present', async () => {
      const snapshot = await model.synthesize();

      expect(snapshot.selfNarrative).toContain('2 active decisions');
      expect(snapshot.selfNarrative).toContain('1 repair actions awaiting approval');
    });

    it('includes degraded health issues in narrative', async () => {
      const degradedDeps = createMockDeps({
        monitor: {
          getPulse: vi.fn(() =>
            makePulse({
              overall: 'degraded',
              anomalies: [
                {
                  subsystem: 'memory',
                  severity: 'medium',
                  description: 'High memory usage',
                  detectedAt: Date.now(),
                },
              ],
            }),
          ),
        },
      });
      const degradedModel = new SelfModel(degradedDeps);
      const snapshot = await degradedModel.synthesize();

      expect(snapshot.selfNarrative).toContain('My systems are degraded');
      expect(snapshot.selfNarrative).toContain('High memory usage');
    });
  });

  describe('empty state', () => {
    it('handles no sessions gracefully', async () => {
      const emptyDeps = createMockDeps({
        journal: {
          getRecentSessions: vi.fn(async () => []),
        },
        decisionLog: {
          query: vi.fn(() => []),
          getDueFollowUps: vi.fn(() => []),
        },
        repair: {
          getRepairHistory: vi.fn(() => []),
          getPendingApprovals: vi.fn(() => []),
        },
      });
      const emptyModel = new SelfModel(emptyDeps);
      const snapshot = await emptyModel.synthesize();

      expect(snapshot.memory.totalSessions).toBe(0);
      expect(snapshot.memory.totalMessages).toBe(0);
      expect(snapshot.memory.oldestMemory).toBe(0);
      expect(snapshot.memory.recentTopics).toEqual([]);
      expect(snapshot.memory.activeDecisions).toBe(0);
      expect(snapshot.repair.recentActions).toBe(0);
      expect(snapshot.repair.lastRepairAt).toBeNull();
      expect(snapshot.selfNarrative).toContain('I have no conversation history yet');
      // No decisions sentence when activeDecisions is 0 and no pending approvals
      expect(snapshot.selfNarrative).not.toContain('active decisions');
    });
  });
});
