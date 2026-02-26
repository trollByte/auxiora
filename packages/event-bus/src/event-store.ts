import { DatabaseSync } from 'node:sqlite';
import type { StoredEvent } from './types.js';

export interface TopicCount {
  topic: string;
  count: number;
}

export class EventStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA busy_timeout=5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bus_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic TEXT NOT NULL,
        agentId TEXT NOT NULL,
        payload TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_events_agent ON bus_events (agentId)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_events_topic ON bus_events (topic)');
  }

  record(event: StoredEvent): void {
    if (this.closed) return;
    const stmt = this.db.prepare(
      'INSERT INTO bus_events (topic, agentId, payload, timestamp) VALUES (?, ?, ?, ?)',
    );
    stmt.run(event.topic, event.agentId, JSON.stringify(event.payload), event.timestamp);
  }

  getByAgent(agentId: string): StoredEvent[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM bus_events WHERE agentId = ? ORDER BY timestamp ASC');
    return this.mapRows(stmt.all(agentId) as Record<string, unknown>[]);
  }

  getByTopicPrefix(prefix: string): StoredEvent[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM bus_events WHERE topic LIKE ? ORDER BY timestamp ASC');
    return this.mapRows(stmt.all(prefix + '%') as Record<string, unknown>[]);
  }

  getRecent(limit = 50): StoredEvent[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM bus_events ORDER BY timestamp DESC LIMIT ?');
    return this.mapRows(stmt.all(limit) as Record<string, unknown>[]);
  }

  countByTopic(): TopicCount[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT topic, COUNT(*) as count FROM bus_events GROUP BY topic ORDER BY count DESC');
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((r) => ({ topic: r.topic as string, count: r.count as number }));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private mapRows(rows: Record<string, unknown>[]): StoredEvent[] {
    return rows.map((r) => ({
      topic: r.topic as string,
      agentId: r.agentId as string,
      payload: JSON.parse(r.payload as string) as Record<string, unknown>,
      timestamp: r.timestamp as number,
    }));
  }
}
