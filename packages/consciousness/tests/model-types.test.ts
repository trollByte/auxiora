import { describe, it, expect } from 'vitest';
import type { SelfModelSnapshot } from '../src/model/model-types.js';

describe('ModelTypes', () => {
  it('SelfModelSnapshot satisfies shape', () => {
    const snapshot: SelfModelSnapshot = {
      generatedAt: Date.now(),
      identity: {
        name: 'Auxiora',
        version: '1.4.0',
        personality: 'The Architect',
        uptime: 7200,
      },
      memory: {
        totalSessions: 42,
        totalMessages: 500,
        oldestMemory: 1000000,
        recentTopics: ['security', 'architecture'],
        activeDecisions: 3,
        pendingFollowUps: 1,
      },
      health: {
        timestamp: Date.now(),
        overall: 'healthy',
        subsystems: [],
        anomalies: [],
        reasoning: { avgResponseQuality: 0.8, domainAccuracy: 0.9, preferenceStability: 0.95 },
        resources: { memoryUsageMb: 256, cpuPercent: 10, activeConnections: 2, uptimeSeconds: 7200 },
        capabilities: { totalCapabilities: 10, healthyCapabilities: 10, degradedCapabilities: [] },
      },
      performance: {
        responseQuality: 0.8,
        domainAccuracy: 0.9,
        userSatisfaction: 'improving',
        strongDomains: ['code_engineering'],
        weakDomains: ['marketing_content'],
      },
      repair: {
        recentActions: 2,
        pendingApprovals: 0,
        lastRepairAt: Date.now() - 3600000,
      },
      selfNarrative: 'I am Auxiora v1.4.0.',
    };
    expect(snapshot.identity.name).toBe('Auxiora');
    expect(snapshot.performance.userSatisfaction).toBe('improving');
  });
});
