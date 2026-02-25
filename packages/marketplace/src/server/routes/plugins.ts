import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { RegistryDatabase } from '../db.js';
import type { PackageStorage } from '../storage.js';

const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB base64

function timingSafeTokenMatch(token: string, keys: string[]): boolean {
  const tokenBuf = Buffer.from(token);
  for (const key of keys) {
    const keyBuf = Buffer.from(key);
    if (tokenBuf.length === keyBuf.length && timingSafeEqual(tokenBuf, keyBuf)) {
      return true;
    }
  }
  return false;
}

function clampInt(value: string | undefined, defaultVal: number, min: number, max: number): number {
  if (value === undefined) return defaultVal;
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultVal;
  return Math.min(Math.max(Math.round(n), min), max);
}

export interface PluginRoutesOptions extends FastifyPluginOptions {
  db: RegistryDatabase;
  storage: PackageStorage;
  apiKeys: string[];
}

export async function pluginRoutes(
  app: FastifyInstance,
  opts: PluginRoutesOptions,
): Promise<void> {
  const { db, storage, apiKeys } = opts;

  // GET /api/v1/plugins/search?q=...&author=...&limit=...&offset=...
  app.get('/api/v1/plugins/search', async (request, _reply) => {
    const { q, author, keywords, sort, limit, offset } = request.query as Record<string, string | undefined>;
    const result = db.searchPlugins({
      query: q,
      author,
      keywords: keywords ? keywords.split(',') : undefined,
      sort: sort as 'name' | 'downloads' | 'rating' | 'updated' | undefined,
      limit: clampInt(limit, 20, 1, 100),
      offset: clampInt(offset, 0, 0, 10000),
    });
    return result;
  });

  // GET /api/v1/plugins/:name
  app.get('/api/v1/plugins/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    const plugin = db.getPlugin(name);
    if (!plugin) {
      return reply.status(404).send({ error: 'Plugin not found' });
    }
    return plugin;
  });

  // POST /api/v1/plugins/publish (requires API key)
  app.post('/api/v1/plugins/publish', async (request, reply) => {
    const auth = request.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token || !timingSafeTokenMatch(token, apiKeys)) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    const body = request.body as Record<string, unknown>;
    const {
      name,
      version,
      description,
      author,
      license,
      permissions,
      keywords,
      content,
      homepage,
      repository,
    } = body as {
      name: string;
      version: string;
      description: string;
      author: string;
      license?: string;
      permissions?: string[];
      keywords?: string[];
      content?: string;
      homepage?: string;
      repository?: string;
    };

    // Store package if content provided
    if (content) {
      if (content.length > MAX_CONTENT_SIZE) {
        return reply.status(413).send({ error: 'Package content too large (max 10MB)' });
      }
      const buffer = Buffer.from(content, 'base64');
      await storage.store('plugins', name, version, buffer);
    }

    // Upsert in database
    db.upsertPlugin({
      name,
      version,
      description,
      author,
      license: license || 'MIT',
      permissions: permissions || [],
      keywords: keywords || [],
      homepage,
      repository,
    });

    return { success: true, name, version };
  });

  // POST /api/v1/plugins/install
  app.post('/api/v1/plugins/install', async (request, reply) => {
    const { name, version } = request.body as { name: string; version?: string };
    const plugin = db.getPlugin(name);
    if (!plugin) {
      return reply.status(404).send({ error: 'Plugin not found' });
    }

    const ver = version || plugin.version;
    const content = await storage.retrieve('plugins', name, ver);

    db.incrementDownloads(name);

    return {
      success: true,
      name,
      version: ver,
      hasContent: content !== null,
      content: content ? content.toString('base64') : null,
    };
  });
}
