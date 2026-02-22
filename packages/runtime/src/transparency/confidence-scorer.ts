import type { ConfidenceFactor, ConfidenceLevel } from './types.js';

export interface ConfidenceInput {
  readonly toolsUsed: readonly string[];
  readonly hasMemoryRecall: boolean;
  readonly hasUserData: boolean;
  readonly finishReason: string;
  readonly knowledgeBoundaryCorrections: number;
  readonly hedgePhraseCount: number;
  readonly escalationAlert: boolean;
}

export interface ConfidenceResult {
  readonly level: ConfidenceLevel;
  readonly score: number;
  readonly factors: readonly ConfidenceFactor[];
}

const BASE_SCORE = 0.7;
const HEDGE_THRESHOLD = 3;

export function scoreConfidence(input: ConfidenceInput): ConfidenceResult {
  let score = BASE_SCORE;
  const factors: ConfidenceFactor[] = [];

  // Positive: tool grounding
  if (input.toolsUsed.length > 0) {
    score += 0.15;
    factors.push({ signal: 'tool_grounded', impact: 'positive', detail: `Response grounded in ${input.toolsUsed.length} tool result(s)` });
  }

  // Positive: memory recall
  if (input.hasMemoryRecall) {
    score += 0.10;
    factors.push({ signal: 'memory_backed', impact: 'positive', detail: 'Response informed by memory/knowledge graph' });
  }

  // Positive: user data
  if (input.hasUserData) {
    score += 0.05;
    factors.push({ signal: 'user_data_informed', impact: 'positive', detail: 'Response references user preferences or decisions' });
  }

  // Positive: clean finish
  if (input.finishReason === 'stop') {
    score += 0.05;
    factors.push({ signal: 'clean_finish', impact: 'positive', detail: 'Model completed response normally' });
  }

  // Positive: no corrections
  if (input.knowledgeBoundaryCorrections === 0) {
    score += 0.05;
    factors.push({ signal: 'no_corrections', impact: 'positive', detail: 'No prior user corrections on this topic' });
  }

  // Negative: knowledge boundary
  if (input.knowledgeBoundaryCorrections > 0) {
    const penalty = Math.min(input.knowledgeBoundaryCorrections * 0.15, 0.30);
    score -= penalty;
    factors.push({
      signal: 'knowledge_boundary',
      impact: 'negative',
      detail: `Topic previously corrected ${input.knowledgeBoundaryCorrections} time(s) by user`,
    });
  }

  // Negative: truncated
  if (input.finishReason === 'max_tokens') {
    score -= 0.20;
    factors.push({ signal: 'truncated_response', impact: 'negative', detail: 'Response was truncated (hit token limit)' });
  }

  // Negative: hedge density
  if (input.hedgePhraseCount > HEDGE_THRESHOLD) {
    score -= 0.10;
    factors.push({ signal: 'hedge_density', impact: 'negative', detail: `${input.hedgePhraseCount} hedge phrases detected in response` });
  }

  // Negative: ungrounded (no tools, no memory, no user data)
  if (input.toolsUsed.length === 0 && !input.hasMemoryRecall && !input.hasUserData) {
    score -= 0.10;
    factors.push({ signal: 'ungrounded', impact: 'negative', detail: 'Response is pure model generation without external grounding' });
  }

  // Negative: escalation
  if (input.escalationAlert) {
    score -= 0.10;
    factors.push({ signal: 'escalation_flagged', impact: 'negative', detail: 'Personality engine flagged potential escalation' });
  }

  // Clamp and level
  score = Math.max(0.1, Math.min(1.0, score));
  const level: ConfidenceLevel = score >= 0.75 ? 'high' : score >= 0.45 ? 'medium' : 'low';

  return { level, score: Math.round(score * 100) / 100, factors };
}
