import { DatabaseSync } from 'node:sqlite';
import type { ToolInvocation, ToolStats, JobOutcome, JobTypeStats } from './types.js';

export class TelemetryTracker {
  private db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_invocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool TEXT NOT NULL,
        success INTEGER NOT NULL,
        duration_ms REAL NOT NULL,
        context TEXT DEFAULT '',
        error TEXT DEFAULT '',
        timestamp INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS job_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        success INTEGER NOT NULL,
        duration_ms REAL NOT NULL,
        job_id TEXT NOT NULL,
        error TEXT DEFAULT '',
        timestamp INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_tool_inv_tool ON tool_invocations(tool)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_job_out_type ON job_outcomes(type)');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_reflections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        tools_used INTEGER NOT NULL,
        success_rate REAL NOT NULL,
        issues TEXT NOT NULL,
        what_worked TEXT NOT NULL,
        what_was_slow TEXT NOT NULL,
        what_to_change TEXT NOT NULL,
        summary TEXT NOT NULL
      )
    `);
  }

  record(inv: ToolInvocation): void {
    if (this.closed) return;
    this.db.prepare(
      'INSERT INTO tool_invocations (tool, success, duration_ms, context, error) VALUES (?, ?, ?, ?, ?)'
    ).run(inv.tool, inv.success ? 1 : 0, inv.durationMs, inv.context ?? '', inv.error ?? '');
  }

  recordJob(outcome: JobOutcome): void {
    if (this.closed) return;
    this.db.prepare(
      'INSERT INTO job_outcomes (type, success, duration_ms, job_id, error) VALUES (?, ?, ?, ?, ?)'
    ).run(outcome.type, outcome.success ? 1 : 0, outcome.durationMs, outcome.jobId, outcome.error ?? '');
  }

  getToolStats(tool: string): ToolStats {
    const row = this.db.prepare(
      'SELECT COUNT(*) as total, COALESCE(SUM(success), 0) as successes, AVG(duration_ms) as avg_dur FROM tool_invocations WHERE tool = ?'
    ).get(tool) as { total: number; successes: number; avg_dur: number | null } | undefined;

    const total = row?.total ?? 0;
    const successes = Number(row?.successes ?? 0);

    const errRow = this.db.prepare(
      "SELECT error FROM tool_invocations WHERE tool = ? AND success = 0 AND error != '' ORDER BY timestamp DESC LIMIT 1"
    ).get(tool) as { error: string } | undefined;

    return {
      tool,
      totalCalls: total,
      successCount: successes,
      failureCount: total - successes,
      successRate: total > 0 ? successes / total : 0,
      avgDurationMs: row?.avg_dur ?? 0,
      lastError: errRow?.error ?? '',
    };
  }

  getAllStats(): ToolStats[] {
    const tools = this.db.prepare('SELECT DISTINCT tool FROM tool_invocations').all() as Array<{ tool: string }>;
    return tools
      .map(t => this.getToolStats(t.tool))
      .sort((a, b) => a.successRate - b.successRate);
  }

  getFlaggedTools(threshold: number, minCalls: number): ToolStats[] {
    return this.getAllStats().filter(s => s.totalCalls >= minCalls && s.successRate < threshold);
  }

  getJobStats(type: string): JobTypeStats {
    const row = this.db.prepare(
      'SELECT COUNT(*) as total, COALESCE(SUM(success), 0) as successes, AVG(duration_ms) as avg_dur FROM job_outcomes WHERE type = ?'
    ).get(type) as { total: number; successes: number; avg_dur: number | null } | undefined;

    const total = row?.total ?? 0;
    const successes = Number(row?.successes ?? 0);

    const errRow = this.db.prepare(
      "SELECT error FROM job_outcomes WHERE type = ? AND success = 0 AND error != '' ORDER BY timestamp DESC LIMIT 1"
    ).get(type) as { error: string } | undefined;

    return {
      type,
      totalJobs: total,
      successCount: successes,
      failureCount: total - successes,
      successRate: total > 0 ? successes / total : 0,
      avgDurationMs: row?.avg_dur ?? 0,
      lastError: errRow?.error ?? '',
    };
  }

  saveReflection(data: {
    sessionId: string; timestamp: number; toolsUsed: number;
    successRate: number; issues: string[]; whatWorked: string[];
    whatWasSlow: string[]; whatToChange: string[]; summary: string;
  }): void {
    if (this.closed) return;
    this.db.prepare(
      `INSERT INTO session_reflections (session_id, timestamp, tools_used, success_rate, issues, what_worked, what_was_slow, what_to_change, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      data.sessionId, data.timestamp, data.toolsUsed, data.successRate,
      JSON.stringify(data.issues), JSON.stringify(data.whatWorked),
      JSON.stringify(data.whatWasSlow), JSON.stringify(data.whatToChange),
      data.summary,
    );
  }

  getReflections(limit: number): Array<{
    sessionId: string; timestamp: number; toolsUsed: number;
    overallSuccessRate: number; issues: string[]; whatWorked: string[];
    whatWasSlow: string[]; whatToChange: string[]; summary: string;
  }> {
    const rows = this.db.prepare(
      'SELECT * FROM session_reflections ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as any[];
    return rows.map((r: any) => ({
      sessionId: r.session_id,
      timestamp: r.timestamp,
      toolsUsed: r.tools_used,
      overallSuccessRate: r.success_rate,
      issues: JSON.parse(r.issues),
      whatWorked: JSON.parse(r.what_worked),
      whatWasSlow: JSON.parse(r.what_was_slow),
      whatToChange: JSON.parse(r.what_to_change),
      summary: r.summary,
    }));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}
