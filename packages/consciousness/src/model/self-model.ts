import type { SessionSummary } from '../journal/journal-types.js';
import type { SystemPulse } from '../monitor/monitor-types.js';
import type {
  SelfModelSnapshot,
  IdentityInfo,
  MemoryInfo,
  PerformanceInfo,
  RepairInfo,
} from './model-types.js';

export interface SessionJournalLike {
  getRecentSessions(limit?: number): Promise<SessionSummary[]>;
}

export interface SelfMonitorLike {
  getPulse(): SystemPulse;
}

export interface SelfRepairEngineLike {
  getRepairHistory(limit?: number): Array<{ actionId: string; executedAt: number }>;
  getPendingApprovals(): unknown[];
}

export interface DecisionLogLike {
  query(q: { status?: string; limit?: number }): Array<{ id: string; status: string }>;
  getDueFollowUps(): unknown[];
}

export interface FeedbackStoreLike {
  getInsights(): {
    weakDomains: string[];
    trend: 'improving' | 'declining' | 'stable';
    totalFeedback: number;
  };
}

export interface SelfModelDeps {
  journal: SessionJournalLike;
  monitor: SelfMonitorLike;
  repair: SelfRepairEngineLike;
  decisionLog: DecisionLogLike;
  feedbackStore: FeedbackStoreLike;
  version: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class SelfModel {
  private readonly deps: SelfModelDeps;

  constructor(deps: SelfModelDeps) {
    this.deps = deps;
  }

  async synthesize(): Promise<SelfModelSnapshot> {
    const now = Date.now();
    const pulse = this.deps.monitor.getPulse();
    const sessions = await this.deps.journal.getRecentSessions(100);
    const feedback = this.deps.feedbackStore.getInsights();
    const activeDecisions = this.deps.decisionLog.query({ status: 'active' });
    const pendingFollowUps = this.deps.decisionLog.getDueFollowUps();
    const repairHistory = this.deps.repair.getRepairHistory(100);
    const pendingApprovals = this.deps.repair.getPendingApprovals();

    const identity = this.buildIdentity(pulse);
    const memory = this.buildMemory(sessions, activeDecisions, pendingFollowUps);
    const performance = this.buildPerformance(pulse, feedback);
    const repair = this.buildRepair(repairHistory, pendingApprovals, now);
    const selfNarrative = this.buildNarrative(
      identity,
      memory,
      pulse,
      feedback,
      pendingApprovals,
    );

    return {
      generatedAt: now,
      identity,
      memory,
      health: pulse,
      performance,
      repair,
      selfNarrative,
    };
  }

  private buildIdentity(pulse: SystemPulse): IdentityInfo {
    return {
      name: 'Auxiora',
      version: this.deps.version,
      personality: 'The Architect',
      uptime: pulse.resources.uptimeSeconds,
    };
  }

  private buildMemory(
    sessions: SessionSummary[],
    activeDecisions: Array<{ id: string; status: string }>,
    pendingFollowUps: unknown[],
  ): MemoryInfo {
    const totalSessions = sessions.length;
    const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);
    const oldestMemory =
      sessions.length > 0
        ? Math.min(...sessions.map((s) => s.startTime))
        : 0;

    const domainSet = new Set<string>();
    for (const session of sessions) {
      for (const domain of session.domains) {
        domainSet.add(domain);
      }
    }
    const recentTopics = [...domainSet].slice(0, 5);

    return {
      totalSessions,
      totalMessages,
      oldestMemory,
      recentTopics,
      activeDecisions: activeDecisions.length,
      pendingFollowUps: pendingFollowUps.length,
    };
  }

  private buildPerformance(
    pulse: SystemPulse,
    feedback: ReturnType<FeedbackStoreLike['getInsights']>,
  ): PerformanceInfo {
    return {
      responseQuality: pulse.reasoning.avgResponseQuality,
      domainAccuracy: pulse.reasoning.domainAccuracy,
      userSatisfaction: feedback.trend,
      strongDomains: [],
      weakDomains: feedback.weakDomains,
    };
  }

  private buildRepair(
    repairHistory: Array<{ actionId: string; executedAt: number }>,
    pendingApprovals: unknown[],
    now: number,
  ): RepairInfo {
    const recentCutoff = now - DAY_MS;
    const recentActions = repairHistory.filter((r) => r.executedAt >= recentCutoff).length;
    const lastRepairAt =
      repairHistory.length > 0
        ? Math.max(...repairHistory.map((r) => r.executedAt))
        : null;

    return {
      recentActions,
      pendingApprovals: pendingApprovals.length,
      lastRepairAt,
    };
  }

  private formatUptime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  }

  private buildNarrative(
    identity: IdentityInfo,
    memory: MemoryInfo,
    pulse: SystemPulse,
    feedback: ReturnType<FeedbackStoreLike['getInsights']>,
    pendingApprovals: unknown[],
  ): string {
    const parts: string[] = [];

    // Sentence 1: Identity
    parts.push(
      `I am Auxiora v${identity.version}, running for ${this.formatUptime(identity.uptime)}. I use The Architect personality framework.`,
    );

    // Sentence 2: Memory
    if (memory.totalSessions === 0) {
      parts.push('I have no conversation history yet.');
    } else {
      const topicStr =
        memory.recentTopics.length > 0
          ? ` My recent focus has been on ${memory.recentTopics.join(', ')}.`
          : '';
      parts.push(
        `I remember ${memory.totalSessions} conversations with ${memory.totalMessages} messages.${topicStr}`,
      );
    }

    // Sentence 3: Health
    let healthStr = `My systems are ${pulse.overall}.`;
    if (pulse.overall !== 'healthy' && pulse.anomalies.length > 0) {
      const issues = pulse.anomalies.map((a) => a.description).join('; ');
      healthStr += ` Issues: ${issues}.`;
    }
    parts.push(healthStr);

    // Sentence 4: Satisfaction
    parts.push(`User satisfaction is ${feedback.trend}.`);

    // Sentence 5: Decisions / approvals (conditional)
    if (memory.activeDecisions > 0 || pendingApprovals.length > 0) {
      let decisionStr = `I have ${memory.activeDecisions} active decisions`;
      if (pendingApprovals.length > 0) {
        decisionStr += ` and ${pendingApprovals.length} repair actions awaiting approval`;
      }
      decisionStr += '.';
      parts.push(decisionStr);
    }

    return parts.join(' ');
  }
}
