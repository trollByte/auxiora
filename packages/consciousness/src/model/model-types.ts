import type { SystemPulse } from '../monitor/monitor-types.js';

export interface IdentityInfo {
  name: string;
  version: string;
  personality: string;
  uptime: number;
}

export interface MemoryInfo {
  totalSessions: number;
  totalMessages: number;
  oldestMemory: number;
  recentTopics: string[];
  activeDecisions: number;
  pendingFollowUps: number;
}

export interface PerformanceInfo {
  responseQuality: number;
  domainAccuracy: number;
  userSatisfaction: 'improving' | 'stable' | 'declining';
  strongDomains: string[];
  weakDomains: string[];
}

export interface RepairInfo {
  recentActions: number;
  pendingApprovals: number;
  lastRepairAt: number | null;
}

export interface SelfModelSnapshot {
  generatedAt: number;
  identity: IdentityInfo;
  memory: MemoryInfo;
  health: SystemPulse;
  performance: PerformanceInfo;
  repair: RepairInfo;
  selfNarrative: string;
}
