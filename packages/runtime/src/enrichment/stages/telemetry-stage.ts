import type { EnrichmentContext, EnrichmentStage, StageResult } from '../types.js';

/** Structural type — avoids importing @auxiora/telemetry directly */
export interface TelemetryStatsLike {
  readonly tool: string;
  readonly totalCalls: number;
  readonly successRate: number;
  readonly lastError: string;
}

export class TelemetryStage implements EnrichmentStage {
  readonly name = 'telemetry';
  readonly order = 50;

  private cachedStats: TelemetryStatsLike[] = [];

  constructor(
    private readonly getFlaggedTools: () => TelemetryStatsLike[],
  ) {}

  enabled(_ctx: EnrichmentContext): boolean {
    this.cachedStats = this.getFlaggedTools();
    return this.cachedStats.length > 0;
  }

  async enrich(_ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    // Self-contained: re-fetch if enabled() wasn't called (defensive)
    const stats = this.cachedStats.length > 0 ? this.cachedStats : this.getFlaggedTools();
    if (stats.length === 0) {
      return { prompt: currentPrompt };
    }

    const lines = ['[Operational Telemetry]', 'The following tools have degraded performance:'];
    for (const s of stats) {
      const pct = Math.round(s.successRate * 100);
      let line = `- ${s.tool}: ${pct}% success rate (${s.totalCalls} calls)`;
      if (s.lastError) {
        line += ` — last error: ${s.lastError.slice(0, 150)}`;
      }
      lines.push(line);
    }
    lines.push('Consider alternative approaches if these tools fail.');
    lines.push('');

    const section = lines.join('\n');

    return {
      prompt: currentPrompt + '\n\n' + section,
      metadata: {
        flaggedTools: stats.map(s => s.tool),
      },
    };
  }
}
