import { DatabaseSync } from 'node:sqlite';

export interface ChangeEntry {
  readonly component: string;
  readonly description: string;
  readonly reason: string;
  readonly previousValue?: string;
  readonly newValue?: string;
}

export interface ImpactAssessment {
  readonly outcome: 'positive' | 'negative' | 'neutral';
  readonly metric?: string;
  readonly before?: number;
  readonly after?: number;
  readonly notes?: string;
}

export interface ChangeRecord {
  readonly id: number;
  readonly component: string;
  readonly description: string;
  readonly reason: string;
  readonly previousValue?: string;
  readonly newValue?: string;
  readonly impact?: ImpactAssessment;
  readonly createdAt: number;
}

export class ChangeLog {
  private db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        component TEXT NOT NULL,
        description TEXT NOT NULL,
        reason TEXT NOT NULL,
        previous_value TEXT,
        new_value TEXT,
        impact_json TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
  }

  record(entry: ChangeEntry): number {
    if (this.closed) return -1;
    const result = this.db.prepare(
      `INSERT INTO changes (component, description, reason, previous_value, new_value) VALUES (?, ?, ?, ?, ?)`,
    ).run(entry.component, entry.description, entry.reason, entry.previousValue ?? null, entry.newValue ?? null);
    return Number(result.lastInsertRowid);
  }

  recordImpact(id: number, impact: ImpactAssessment): void {
    if (this.closed) return;
    this.db.prepare('UPDATE changes SET impact_json = ? WHERE id = ?').run(JSON.stringify(impact), id);
  }

  getById(id: number): ChangeRecord | undefined {
    if (this.closed) return undefined;
    const row = this.db.prepare('SELECT * FROM changes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToRecord(row) : undefined;
  }

  getAll(): ChangeRecord[] {
    if (this.closed) return [];
    const rows = this.db.prepare('SELECT * FROM changes ORDER BY created_at DESC').all() as Record<string, unknown>[];
    return rows.map(r => this.rowToRecord(r));
  }

  getByComponent(component: string): ChangeRecord[] {
    if (this.closed) return [];
    const rows = this.db.prepare('SELECT * FROM changes WHERE component = ? ORDER BY created_at DESC').all(component) as Record<string, unknown>[];
    return rows.map(r => this.rowToRecord(r));
  }

  getRecent(limit: number): ChangeRecord[] {
    if (this.closed) return [];
    const rows = this.db.prepare('SELECT * FROM changes ORDER BY created_at DESC LIMIT ?').all(limit) as Record<string, unknown>[];
    return rows.map(r => this.rowToRecord(r));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private rowToRecord(row: Record<string, unknown>): ChangeRecord {
    const impact = row.impact_json ? JSON.parse(row.impact_json as string) as ImpactAssessment : undefined;
    return {
      id: row.id as number,
      component: row.component as string,
      description: row.description as string,
      reason: row.reason as string,
      previousValue: (row.previous_value as string | null) ?? undefined,
      newValue: (row.new_value as string | null) ?? undefined,
      impact,
      createdAt: row.created_at as number,
    };
  }
}
