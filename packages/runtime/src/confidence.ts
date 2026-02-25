import { getLogger } from '@auxiora/logger';

const logger = getLogger('runtime:confidence');

export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type KnowledgeSource = 'user_data' | 'inference' | 'generation' | 'tool_result' | 'search_result';

export interface ConfidenceSignal {
  /** What type of signal this is */
  source: KnowledgeSource;
  /** Confidence from this signal (0-1) */
  confidence: number;
  /** Description of the evidence */
  evidence: string;
}

export interface ConfidenceAssessment {
  /** Overall confidence level */
  level: ConfidenceLevel;
  /** Numeric score (0-1) */
  score: number;
  /** Human-readable explanation */
  explanation: string;
  /** Individual signals that contributed */
  signals: ConfidenceSignal[];
  /** Source breakdown: what percentage of the response came from each source type */
  sourceBreakdown: Record<KnowledgeSource, number>;
  /** Uncertainty markers for display */
  uncertaintyMarkers: UncertaintyMarker[];
}

export interface UncertaintyMarker {
  /** The response segment this applies to */
  segmentHint: string;
  /** What kind of knowledge this is */
  source: KnowledgeSource;
  /** Human-readable label */
  label: string;
}

export class ConfidenceAssessor {
  /**
   * Assess confidence for a response based on available signals.
   */
  assess(signals: ConfidenceSignal[]): ConfidenceAssessment {
    if (signals.length === 0) {
      return this.defaultAssessment();
    }

    // Weighted average: user_data and tool_result weigh more than generation
    const weights: Record<KnowledgeSource, number> = {
      user_data: 1.5,
      tool_result: 1.3,
      search_result: 1.2,
      inference: 0.8,
      generation: 0.5,
    };

    let weightedSum = 0;
    let totalWeight = 0;
    const sourceCounts: Record<string, number> = {};

    for (const signal of signals) {
      const weight = weights[signal.source] ?? 1;
      weightedSum += signal.confidence * weight;
      totalWeight += weight;
      sourceCounts[signal.source] = (sourceCounts[signal.source] ?? 0) + 1;
    }

    const score = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
    const level = this.scoreToLevel(score);

    // Build source breakdown (percentage)
    const sourceBreakdown: Record<string, number> = {};
    for (const [source, count] of Object.entries(sourceCounts)) {
      sourceBreakdown[source] = count / signals.length;
    }

    // Build uncertainty markers
    const markers = this.buildMarkers(signals);

    // Build explanation
    const explanation = this.buildExplanation(level, score, signals);

    logger.debug('Confidence assessed', { level, score: score.toFixed(2), signalCount: signals.length });

    return {
      level,
      score: Math.round(score * 100) / 100,
      explanation,
      signals,
      sourceBreakdown: sourceBreakdown as Record<KnowledgeSource, number>,
      uncertaintyMarkers: markers,
    };
  }

  /** Quick assessment for a fully-generated response with no grounding */
  assessGenerated(): ConfidenceAssessment {
    return this.assess([{
      source: 'generation',
      confidence: 0.5,
      evidence: 'Response generated from model knowledge',
    }]);
  }

  /** Convert a numeric score to a level */
  scoreToLevel(score: number): ConfidenceLevel {
    if (score >= 0.7) return 'high';
    if (score >= 0.4) return 'medium';
    return 'low';
  }

  private buildMarkers(signals: ConfidenceSignal[]): UncertaintyMarker[] {
    const markers: UncertaintyMarker[] = [];
    const sourceLabels: Record<KnowledgeSource, string> = {
      user_data: 'Based on your data',
      inference: 'Inferred from context',
      generation: 'AI generated',
      tool_result: 'From tool output',
      search_result: 'From web search',
    };

    // Group by source type and create one marker per type
    const seen = new Set<KnowledgeSource>();
    for (const signal of signals) {
      if (seen.has(signal.source)) continue;
      seen.add(signal.source);
      markers.push({
        segmentHint: signal.evidence,
        source: signal.source,
        label: sourceLabels[signal.source] ?? signal.source,
      });
    }

    return markers;
  }

  private buildExplanation(level: ConfidenceLevel, score: number, signals: ConfidenceSignal[]): string {
    const pct = Math.round(score * 100);
    const sources = [...new Set(signals.map(s => s.source))];
    const sourceStr = sources.join(', ');

    switch (level) {
      case 'high':
        return `High confidence (${pct}%) — grounded in ${sourceStr}`;
      case 'medium':
        return `Medium confidence (${pct}%) — partially grounded in ${sourceStr}`;
      case 'low':
        return `Low confidence (${pct}%) — mostly generated, limited grounding`;
    }
  }

  private defaultAssessment(): ConfidenceAssessment {
    return {
      level: 'low',
      score: 0.5,
      explanation: 'No confidence signals available',
      signals: [],
      sourceBreakdown: {} as Record<KnowledgeSource, number>,
      uncertaintyMarkers: [],
    };
  }
}
