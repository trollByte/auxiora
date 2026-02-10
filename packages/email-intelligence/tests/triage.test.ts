import { describe, it, expect } from 'vitest';
import { EmailTriageEngine } from '../src/triage.js';
import type { EmailMessage } from '../src/types.js';

function makeEmail(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: 'msg_1',
    from: 'sender@example.com',
    to: ['me@example.com'],
    subject: 'Hello',
    bodyPreview: 'Just a normal email body.',
    receivedDateTime: '2025-01-15T10:00:00Z',
    importance: 'normal',
    isRead: false,
    hasAttachments: false,
    conversationId: 'conv_1',
    isDirect: true,
    ...overrides,
  };
}

describe('EmailTriageEngine', () => {
  const engine = new EmailTriageEngine({
    urgentSenders: ['ceo@company.com'],
    vipDomains: ['vip.org'],
    spamPatterns: ['win-a-prize'],
    newsletterSenders: ['news@updates.com'],
  });

  // --- Urgent ---

  it('should triage VIP sender as urgent', () => {
    const result = engine.triageSingle(makeEmail({ from: 'ceo@company.com' }));
    expect(result.priority).toBe('urgent');
    expect(result.reason).toContain('VIP sender');
  });

  it('should triage high importance as urgent', () => {
    const result = engine.triageSingle(makeEmail({ importance: 'high' }));
    expect(result.priority).toBe('urgent');
    expect(result.reason).toContain('high');
  });

  it('should triage subject with "ASAP" as urgent', () => {
    const result = engine.triageSingle(makeEmail({ subject: 'Need this ASAP' }));
    expect(result.priority).toBe('urgent');
    expect(result.reason).toContain('asap');
  });

  it('should triage subject with "emergency" as urgent', () => {
    const result = engine.triageSingle(makeEmail({ subject: 'Emergency: server down' }));
    expect(result.priority).toBe('urgent');
  });

  // --- Action ---

  it('should triage direct email with question mark as action', () => {
    const result = engine.triageSingle(makeEmail({
      isDirect: true,
      bodyPreview: 'Can we discuss the project timeline?',
    }));
    expect(result.priority).toBe('action');
    expect(result.reason).toContain('question');
  });

  it('should triage email with "please" request as action', () => {
    const result = engine.triageSingle(makeEmail({
      isDirect: true,
      bodyPreview: 'Please review the attached document.',
    }));
    expect(result.priority).toBe('action');
    expect(result.reason).toContain('please');
  });

  // --- Newsletter ---

  it('should triage email with hasUnsubscribe as newsletter', () => {
    const result = engine.triageSingle(makeEmail({
      hasUnsubscribe: true,
      isDirect: false,
    }));
    expect(result.priority).toBe('newsletter');
    expect(result.suggestedAction).toBe('unsubscribe');
  });

  // --- Spam ---

  it('should triage email matching spam pattern as spam', () => {
    const result = engine.triageSingle(makeEmail({
      from: 'win-a-prize@scam.com',
      isDirect: false,
    }));
    expect(result.priority).toBe('spam');
    expect(result.suggestedAction).toBe('archive');
  });

  // --- FYI ---

  it('should triage CC email as FYI', () => {
    const result = engine.triageSingle(makeEmail({
      isDirect: false,
      from: 'colleague@work.com',
      bodyPreview: 'FYI - notes from the meeting.',
    }));
    expect(result.priority).toBe('fyi');
    expect(result.suggestedAction).toBe('none');
  });

  it('should triage generic email as FYI', () => {
    const result = engine.triageSingle(makeEmail({
      isDirect: false,
      from: 'system@internal.com',
      bodyPreview: 'Build completed successfully.',
    }));
    expect(result.priority).toBe('fyi');
  });

  // --- Confidence & suggested action ---

  it('should have confidence >= 0.9 for urgent emails', () => {
    const result = engine.triageSingle(makeEmail({ importance: 'urgent' }));
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('should suggest "reply" for urgent emails', () => {
    const result = engine.triageSingle(makeEmail({ importance: 'urgent' }));
    expect(result.suggestedAction).toBe('reply');
  });

  it('should suggest "archive" for spam emails', () => {
    const result = engine.triageSingle(makeEmail({
      from: 'win-a-prize@junk.com',
      isDirect: false,
    }));
    expect(result.suggestedAction).toBe('archive');
  });

  // --- Batch triage ---

  it('should triage multiple emails at once', () => {
    const results = engine.triage([
      makeEmail({ importance: 'urgent' }),
      makeEmail({ isDirect: false }),
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].priority).toBe('urgent');
    expect(results[1].priority).toBe('fyi');
  });
});
