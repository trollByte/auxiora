import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { pluginRoutes } from '../../../src/server/routes/plugins.js';
import { RegistryDatabase } from '../../../src/server/db.js';
import { PackageStorage } from '../../../src/server/storage.js';

const API_KEY = 'test-key-123';

describe('Plugin API routes', () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let db: RegistryDatabase;
  let storage: PackageStorage;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marketplace-routes-'));
    db = new RegistryDatabase(path.join(tmpDir, 'registry.db'));
    storage = new PackageStorage(path.join(tmpDir, 'packages'));

    app = Fastify();
    await app.register(pluginRoutes, { db, storage, apiKeys: [API_KEY] });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('GET /api/v1/plugins/search', () => {
    it('returns empty results when no plugins exist', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/plugins/search',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.plugins).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('returns matching results for q=weather', async () => {
      db.upsertPlugin({
        name: 'weather-plugin',
        version: '1.0.0',
        description: 'Provides weather forecasts',
        author: 'alice',
        license: 'MIT',
        permissions: ['NETWORK'],
        keywords: ['weather'],
      });
      db.upsertPlugin({
        name: 'calendar-plugin',
        version: '1.0.0',
        description: 'Calendar management',
        author: 'bob',
        license: 'MIT',
        permissions: [],
        keywords: ['calendar'],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/plugins/search?q=weather',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(1);
      expect(body.plugins).toHaveLength(1);
      expect(body.plugins[0].name).toBe('weather-plugin');
    });

    it('supports pagination with limit and offset', async () => {
      for (let i = 0; i < 5; i++) {
        db.upsertPlugin({
          name: `plugin-${String(i).padStart(2, '0')}`,
          version: '1.0.0',
          description: `Plugin number ${i}`,
          author: 'alice',
          license: 'MIT',
          permissions: [],
          keywords: [],
        });
      }

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/plugins/search?limit=2&offset=2',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(5);
      expect(body.plugins).toHaveLength(2);
      expect(body.limit).toBe(2);
      expect(body.offset).toBe(2);
    });
  });

  describe('GET /api/v1/plugins/:name', () => {
    it('returns 404 for unknown plugin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/plugins/nonexistent',
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Plugin not found' });
    });

    it('returns plugin details for existing plugin', async () => {
      db.upsertPlugin({
        name: 'weather-plugin',
        version: '2.0.0',
        description: 'Weather forecasts',
        author: 'alice',
        license: 'MIT',
        permissions: ['NETWORK'],
        keywords: ['weather'],
        homepage: 'https://example.com',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/plugins/weather-plugin',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name).toBe('weather-plugin');
      expect(body.version).toBe('2.0.0');
      expect(body.author).toBe('alice');
      expect(body.permissions).toEqual(['NETWORK']);
      expect(body.homepage).toBe('https://example.com');
    });
  });

  describe('POST /api/v1/plugins/publish', () => {
    it('returns 401 without API key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/plugins/publish',
        payload: { name: 'test', version: '1.0.0', description: 'test', author: 'a' },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: 'Invalid API key' });
    });

    it('publishes successfully with valid key', async () => {
      const content = Buffer.from('fake-tarball').toString('base64');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/plugins/publish',
        headers: { authorization: `Bearer ${API_KEY}` },
        payload: {
          name: 'my-plugin',
          version: '1.0.0',
          description: 'A test plugin',
          author: 'alice',
          license: 'MIT',
          permissions: ['NETWORK'],
          keywords: ['test'],
          content,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true, name: 'my-plugin', version: '1.0.0' });

      // Verify plugin is in database
      const plugin = db.getPlugin('my-plugin');
      expect(plugin).not.toBeNull();
      expect(plugin!.version).toBe('1.0.0');

      // Verify content was stored
      const stored = await storage.retrieve('plugins', 'my-plugin', '1.0.0');
      expect(stored).not.toBeNull();
      expect(stored!.toString()).toBe('fake-tarball');
    });
  });

  describe('POST /api/v1/plugins/install', () => {
    it('returns 404 for unknown plugin', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/plugins/install',
        payload: { name: 'nonexistent' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Plugin not found' });
    });

    it('returns content and increments download count', async () => {
      db.upsertPlugin({
        name: 'my-plugin',
        version: '1.0.0',
        description: 'A test plugin',
        author: 'alice',
        license: 'MIT',
        permissions: [],
        keywords: [],
      });
      await storage.store('plugins', 'my-plugin', '1.0.0', Buffer.from('tarball-data'));

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/plugins/install',
        payload: { name: 'my-plugin' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.name).toBe('my-plugin');
      expect(body.version).toBe('1.0.0');
      expect(body.hasContent).toBe(true);
      expect(Buffer.from(body.content, 'base64').toString()).toBe('tarball-data');

      // Verify download count incremented
      const plugin = db.getPlugin('my-plugin');
      expect(plugin!.downloads).toBe(1);
    });
  });
});
