import { DatabaseSync } from 'node:sqlite';

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS discovered_models (
    id TEXT PRIMARY KEY,
    provider_source TEXT NOT NULL,
    model_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    context_length INTEGER DEFAULT 0,
    supports_vision INTEGER DEFAULT 0,
    supports_tools INTEGER DEFAULT 0,
    supports_streaming INTEGER DEFAULT 1,
    supports_image_gen INTEGER DEFAULT 0,
    cost_per_1k_input REAL DEFAULT 0,
    cost_per_1k_output REAL DEFAULT 0,
    strengths TEXT DEFAULT '[]',
    raw_metadata TEXT,
    hf_model_card TEXT,
    hf_downloads INTEGER,
    hf_likes INTEGER,
    hf_trending_score REAL,
    hf_tags TEXT,
    hf_benchmark_scores TEXT,
    hf_inference_providers TEXT,
    last_refreshed_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    enabled INTEGER DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_models_source ON discovered_models(provider_source);
  CREATE INDEX IF NOT EXISTS idx_models_enabled ON discovered_models(enabled);
`;

export function openDatabase(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(SCHEMA_DDL);
  return db;
}
