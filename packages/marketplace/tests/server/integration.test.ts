import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createRegistryServer } from '../../src/server/index.js';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance;
let testDir: string;

beforeEach(async () => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-registry-integration-'));
  server = await createRegistryServer({
    dataDir: testDir,
    port: 0,
    apiKeys: ['integration-key'],
  });
});

afterEach(async () => {
  await server.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('registry integration', () => {
  it('should support full publish → search → install flow for plugins', async () => {
    // 1. Publish
    const publishRes = await server.inject({
      method: 'POST',
      url: '/api/v1/plugins/publish',
      headers: { authorization: 'Bearer integration-key' },
      payload: {
        name: 'greeting_tool',
        version: '1.0.0',
        description: 'Says hello to people',
        author: 'tester',
        license: 'MIT',
        permissions: [],
        keywords: ['greeting', 'hello'],
        content: Buffer.from('fake-plugin-content').toString('base64'),
      },
    });
    expect(publishRes.statusCode).toBe(200);
    expect(JSON.parse(publishRes.payload).success).toBe(true);

    // 2. Search
    const searchRes = await server.inject({
      method: 'GET',
      url: '/api/v1/plugins/search?q=greeting',
    });
    expect(searchRes.statusCode).toBe(200);
    const searchBody = JSON.parse(searchRes.payload);
    expect(searchBody.total).toBe(1);
    expect(searchBody.plugins[0].name).toBe('greeting_tool');

    // 3. Get details
    const getRes = await server.inject({
      method: 'GET',
      url: '/api/v1/plugins/greeting_tool',
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.payload);
    expect(getBody.version).toBe('1.0.0');
    expect(getBody.keywords).toEqual(['greeting', 'hello']);

    // 4. Install
    const installRes = await server.inject({
      method: 'POST',
      url: '/api/v1/plugins/install',
      payload: { name: 'greeting_tool' },
    });
    expect(installRes.statusCode).toBe(200);
    const installBody = JSON.parse(installRes.payload);
    expect(installBody.success).toBe(true);
    expect(installBody.hasContent).toBe(true);
    // Verify base64 content round-trips
    expect(Buffer.from(installBody.content, 'base64').toString()).toBe('fake-plugin-content');

    // 5. Verify download count incremented
    const afterInstall = await server.inject({
      method: 'GET',
      url: '/api/v1/plugins/greeting_tool',
    });
    expect(JSON.parse(afterInstall.payload).downloads).toBeGreaterThanOrEqual(1);
  });

  it('should support full publish → search → install flow for personalities', async () => {
    // 1. Publish
    const publishRes = await server.inject({
      method: 'POST',
      url: '/api/v1/personalities/publish',
      headers: { authorization: 'Bearer integration-key' },
      payload: {
        name: 'cheerful_bot',
        version: '1.0.0',
        description: 'Always cheerful and upbeat',
        author: 'tester',
        preview: 'Hey there! Great to see you!',
        tone: { warmth: 0.9, humor: 0.6, formality: 0.2 },
        keywords: ['cheerful', 'friendly'],
        content: Buffer.from('fake-personality-content').toString('base64'),
      },
    });
    expect(publishRes.statusCode).toBe(200);
    expect(JSON.parse(publishRes.payload).success).toBe(true);

    // 2. Search
    const searchRes = await server.inject({
      method: 'GET',
      url: '/api/v1/personalities/search?q=cheerful',
    });
    expect(searchRes.statusCode).toBe(200);
    const searchBody = JSON.parse(searchRes.payload);
    expect(searchBody.total).toBe(1);
    expect(searchBody.personalities[0].name).toBe('cheerful_bot');

    // 3. Get details with tone
    const getRes = await server.inject({
      method: 'GET',
      url: '/api/v1/personalities/cheerful_bot',
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.payload);
    expect(getBody.tone.warmth).toBe(0.9);

    // 4. Install
    const installRes = await server.inject({
      method: 'POST',
      url: '/api/v1/personalities/install',
      payload: { name: 'cheerful_bot' },
    });
    expect(installRes.statusCode).toBe(200);
    expect(JSON.parse(installRes.payload).success).toBe(true);

    // 5. Verify download count
    const afterInstall = await server.inject({
      method: 'GET',
      url: '/api/v1/personalities/cheerful_bot',
    });
    expect(JSON.parse(afterInstall.payload).downloads).toBeGreaterThanOrEqual(1);
  });

  it('should handle health check', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).status).toBe('ok');
  });

  it('should reject publish without auth', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/plugins/publish',
      payload: { name: 'bad', version: '1.0.0', description: 'test', author: 'x', license: 'MIT' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should update a published plugin version', async () => {
    // Publish v1
    await server.inject({
      method: 'POST',
      url: '/api/v1/plugins/publish',
      headers: { authorization: 'Bearer integration-key' },
      payload: {
        name: 'evolving_tool',
        version: '1.0.0',
        description: 'Version 1',
        author: 'tester',
        license: 'MIT',
        permissions: [],
        keywords: [],
        content: Buffer.from('v1').toString('base64'),
      },
    });

    // Publish v2
    await server.inject({
      method: 'POST',
      url: '/api/v1/plugins/publish',
      headers: { authorization: 'Bearer integration-key' },
      payload: {
        name: 'evolving_tool',
        version: '2.0.0',
        description: 'Version 2',
        author: 'tester',
        license: 'MIT',
        permissions: [],
        keywords: [],
        content: Buffer.from('v2').toString('base64'),
      },
    });

    const getRes = await server.inject({
      method: 'GET',
      url: '/api/v1/plugins/evolving_tool',
    });
    expect(JSON.parse(getRes.payload).version).toBe('2.0.0');
    expect(JSON.parse(getRes.payload).description).toBe('Version 2');
  });
});
