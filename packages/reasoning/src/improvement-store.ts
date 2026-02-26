import { DatabaseSync } from 'node:sqlite';
import type { ImprovementProposal } from './improvement-types.js';

export interface StoredProposal extends ImprovementProposal {
  id: number;
}

export class ImprovementStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA busy_timeout=5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS improvement_proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        observationsJson TEXT NOT NULL,
        reflectionsJson TEXT NOT NULL,
        hypothesesJson TEXT NOT NULL,
        validationsJson TEXT NOT NULL,
        status TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_proposals_status ON improvement_proposals (status)');
  }

  record(proposal: ImprovementProposal): number {
    if (this.closed) return -1;
    const stmt = this.db.prepare(
      'INSERT INTO improvement_proposals (observationsJson, reflectionsJson, hypothesesJson, validationsJson, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    );
    stmt.run(
      JSON.stringify(proposal.observations),
      JSON.stringify(proposal.reflections),
      JSON.stringify(proposal.hypotheses),
      JSON.stringify(proposal.validations),
      proposal.status,
      proposal.createdAt,
    );
    const row = this.db.prepare('SELECT last_insert_rowid() as id').get() as Record<string, unknown>;
    return row.id as number;
  }

  getById(id: number): StoredProposal | undefined {
    if (this.closed) return undefined;
    const stmt = this.db.prepare('SELECT * FROM improvement_proposals WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  updateStatus(id: number, status: ImprovementProposal['status']): void {
    if (this.closed) return;
    const stmt = this.db.prepare('UPDATE improvement_proposals SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }

  getByStatus(status: ImprovementProposal['status']): StoredProposal[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM improvement_proposals WHERE status = ? ORDER BY createdAt DESC');
    return this.mapRows(stmt.all(status) as Record<string, unknown>[]);
  }

  getRecent(limit = 50): StoredProposal[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM improvement_proposals ORDER BY createdAt DESC LIMIT ?');
    return this.mapRows(stmt.all(limit) as Record<string, unknown>[]);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private mapRows(rows: Record<string, unknown>[]): StoredProposal[] {
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(r: Record<string, unknown>): StoredProposal {
    return {
      id: r.id as number,
      observations: JSON.parse(r.observationsJson as string) as Record<string, unknown>,
      reflections: JSON.parse(r.reflectionsJson as string) as Record<string, unknown>,
      hypotheses: JSON.parse(r.hypothesesJson as string) as Record<string, unknown>,
      validations: JSON.parse(r.validationsJson as string) as Record<string, unknown>,
      status: r.status as ImprovementProposal['status'],
      createdAt: r.createdAt as number,
    };
  }
}
