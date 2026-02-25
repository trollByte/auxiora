import type { Contact, Interaction, RelationshipScore } from './types.js';

export class RelationshipScorer {
  private decayDays: number;

  constructor(config?: { decayDays?: number }) {
    this.decayDays = config?.decayDays ?? 90;
  }

  score(interactions: Interaction[]): RelationshipScore {
    if (interactions.length === 0) {
      return { strength: 0, frequency: 0, recency: Infinity, context: 'unknown' };
    }

    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    // Recency: days since most recent interaction
    const mostRecent = Math.max(...interactions.map(i => i.timestamp));
    const recency = (now - mostRecent) / (24 * 60 * 60 * 1000);

    // Frequency: interactions in last 30 days
    const recentInteractions = interactions.filter(
      i => now - i.timestamp <= thirtyDaysMs,
    );
    const frequency = recentInteractions.length;

    // Strength: weighted formula, clamped to [0, 1]
    const recencyFactor = Math.max(0, 1 - recency / this.decayDays);
    const frequencyFactor = Math.min(frequency / 10, 1);
    const strength = Math.max(0, Math.min(1, 0.4 * recencyFactor + 0.6 * frequencyFactor));

    // Context: infer from interaction types
    const context = this.inferContext(interactions);

    return { strength, frequency, recency, context };
  }

  updateRelationship(contact: Contact, interactions: Interaction[]): Contact {
    return { ...contact, relationship: this.score(interactions) };
  }

  private inferContext(interactions: Interaction[]): string {
    const counts: Record<string, number> = {};
    for (const interaction of interactions) {
      counts[interaction.type] = (counts[interaction.type] ?? 0) + 1;
    }

    const total = interactions.length;
    const emailRatio = (counts['email'] ?? 0) / total;
    const messageRatio = (counts['message'] ?? 0) / total;
    const meetingRatio = (counts['meeting'] ?? 0) / total;

    if (emailRatio > 0.5) return 'professional';
    if (messageRatio > 0.5) return 'personal';
    if (meetingRatio > 0.5) return 'colleague';
    return 'mixed';
  }
}
