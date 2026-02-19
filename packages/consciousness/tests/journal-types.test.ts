import { describe, it, expect } from 'vitest';
import type {
  JournalEntry,
  SessionSummary,
  JournalSearchQuery,
} from '../src/journal/journal-types.js';

describe('JournalTypes', () => {
  it('JournalEntry satisfies shape with message type', () => {
    const entry: JournalEntry = {
      id: 'entry-1',
      sessionId: 'session-abc',
      timestamp: Date.now(),
      type: 'message',
      message: {
        role: 'user',
        content: 'Hello',
        tokens: 5,
      },
      context: {
        domains: ['general'],
      },
      selfState: {
        health: 'healthy',
        activeProviders: ['openai'],
        uptime: 3600,
      },
    };
    expect(entry.type).toBe('message');
    expect(entry.message?.role).toBe('user');
  });

  it('JournalEntry satisfies shape with decision type', () => {
    const entry: JournalEntry = {
      id: 'entry-2',
      sessionId: 'session-abc',
      timestamp: Date.now(),
      type: 'decision',
      context: {
        domains: ['architecture_design'],
        activeDecisions: ['dec-1'],
      },
      selfState: {
        health: 'healthy',
        activeProviders: ['anthropic'],
        uptime: 7200,
      },
    };
    expect(entry.type).toBe('decision');
    expect(entry.message).toBeUndefined();
  });

  it('SessionSummary satisfies shape', () => {
    const summary: SessionSummary = {
      sessionId: 'session-abc',
      startTime: 1000,
      endTime: 2000,
      messageCount: 10,
      domains: ['code_engineering', 'debugging'],
      decisions: ['dec-1'],
      corrections: 2,
      satisfaction: 'positive',
      summary: 'Worked on code engineering and debugging.',
    };
    expect(summary.messageCount).toBe(10);
    expect(summary.satisfaction).toBe('positive');
  });

  it('JournalSearchQuery satisfies shape', () => {
    const query: JournalSearchQuery = {
      text: 'authentication',
      domains: ['security_review'],
      dateRange: { from: 1000, to: 2000 },
      type: 'message',
      limit: 20,
    };
    expect(query.limit).toBe(20);
  });
});
