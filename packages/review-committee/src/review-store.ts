import { DatabaseSync } from 'node:sqlite';
import type { AggregatedReview } from './types.js';

export interface StoredReview {
  id: number;
  proposalTitle: string;
  approved: boolean;
  weightedScore: number;
  totalIssues: number;
  blockers: string;
  reviewsJson: string;
  createdAt: number;
}

export class ReviewStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proposalTitle TEXT,
        approved INTEGER,
        weightedScore REAL,
        totalIssues INTEGER,
        blockers TEXT DEFAULT '[]',
        reviewsJson TEXT DEFAULT '[]',
        createdAt INTEGER
      )
    `);
  }

  record(proposalTitle: string, review: AggregatedReview): void {
    if (this.closed) return;
    const stmt = this.db.prepare(
      `INSERT INTO reviews (proposalTitle, approved, weightedScore, totalIssues, blockers, reviewsJson, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    stmt.run(
      proposalTitle,
      review.approved ? 1 : 0,
      review.weightedScore,
      review.totalIssues,
      JSON.stringify(review.blockers),
      JSON.stringify(review.reviews),
      Date.now(),
    );
  }

  getRecent(limit: number): StoredReview[] {
    if (this.closed) return [];
    const stmt = this.db.prepare(
      'SELECT * FROM reviews ORDER BY createdAt DESC LIMIT ?',
    );
    const rows = stmt.all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapRow(r));
  }

  getByStatus(approved: boolean): StoredReview[] {
    if (this.closed) return [];
    const stmt = this.db.prepare(
      'SELECT * FROM reviews WHERE approved = ? ORDER BY createdAt DESC',
    );
    const rows = stmt.all(approved ? 1 : 0) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapRow(r));
  }

  getApprovalRate(): number {
    if (this.closed) return 0;
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as total, SUM(approved) as approvedCount FROM reviews',
    );
    const row = stmt.get() as { total: number; approvedCount: number } | undefined;
    if (!row || row.total === 0) return 0;
    return row.approvedCount / row.total;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private mapRow(r: Record<string, unknown>): StoredReview {
    return {
      id: r['id'] as number,
      proposalTitle: r['proposalTitle'] as string,
      approved: (r['approved'] as number) === 1,
      weightedScore: r['weightedScore'] as number,
      totalIssues: r['totalIssues'] as number,
      blockers: r['blockers'] as string,
      reviewsJson: r['reviewsJson'] as string,
      createdAt: r['createdAt'] as number,
    };
  }
}
