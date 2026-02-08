import * as crypto from 'node:crypto';
import type { AmbientPattern, Anticipation } from './types.js';

/**
 * Anticipation engine — predicts user needs based on detected patterns.
 */
export class AnticipationEngine {
  private anticipations: Map<string, Anticipation> = new Map();

  /**
   * Generate anticipations from detected patterns and current context.
   * @param patterns - Currently detected patterns.
   * @param context - Current context (time, active tasks, etc.).
   */
  generateAnticipations(
    patterns: AmbientPattern[],
    context?: { currentTime?: number; activeTaskCount?: number }
  ): Anticipation[] {
    const now = context?.currentTime ?? Date.now();
    const generated: Anticipation[] = [];

    for (const pattern of patterns) {
      if (pattern.confidence < 0.4) continue;

      switch (pattern.type) {
        case 'schedule': {
          const anticipation = this.anticipateSchedule(pattern, now);
          if (anticipation) generated.push(anticipation);
          break;
        }
        case 'preference': {
          const anticipation = this.anticipatePreference(pattern, now);
          if (anticipation) generated.push(anticipation);
          break;
        }
        case 'correlation': {
          const anticipation = this.anticipateCorrelation(pattern, now);
          if (anticipation) generated.push(anticipation);
          break;
        }
        case 'trigger': {
          const anticipation = this.anticipateTrigger(pattern, now);
          if (anticipation) generated.push(anticipation);
          break;
        }
      }
    }

    // Store generated anticipations
    for (const a of generated) {
      this.anticipations.set(a.id, a);
    }

    return generated;
  }

  /** Get all current anticipations sorted by expected time. */
  getAnticipations(): Anticipation[] {
    return Array.from(this.anticipations.values())
      .filter(a => a.expectedAt > Date.now())
      .sort((a, b) => a.expectedAt - b.expectedAt);
  }

  /** Clear expired anticipations. */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [id, a] of this.anticipations) {
      if (a.expectedAt < now) {
        this.anticipations.delete(id);
        pruned++;
      }
    }
    return pruned;
  }

  /** Reset all anticipations. */
  reset(): void {
    this.anticipations.clear();
  }

  private anticipateSchedule(pattern: AmbientPattern, now: number): Anticipation | null {
    // Extract hour from description like '... around 14:00'
    const match = pattern.description.match(/around (\d+):00/);
    if (!match) return null;

    const hour = parseInt(match[1], 10);
    const nextOccurrence = new Date(now);
    nextOccurrence.setHours(hour, 0, 0, 0);
    if (nextOccurrence.getTime() <= now) {
      nextOccurrence.setDate(nextOccurrence.getDate() + 1);
    }

    return {
      id: crypto.randomUUID(),
      description: `Based on your pattern: ${pattern.description}`,
      expectedAt: nextOccurrence.getTime(),
      confidence: pattern.confidence * 0.8,
      sourcePatterns: [pattern.id],
      suggestedAction: `Prepare for upcoming "${pattern.description.split('"')[1]}" activity`,
    };
  }

  private anticipatePreference(pattern: AmbientPattern, now: number): Anticipation | null {
    // Extract interval from description like 'every 2.5 hours'
    const match = pattern.description.match(/every ([\d.]+) hours/);
    if (!match) return null;

    const intervalHours = parseFloat(match[1]);
    const expectedAt = now + intervalHours * 60 * 60 * 1000;

    return {
      id: crypto.randomUUID(),
      description: `You typically do this every ${intervalHours} hours`,
      expectedAt,
      confidence: pattern.confidence * 0.7,
      sourcePatterns: [pattern.id],
    };
  }

  private anticipateCorrelation(pattern: AmbientPattern, now: number): Anticipation | null {
    return {
      id: crypto.randomUUID(),
      description: `When this happens: ${pattern.description}`,
      expectedAt: now + 5 * 60 * 1000, // 5 minutes from now
      confidence: pattern.confidence * 0.6,
      sourcePatterns: [pattern.id],
      suggestedAction: `Proactively prepare the follow-up action`,
    };
  }

  private anticipateTrigger(pattern: AmbientPattern, now: number): Anticipation | null {
    return {
      id: crypto.randomUUID(),
      description: `Trigger detected: ${pattern.description}`,
      expectedAt: now + 60 * 1000, // 1 minute
      confidence: pattern.confidence * 0.9,
      sourcePatterns: [pattern.id],
    };
  }
}
