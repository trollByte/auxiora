import { describe, it, expect } from 'vitest';
import { ThreadSummarizer } from '../src/thread-summarizer.js';
import type { EmailMessage } from '../src/types.js';

function makeEmail(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: 'msg_1',
    from: 'alice@example.com',
    to: ['bob@example.com'],
    subject: 'Project Alpha',
    bodyPreview: 'Here is the update.',
    receivedDateTime: '2025-01-15T10:00:00Z',
    importance: 'normal',
    isRead: true,
    hasAttachments: false,
    conversationId: 'conv_1',
    isDirect: true,
    ...overrides,
  };
}

describe('ThreadSummarizer', () => {
  const summarizer = new ThreadSummarizer();

  it('should extract participants from thread', () => {
    const messages = [
      makeEmail({ from: 'alice@example.com', to: ['bob@example.com'] }),
      makeEmail({ id: 'msg_2', from: 'bob@example.com', to: ['alice@example.com'], cc: ['carol@example.com'] }),
    ];
    const result = summarizer.summarize(messages);
    expect(result.participants).toContain('alice@example.com');
    expect(result.participants).toContain('bob@example.com');
    expect(result.participants).toContain('carol@example.com');
  });

  it('should count messages correctly', () => {
    const messages = [
      makeEmail(),
      makeEmail({ id: 'msg_2', receivedDateTime: '2025-01-15T11:00:00Z' }),
      makeEmail({ id: 'msg_3', receivedDateTime: '2025-01-15T12:00:00Z' }),
    ];
    const result = summarizer.summarize(messages);
    expect(result.messageCount).toBe(3);
  });

  it('should extract action items', () => {
    const messages = [
      makeEmail({
        body: 'We discussed the plan.\nAction: Update the roadmap\nTodo: Review the budget\nWe need to finalize the timeline.',
      }),
    ];
    const result = summarizer.summarize(messages);
    expect(result.actionItems.length).toBeGreaterThanOrEqual(3);
    expect(result.actionItems.some(item => item.includes('roadmap'))).toBe(true);
    expect(result.actionItems.some(item => item.includes('budget'))).toBe(true);
    expect(result.actionItems.some(item => item.includes('need to'))).toBe(true);
  });

  it('should extract key points with questions', () => {
    const messages = [
      makeEmail({
        body: 'When is the deadline? We confirmed the approach. The timeline looks good.',
      }),
    ];
    const result = summarizer.summarize(messages);
    expect(result.keyPoints.some(kp => kp.includes('deadline'))).toBe(true);
    expect(result.keyPoints.some(kp => kp.includes('confirmed'))).toBe(true);
  });

  it('should handle single-message thread', () => {
    const messages = [makeEmail({ body: 'Just a quick note.' })];
    const result = summarizer.summarize(messages);
    expect(result.messageCount).toBe(1);
    expect(result.conversationId).toBe('conv_1');
    expect(result.summary).toContain('1 messages');
  });
});
