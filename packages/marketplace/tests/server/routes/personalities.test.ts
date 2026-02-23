import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { RegistryDatabase } from '../../../src/server/db.js';
import { PackageStorage } from '../../../src/server/storage.js';
import { personalityRoutes } from '../../../src/server/routes/personalities.js';

const API_KEY = 'test-key-123';

describe('personalityRoutes', () => {
  let app: FastifyInstance;
  let db: RegistryDatabase;
  let storage: PackageStorage;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'personality-routes-'));
    db = new RegistryDatabase(join(tmpDir, 'test.db'));
    storage = new PackageStorage(join(tmpDir, 'packages'));

    app = Fastify();
    await app.register(personalityRoutes, {
      db,
      storage,
      apiKeys: [API_KEY],
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('GET /api/v1/personalities/search', () => {
    it('should return empty results when no personalities exist', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/personalities/search',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.personalities).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should return matching results for query', async () => {
      db.upsertPersonality({
        name: 'comedian-bot',
        version: '1.0.0',
        description: 'A funny comedian assistant',
        author: 'alice',
        preview: 'Why did the chicken cross the road?',
        tone: { warmth: 0.7, humor: 0.95, formality: 0.2 },
        keywords: ['funny', 'humor'],
      });
      db.upsertPersonality({
        name: 'formal-bot',
        version: '1.0.0',
        description: 'A professional assistant',
        author: 'bob',
        preview: 'How may I assist you today?',
        tone: { warmth: 0.5, humor: 0.1, formality: 0.9 },
        keywords: ['formal'],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/personalities/search?q=comedian',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(1);
      expect(body.personalities).toHaveLength(1);
      expect(body.personalities[0].name).toBe('comedian-bot');
    });
  });

  describe('GET /api/v1/personalities/:name', () => {
    it('should return 404 for unknown personality', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/personalities/nonexistent',
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Personality not found' });
    });

    it('should return personality with tone', async () => {
      db.upsertPersonality({
        name: 'cheerful-bot',
        version: '2.0.0',
        description: 'A cheerful helper',
        author: 'carol',
        preview: 'Hello sunshine!',
        tone: { warmth: 0.9, humor: 0.6, formality: 0.3 },
        keywords: ['cheerful', 'happy'],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/personalities/cheerful-bot',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name).toBe('cheerful-bot');
      expect(body.version).toBe('2.0.0');
      expect(body.tone).toEqual({ warmth: 0.9, humor: 0.6, formality: 0.3 });
      expect(body.keywords).toEqual(['cheerful', 'happy']);
    });
  });

  describe('POST /api/v1/personalities/publish', () => {
    it('should return 401 without API key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/personalities/publish',
        payload: {
          name: 'test-bot',
          version: '1.0.0',
          description: 'Test',
          author: 'tester',
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: 'Invalid API key' });
    });

    it('should publish successfully with valid key', async () => {
      const content = Buffer.from('fake-tarball-content').toString('base64');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/personalities/publish',
        headers: {
          authorization: `Bearer ${API_KEY}`,
        },
        payload: {
          name: 'new-bot',
          version: '1.0.0',
          description: 'A brand new bot',
          author: 'dave',
          preview: 'Hi there!',
          tone: { warmth: 0.8, humor: 0.4, formality: 0.5 },
          keywords: ['new'],
          content,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({ success: true, name: 'new-bot', version: '1.0.0' });

      // Verify it was actually stored in the database
      const personality = db.getPersonality('new-bot');
      expect(personality).not.toBeNull();
      expect(personality!.name).toBe('new-bot');
      expect(personality!.author).toBe('dave');
    });
  });

  describe('POST /api/v1/personalities/install', () => {
    it('should return 404 for unknown personality', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/personalities/install',
        payload: { name: 'nonexistent' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Personality not found' });
    });
  });
});
