import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionJournal } from '../src/journal/session-journal.js';
import type { VaultLike } from '../src/journal/session-journal.js';
import type { JournalEntry } from '../src/journal/journal-types.js';

function createMockVault(): VaultLike {
  const store = new Map<string, string>();
  return {
    add: vi.fn(async (name: string, value: string) => {
      store.set(name, value);
    }),
    get: vi.fn((name: string) => store.get(name)),
    has: vi.fn((name: string) => store.has(name)),
    list: vi.fn(() => [...store.keys()]),
    remove: vi.fn(async (name: string) => store.delete(name)),
  };
}

function makeEntry(overrides: Partial<Omit<JournalEntry, 'id' | 'timestamp'>> = {}) {
  return {
    sessionId: overrides.sessionId ?? 'session-1',
    type: overrides.type ?? ('message' as const),
    message: overrides.message ?? { role: 'user' as const, content: 'hello world' },
    context: overrides.context ?? { domains: ['general' as const] },
    selfState: overrides.selfState ?? {
      health: 'healthy' as const,
      activeProviders: ['openai'],
      uptime: 100,
    },
    ...(overrides.summary !== undefined ? { summary: overrides.summary } : {}),
  };
}

describe('SessionJournal', () => {
  let vault: VaultLike;
  let journal: SessionJournal;

  beforeEach(() => {
    vault = createMockVault();
    journal = new SessionJournal(vault);
  });

  describe('record', () => {
    it('assigns id and timestamp to entry and persists to vault', async () => {
      const id = await journal.record(makeEntry());
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(vault.add).toHaveBeenCalled();

      const entries = await journal.getSession('session-1');
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe(id);
      expect(entries[0].timestamp).toBeGreaterThan(0);
    });

    it('auto-initializes on first call', async () => {
      // No explicit initialize() call
      const id = await journal.record(makeEntry());
      expect(id).toBeDefined();
      expect(vault.get).toHaveBeenCalledWith('consciousness:journal:index');
    });
  });

  describe('getSession', () => {
    it('returns entries for a given session', async () => {
      await journal.record(makeEntry({ sessionId: 'session-1' }));
      await journal.record(makeEntry({ sessionId: 'session-1' }));
      await journal.record(makeEntry({ sessionId: 'session-2' }));

      const entries = await journal.getSession('session-1');
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.sessionId === 'session-1')).toBe(true);
    });

    it('returns empty array for unknown session', async () => {
      const entries = await journal.getSession('nonexistent');
      expect(entries).toHaveLength(0);
    });
  });

  describe('search', () => {
    it('filters by text in message content (case-insensitive)', async () => {
      await journal.record(makeEntry({ message: { role: 'user', content: 'Authentication issue' } }));
      await journal.record(makeEntry({ message: { role: 'user', content: 'General chat' } }));

      const results = await journal.search({ text: 'auth' });
      expect(results).toHaveLength(1);
      expect(results[0].message?.content).toBe('Authentication issue');
    });

    it('filters by text in summary', async () => {
      await journal.record(makeEntry({ summary: 'Discussed security topics' }));
      await journal.record(makeEntry({ summary: 'Talked about weather' }));

      const results = await journal.search({ text: 'security' });
      expect(results).toHaveLength(1);
      expect(results[0].summary).toBe('Discussed security topics');
    });

    it('filters by domain intersection', async () => {
      await journal.record(makeEntry({ context: { domains: ['security_review', 'debugging'] } }));
      await journal.record(makeEntry({ context: { domains: ['general'] } }));

      const results = await journal.search({ domains: ['security_review'] });
      expect(results).toHaveLength(1);
      expect(results[0].context.domains).toContain('security_review');
    });

    it('filters by date range', async () => {
      await journal.record(makeEntry());
      const now = Date.now();

      const results = await journal.search({ dateRange: { from: now - 1000, to: now + 1000 } });
      expect(results).toHaveLength(1);

      const noResults = await journal.search({ dateRange: { from: 0, to: 1 } });
      expect(noResults).toHaveLength(0);
    });

    it('filters by entry type', async () => {
      await journal.record(makeEntry({ type: 'message' }));
      await journal.record(makeEntry({ type: 'decision' }));

      const results = await journal.search({ type: 'decision' });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('decision');
    });

    it('respects limit (takes last N)', async () => {
      await journal.record(makeEntry({ message: { role: 'user', content: 'first' } }));
      await journal.record(makeEntry({ message: { role: 'user', content: 'second' } }));
      await journal.record(makeEntry({ message: { role: 'user', content: 'third' } }));

      const results = await journal.search({ limit: 2 });
      expect(results).toHaveLength(2);
      expect(results[0].message?.content).toBe('second');
      expect(results[1].message?.content).toBe('third');
    });
  });

  describe('getRecentSessions', () => {
    it('returns session summaries ordered by recency', async () => {
      await journal.record(makeEntry({ sessionId: 'old-session' }));
      // Ensure the second session has a later timestamp
      await new Promise((r) => setTimeout(r, 5));
      await journal.record(makeEntry({ sessionId: 'new-session' }));

      const summaries = await journal.getRecentSessions(10);
      expect(summaries).toHaveLength(2);
      expect(summaries[0].sessionId).toBe('new-session');
      expect(summaries[1].sessionId).toBe('old-session');
    });
  });

  describe('summarizeSession', () => {
    it('produces correct summary fields', async () => {
      await journal.record(makeEntry({
        sessionId: 'sess-x',
        type: 'message',
        context: { domains: ['code_engineering', 'debugging'], satisfaction: 0.8 },
      }));
      await journal.record(makeEntry({
        sessionId: 'sess-x',
        type: 'correction',
        context: { domains: ['code_engineering'], satisfaction: 0.7 },
      }));

      const summary = await journal.summarizeSession('sess-x');
      expect(summary.sessionId).toBe('sess-x');
      expect(summary.messageCount).toBe(1);
      expect(summary.corrections).toBe(1);
      expect(summary.domains).toContain('code_engineering');
      expect(summary.domains).toContain('debugging');
      expect(summary.satisfaction).toBe('positive');
      expect(summary.summary).toBe('Session with 1 messages in code_engineering, debugging.');
    });

    it('returns unknown satisfaction when no scores', async () => {
      await journal.record(makeEntry({ sessionId: 'sess-y', context: { domains: ['general'] } }));
      const summary = await journal.summarizeSession('sess-y');
      expect(summary.satisfaction).toBe('unknown');
    });

    it('returns negative satisfaction for low scores', async () => {
      await journal.record(makeEntry({
        sessionId: 'sess-z',
        context: { domains: ['general'], satisfaction: 0.2 },
      }));
      const summary = await journal.summarizeSession('sess-z');
      expect(summary.satisfaction).toBe('negative');
    });
  });

  describe('persistence', () => {
    it('loads entries from vault on initialize', async () => {
      // Record entries with first journal instance
      await journal.record(makeEntry({ sessionId: 'persisted' }));

      // Create a new journal instance sharing the same vault
      const journal2 = new SessionJournal(vault);
      await journal2.initialize();

      const entries = await journal2.getSession('persisted');
      expect(entries).toHaveLength(1);
      expect(entries[0].sessionId).toBe('persisted');
    });
  });
});
