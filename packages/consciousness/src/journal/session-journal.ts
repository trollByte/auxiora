import { randomUUID } from 'node:crypto';
import type {
  JournalEntry,
  JournalSearchQuery,
  SessionSummary,
  ContextDomain,
} from './journal-types.js';

export interface VaultLike {
  add(name: string, value: string): Promise<void>;
  get(name: string): string | undefined;
  has(name: string): boolean;
  list(): string[];
  remove(name: string): Promise<boolean>;
}

const VAULT_KEY = 'consciousness:journal:index';

export class SessionJournal {
  private readonly vault: VaultLike;
  private entries: JournalEntry[] = [];
  private initialized = false;

  constructor(vault: VaultLike) {
    this.vault = vault;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const raw = this.vault.get(VAULT_KEY);
    if (raw) {
      this.entries = JSON.parse(raw) as JournalEntry[];
    }
    this.initialized = true;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async persist(): Promise<void> {
    await this.vault.add(VAULT_KEY, JSON.stringify(this.entries));
  }

  async record(entry: Omit<JournalEntry, 'id' | 'timestamp'>): Promise<string> {
    await this.ensureInitialized();
    const id = randomUUID();
    const full: JournalEntry = {
      ...entry,
      id,
      timestamp: Date.now(),
    };
    this.entries.push(full);
    await this.persist();
    return id;
  }

  async getSession(sessionId: string): Promise<JournalEntry[]> {
    await this.ensureInitialized();
    return this.entries.filter((e) => e.sessionId === sessionId);
  }

  async search(query: JournalSearchQuery): Promise<JournalEntry[]> {
    await this.ensureInitialized();
    let results = [...this.entries];

    if (query.text) {
      const lower = query.text.toLowerCase();
      results = results.filter((e) => {
        const content = e.message?.content?.toLowerCase() ?? '';
        const summary = e.summary?.toLowerCase() ?? '';
        return content.includes(lower) || summary.includes(lower);
      });
    }

    if (query.domains && query.domains.length > 0) {
      const domainSet = new Set<ContextDomain>(query.domains);
      results = results.filter((e) =>
        e.context.domains.some((d) => domainSet.has(d)),
      );
    }

    if (query.dateRange) {
      const { from, to } = query.dateRange;
      results = results.filter((e) => e.timestamp >= from && e.timestamp <= to);
    }

    if (query.type) {
      results = results.filter((e) => e.type === query.type);
    }

    if (query.limit !== undefined) {
      results = results.slice(-query.limit);
    }

    return results;
  }

  async getRecentSessions(limit = 10): Promise<SessionSummary[]> {
    await this.ensureInitialized();

    const sessionIds = new Map<string, number>();
    for (const entry of this.entries) {
      const last = sessionIds.get(entry.sessionId) ?? 0;
      if (entry.timestamp > last) {
        sessionIds.set(entry.sessionId, entry.timestamp);
      }
    }

    const sorted = [...sessionIds.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const summaries: SessionSummary[] = [];
    for (const [sessionId] of sorted) {
      summaries.push(await this.summarizeSession(sessionId));
    }
    return summaries;
  }

  async summarizeSession(sessionId: string): Promise<SessionSummary> {
    await this.ensureInitialized();
    const entries = this.entries.filter((e) => e.sessionId === sessionId);

    const messageCount = entries.filter((e) => e.type === 'message').length;
    const domainSet = new Set<ContextDomain>();
    const decisions: string[] = [];
    let corrections = 0;
    const satisfactionScores: number[] = [];

    for (const entry of entries) {
      for (const d of entry.context.domains) {
        domainSet.add(d);
      }
      if (entry.context.activeDecisions) {
        for (const dec of entry.context.activeDecisions) {
          if (!decisions.includes(dec)) {
            decisions.push(dec);
          }
        }
      }
      if (entry.type === 'correction') {
        corrections++;
      }
      if (entry.context.satisfaction !== undefined) {
        satisfactionScores.push(entry.context.satisfaction);
      }
    }

    const domains = [...domainSet];
    let satisfaction: SessionSummary['satisfaction'];
    if (satisfactionScores.length === 0) {
      satisfaction = 'unknown';
    } else {
      const avg =
        satisfactionScores.reduce((a, b) => a + b, 0) / satisfactionScores.length;
      if (avg > 0.6) {
        satisfaction = 'positive';
      } else if (avg < 0.4) {
        satisfaction = 'negative';
      } else {
        satisfaction = 'neutral';
      }
    }

    const timestamps = entries.map((e) => e.timestamp);
    const startTime = timestamps.length > 0 ? Math.min(...timestamps) : 0;
    const endTime = timestamps.length > 0 ? Math.max(...timestamps) : 0;

    const domainList = domains.join(', ');
    const summary = `Session with ${messageCount} messages in ${domainList}.`;

    return {
      sessionId,
      startTime,
      endTime,
      messageCount,
      domains,
      decisions,
      corrections,
      satisfaction,
      summary,
    };
  }
}
