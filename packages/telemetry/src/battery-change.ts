import type { TelemetryTracker } from './tracker.js';
import { SessionReflector } from './reflection.js';

/**
 * Battery Change reviewer — periodic deep self-review.
 *
 * Periodically analyze aggregated telemetry, recent
 * reflections, and generate actionable improvement suggestions.
 */
export class BatteryChangeReviewer {
  private readonly reflector: SessionReflector;

  constructor(private readonly tracker: TelemetryTracker) {
    this.reflector = new SessionReflector(tracker);
  }

  generateReport(): string {
    const allStats = this.tracker.getAllStats();
    const reflections = this.reflector.getRecentReflections(10);

    const lines: string[] = ['# Auxiora Self-Improvement Report', ''];

    // Tool Performance
    lines.push('## Tool Performance', '');
    if (allStats.length === 0) {
      lines.push('No tool invocations recorded yet.', '');
    } else {
      for (const s of allStats) {
        const pct = Math.round(s.successRate * 100);
        const status = s.successRate >= 0.8 ? 'OK' : s.successRate >= 0.5 ? 'DEGRADED' : 'CRITICAL';
        lines.push(`- **${s.tool}**: ${pct}% success (${s.totalCalls} calls, avg ${Math.round(s.avgDurationMs)}ms) [${status}]`);
        if (s.lastError && s.successRate < 0.8) {
          lines.push(`  Last error: ${s.lastError.slice(0, 200)}`);
        }
      }
      lines.push('');
    }

    // Recent Session Reflections
    if (reflections.length > 0) {
      lines.push('## Recent Session Reflections', '');
      for (const r of reflections.slice(0, 5)) {
        lines.push(`- **${r.sessionId}**: ${r.summary}`);
        for (const issue of r.issues) {
          lines.push(`  - Issue: ${issue}`);
        }
      }
      lines.push('');
    }

    // Suggestions
    lines.push('## Suggestions', '');
    const flagged = allStats.filter(s => s.successRate < 0.7 && s.totalCalls >= 5);
    if (flagged.length > 0) {
      for (const s of flagged) {
        lines.push(`- Investigate ${s.tool} failures (${Math.round(s.successRate * 100)}% success, last: ${s.lastError || 'unknown'})`);
      }
    }

    const allIssues = new Set<string>();
    for (const r of reflections) {
      for (const change of r.whatToChange) {
        allIssues.add(change);
      }
    }
    for (const issue of [...allIssues].slice(0, 5)) {
      lines.push(`- ${issue}`);
    }

    if (flagged.length === 0 && allIssues.size === 0) {
      lines.push('- All systems performing within normal parameters.');
    }
    lines.push('');

    return lines.join('\n');
  }
}
