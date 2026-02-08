import type { ModeId, ModeTemplate, ModeDetectionResult, SessionModeState } from './types.js';

const TASK_TYPE_BOOSTS: Record<string, Partial<Record<ModeId, number>>> = {
  code: { operator: 0.15 },
  reasoning: { analyst: 0.1, socratic: 0.1 },
  creative: { writer: 0.15 },
  fast: { operator: 0.1 },
};

const HYSTERESIS_BONUS = 0.05;

export class ModeDetector {
  private modes: Map<ModeId, ModeTemplate>;

  constructor(modes: Map<ModeId, ModeTemplate>) {
    this.modes = modes;
  }

  detect(
    message: string,
    context?: { taskType?: string; currentState?: SessionModeState },
  ): ModeDetectionResult | null {
    if (!message || message.length < 3) return null;

    const lowerMessage = message.toLowerCase();
    const scores = new Map<ModeId, number>();

    for (const [id, mode] of this.modes) {
      let score = 0;
      for (const signal of mode.signals) {
        if (lowerMessage.includes(signal.phrase)) {
          score += signal.weight;
        }
      }
      if (score > 0) {
        scores.set(id, score);
      }
    }

    if (scores.size === 0) return null;

    // Apply task-type boosts
    if (context?.taskType) {
      const boosts = TASK_TYPE_BOOSTS[context.taskType];
      if (boosts) {
        for (const [modeId, boost] of Object.entries(boosts)) {
          const current = scores.get(modeId as ModeId) ?? 0;
          if (current > 0) {
            scores.set(modeId as ModeId, current + boost);
          }
        }
      }
    }

    // Apply hysteresis for current mode
    if (context?.currentState?.activeMode && context.currentState.activeMode !== 'auto' && context.currentState.activeMode !== 'off') {
      const currentMode = context.currentState.activeMode as ModeId;
      const current = scores.get(currentMode);
      if (current !== undefined) {
        scores.set(currentMode, current + HYSTERESIS_BONUS);
      }
    }

    // Normalize scores
    const maxScore = Math.max(...scores.values());
    const candidates: Array<{ mode: ModeId; score: number }> = [];
    for (const [mode, score] of scores) {
      candidates.push({ mode, score: score / maxScore });
    }
    candidates.sort((a, b) => b.score - a.score);

    const best = candidates[0];
    // Confidence is based on the raw normalized score
    const confidence = best.score;

    if (confidence < 0.4) return null;

    return {
      mode: best.mode,
      confidence,
      candidates,
    };
  }
}
