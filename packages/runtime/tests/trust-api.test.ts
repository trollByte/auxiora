import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Router } from 'express';
import request from 'supertest';

/**
 * We test the trust REST API routes in isolation by building a router
 * that mirrors createTrustRouter() from the runtime, wired to mock
 * sub-components.  This avoids needing to instantiate the full AuxioraRuntime.
 */

interface MockTrustEngine {
  getAllLevels: ReturnType<typeof vi.fn>;
  getTrustLevel: ReturnType<typeof vi.fn>;
  getEvidence: ReturnType<typeof vi.fn>;
  setTrustLevel: ReturnType<typeof vi.fn>;
}

interface MockAuditTrail {
  getHistory: ReturnType<typeof vi.fn>;
}

function createTestTrustRouter(
  trustEngine: MockTrustEngine | undefined,
  trustAuditTrail: MockAuditTrail | undefined,
) {
  const router = Router();

  router.get('/levels', (_req: any, res: any) => {
    if (!trustEngine) return res.status(503).json({ error: 'Trust engine not initialized' });
    try {
      const levels = trustEngine.getAllLevels();
      res.json({ levels });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/levels/:domain', (_req: any, res: any) => {
    if (!trustEngine) return res.status(503).json({ error: 'Trust engine not initialized' });
    try {
      const domain = _req.params.domain;
      const level = trustEngine.getTrustLevel(domain);
      const evidence = trustEngine.getEvidence(domain);
      res.json({ domain, level, evidence });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.put('/levels/:domain', async (req: any, res: any) => {
    if (!trustEngine) return res.status(503).json({ error: 'Trust engine not initialized' });
    try {
      const domain = req.params.domain;
      const { level, reason } = req.body;
      await trustEngine.setTrustLevel(domain, level, reason);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/audit', (_req: any, res: any) => {
    if (!trustEngine) return res.status(503).json({ error: 'Trust engine not initialized' });
    try {
      const history = trustAuditTrail ? trustAuditTrail.getHistory() : [];
      res.json({ history });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

describe('Trust REST API', () => {
  let app: express.Express;
  let trustEngine: MockTrustEngine;
  let trustAuditTrail: MockAuditTrail;

  beforeEach(() => {
    trustEngine = {
      getAllLevels: vi.fn(),
      getTrustLevel: vi.fn(),
      getEvidence: vi.fn(),
      setTrustLevel: vi.fn(),
    };
    trustAuditTrail = {
      getHistory: vi.fn(),
    };
    app = express();
    app.use(express.json());
    app.use('/api/v1/trust', createTestTrustRouter(trustEngine, trustAuditTrail));
  });

  // --- GET /levels ---

  it('GET /levels returns all trust levels', async () => {
    const levels = { system: 4, web: 2, filesystem: 3 };
    trustEngine.getAllLevels.mockReturnValue(levels);

    const res = await request(app).get('/api/v1/trust/levels');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ levels });
    expect(trustEngine.getAllLevels).toHaveBeenCalledOnce();
  });

  it('GET /levels returns 500 on error', async () => {
    trustEngine.getAllLevels.mockImplementation(() => {
      throw new Error('levels failure');
    });

    const res = await request(app).get('/api/v1/trust/levels');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('levels failure');
  });

  // --- GET /levels/:domain ---

  it('GET /levels/:domain returns domain level and evidence', async () => {
    trustEngine.getTrustLevel.mockReturnValue(3);
    trustEngine.getEvidence.mockReturnValue([{ action: 'read', success: true }]);

    const res = await request(app).get('/api/v1/trust/levels/filesystem');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      domain: 'filesystem',
      level: 3,
      evidence: [{ action: 'read', success: true }],
    });
    expect(trustEngine.getTrustLevel).toHaveBeenCalledWith('filesystem');
    expect(trustEngine.getEvidence).toHaveBeenCalledWith('filesystem');
  });

  it('GET /levels/:domain returns 500 on error', async () => {
    trustEngine.getTrustLevel.mockImplementation(() => {
      throw new Error('unknown domain');
    });

    const res = await request(app).get('/api/v1/trust/levels/bad');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('unknown domain');
  });

  // --- PUT /levels/:domain ---

  it('PUT /levels/:domain sets trust level', async () => {
    trustEngine.setTrustLevel.mockResolvedValue(undefined);

    const res = await request(app)
      .put('/api/v1/trust/levels/web')
      .send({ level: 2, reason: 'user request' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(trustEngine.setTrustLevel).toHaveBeenCalledWith('web', 2, 'user request');
  });

  it('PUT /levels/:domain returns 500 on error', async () => {
    trustEngine.setTrustLevel.mockRejectedValue(new Error('invalid level'));

    const res = await request(app)
      .put('/api/v1/trust/levels/web')
      .send({ level: 99, reason: 'test' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('invalid level');
  });

  // --- GET /audit ---

  it('GET /audit returns audit history', async () => {
    const history = [{ id: 'a1', action: 'set_level', timestamp: Date.now() }];
    trustAuditTrail.getHistory.mockReturnValue(history);

    const res = await request(app).get('/api/v1/trust/audit');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ history });
    expect(trustAuditTrail.getHistory).toHaveBeenCalledOnce();
  });

  it('GET /audit returns empty array when trustAuditTrail is undefined', async () => {
    const appNoAudit = express();
    appNoAudit.use(express.json());
    appNoAudit.use('/api/v1/trust', createTestTrustRouter(trustEngine, undefined));

    const res = await request(appNoAudit).get('/api/v1/trust/audit');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ history: [] });
  });

  it('GET /audit returns 500 on error', async () => {
    trustAuditTrail.getHistory.mockImplementation(() => {
      throw new Error('audit db error');
    });

    const res = await request(app).get('/api/v1/trust/audit');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('audit db error');
  });

  // --- 503 when trust engine is not initialized ---

  describe('503 when trust engine is not initialized', () => {
    let uninitApp: express.Express;

    beforeEach(() => {
      uninitApp = express();
      uninitApp.use(express.json());
      uninitApp.use('/api/v1/trust', createTestTrustRouter(undefined, undefined));
    });

    it('GET /levels returns 503', async () => {
      const res = await request(uninitApp).get('/api/v1/trust/levels');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Trust engine not initialized');
    });

    it('GET /levels/:domain returns 503', async () => {
      const res = await request(uninitApp).get('/api/v1/trust/levels/system');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Trust engine not initialized');
    });

    it('PUT /levels/:domain returns 503', async () => {
      const res = await request(uninitApp)
        .put('/api/v1/trust/levels/system')
        .send({ level: 1, reason: 'test' });
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Trust engine not initialized');
    });

    it('GET /audit returns 503', async () => {
      const res = await request(uninitApp).get('/api/v1/trust/audit');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Trust engine not initialized');
    });
  });
});
