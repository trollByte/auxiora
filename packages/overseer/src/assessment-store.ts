import { DatabaseSync } from 'node:sqlite';
import type { AssessmentResult, OverseerAction, LLMAssessment, OverseerAlert } from './types.js';

export class AssessmentStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA busy_timeout=5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agentId TEXT NOT NULL,
        heuristicAlertsJson TEXT NOT NULL,
        llmAssessmentJson TEXT,
        action TEXT NOT NULL,
        notification TEXT,
        assessedAt INTEGER NOT NULL
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_assessments_agent ON assessments (agentId)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_assessments_action ON assessments (action)');
  }

  record(result: AssessmentResult): void {
    if (this.closed) return;
    const stmt = this.db.prepare(
      'INSERT INTO assessments (agentId, heuristicAlertsJson, llmAssessmentJson, action, notification, assessedAt) VALUES (?, ?, ?, ?, ?, ?)',
    );
    stmt.run(
      result.agentId,
      JSON.stringify(result.heuristicAlerts),
      result.llmAssessment ? JSON.stringify(result.llmAssessment) : null,
      result.action,
      result.notification ?? null,
      result.assessedAt,
    );
  }

  getByAgent(agentId: string): AssessmentResult[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM assessments WHERE agentId = ? ORDER BY assessedAt DESC');
    return this.mapRows(stmt.all(agentId) as Record<string, unknown>[]);
  }

  getByAction(action: OverseerAction): AssessmentResult[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM assessments WHERE action = ? ORDER BY assessedAt DESC');
    return this.mapRows(stmt.all(action) as Record<string, unknown>[]);
  }

  getRecent(limit = 50): AssessmentResult[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM assessments ORDER BY assessedAt DESC LIMIT ?');
    return this.mapRows(stmt.all(limit) as Record<string, unknown>[]);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private mapRows(rows: Record<string, unknown>[]): AssessmentResult[] {
    return rows.map((r) => ({
      agentId: r.agentId as string,
      heuristicAlerts: JSON.parse(r.heuristicAlertsJson as string) as OverseerAlert[],
      llmAssessment: r.llmAssessmentJson ? (JSON.parse(r.llmAssessmentJson as string) as LLMAssessment) : undefined,
      action: r.action as OverseerAction,
      notification: (r.notification as string) || undefined,
      assessedAt: r.assessedAt as number,
    }));
  }
}
