import { DatabaseSync } from 'node:sqlite';

export interface Learning {
  readonly id: number;
  readonly content: string;
  readonly category: string;
  readonly jobId: string;
  readonly jobType: string;
  readonly occurrences: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const MAX_CONTENT_LENGTH = 500;

const MARKERS: Array<{ regex: RegExp; category: string }> = [
  { regex: /\bNote:\s*(.+)/gi, category: 'note' },
  { regex: /\bWarning:\s*(.+)/gi, category: 'warning' },
  { regex: /\bPattern:\s*(.+)/gi, category: 'pattern' },
  { regex: /\bPitfall:\s*(.+)/gi, category: 'pitfall' },
  { regex: /\bBest practice:\s*(.+)/gi, category: 'best_practice' },
  { regex: /\bLearned:\s*(.+)/gi, category: 'learned' },
];

export class LearningStore {
  private db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS learnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        job_id TEXT NOT NULL,
        job_type TEXT NOT NULL,
        occurrences INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(content, category)
      )
    `);
  }

  extractAndStore(output: string, jobId: string, jobType: string): number {
    if (this.closed) return 0;
    let count = 0;
    for (const { regex, category } of MARKERS) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(output)) !== null) {
        const content = match[1].trim().slice(0, MAX_CONTENT_LENGTH);
        if (content.length > 0) {
          this.upsert(content, category, jobId, jobType);
          count++;
        }
      }
    }
    return count;
  }

  getAll(): Learning[] {
    if (this.closed) return [];
    const rows = this.db
      .prepare('SELECT * FROM learnings ORDER BY updated_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToLearning(r));
  }

  getByCategory(category: string): Learning[] {
    if (this.closed) return [];
    const rows = this.db
      .prepare('SELECT * FROM learnings WHERE category = ? ORDER BY updated_at DESC')
      .all(category) as Record<string, unknown>[];
    return rows.map((r) => this.rowToLearning(r));
  }

  getRecent(limit: number): Learning[] {
    if (this.closed) return [];
    const rows = this.db
      .prepare('SELECT * FROM learnings ORDER BY updated_at DESC LIMIT ?')
      .all(limit) as Record<string, unknown>[];
    return rows.map((r) => this.rowToLearning(r));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private upsert(
    content: string,
    category: string,
    jobId: string,
    jobType: string,
  ): void {
    const existing = this.db
      .prepare('SELECT id, occurrences FROM learnings WHERE content = ? AND category = ?')
      .get(content, category) as Record<string, unknown> | undefined;
    if (existing) {
      this.db
        .prepare(
          'UPDATE learnings SET occurrences = occurrences + 1, updated_at = unixepoch() WHERE id = ?',
        )
        .run(existing.id as number);
    } else {
      this.db
        .prepare(
          'INSERT INTO learnings (content, category, job_id, job_type) VALUES (?, ?, ?, ?)',
        )
        .run(content, category, jobId, jobType);
    }
  }

  private rowToLearning(row: Record<string, unknown>): Learning {
    return {
      id: row.id as number,
      content: row.content as string,
      category: row.category as string,
      jobId: row.job_id as string,
      jobType: row.job_type as string,
      occurrences: row.occurrences as number,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }
}
