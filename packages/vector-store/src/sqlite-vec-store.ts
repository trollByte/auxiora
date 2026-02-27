import { DatabaseSync } from 'node:sqlite';
import type { VectorEntry, VectorStoreOptions, SimilarityResult } from './types.js';
import { cosineSimilarity } from './math.js';

export interface SqliteVecStoreOptions extends VectorStoreOptions {
  dbPath: string; // path to SQLite file, or ':memory:' for testing
}

export class SqliteVecStore {
  private db: DatabaseSync;
  private dimensions: number;
  private maxEntries: number;

  constructor(private options: SqliteVecStoreOptions) {
    this.dimensions = options.dimensions;
    this.maxEntries = options.maxEntries ?? 10_000;
    this.db = new DatabaseSync(options.dbPath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vectors (
        id TEXT PRIMARY KEY,
        vector TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      )
    `);
    this.db.exec(
      'CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(id UNINDEXED, content)',
    );
  }

  add(
    id: string,
    vector: number[],
    content: string,
    metadata: Record<string, unknown> = {},
  ): VectorEntry {
    this.validateDimensions(vector);

    const existing = this.get(id);
    if (!existing && this.size() >= this.maxEntries) {
      throw new Error(`Vector store is full (max ${this.maxEntries} entries)`);
    }

    const now = Date.now();
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO vectors (id, vector, content, metadata, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    stmt.run(
      id,
      JSON.stringify(vector),
      content,
      JSON.stringify(metadata),
      existing?.createdAt ?? now,
    );

    // Keep FTS index in sync — delete old row first (INSERT OR REPLACE not supported for FTS5)
    this.db.prepare('DELETE FROM chunks_fts WHERE id = ?').run(id);
    this.db.prepare('INSERT INTO chunks_fts (id, content) VALUES (?, ?)').run(id, content);

    return { id, vector, content, metadata, createdAt: existing?.createdAt ?? now };
  }

  search(queryVector: number[], limit = 10, minScore = 0): SimilarityResult[] {
    this.validateDimensions(queryVector);

    const rows = this.db
      .prepare('SELECT id, vector, content, metadata, created_at FROM vectors')
      .all() as Array<{
      id: string;
      vector: string;
      content: string;
      metadata: string;
      created_at: number;
    }>;

    const results: SimilarityResult[] = [];
    for (const row of rows) {
      const entryVector = JSON.parse(row.vector) as number[];
      const score = cosineSimilarity(queryVector, entryVector);
      if (score >= minScore) {
        results.push({
          entry: {
            id: row.id,
            vector: entryVector,
            content: row.content,
            metadata: JSON.parse(row.metadata) as Record<string, unknown>,
            createdAt: row.created_at,
          },
          score,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  keywordSearch(query: string, limit = 10): SimilarityResult[] {
    // Sanitize: remove quotes to prevent FTS5 syntax errors
    const sanitized = query.replace(/["']/g, '');
    if (!sanitized.trim()) return [];

    // Split into terms, wrap each in quotes, join with OR
    const terms = sanitized.split(/\s+/).filter(Boolean);
    const ftsQuery = terms.map(t => `"${t}"`).join(' OR ');

    const rows = this.db
      .prepare(
        `SELECT f.id, f.rank, v.vector, v.content, v.metadata, v.created_at
         FROM chunks_fts f
         JOIN vectors v ON v.id = f.id
         WHERE chunks_fts MATCH ?
         ORDER BY f.rank
         LIMIT ?`,
      )
      .all(ftsQuery, limit) as Array<{
      id: string;
      rank: number;
      vector: string;
      content: string;
      metadata: string;
      created_at: number;
    }>;

    return rows.map(row => ({
      entry: {
        id: row.id,
        vector: JSON.parse(row.vector) as number[],
        content: row.content,
        metadata: JSON.parse(row.metadata) as Record<string, unknown>,
        createdAt: row.created_at,
      },
      score: -row.rank, // FTS5 rank is negative, lower=better; negate for positive score
    }));
  }

  get(id: string): VectorEntry | undefined {
    const row = this.db
      .prepare(
        'SELECT id, vector, content, metadata, created_at FROM vectors WHERE id = ?',
      )
      .get(id) as
      | {
          id: string;
          vector: string;
          content: string;
          metadata: string;
          created_at: number;
        }
      | undefined;

    if (!row) return undefined;
    return {
      id: row.id,
      vector: JSON.parse(row.vector) as number[],
      content: row.content,
      metadata: JSON.parse(row.metadata) as Record<string, unknown>,
      createdAt: row.created_at,
    };
  }

  remove(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM vectors WHERE id = ?')
      .run(id);
    if (result.changes > 0) {
      this.db.prepare('DELETE FROM chunks_fts WHERE id = ?').run(id);
    }
    return result.changes > 0;
  }

  update(
    id: string,
    vector: number[],
    content?: string,
    metadata?: Record<string, unknown>,
  ): VectorEntry {
    this.validateDimensions(vector);
    const existing = this.get(id);
    if (!existing) throw new Error(`Entry with id "${id}" not found`);

    const updated: VectorEntry = {
      ...existing,
      vector,
      content: content ?? existing.content,
      metadata: metadata ?? existing.metadata,
    };

    this.db
      .prepare(
        'UPDATE vectors SET vector = ?, content = ?, metadata = ? WHERE id = ?',
      )
      .run(
        JSON.stringify(vector),
        updated.content,
        JSON.stringify(updated.metadata),
        id,
      );

    return updated;
  }

  size(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM vectors')
      .get() as { count: number };
    return row.count;
  }

  clear(): void {
    this.db.exec('DELETE FROM vectors');
    this.db.exec('DELETE FROM chunks_fts');
  }

  close(): void {
    this.db.close();
  }

  private validateDimensions(vector: number[]): void {
    if (vector.length !== this.dimensions) {
      throw new Error(
        `Expected vector of ${this.dimensions} dimensions, got ${vector.length}`,
      );
    }
  }
}
