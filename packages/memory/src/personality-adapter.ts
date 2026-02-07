import type { PersonalityAdaptation } from './types.js';
import type { MemoryStore } from './store.js';

export class PersonalityAdapter {
  constructor(private store: MemoryStore) {}

  async recordSignal(signal: PersonalityAdaptation): Promise<void> {
    const existing = await this.store.getByCategory('personality');

    // Find existing adaptation for this trait
    const match = existing.find(m => {
      try {
        const data = JSON.parse(m.content) as PersonalityAdaptation;
        return data.trait === signal.trait;
      } catch {
        return false;
      }
    });

    if (match) {
      const current = JSON.parse(match.content) as PersonalityAdaptation;
      // Accumulate signals: weighted average moving toward the new direction
      const combined: PersonalityAdaptation = {
        trait: signal.trait,
        adjustment: clamp(current.adjustment + signal.adjustment * 0.2, -1, 1),
        reason: signal.reason,
        signalCount: current.signalCount + 1,
      };
      await this.store.update(match.id, {
        content: JSON.stringify(combined),
        confidence: Math.min(0.5 + combined.signalCount * 0.05, 0.95),
      });
    } else {
      await this.store.add(
        JSON.stringify(signal),
        'personality',
        'observed',
        {
          importance: 0.6,
          confidence: 0.5,
        },
      );
    }
  }

  async getAdjustments(): Promise<PersonalityAdaptation[]> {
    const entries = await this.store.getByCategory('personality');
    const results: PersonalityAdaptation[] = [];

    for (const entry of entries) {
      try {
        const data = JSON.parse(entry.content) as PersonalityAdaptation;
        results.push(data);
      } catch {
        // Skip malformed entries
      }
    }

    return results;
  }

  async getPromptModifier(): Promise<string> {
    const adjustments = await this.getAdjustments();
    if (adjustments.length === 0) return '';

    const lines = adjustments
      .filter(a => Math.abs(a.adjustment) > 0.1)
      .map(a => {
        const direction = a.adjustment > 0 ? 'Increase' : 'Decrease';
        const magnitude = Math.abs(a.adjustment) > 0.5 ? 'significantly' : 'slightly';
        return `- ${direction} ${a.trait} ${magnitude} (${a.reason})`;
      });

    if (lines.length === 0) return '';

    return `\n\n## Personality Adaptations (learned from interactions)\n${lines.join('\n')}`;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
