import type { TelemetryTracker } from './tracker.js';

export interface SessionReflection {
  readonly sessionId: string;
  readonly timestamp: number;
  readonly toolsUsed: number;
  readonly overallSuccessRate: number;
  readonly issues: string[];
  readonly whatWorked: string[];
  readonly whatWasSlow: string[];
  readonly whatToChange: string[];
  readonly summary: string;
}

const SLOW_THRESHOLD_MS = 3000;
const LOW_SUCCESS_THRESHOLD = 0.7;
const MIN_CALLS_TO_FLAG = 3;

export class SessionReflector {
  constructor(private readonly tracker: TelemetryTracker) {}

  reflect(sessionId: string): SessionReflection {
    const allStats = this.tracker.getAllStats();
    const totalCalls = allStats.reduce((sum, s) => sum + s.totalCalls, 0);
    const totalSuccesses = allStats.reduce((sum, s) => sum + s.successCount, 0);
    const overallRate = totalCalls > 0 ? totalSuccesses / totalCalls : 1.0;

    const issues: string[] = [];
    const whatWorked: string[] = [];
    const whatWasSlow: string[] = [];
    const whatToChange: string[] = [];

    for (const s of allStats) {
      if (s.successRate >= 0.9 && s.totalCalls >= MIN_CALLS_TO_FLAG) {
        whatWorked.push(`${s.tool} performed reliably (${Math.round(s.successRate * 100)}% success)`);
      }

      if (s.avgDurationMs > SLOW_THRESHOLD_MS) {
        whatWasSlow.push(`${s.tool} averaged ${Math.round(s.avgDurationMs)}ms per call`);
      }

      if (s.successRate < LOW_SUCCESS_THRESHOLD && s.totalCalls >= MIN_CALLS_TO_FLAG) {
        const pct = Math.round(s.successRate * 100);
        issues.push(`${s.tool}: ${pct}% success rate (${s.failureCount} failures) — ${s.lastError || 'unknown error'}`);
        whatToChange.push(`Investigate ${s.tool} failures (${s.lastError || 'check logs'})`);
      }
    }

    if (whatWorked.length === 0 && totalCalls > 0) {
      whatWorked.push('Session completed without critical failures');
    }

    const summary = issues.length === 0
      ? `All tools performing well across ${totalCalls} invocations.`
      : `${issues.length} tool(s) degraded across ${totalCalls} invocations: ${issues.map(i => i.split(':')[0]).join(', ')}.`;

    return {
      sessionId,
      timestamp: Date.now(),
      toolsUsed: totalCalls,
      overallSuccessRate: overallRate,
      issues,
      whatWorked,
      whatWasSlow,
      whatToChange,
      summary,
    };
  }

  save(reflection: SessionReflection): void {
    this.tracker.saveReflection({
      sessionId: reflection.sessionId,
      timestamp: reflection.timestamp,
      toolsUsed: reflection.toolsUsed,
      successRate: reflection.overallSuccessRate,
      issues: reflection.issues,
      whatWorked: reflection.whatWorked,
      whatWasSlow: reflection.whatWasSlow,
      whatToChange: reflection.whatToChange,
      summary: reflection.summary,
    });
  }

  getRecentReflections(limit: number): SessionReflection[] {
    return this.tracker.getReflections(limit);
  }
}
