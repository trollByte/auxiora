import Database from 'better-sqlite3';

export interface PluginRecord {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  permissions: string[];
  keywords: string[];
  downloads: number;
  rating: number;
  homepage?: string;
  repository?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalityRecord {
  name: string;
  version: string;
  description: string;
  author: string;
  preview: string;
  tone: { warmth: number; humor: number; formality: number };
  keywords: string[];
  downloads: number;
  rating: number;
  createdAt: string;
  updatedAt: string;
}

export interface SearchOptions {
  query?: string;
  author?: string;
  keywords?: string[];
  sort?: 'name' | 'downloads' | 'rating' | 'updated';
  limit?: number;
  offset?: number;
}

export interface PluginSearchResult {
  plugins: PluginRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface PersonalitySearchResult {
  personalities: PersonalityRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface PluginInput {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  permissions: string[];
  keywords: string[];
  homepage?: string;
  repository?: string;
}

export interface PersonalityInput {
  name: string;
  version: string;
  description: string;
  author: string;
  preview: string;
  tone: { warmth: number; humor: number; formality: number };
  keywords: string[];
}

interface PluginRow {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  permissions: string;
  keywords: string;
  downloads: number;
  rating: number;
  homepage: string | null;
  repository: string | null;
  created_at: string;
  updated_at: string;
}

interface PersonalityRow {
  name: string;
  version: string;
  description: string;
  author: string;
  preview: string;
  warmth: number;
  humor: number;
  formality: number;
  keywords: string;
  downloads: number;
  rating: number;
  created_at: string;
  updated_at: string;
}

function toPluginRecord(row: PluginRow): PluginRecord {
  return {
    name: row.name,
    version: row.version,
    description: row.description,
    author: row.author,
    license: row.license,
    permissions: JSON.parse(row.permissions) as string[],
    keywords: JSON.parse(row.keywords) as string[],
    downloads: row.downloads,
    rating: row.rating,
    ...(row.homepage != null ? { homepage: row.homepage } : {}),
    ...(row.repository != null ? { repository: row.repository } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPersonalityRecord(row: PersonalityRow): PersonalityRecord {
  return {
    name: row.name,
    version: row.version,
    description: row.description,
    author: row.author,
    preview: row.preview,
    tone: { warmth: row.warmth, humor: row.humor, formality: row.formality },
    keywords: JSON.parse(row.keywords) as string[],
    downloads: row.downloads,
    rating: row.rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SORT_MAP: Record<string, string> = {
  name: 'name ASC',
  downloads: 'downloads DESC',
  rating: 'rating DESC',
  updated: 'updated_at DESC',
};

export class RegistryDatabase {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.createTables();
  }

  private createTables(): void {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS plugins (
        name TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        description TEXT NOT NULL,
        author TEXT NOT NULL,
        license TEXT NOT NULL,
        permissions TEXT NOT NULL DEFAULT '[]',
        keywords TEXT NOT NULL DEFAULT '[]',
        downloads INTEGER NOT NULL DEFAULT 0,
        rating REAL NOT NULL DEFAULT 0,
        homepage TEXT,
        repository TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();

    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS personalities (
        name TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        description TEXT NOT NULL,
        author TEXT NOT NULL,
        preview TEXT NOT NULL,
        warmth REAL NOT NULL,
        humor REAL NOT NULL,
        formality REAL NOT NULL,
        keywords TEXT NOT NULL DEFAULT '[]',
        downloads INTEGER NOT NULL DEFAULT 0,
        rating REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
  }

  close(): void {
    this.db.close();
  }

  upsertPlugin(input: PluginInput): void {
    const stmt = this.db.prepare(`
      INSERT INTO plugins (name, version, description, author, license, permissions, keywords, homepage, repository)
      VALUES (@name, @version, @description, @author, @license, @permissions, @keywords, @homepage, @repository)
      ON CONFLICT(name) DO UPDATE SET
        version = excluded.version,
        description = excluded.description,
        author = excluded.author,
        license = excluded.license,
        permissions = excluded.permissions,
        keywords = excluded.keywords,
        homepage = excluded.homepage,
        repository = excluded.repository,
        updated_at = datetime('now')
    `);
    stmt.run({
      name: input.name,
      version: input.version,
      description: input.description,
      author: input.author,
      license: input.license,
      permissions: JSON.stringify(input.permissions),
      keywords: JSON.stringify(input.keywords),
      homepage: input.homepage ?? null,
      repository: input.repository ?? null,
    });
  }

  getPlugin(name: string): PluginRecord | null {
    const row = this.db
      .prepare('SELECT * FROM plugins WHERE name = ?')
      .get(name) as PluginRow | undefined;
    return row ? toPluginRecord(row) : null;
  }

  searchPlugins(options: SearchOptions = {}): PluginSearchResult {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const sort = SORT_MAP[options.sort ?? 'name'] ?? 'name ASC';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.query) {
      conditions.push('(name LIKE ? OR description LIKE ?)');
      const pattern = `%${options.query}%`;
      params.push(pattern, pattern);
    }
    if (options.author) {
      conditions.push('author = ?');
      params.push(options.author);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM plugins ${where}`)
      .get(...params) as { count: number };

    const total = countRow.count;

    const rows = this.db
      .prepare(`SELECT * FROM plugins ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as PluginRow[];

    return {
      plugins: rows.map(toPluginRecord),
      total,
      limit,
      offset,
    };
  }

  incrementDownloads(name: string): void {
    this.db
      .prepare('UPDATE plugins SET downloads = downloads + 1 WHERE name = ?')
      .run(name);
  }

  upsertPersonality(input: PersonalityInput): void {
    const stmt = this.db.prepare(`
      INSERT INTO personalities (name, version, description, author, preview, warmth, humor, formality, keywords)
      VALUES (@name, @version, @description, @author, @preview, @warmth, @humor, @formality, @keywords)
      ON CONFLICT(name) DO UPDATE SET
        version = excluded.version,
        description = excluded.description,
        author = excluded.author,
        preview = excluded.preview,
        warmth = excluded.warmth,
        humor = excluded.humor,
        formality = excluded.formality,
        keywords = excluded.keywords,
        updated_at = datetime('now')
    `);
    stmt.run({
      name: input.name,
      version: input.version,
      description: input.description,
      author: input.author,
      preview: input.preview,
      warmth: input.tone.warmth,
      humor: input.tone.humor,
      formality: input.tone.formality,
      keywords: JSON.stringify(input.keywords),
    });
  }

  getPersonality(name: string): PersonalityRecord | null {
    const row = this.db
      .prepare('SELECT * FROM personalities WHERE name = ?')
      .get(name) as PersonalityRow | undefined;
    return row ? toPersonalityRecord(row) : null;
  }

  searchPersonalities(options: SearchOptions = {}): PersonalitySearchResult {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const sort = SORT_MAP[options.sort ?? 'name'] ?? 'name ASC';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.query) {
      conditions.push('(name LIKE ? OR description LIKE ?)');
      const pattern = `%${options.query}%`;
      params.push(pattern, pattern);
    }
    if (options.author) {
      conditions.push('author = ?');
      params.push(options.author);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM personalities ${where}`)
      .get(...params) as { count: number };

    const total = countRow.count;

    const rows = this.db
      .prepare(`SELECT * FROM personalities ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as PersonalityRow[];

    return {
      personalities: rows.map(toPersonalityRecord),
      total,
      limit,
      offset,
    };
  }

  incrementPersonalityDownloads(name: string): void {
    this.db
      .prepare('UPDATE personalities SET downloads = downloads + 1 WHERE name = ?')
      .run(name);
  }
}
