import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

function createTestMcpRouter(manager: any) {
  const router = express.Router();

  router.get('/servers', (_req, res) => {
    if (!manager) return res.json({ servers: {} });
    const status = manager.getStatus();
    const servers: Record<string, any> = {};
    for (const [name, s] of status) servers[name] = s;
    res.json({ servers });
  });

  router.post('/servers/:name/connect', async (req, res) => {
    if (!manager) return res.status(503).json({ error: 'MCP not configured' });
    try {
      await manager.connect(req.params.name);
      res.json({ status: 'connected' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/servers/:name/disconnect', async (req, res) => {
    if (!manager) return res.status(503).json({ error: 'MCP not configured' });
    try {
      await manager.disconnect(req.params.name);
      res.json({ status: 'disconnected' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/servers/:name/tools', (req, res) => {
    if (!manager) return res.status(503).json({ error: 'MCP not configured' });
    const tools = manager.getToolsForServer(req.params.name);
    res.json({ tools });
  });

  return router;
}

describe('MCP REST API', () => {
  let app: express.Express;

  describe('with no MCP manager', () => {
    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use('/api/v1/mcp', createTestMcpRouter(null));
    });

    it('GET /servers returns empty when MCP not configured', async () => {
      const res = await request(app).get('/api/v1/mcp/servers');
      expect(res.status).toBe(200);
      expect(res.body.servers).toEqual({});
    });

    it('POST /servers/:name/connect returns 503 when not configured', async () => {
      const res = await request(app).post('/api/v1/mcp/servers/test/connect');
      expect(res.status).toBe(503);
    });
  });

  describe('with MCP manager', () => {
    const mockStatus = new Map([
      ['test-server', { state: 'connected', toolCount: 3 }],
    ]);
    const mockManager = {
      getStatus: () => mockStatus,
      connect: async (name: string) => {
        if (name === 'unknown') throw new Error('Server not found');
      },
      disconnect: async () => {},
      getToolsForServer: (name: string) => {
        if (name === 'test-server') return ['tool1', 'tool2', 'tool3'];
        return [];
      },
    };

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use('/api/v1/mcp', createTestMcpRouter(mockManager));
    });

    it('GET /servers lists connected servers', async () => {
      const res = await request(app).get('/api/v1/mcp/servers');
      expect(res.status).toBe(200);
      expect(res.body.servers['test-server']).toEqual({ state: 'connected', toolCount: 3 });
    });

    it('POST /servers/:name/connect succeeds', async () => {
      const res = await request(app).post('/api/v1/mcp/servers/test-server/connect');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('connected');
    });

    it('POST /servers/:name/connect returns 500 on error', async () => {
      const res = await request(app).post('/api/v1/mcp/servers/unknown/connect');
      expect(res.status).toBe(500);
    });

    it('POST /servers/:name/disconnect succeeds', async () => {
      const res = await request(app).post('/api/v1/mcp/servers/test-server/disconnect');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('disconnected');
    });

    it('GET /servers/:name/tools returns tools', async () => {
      const res = await request(app).get('/api/v1/mcp/servers/test-server/tools');
      expect(res.status).toBe(200);
      expect(res.body.tools).toEqual(['tool1', 'tool2', 'tool3']);
    });
  });
});
