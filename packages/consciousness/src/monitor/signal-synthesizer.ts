import type {
  SystemPulse,
  SubsystemStatus,
  Anomaly,
  ReasoningMetrics,
  ResourceMetrics,
  CapabilityMetrics,
} from './monitor-types.js';

export interface HealthMonitorLike {
  getHealthState(): {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    subsystems: Array<{
      name: string;
      status: string;
      lastCheck: string;
      details?: string;
    }>;
    issues: Array<{
      id: string;
      subsystem: string;
      severity: 'warning' | 'critical';
      description: string;
      detectedAt: string;
      autoFixable: boolean;
    }>;
    lastCheck: string;
  };
}

export interface FeedbackStoreLike {
  getInsights(): {
    suggestedAdjustments: Record<string, number>;
    weakDomains: string[];
    trend: 'improving' | 'declining' | 'stable';
    totalFeedback: number;
  };
}

export interface CorrectionStoreLike {
  getStats(): {
    totalCorrections: number;
    topMisclassifications: Array<{ from: string; to: string; count: number }>;
    correctionRate: Record<string, number>;
  };
}

export interface PreferenceHistoryLike {
  detectConflicts(): unknown[];
}

export interface SignalSynthesizerDeps {
  healthMonitor: HealthMonitorLike;
  feedbackStore: FeedbackStoreLike;
  correctionStore: CorrectionStoreLike;
  preferenceHistory: PreferenceHistoryLike;
  getResourceMetrics: () => ResourceMetrics;
  getCapabilityMetrics: () => CapabilityMetrics;
}

function mapOverall(
  overall: 'healthy' | 'degraded' | 'unhealthy',
): SystemPulse['overall'] {
  if (overall === 'unhealthy') return 'critical';
  return overall;
}

function mapSubsystemStatus(status: string): SubsystemStatus['status'] {
  if (status === 'healthy') return 'up';
  if (status === 'degraded') return 'degraded';
  return 'down';
}

function mapIssueSeverity(severity: 'warning' | 'critical'): Anomaly['severity'] {
  return severity === 'critical' ? 'high' : 'low';
}

function computeReasoning(
  feedbackStore: FeedbackStoreLike,
  correctionStore: CorrectionStoreLike,
  preferenceHistory: PreferenceHistoryLike,
): ReasoningMetrics {
  const insights = feedbackStore.getInsights();
  const stats = correctionStore.getStats();
  const conflicts = preferenceHistory.detectConflicts();

  // avgResponseQuality: trend-based, 0.5 if no feedback
  let avgResponseQuality: number;
  if (insights.totalFeedback === 0) {
    avgResponseQuality = 0.5;
  } else if (insights.trend === 'improving') {
    avgResponseQuality = 0.85;
  } else if (insights.trend === 'stable') {
    avgResponseQuality = 0.7;
  } else {
    avgResponseQuality = 0.5;
  }

  // domainAccuracy: 1 - avg(correctionRates), clamped [0,1]
  const rates = Object.values(stats.correctionRate);
  let domainAccuracy: number;
  if (rates.length === 0) {
    domainAccuracy = 1;
  } else {
    const avg = rates.reduce((sum, r) => sum + r, 0) / rates.length;
    domainAccuracy = Math.max(0, Math.min(1, 1 - avg));
  }

  // preferenceStability: max(0, 1 - conflicts.length * 0.15)
  const preferenceStability = Math.max(0, 1 - conflicts.length * 0.15);

  return { avgResponseQuality, domainAccuracy, preferenceStability };
}

export class SignalSynthesizer {
  private readonly deps: SignalSynthesizerDeps;

  constructor(deps: SignalSynthesizerDeps) {
    this.deps = deps;
  }

  synthesize(): SystemPulse {
    const healthState = this.deps.healthMonitor.getHealthState();

    const overall = mapOverall(healthState.overall);

    const subsystems: SubsystemStatus[] = healthState.subsystems.map((s) => ({
      name: s.name,
      status: mapSubsystemStatus(s.status),
      lastCheck: new Date(s.lastCheck).getTime(),
    }));

    const anomalies: Anomaly[] = healthState.issues.map((issue) => ({
      subsystem: issue.subsystem,
      severity: mapIssueSeverity(issue.severity),
      description: issue.description,
      detectedAt: new Date(issue.detectedAt).getTime(),
    }));

    const reasoning = computeReasoning(
      this.deps.feedbackStore,
      this.deps.correctionStore,
      this.deps.preferenceHistory,
    );

    const resources = this.deps.getResourceMetrics();
    const capabilities = this.deps.getCapabilityMetrics();

    return {
      timestamp: Date.now(),
      overall,
      subsystems,
      anomalies,
      reasoning,
      resources,
      capabilities,
    };
  }
}
