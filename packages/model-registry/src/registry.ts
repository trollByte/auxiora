import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { openDatabase } from './db.js';
import type { DiscoveredModel, ModelCapabilitiesLike, ModelSearchOptions } from './types.js';

type Row = Record<string, unknown>;

function rowToModel(row: Row): DiscoveredModel {
  return {
    id: row.id as string,
    providerSource: row.provider_source as string,
    modelId: row.model_id as string,
    displayName: row.display_name as string,
    contextLength: row.context_length as number,
    supportsVision: (row.supports_vision as number) === 1,
    supportsTools: (row.supports_tools as number) === 1,
    supportsStreaming: (row.supports_streaming as number) === 1,
    supportsImageGen: (row.supports_image_gen as number) === 1,
    costPer1kInput: row.cost_per_1k_input as number,
    costPer1kOutput: row.cost_per_1k_output as number,
    strengths: JSON.parse((row.strengths as string) || '[]') as string[],
    rawMetadata: row.raw_metadata as string | undefined,
    hfModelCard: row.hf_model_card as string | undefined,
    hfDownloads: row.hf_downloads as number | undefined,
    hfLikes: row.hf_likes as number | undefined,
    hfTrendingScore: row.hf_trending_score as number | undefined,
    hfTags: row.hf_tags ? JSON.parse(row.hf_tags as string) as string[] : undefined,
    hfBenchmarkScores: row.hf_benchmark_scores
      ? JSON.parse(row.hf_benchmark_scores as string) as Record<string, number>
      : undefined,
    hfInferenceProviders: row.hf_inference_providers
      ? JSON.parse(row.hf_inference_providers as string) as string[]
      : undefined,
    lastRefreshedAt: row.last_refreshed_at as number,
    createdAt: row.created_at as number,
    enabled: (row.enabled as number) === 1,
  };
}

export class ModelRegistry {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = openDatabase(dbPath);
  }

  upsertModels(models: DiscoveredModel[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO discovered_models (
        id, provider_source, model_id, display_name, context_length,
        supports_vision, supports_tools, supports_streaming, supports_image_gen,
        cost_per_1k_input, cost_per_1k_output, strengths, raw_metadata,
        hf_model_card, hf_downloads, hf_likes, hf_trending_score,
        hf_tags, hf_benchmark_scores, hf_inference_providers,
        last_refreshed_at, created_at, enabled
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?
      )
    `);

    for (const m of models) {
      stmt.run(
        m.id, m.providerSource, m.modelId, m.displayName, m.contextLength,
        m.supportsVision ? 1 : 0, m.supportsTools ? 1 : 0,
        m.supportsStreaming ? 1 : 0, m.supportsImageGen ? 1 : 0,
        m.costPer1kInput, m.costPer1kOutput,
        JSON.stringify(m.strengths), m.rawMetadata ?? null,
        m.hfModelCard ?? null, m.hfDownloads ?? null,
        m.hfLikes ?? null, m.hfTrendingScore ?? null,
        m.hfTags ? JSON.stringify(m.hfTags) : null,
        m.hfBenchmarkScores ? JSON.stringify(m.hfBenchmarkScores) : null,
        m.hfInferenceProviders ? JSON.stringify(m.hfInferenceProviders) : null,
        m.lastRefreshedAt, m.createdAt,
        m.enabled ? 1 : 0,
      );
    }
  }

  getModels(options?: ModelSearchOptions): DiscoveredModel[] {
    const conditions: string[] = [];
    const params: SQLInputValue[] = [];

    if (options?.source) {
      conditions.push('provider_source = ?');
      params.push(options.source);
    }
    if (options?.query) {
      conditions.push('(display_name LIKE ? OR model_id LIKE ?)');
      const q = `%${options.query}%`;
      params.push(q, q);
    }
    if (options?.supportsVision !== undefined) {
      conditions.push('supports_vision = ?');
      params.push(options.supportsVision ? 1 : 0);
    }
    if (options?.supportsTools !== undefined) {
      conditions.push('supports_tools = ?');
      params.push(options.supportsTools ? 1 : 0);
    }
    if (options?.enabled !== undefined) {
      conditions.push('enabled = ?');
      params.push(options.enabled ? 1 : 0);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit ?? 200;
    const offset = options?.offset ?? 0;

    const rows = this.db.prepare(
      `SELECT * FROM discovered_models ${where} ORDER BY display_name ASC LIMIT ? OFFSET ?`,
    ).all(...params, limit, offset) as Row[];

    return rows.map(rowToModel);
  }

  getModel(id: string): DiscoveredModel | undefined {
    const row = this.db.prepare(
      'SELECT * FROM discovered_models WHERE id = ?',
    ).get(id) as Row | undefined;

    return row ? rowToModel(row) : undefined;
  }

  /**
   * Convert discovered models to the format ModelRouter expects.
   * Returns Record<modelId, ModelCapabilities>.
   */
  toModelCapabilities(source: string): Record<string, ModelCapabilitiesLike> {
    const models = this.getModels({ source, enabled: true });
    const result: Record<string, ModelCapabilitiesLike> = {};

    for (const m of models) {
      result[m.modelId] = {
        maxContextTokens: m.contextLength,
        supportsVision: m.supportsVision,
        supportsTools: m.supportsTools,
        supportsStreaming: m.supportsStreaming,
        supportsImageGen: m.supportsImageGen,
        costPer1kInput: m.costPer1kInput,
        costPer1kOutput: m.costPer1kOutput,
        strengths: m.strengths,
        isLocal: false,
      };
    }

    return result;
  }

  search(query: string): DiscoveredModel[] {
    return this.getModels({ query, enabled: true });
  }

  getTrending(limit = 20): DiscoveredModel[] {
    const rows = this.db.prepare(
      `SELECT * FROM discovered_models
       WHERE hf_trending_score IS NOT NULL AND enabled = 1
       ORDER BY hf_trending_score DESC
       LIMIT ?`,
    ).all(limit) as Row[];

    return rows.map(rowToModel);
  }

  pruneStale(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    const result = this.db.prepare(
      'DELETE FROM discovered_models WHERE last_refreshed_at < ?',
    ).run(cutoff);
    return Number(result.changes);
  }

  setEnabled(id: string, enabled: boolean): void {
    this.db.prepare(
      'UPDATE discovered_models SET enabled = ? WHERE id = ?',
    ).run(enabled ? 1 : 0, id);
  }
}
