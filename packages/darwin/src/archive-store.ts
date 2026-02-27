import { DatabaseSync } from 'node:sqlite';
import type { ArchiveCell, Niche, Variant, VariantStatus } from './types.js';

interface VariantRow {
  id: string;
  generation: number;
  parentIdsJson: string;
  strategy: string;
  type: string;
  content: string;
  metadataJson: string;
  metricsJson: string;
  securityPassed: number;
  reviewScore: number;
  status: string;
  createdAt: number;
}

interface CellRow {
  domain: string;
  complexity: string;
  variantId: string;
  benchmarkScore: number;
  lastEvaluated: number;
  staleness: number;
}

export class ArchiveStore {
  private db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS variants (
        id TEXT PRIMARY KEY,
        generation INTEGER NOT NULL,
        parentIdsJson TEXT NOT NULL DEFAULT '[]',
        strategy TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadataJson TEXT NOT NULL DEFAULT '{}',
        metricsJson TEXT NOT NULL,
        securityPassed INTEGER NOT NULL,
        reviewScore REAL NOT NULL,
        status TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_variants_status ON variants(status)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_variants_created ON variants(createdAt)');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS archive_cells (
        domain TEXT NOT NULL,
        complexity TEXT NOT NULL,
        variantId TEXT NOT NULL,
        benchmarkScore REAL NOT NULL,
        lastEvaluated INTEGER NOT NULL,
        staleness INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (domain, complexity)
      )
    `);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  saveVariant(v: Variant): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO variants
        (id, generation, parentIdsJson, strategy, type, content, metadataJson, metricsJson, securityPassed, reviewScore, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      v.id,
      v.generation,
      JSON.stringify(v.parentIds),
      v.strategy,
      v.type,
      v.content,
      JSON.stringify(v.metadata),
      JSON.stringify(v.metrics),
      v.securityPassed ? 1 : 0,
      v.reviewScore,
      v.status,
      v.createdAt,
    );
  }

  getVariant(id: string): Variant | null {
    const row = this.db.prepare(
      'SELECT id, generation, parentIdsJson, strategy, type, content, metadataJson, metricsJson, securityPassed, reviewScore, status, createdAt FROM variants WHERE id = ?',
    ).get(id) as VariantRow | undefined;
    if (!row) return null;
    return this.rowToVariant(row);
  }

  updateVariantStatus(id: string, status: VariantStatus): void {
    this.db.prepare('UPDATE variants SET status = ? WHERE id = ?').run(status, id);
  }

  getVariantsByStatus(status: VariantStatus): Variant[] {
    const rows = this.db.prepare(
      'SELECT id, generation, parentIdsJson, strategy, type, content, metadataJson, metricsJson, securityPassed, reviewScore, status, createdAt FROM variants WHERE status = ?',
    ).all(status) as unknown as VariantRow[];
    return rows.map((r) => this.rowToVariant(r));
  }

  getVariantsByParent(parentId: string): Variant[] {
    const rows = this.db.prepare(
      'SELECT id, generation, parentIdsJson, strategy, type, content, metadataJson, metricsJson, securityPassed, reviewScore, status, createdAt FROM variants WHERE parentIdsJson LIKE ?',
    ).all(`%"${parentId}"%`) as unknown as VariantRow[];
    return rows.map((r) => this.rowToVariant(r));
  }

  getVariantsCreatedToday(): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM variants WHERE createdAt >= ?',
    ).get(startOfDay) as { cnt: number };
    return row.cnt;
  }

  setCell(niche: Niche, variantId: string, benchmarkScore: number): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO archive_cells (domain, complexity, variantId, benchmarkScore, lastEvaluated, staleness)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(niche.domain, niche.complexity, variantId, benchmarkScore, Date.now());
  }

  getCell(niche: Niche): ArchiveCell | null {
    const row = this.db.prepare(
      'SELECT domain, complexity, variantId, benchmarkScore, lastEvaluated, staleness FROM archive_cells WHERE domain = ? AND complexity = ?',
    ).get(niche.domain, niche.complexity) as CellRow | undefined;
    if (!row) return null;
    return this.rowToCell(row);
  }

  getAllCells(): ArchiveCell[] {
    const rows = this.db.prepare(
      'SELECT domain, complexity, variantId, benchmarkScore, lastEvaluated, staleness FROM archive_cells',
    ).all() as unknown as CellRow[];
    return rows.map((r) => this.rowToCell(r));
  }

  getStaleCells(threshold: number): ArchiveCell[] {
    const rows = this.db.prepare(
      'SELECT domain, complexity, variantId, benchmarkScore, lastEvaluated, staleness FROM archive_cells WHERE staleness >= ?',
    ).all(threshold) as unknown as CellRow[];
    return rows.map((r) => this.rowToCell(r));
  }

  getDomains(): string[] {
    const rows = this.db.prepare(
      'SELECT DISTINCT domain FROM archive_cells ORDER BY domain',
    ).all() as Array<{ domain: string }>;
    return rows.map((r) => r.domain);
  }

  incrementStaleness(): void {
    this.db.prepare('UPDATE archive_cells SET staleness = staleness + 1').run();
  }

  pruneOldFailed(maxAgeDays: number): number {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const result = this.db.prepare(
      'DELETE FROM variants WHERE status = ? AND createdAt < ?',
    ).run('failed', cutoff);
    return Number(result.changes);
  }

  private rowToVariant(row: VariantRow): Variant {
    return {
      id: row.id,
      generation: row.generation,
      parentIds: JSON.parse(row.parentIdsJson) as string[],
      strategy: row.strategy as Variant['strategy'],
      type: row.type as Variant['type'],
      content: row.content,
      metadata: JSON.parse(row.metadataJson) as Record<string, unknown>,
      metrics: JSON.parse(row.metricsJson) as Variant['metrics'],
      securityPassed: row.securityPassed === 1,
      reviewScore: row.reviewScore,
      status: row.status as Variant['status'],
      createdAt: row.createdAt,
    };
  }

  private rowToCell(row: CellRow): ArchiveCell {
    return {
      niche: { domain: row.domain, complexity: row.complexity as Niche['complexity'] },
      variantId: row.variantId,
      benchmarkScore: row.benchmarkScore,
      lastEvaluated: row.lastEvaluated,
      staleness: row.staleness,
    };
  }
}
