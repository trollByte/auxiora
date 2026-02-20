import type { SignalCollector, AwarenessSignal, CollectionContext } from '@auxiora/self-awareness';
import type { AmbientPattern, Anticipation } from './types.js';

interface ActivitySnapshot {
  eventRate: number;
  activeBehaviors: number;
}

export class AmbientAwarenessCollector implements SignalCollector {
  readonly name = 'ambient';
  enabled = true;

  private patterns: AmbientPattern[] = [];
  private anticipations: Anticipation[] = [];
  private activity: ActivitySnapshot | null = null;

  updatePatterns(patterns: AmbientPattern[]): void {
    this.patterns = patterns;
  }

  updateAnticipations(anticipations: Anticipation[]): void {
    this.anticipations = anticipations;
  }

  updateActivity(snapshot: ActivitySnapshot): void {
    this.activity = snapshot;
  }

  async collect(_context: CollectionContext): Promise<AwarenessSignal[]> {
    const signals: AwarenessSignal[] = [];

    // Top 3 high-confidence patterns
    const topPatterns = this.patterns
      .filter(p => p.confidence >= 0.3)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    if (topPatterns.length > 0) {
      signals.push({
        dimension: 'ambient-patterns',
        priority: 0.5,
        text: topPatterns.map(p => `${p.description} (${(p.confidence * 100).toFixed(0)}%)`).join('; '),
        data: { count: topPatterns.length, patterns: topPatterns.map(p => ({ id: p.id, description: p.description, confidence: p.confidence })) },
      });
    }

    // Upcoming anticipations within 1 hour
    const oneHourFromNow = Date.now() + 60 * 60 * 1000;
    const upcoming = this.anticipations.filter(a => a.expectedAt <= oneHourFromNow && a.expectedAt > Date.now());

    if (upcoming.length > 0) {
      signals.push({
        dimension: 'ambient-anticipations',
        priority: 0.7,
        text: upcoming.map(a => a.description).join('; '),
        data: { count: upcoming.length, anticipations: upcoming.map(a => ({ id: a.id, description: a.description, expectedAt: a.expectedAt })) },
      });
    }

    // Activity snapshot
    if (this.activity) {
      signals.push({
        dimension: 'ambient-activity',
        priority: 0.3,
        text: `Event rate: ${this.activity.eventRate}/window, active behaviors: ${this.activity.activeBehaviors}`,
        data: { eventRate: this.activity.eventRate, activeBehaviors: this.activity.activeBehaviors },
      });
    }

    return signals;
  }
}
