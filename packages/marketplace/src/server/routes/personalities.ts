import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { RegistryDatabase } from '../db.js';
import type { PackageStorage } from '../storage.js';

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
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
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
    if (!token || !apiKeys.includes(token)) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    const body = request.body as any;
    const { name, version, description, author, preview, tone, keywords, content } = body;

    if (content) {
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
