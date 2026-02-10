import { describe, it, expect } from 'vitest';
import { FollowUpTracker } from '../src/follow-up.js';
import type { EmailMessage } from '../src/types.js';

function makeSentEmail(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: 'sent_1',
    from: 'me@example.com',
    to: ['recipient@example.com'],
    subject: 'Re: Project update',
    bodyPreview: '',
    receivedDateTime: '2025-01-15T10:00:00Z',
    importance: 'normal',
    isRead: true,
    hasAttachments: false,
    conversationId: 'conv_1',
    isDirect: true,
    ...overrides,
  };
}

describe('FollowUpTracker', () => {
  const tracker = new FollowUpTracker();

  it('should detect "I\'ll send" promise', () => {
    const email = makeSentEmail({ body: "I'll send you the report tomorrow." });
    const followUps = tracker.detectPromises(email);
    expect(followUps).toHaveLength(1);
    expect(followUps[0].promiseText).toContain("send");
    expect(followUps[0].status).toBe('pending');
  });

  it('should detect "I\'ll get back to you" promise', () => {
    const email = makeSentEmail({ body: "I'll get back to you on this by Friday." });
    const followUps = tracker.detectPromises(email);
    expect(followUps).toHaveLength(1);
    expect(followUps[0].promiseText).toContain("get back");
  });

  it('should detect multiple promises in one email', () => {
    const email = makeSentEmail({
      body: "I'll send the report. Let me check on the budget. I will follow up with the team.",
    });
    const followUps = tracker.detectPromises(email);
    expect(followUps.length).toBeGreaterThanOrEqual(3);
  });

  it('should not detect promises in normal email', () => {
    const email = makeSentEmail({ body: 'Thanks for the update. Looks good to me.' });
    const followUps = tracker.detectPromises(email);
    expect(followUps).toHaveLength(0);
  });

  it('should return overdue follow-ups', () => {
    const pastDate = Date.now() - 86400000; // 1 day ago
    const futureDate = Date.now() + 86400000; // 1 day from now
    const followUps = [
      {
        id: 'fu_1',
        emailId: 'sent_1',
        promiseText: "I'll send it",
        detectedAt: pastDate - 86400000,
        dueDate: pastDate,
        status: 'pending' as const,
        reminderSent: false,
      },
      {
        id: 'fu_2',
        emailId: 'sent_2',
        promiseText: "I'll follow up",
        detectedAt: Date.now(),
        dueDate: futureDate,
        status: 'pending' as const,
        reminderSent: false,
      },
    ];
    const overdue = tracker.checkOverdue(followUps);
    expect(overdue).toHaveLength(1);
    expect(overdue[0].id).toBe('fu_1');
  });

  it('should mark follow-up as completed', () => {
    const followUps = [
      {
        id: 'fu_1',
        emailId: 'sent_1',
        promiseText: "I'll send it",
        detectedAt: Date.now(),
        status: 'pending' as const,
        reminderSent: false,
      },
      {
        id: 'fu_2',
        emailId: 'sent_2',
        promiseText: "I'll check",
        detectedAt: Date.now(),
        status: 'pending' as const,
        reminderSent: false,
      },
    ];
    const updated = tracker.markCompleted(followUps, 'fu_1');
    expect(updated[0].status).toBe('completed');
    expect(updated[1].status).toBe('pending');
  });
});
