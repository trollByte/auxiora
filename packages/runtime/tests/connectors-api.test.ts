import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockConnectors = [
  { id: 'github', name: 'GitHub', category: 'dev', auth: { type: 'oauth2' }, actions: [], triggers: [] },
  { id: 'slack', name: 'Slack', category: 'communication', auth: { type: 'oauth2' }, actions: [], triggers: [] },
];

const mockActions = [
  { id: 'create-issue', name: 'Create Issue', connectorId: 'github' },
  { id: 'create-pr', name: 'Create PR', connectorId: 'github' },
];

const mockTriggers = [
  { id: 'on-push', name: 'On Push', connectorId: 'github' },
];

function createTestConnectorRouter(registry: any, authManager: any) {
  const router = express.Router();

  router.get('/', (_req, res) => {
    if (!registry) return res.status(503).json({ error: 'Connectors not configured' });
    try {
      res.json({ connectors: registry.list() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', (req, res) => {
    if (!registry) return res.status(503).json({ error: 'Connectors not configured' });
    try {
      const connector = registry.get(req.params.id);
      if (!connector) return res.status(404).json({ error: 'Connector not found' });
      res.json(connector);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id/actions', (req, res) => {
    if (!registry) return res.status(503).json({ error: 'Connectors not configured' });
    try {
      if (!registry.has(req.params.id)) return res.status(404).json({ error: 'Connector not found' });
      const actions = registry.getActions(req.params.id);
      res.json({ actions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id/triggers', (req, res) => {
    if (!registry) return res.status(503).json({ error: 'Connectors not configured' });
    try {
      if (!registry.has(req.params.id)) return res.status(404).json({ error: 'Connector not found' });
      const triggers = registry.getTriggers(req.params.id);
      res.json({ triggers });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/:id/authenticate', async (req, res) => {
    if (!registry) return res.status(503).json({ error: 'Connectors not configured' });
    if (!authManager) return res.status(503).json({ error: 'Auth manager not configured' });
    try {
      if (!registry.has(req.params.id)) return res.status(404).json({ error: 'Connector not found' });
      await authManager.authenticate(req.params.id, req.params.id, req.body.credentials);
      res.json({ authenticated: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/:id/disconnect', async (req, res) => {
    if (!registry) return res.status(503).json({ error: 'Connectors not configured' });
    if (!authManager) return res.status(503).json({ error: 'Auth manager not configured' });
    try {
      if (!registry.has(req.params.id)) return res.status(404).json({ error: 'Connector not found' });
      await authManager.revokeToken(req.params.id);
      res.json({ disconnected: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id/status', (req, res) => {
    if (!registry) return res.status(503).json({ error: 'Connectors not configured' });
    if (!authManager) return res.status(503).json({ error: 'Auth manager not configured' });
    try {
      if (!registry.has(req.params.id)) return res.status(404).json({ error: 'Connector not found' });
      res.json({
        connected: authManager.hasToken(req.params.id),
        expired: authManager.isTokenExpired(req.params.id),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

describe('Connectors REST API', () => {
  let app: express.Express;

  describe('with no registry (503)', () => {
    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use('/api/v1/connectors', createTestConnectorRouter(null, null));
    });

    it('GET / returns 503', async () => {
      const res = await request(app).get('/api/v1/connectors');
      expect(res.status).toBe(503);
    });

    it('GET /:id returns 503', async () => {
      const res = await request(app).get('/api/v1/connectors/github');
      expect(res.status).toBe(503);
    });

    it('GET /:id/actions returns 503', async () => {
      const res = await request(app).get('/api/v1/connectors/github/actions');
      expect(res.status).toBe(503);
    });

    it('GET /:id/triggers returns 503', async () => {
      const res = await request(app).get('/api/v1/connectors/github/triggers');
      expect(res.status).toBe(503);
    });

    it('POST /:id/authenticate returns 503', async () => {
      const res = await request(app)
        .post('/api/v1/connectors/github/authenticate')
        .send({ credentials: { token: 'abc' } });
      expect(res.status).toBe(503);
    });

    it('POST /:id/disconnect returns 503', async () => {
      const res = await request(app).post('/api/v1/connectors/github/disconnect');
      expect(res.status).toBe(503);
    });

    it('GET /:id/status returns 503', async () => {
      const res = await request(app).get('/api/v1/connectors/github/status');
      expect(res.status).toBe(503);
    });
  });

  describe('with registry but no auth manager', () => {
    const mockRegistry = {
      list: () => mockConnectors,
      get: (id: string) => mockConnectors.find(c => c.id === id),
      has: (id: string) => mockConnectors.some(c => c.id === id),
      getActions: (id: string) => (id === 'github' ? mockActions : []),
      getTriggers: (id: string) => (id === 'github' ? mockTriggers : []),
    };

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use('/api/v1/connectors', createTestConnectorRouter(mockRegistry, null));
    });

    it('POST /:id/authenticate returns 503 without auth manager', async () => {
      const res = await request(app)
        .post('/api/v1/connectors/github/authenticate')
        .send({ credentials: { token: 'abc' } });
      expect(res.status).toBe(503);
    });

    it('POST /:id/disconnect returns 503 without auth manager', async () => {
      const res = await request(app).post('/api/v1/connectors/github/disconnect');
      expect(res.status).toBe(503);
    });

    it('GET /:id/status returns 503 without auth manager', async () => {
      const res = await request(app).get('/api/v1/connectors/github/status');
      expect(res.status).toBe(503);
    });
  });

  describe('with registry and auth manager', () => {
    const mockRegistry = {
      list: () => mockConnectors,
      get: (id: string) => mockConnectors.find(c => c.id === id),
      has: (id: string) => mockConnectors.some(c => c.id === id),
      getActions: (id: string) => (id === 'github' ? mockActions : []),
      getTriggers: (id: string) => (id === 'github' ? mockTriggers : []),
    };

    const tokenStore = new Set<string>();
    const mockAuthManager = {
      authenticate: async (instanceId: string, _connectorId: string, _credentials: any) => {
        tokenStore.add(instanceId);
      },
      revokeToken: async (instanceId: string) => {
        tokenStore.delete(instanceId);
      },
      hasToken: (instanceId: string) => tokenStore.has(instanceId),
      isTokenExpired: (_instanceId: string) => false,
    };

    beforeEach(() => {
      tokenStore.clear();
      app = express();
      app.use(express.json());
      app.use('/api/v1/connectors', createTestConnectorRouter(mockRegistry, mockAuthManager));
    });

    // GET /
    it('GET / lists all connectors', async () => {
      const res = await request(app).get('/api/v1/connectors');
      expect(res.status).toBe(200);
      expect(res.body.connectors).toHaveLength(2);
      expect(res.body.connectors[0].id).toBe('github');
      expect(res.body.connectors[1].id).toBe('slack');
    });

    // GET /:id
    it('GET /:id returns connector', async () => {
      const res = await request(app).get('/api/v1/connectors/github');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('github');
      expect(res.body.name).toBe('GitHub');
    });

    it('GET /:id returns 404 for unknown', async () => {
      const res = await request(app).get('/api/v1/connectors/unknown');
      expect(res.status).toBe(404);
    });

    // GET /:id/actions
    it('GET /:id/actions returns actions', async () => {
      const res = await request(app).get('/api/v1/connectors/github/actions');
      expect(res.status).toBe(200);
      expect(res.body.actions).toHaveLength(2);
      expect(res.body.actions[0].id).toBe('create-issue');
    });

    it('GET /:id/actions returns 404 for unknown connector', async () => {
      const res = await request(app).get('/api/v1/connectors/unknown/actions');
      expect(res.status).toBe(404);
    });

    // GET /:id/triggers
    it('GET /:id/triggers returns triggers', async () => {
      const res = await request(app).get('/api/v1/connectors/github/triggers');
      expect(res.status).toBe(200);
      expect(res.body.triggers).toHaveLength(1);
      expect(res.body.triggers[0].id).toBe('on-push');
    });

    it('GET /:id/triggers returns 404 for unknown connector', async () => {
      const res = await request(app).get('/api/v1/connectors/unknown/triggers');
      expect(res.status).toBe(404);
    });

    // POST /:id/authenticate
    it('POST /:id/authenticate authenticates connector', async () => {
      const res = await request(app)
        .post('/api/v1/connectors/github/authenticate')
        .send({ credentials: { token: 'ghp_abc123' } });
      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
    });

    it('POST /:id/authenticate returns 404 for unknown connector', async () => {
      const res = await request(app)
        .post('/api/v1/connectors/unknown/authenticate')
        .send({ credentials: { token: 'abc' } });
      expect(res.status).toBe(404);
    });

    // POST /:id/disconnect
    it('POST /:id/disconnect revokes token', async () => {
      tokenStore.add('github');
      const res = await request(app).post('/api/v1/connectors/github/disconnect');
      expect(res.status).toBe(200);
      expect(res.body.disconnected).toBe(true);
      expect(tokenStore.has('github')).toBe(false);
    });

    it('POST /:id/disconnect returns 404 for unknown connector', async () => {
      const res = await request(app).post('/api/v1/connectors/unknown/disconnect');
      expect(res.status).toBe(404);
    });

    // GET /:id/status
    it('GET /:id/status returns disconnected status', async () => {
      const res = await request(app).get('/api/v1/connectors/github/status');
      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(false);
      expect(res.body.expired).toBe(false);
    });

    it('GET /:id/status returns connected status after auth', async () => {
      tokenStore.add('github');
      const res = await request(app).get('/api/v1/connectors/github/status');
      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
    });

    it('GET /:id/status returns 404 for unknown connector', async () => {
      const res = await request(app).get('/api/v1/connectors/unknown/status');
      expect(res.status).toBe(404);
    });

    // 500 error handling
    it('GET / returns 500 on registry error', async () => {
      const failRegistry = { ...mockRegistry, list: () => { throw new Error('boom'); } };
      const failApp = express();
      failApp.use(express.json());
      failApp.use('/api/v1/connectors', createTestConnectorRouter(failRegistry, mockAuthManager));

      const res = await request(failApp).get('/api/v1/connectors');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('boom');
    });
  });
});
