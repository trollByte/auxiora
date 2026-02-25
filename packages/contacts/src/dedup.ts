import type { Contact } from './types.js';

export class ContactDeduplicator {
  similarity(a: Contact, b: Contact): number {
    let score = 0;

    // Email overlap: any shared email → 0.9 minimum
    const aEmails = new Set(a.emails.map(e => e.toLowerCase()));
    const hasSharedEmail = b.emails.some(e => aEmails.has(e.toLowerCase()));
    if (hasSharedEmail) {
      score = Math.max(score, 0.9);
    }

    // Name similarity
    const nameScore = this.nameSimilarity(a.displayName, b.displayName);
    score = Math.max(score, nameScore);

    // Company match adds 0.1
    if (a.company && b.company && a.company.toLowerCase() === b.company.toLowerCase()) {
      score = Math.min(1, score + 0.1);
    }

    return score;
  }

  findDuplicates(
    contacts: Contact[],
    threshold = 0.7,
  ): Array<{ contact1: Contact; contact2: Contact; similarity: number }> {
    const results: Array<{ contact1: Contact; contact2: Contact; similarity: number }> = [];

    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        const sim = this.similarity(contacts[i], contacts[j]);
        if (sim >= threshold) {
          results.push({ contact1: contacts[i], contact2: contacts[j], similarity: sim });
        }
      }
    }

    return results;
  }

  private nameSimilarity(a: string, b: string): number {
    const la = a.toLowerCase();
    const lb = b.toLowerCase();

    if (la === lb) return 1.0;
    if (la.includes(lb) || lb.includes(la)) return 0.7;

    // Character overlap ratio
    const setA = new Set(la);
    const setB = new Set(lb);
    let overlap = 0;
    for (const ch of setA) {
      if (setB.has(ch)) overlap++;
    }
    const union = new Set([...setA, ...setB]).size;
    return union > 0 ? overlap / union : 0;
  }
}
