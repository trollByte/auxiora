import { DatabaseSync } from 'node:sqlite';
import type { BenchmarkMetric, BenchmarkRun, MetricDelta, RunComparison, TrendPoint } from './types.js';

export class BenchmarkStore {
  private db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS benchmark_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        suite TEXT NOT NULL,
        version TEXT NOT NULL,
        metricsJson TEXT NOT NULL,
        runAt INTEGER NOT NULL
      )
    `);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  recordRun(suite: string, version: string, metrics: BenchmarkMetric[]): number {
    if (this.closed) return -1;
    const result = this.db.prepare(
      'INSERT INTO benchmark_runs (suite, version, metricsJson, runAt) VALUES (?, ?, ?, ?)',
    ).run(suite, version, JSON.stringify(metrics), Date.now());
    return Number(result.lastInsertRowid);
  }

  getRunsBySuite(suite: string): BenchmarkRun[] {
    if (this.closed) return [];
    const rows = this.db.prepare(
      'SELECT id, suite, version, metricsJson, runAt FROM benchmark_runs WHERE suite = ? ORDER BY runAt ASC',
    ).all(suite) as Array<{ id: number; suite: string; version: string; metricsJson: string; runAt: number }>;
    return rows.map((r) => ({
      id: r.id,
      suite: r.suite,
      version: r.version,
      metrics: JSON.parse(r.metricsJson) as BenchmarkMetric[],
      runAt: r.runAt,
    }));
  }

  compareLatest(suite: string): RunComparison | null {
    if (this.closed) return null;
    const rows = this.db.prepare(
      'SELECT id, suite, version, metricsJson, runAt FROM benchmark_runs WHERE suite = ? ORDER BY runAt DESC, id DESC LIMIT 2',
    ).all(suite) as Array<{ id: number; suite: string; version: string; metricsJson: string; runAt: number }>;

    if (rows.length < 2) return null;

    const current = rows[0]!;
    const previous = rows[1]!;
    const currentMetrics = JSON.parse(current.metricsJson) as BenchmarkMetric[];
    const previousMetrics = JSON.parse(previous.metricsJson) as BenchmarkMetric[];

    const regressions: MetricDelta[] = [];
    const improvements: MetricDelta[] = [];
    const unchanged: MetricDelta[] = [];

    for (const cm of currentMetrics) {
      const pm = previousMetrics.find((m) => m.name === cm.name);
      if (!pm) continue;

      const delta = cm.value - pm.value;
      const percentChange = pm.value !== 0 ? (delta / Math.abs(pm.value)) * 100 : 0;

      const entry: MetricDelta = {
        metric: cm.name,
        previous: pm.value,
        current: cm.value,
        delta,
        percentChange,
      };

      if (Math.abs(delta) < 0.01) {
        unchanged.push(entry);
      } else if (delta < 0) {
        regressions.push(entry);
      } else {
        improvements.push(entry);
      }
    }

    return {
      suite,
      previousVersion: previous.version,
      currentVersion: current.version,
      regressions,
      improvements,
      unchanged,
    };
  }

  listSuites(): string[] {
    if (this.closed) return [];
    const rows = this.db.prepare(
      'SELECT DISTINCT suite FROM benchmark_runs ORDER BY suite',
    ).all() as Array<{ suite: string }>;
    return rows.map((r) => r.suite);
  }

  getTrend(suite: string, metricName: string): TrendPoint[] {
    if (this.closed) return [];
    const rows = this.db.prepare(
      'SELECT version, metricsJson, runAt FROM benchmark_runs WHERE suite = ? ORDER BY runAt ASC',
    ).all(suite) as Array<{ version: string; metricsJson: string; runAt: number }>;

    const points: TrendPoint[] = [];
    for (const row of rows) {
      const metrics = JSON.parse(row.metricsJson) as BenchmarkMetric[];
      const m = metrics.find((metric) => metric.name === metricName);
      if (m) {
        points.push({ version: row.version, value: m.value, runAt: row.runAt });
      }
    }
    return points;
  }
}
