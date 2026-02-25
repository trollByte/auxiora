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

export interface PersonalityRoutesOptions extends FastifyPluginOptions {
  db: RegistryDatabase;
  storage: PackageStorage;
  apiKeys: string[];
}

export async function personalityRoutes(
  app: FastifyInstance,
  opts: PersonalityRoutesOptions,
): Promise<void> {
  const { db, storage, apiKeys } = opts;

  // GET /api/v1/personalities/search?q=...&author=...&limit=...&offset=...
  app.get('/api/v1/personalities/search', async (request, reply) => {
    const { q, author, sort, limit, offset } = request.query as any;
    const result = db.searchPersonalities({
      query: q,
      author,
      sort,
      limit: clampInt(limit, 20, 1, 100),
      offset: clampInt(offset, 0, 0, 10000),
    });
    return result;
  });

  // GET /api/v1/personalities/:name
  app.get('/api/v1/personalities/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    const personality = db.getPersonality(name);
    if (!personality) {
      return reply.status(404).send({ error: 'Personality not found' });
    }
    return personality;
  });

  // POST /api/v1/personalities/publish (requires API key)
  app.post('/api/v1/personalities/publish', async (request, reply) => {
    const auth = request.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token || !timingSafeTokenMatch(token, apiKeys)) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    const body = request.body as any;
    const { name, version, description, author, preview, tone, keywords, content } = body;

    if (content) {
      if (content.length > MAX_CONTENT_SIZE) {
        return reply.status(413).send({ error: 'Package content too large (max 10MB)' });
      }
      const buffer = Buffer.from(content, 'base64');
      await storage.store('personalities', name, version, buffer);
    }

    db.upsertPersonality({
      name,
      version,
      description,
      author,
      preview: preview || '',
      tone: tone || { warmth: 0.5, humor: 0.5, formality: 0.5 },
      keywords: keywords || [],
    });

    return { success: true, name, version };
  });

  // POST /api/v1/personalities/install
  app.post('/api/v1/personalities/install', async (request, reply) => {
    const { name, version } = request.body as { name: string; version?: string };
    const personality = db.getPersonality(name);
    if (!personality) {
      return reply.status(404).send({ error: 'Personality not found' });
    }

    const ver = version || personality.version;
    const content = await storage.retrieve('personalities', name, ver);

    db.incrementPersonalityDownloads(name);

    return {
      success: true,
      name,
      version: ver,
      hasContent: content !== null,
      content: content ? content.toString('base64') : null,
    };
  });
}
