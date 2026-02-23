import { describe, it, expect, afterEach } from 'vitest';
import { createRegistryServer } from '../../src/server/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let testDir: string;

afterEach(() => {
  if (testDir) fs.rmSync(testDir, { recursive: true, force: true });
});

describe('createRegistryServer', () => {
  it('should create a configured server instance', async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-registry-server-'));
    const server = await createRegistryServer({
      dataDir: testDir,
      port: 0,
      apiKeys: ['key-1'],
    });

    expect(server).toBeDefined();
    expect(typeof server.listen).toBe('function');
    expect(typeof server.close).toBe('function');
    await server.close();
  });

  it('should respond to health check', async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-registry-health-'));
    const server = await createRegistryServer({
      dataDir: testDir,
      port: 0,
      apiKeys: [],
    });

    const res = await server.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();

    await server.close();
  });

  it('should serve plugin routes', async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-registry-plugin-routes-'));
    const server = await createRegistryServer({
      dataDir: testDir,
      port: 0,
      apiKeys: ['test-key'],
    });

    const searchRes = await server.inject({ method: 'GET', url: '/api/v1/plugins/search' });
    expect(searchRes.statusCode).toBe(200);
    expect(JSON.parse(searchRes.payload).plugins).toEqual([]);

    await server.close();
  });

  it('should serve personality routes', async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-registry-pers-routes-'));
    const server = await createRegistryServer({
      dataDir: testDir,
      port: 0,
      apiKeys: ['test-key'],
    });

    const searchRes = await server.inject({ method: 'GET', url: '/api/v1/personalities/search' });
    expect(searchRes.statusCode).toBe(200);
    expect(JSON.parse(searchRes.payload).personalities).toEqual([]);

    await server.close();
  });

  it('should clean up database on close', async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-registry-cleanup-'));
    const server = await createRegistryServer({
      dataDir: testDir,
      port: 0,
      apiKeys: [],
    });

    // Server should close without errors
    await server.close();
  });
});
