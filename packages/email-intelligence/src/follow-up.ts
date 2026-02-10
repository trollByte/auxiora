import * as crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import type { EmailMessage, FollowUp } from './types.js';

const logger = getLogger('email-intelligence:follow-up');

const PROMISE_PATTERNS = [
  /i[''\u2019]ll send/i,
  /i will send/i,
  /i[''\u2019]ll get back/i,
  /i will get back/i,
  /i[''\u2019]ll follow up/i,
  /i will follow up/i,
  /let me check/i,
  /i[''\u2019]ll look into/i,
  /i will look into/i,
];

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export class FollowUpTracker {
  detectPromises(sentEmail: EmailMessage): FollowUp[] {
    const body = sentEmail.body ?? sentEmail.bodyPreview;
    const sentences = body.split(/[.!?\n]+/).map(s => s.trim()).filter(Boolean);
    const followUps: FollowUp[] = [];
    const now = Date.now();

    for (const sentence of sentences) {
      for (const pattern of PROMISE_PATTERNS) {
        if (pattern.test(sentence)) {
          const dueDate = this.extractDueDate(sentence, now);
          followUps.push({
            id: crypto.randomUUID(),
            emailId: sentEmail.id,
            promiseText: sentence,
            detectedAt: now,
            dueDate,
            status: 'pending',
            reminderSent: false,
          });
          break; // One match per sentence
        }
      }
    }

    logger.debug(`Detected ${followUps.length} promises`, { emailId: sentEmail.id });
    return followUps;
  }

  checkOverdue(followUps: FollowUp[]): FollowUp[] {
    const now = Date.now();
    return followUps.filter(fu =>
      fu.status === 'pending' && fu.dueDate !== undefined && fu.dueDate < now
    );
  }

  markCompleted(followUps: FollowUp[], id: string): FollowUp[] {
    return followUps.map(fu =>
      fu.id === id ? { ...fu, status: 'completed' as const } : fu
    );
  }

  private extractDueDate(sentence: string, now: number): number | undefined {
    const lower = sentence.toLowerCase();

    // "by end of day" / "by end of week"
    if (lower.includes('by end of day') || lower.includes('by eod')) {
      const date = new Date(now);
      date.setHours(23, 59, 59, 999);
      return date.getTime();
    }

    if (lower.includes('by end of week') || lower.includes('by eow')) {
      const date = new Date(now);
      const daysUntilFriday = (5 - date.getDay() + 7) % 7 || 7;
      date.setDate(date.getDate() + daysUntilFriday);
      date.setHours(23, 59, 59, 999);
      return date.getTime();
    }

    // "by Monday", "by Tuesday", etc.
    for (let i = 0; i < DAY_NAMES.length; i++) {
      if (lower.includes(`by ${DAY_NAMES[i]}`)) {
        const date = new Date(now);
        const daysUntil = (i - date.getDay() + 7) % 7 || 7;
        date.setDate(date.getDate() + daysUntil);
        date.setHours(23, 59, 59, 999);
        return date.getTime();
      }
    }

    return undefined;
  }
}
