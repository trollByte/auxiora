import type { Anomaly } from '../monitor/monitor-types.js';
import type { RepairAction } from './repair-types.js';
import { randomUUID } from 'node:crypto';

export interface RepairPattern {
  match: (anomaly: Anomaly) => boolean;
  rootCause: string;
  confidence: number;
  actions: () => RepairAction[];
}

export const BUILT_IN_PATTERNS: RepairPattern[] = [
  {
    match: (a) => a.subsystem === 'providers' && a.description.includes('all down'),
    rootCause: 'All providers are down — likely credential expiry or upstream outage',
    confidence: 0.9,
    actions: () => [
      {
        id: randomUUID(),
        tier: 'approve',
        description: 'Rotate provider credentials',
        command: 'rotateCredentials --subsystem providers',
        rollback: 'restoreCredentials --subsystem providers',
        estimatedImpact: 'Brief downtime during credential rotation',
      },
    ],
  },
  {
    match: (a) => a.subsystem === 'providers' && a.severity === 'high',
    rootCause: 'Provider subsystem degraded with high severity',
    confidence: 0.75,
    actions: () => [
      {
        id: randomUUID(),
        tier: 'notify',
        description: 'Failover to backup provider',
        command: 'failover --subsystem providers',
        rollback: 'revert-failover --subsystem providers',
        estimatedImpact: 'Temporary switch to backup provider',
      },
    ],
  },
  {
    match: (a) => a.subsystem === 'cache' || a.description.includes('stale'),
    rootCause: 'Stale or corrupted cache detected',
    confidence: 0.85,
    actions: () => [
      {
        id: randomUUID(),
        tier: 'auto',
        description: 'Clear stale cache entries',
        command: 'clearCache --all',
        estimatedImpact: 'Cache miss spike until entries are rebuilt',
      },
    ],
  },
  {
    match: (a) => a.subsystem === 'channels',
    rootCause: 'Channel connection lost or unstable',
    confidence: 0.8,
    actions: () => [
      {
        id: randomUUID(),
        tier: 'auto',
        description: 'Reconnect channel',
        command: 'reconnect --subsystem channels',
        estimatedImpact: 'Brief message delivery delay during reconnect',
      },
    ],
  },
  {
    match: (a) => a.subsystem === 'memory' && a.severity !== 'low',
    rootCause: 'Memory subsystem pressure detected',
    confidence: 0.7,
    actions: () => [
      {
        id: randomUUID(),
        tier: 'notify',
        description: 'Clear memory caches to reduce pressure',
        command: 'clearCaches --subsystem memory',
        rollback: 'restoreCaches --subsystem memory',
        estimatedImpact: 'Temporary performance degradation while caches rebuild',
      },
    ],
  },
];
