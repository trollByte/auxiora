import { getLogger } from '@auxiora/logger';
import type { EmailMessage, TriageResult, TriagePriority } from './types.js';

const logger = getLogger('email-intelligence:triage');

export interface TriageConfig {
  urgentSenders?: string[];
  vipDomains?: string[];
  spamPatterns?: string[];
  newsletterSenders?: string[];
}

const URGENT_KEYWORDS = ['urgent', 'asap', 'emergency', 'critical'];
const ACTION_KEYWORDS = ['please', 'could you', 'can you', 'would you', 'need you to', 'let me know', 'rsvp'];

export class EmailTriageEngine {
  private config: TriageConfig;

  constructor(config: TriageConfig = {}) {
    this.config = config;
  }

  triage(emails: EmailMessage[]): TriageResult[] {
    return emails.map(email => this.triageSingle(email));
  }

  triageSingle(email: EmailMessage): TriageResult {
    const urgent = this.checkUrgent(email);
    if (urgent) return urgent;

    const action = this.checkAction(email);
    if (action) return action;

    const newsletter = this.checkNewsletter(email);
    if (newsletter) return newsletter;

    const spam = this.checkSpam(email);
    if (spam) return spam;

    logger.debug('Email triaged as FYI', { emailId: email.id });
    return {
      emailId: email.id,
      priority: 'fyi',
      reason: 'No specific signals detected',
      suggestedAction: 'none',
      confidence: 0.5,
    };
  }

  private checkUrgent(email: EmailMessage): TriageResult | null {
    const senderDomain = email.from.split('@')[1]?.toLowerCase() ?? '';
    const senderAddress = email.from.toLowerCase();
    const subjectLower = email.subject.toLowerCase();

    // VIP sender
    if (this.config.urgentSenders?.some(s => senderAddress.includes(s.toLowerCase()))) {
      return this.makeResult(email.id, 'urgent', 'From VIP sender', 'reply', 0.9);
    }

    // VIP domain
    if (this.config.vipDomains?.some(d => senderDomain === d.toLowerCase())) {
      return this.makeResult(email.id, 'urgent', 'From VIP domain', 'reply', 0.9);
    }

    // High/urgent importance
    if (email.importance === 'urgent' || email.importance === 'high') {
      return this.makeResult(email.id, 'urgent', `Marked as ${email.importance} importance`, 'reply', 0.9);
    }

    // Urgent keywords in subject
    if (URGENT_KEYWORDS.some(kw => subjectLower.includes(kw))) {
      const matched = URGENT_KEYWORDS.find(kw => subjectLower.includes(kw))!;
      return this.makeResult(email.id, 'urgent', `Subject contains "${matched}"`, 'reply', 0.9);
    }

    return null;
  }

  private checkAction(email: EmailMessage): TriageResult | null {
    if (!email.isDirect) return null;

    const bodyLower = (email.body ?? email.bodyPreview).toLowerCase();

    // Check for question marks
    if (bodyLower.includes('?')) {
      return this.makeResult(email.id, 'action', 'Contains a question directed to you', 'reply', 0.8);
    }

    // Check for action keywords
    const matched = ACTION_KEYWORDS.find(kw => bodyLower.includes(kw));
    if (matched) {
      return this.makeResult(email.id, 'action', `Contains request keyword "${matched}"`, 'reply', 0.7);
    }

    return null;
  }

  private checkNewsletter(email: EmailMessage): TriageResult | null {
    if (email.hasUnsubscribe) {
      return this.makeResult(email.id, 'newsletter', 'Has List-Unsubscribe header', 'unsubscribe', 0.85);
    }

    const senderLower = email.from.toLowerCase();
    if (this.config.newsletterSenders?.some(ns => senderLower.includes(ns.toLowerCase()))) {
      return this.makeResult(email.id, 'newsletter', 'From known newsletter sender', 'unsubscribe', 0.85);
    }

    return null;
  }

  private checkSpam(email: EmailMessage): TriageResult | null {
    const senderLower = email.from.toLowerCase();

    // Check spam patterns
    if (this.config.spamPatterns?.some(sp => senderLower.includes(sp.toLowerCase()) || email.subject.toLowerCase().includes(sp.toLowerCase()))) {
      return this.makeResult(email.id, 'spam', 'Matches spam pattern', 'archive', 0.6);
    }

    // Excessive caps in subject (more than 50% uppercase, at least 5 letters)
    const letters = email.subject.replace(/[^a-zA-Z]/g, '');
    if (letters.length >= 5) {
      const upperCount = (email.subject.match(/[A-Z]/g) ?? []).length;
      if (upperCount / letters.length > 0.5) {
        return this.makeResult(email.id, 'spam', 'Subject has excessive capitalization', 'archive', 0.6);
      }
    }

    // Body contains 'unsubscribe' but no List-Unsubscribe header
    const bodyLower = (email.body ?? email.bodyPreview).toLowerCase();
    if (bodyLower.includes('unsubscribe') && !email.hasUnsubscribe) {
      return this.makeResult(email.id, 'spam', 'Contains "unsubscribe" without proper header', 'archive', 0.6);
    }

    return null;
  }

  private makeResult(
    emailId: string,
    priority: TriagePriority,
    reason: string,
    suggestedAction: TriageResult['suggestedAction'],
    confidence: number,
  ): TriageResult {
    logger.debug(`Email triaged as ${priority}`, { emailId, reason });
    return { emailId, priority, reason, suggestedAction, confidence };
  }
}
