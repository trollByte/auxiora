import { describe, it, expect } from 'vitest';
import type {
  SystemPulse,
  SubsystemStatus,
  Anomaly,
} from '../src/monitor/monitor-types.js';

describe('MonitorTypes', () => {
  it('SystemPulse satisfies healthy shape', () => {
    const pulse: SystemPulse = {
      timestamp: Date.now(),
      overall: 'healthy',
      subsystems: [
        { name: 'channels', status: 'up', lastCheck: Date.now() },
      ],
      anomalies: [],
      reasoning: {
        avgResponseQuality: 0.85,
        domainAccuracy: 0.92,
        preferenceStability: 0.95,
      },
      resources: {
        memoryUsageMb: 256,
        cpuPercent: 12,
        activeConnections: 3,
        uptimeSeconds: 7200,
      },
      capabilities: {
        totalCapabilities: 15,
        healthyCapabilities: 14,
        degradedCapabilities: ['email-channel'],
      },
    };
    expect(pulse.overall).toBe('healthy');
    expect(pulse.anomalies).toHaveLength(0);
  });

  it('Anomaly satisfies shape', () => {
    const anomaly: Anomaly = {
      subsystem: 'providers',
      severity: 'high',
      description: 'Primary provider returning 503',
      detectedAt: Date.now(),
    };
    expect(anomaly.severity).toBe('high');
  });

  it('SubsystemStatus satisfies shape with metrics', () => {
    const status: SubsystemStatus = {
      name: 'providers',
      status: 'degraded',
      lastCheck: Date.now(),
      metrics: { responseTime: 1500, errorRate: 0.15 },
    };
    expect(status.status).toBe('degraded');
    expect(status.metrics?.responseTime).toBe(1500);
  });
});
