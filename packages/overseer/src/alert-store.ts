import { DatabaseSync } from 'node:sqlite';
import type { OverseerAlert } from './types.js';

export interface StoredAlert extends OverseerAlert {
  id: number;
  acknowledged: boolean;
}

export class AlertStore {
  private db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        agentId TEXT NOT NULL,
        message TEXT NOT NULL,
        severity TEXT NOT NULL,
        detectedAt INTEGER NOT NULL,
        acknowledged INTEGER DEFAULT 0
      )
    `);
  }

  record(alert: OverseerAlert): void {
    if (this.closed) return;
    const stmt = this.db.prepare(
      'INSERT INTO alerts (type, agentId, message, severity, detectedAt) VALUES (?, ?, ?, ?, ?)',
    );
    stmt.run(alert.type, alert.agentId, alert.message, alert.severity, alert.detectedAt);
  }

  getRecent(limit = 50): StoredAlert[] {
    if (this.closed) return [];
    const stmt = this.db.prepare('SELECT * FROM alerts ORDER BY detectedAt DESC LIMIT ?');
    return (stmt.all(limit) as RawRow[]).map(toStoredAlert);
  }

  getByAgent(agentId: string): StoredAlert[] {
    if (this.closed) return [];
    const stmt = this.db.prepare(
      'SELECT * FROM alerts WHERE agentId = ? ORDER BY detectedAt DESC',
    );
    return (stmt.all(agentId) as RawRow[]).map(toStoredAlert);
  }

  getBySeverity(severity: string): StoredAlert[] {
    if (this.closed) return [];
    const stmt = this.db.prepare(
      'SELECT * FROM alerts WHERE severity = ? ORDER BY detectedAt DESC',
    );
    return (stmt.all(severity) as RawRow[]).map(toStoredAlert);
  }

  getUnacknowledged(): StoredAlert[] {
    if (this.closed) return [];
    const stmt = this.db.prepare(
      'SELECT * FROM alerts WHERE acknowledged = 0 ORDER BY detectedAt DESC',
    );
    return (stmt.all() as RawRow[]).map(toStoredAlert);
  }

  acknowledge(id: number): void {
    if (this.closed) return;
    const stmt = this.db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?');
    stmt.run(id);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}

interface RawRow {
  id: number;
  type: string;
  agentId: string;
  message: string;
  severity: string;
  detectedAt: number;
  acknowledged: number;
}

function toStoredAlert(row: RawRow): StoredAlert {
  return {
    id: row.id,
    type: row.type as OverseerAlert['type'],
    agentId: row.agentId,
    message: row.message,
    severity: row.severity as OverseerAlert['severity'],
    detectedAt: row.detectedAt,
    acknowledged: row.acknowledged === 1,
  };
}
