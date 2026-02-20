import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Router } from 'express';
import request from 'supertest';

/**
 * We test the consciousness REST API routes in isolation by building a router
 * that mirrors createConsciousnessRouter() from the runtime, wired to mock
 * sub-components.  This avoids needing to instantiate the full AuxioraRuntime.
 */

interface MockConsciousness {
  monitor: { getPulse: ReturnType<typeof vi.fn> };
  model: { synthesize: ReturnType<typeof vi.fn> };
  journal: {
    getRecentSessions: ReturnType<typeof vi.fn>;
    getSession: ReturnType<typeof vi.fn>;
  };
  repair: {
    getRepairHistory: ReturnType<typeof vi.fn>;
    getPendingApprovals: ReturnType<typeof vi.fn>;
  };
}

function createTestConsciousnessRouter(consciousness: MockConsciousness | undefined) {
  const router = Router();

  router.get('/pulse', (_req: any, res: any) => {
    if (!consciousness) return res.status(503).json({ error: 'Consciousness not initialized' });
    try {
      const pulse = consciousness.monitor.getPulse();
      res.json(pulse);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/self-model', async (_req: any, res: any) => {
    if (!consciousness) return res.status(503).json({ error: 'Consciousness not initialized' });
    try {
      const snapshot = await consciousness.model.synthesize();
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/journal/sessions', async (req: any, res: any) => {
    if (!consciousness) return res.status(503).json({ error: 'Consciousness not initialized' });
    try {
      const limit = Number(req.query.limit) || 10;
      const sessions = await consciousness.journal.getRecentSessions(limit);
      res.json(sessions);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/journal/sessions/:sessionId', async (req: any, res: any) => {
    if (!consciousness) return res.status(503).json({ error: 'Consciousness not initialized' });
    try {
      const session = await consciousness.journal.getSession(req.params.sessionId);
      res.json(session);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/repairs', async (req: any, res: any) => {
    if (!consciousness) return res.status(503).json({ error: 'Consciousness not initialized' });
    try {
      const limit = Number(req.query.limit) || 20;
      const history = await consciousness.repair.getRepairHistory(limit);
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/repairs/pending', async (_req: any, res: any) => {
    if (!consciousness) return res.status(503).json({ error: 'Consciousness not initialized' });
    try {
      const pending = await consciousness.repair.getPendingApprovals();
      res.json(pending);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

describe('Consciousness REST API', () => {
  let app: express.Express;
  let consciousness: MockConsciousness;

  beforeEach(() => {
    consciousness = {
      monitor: { getPulse: vi.fn() },
      model: { synthesize: vi.fn() },
      journal: {
        getRecentSessions: vi.fn(),
        getSession: vi.fn(),
      },
      repair: {
        getRepairHistory: vi.fn(),
        getPendingApprovals: vi.fn(),
      },
    };
    app = express();
    app.use(express.json());
    app.use('/api/v1/consciousness', createTestConsciousnessRouter(consciousness));
  });

  // --- GET /pulse ---

  it('GET /pulse returns pulse data', async () => {
    const pulseData = { status: 'healthy', uptime: 3600, timestamp: Date.now() };
    consciousness.monitor.getPulse.mockReturnValue(pulseData);

    const res = await request(app).get('/api/v1/consciousness/pulse');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(pulseData);
    expect(consciousness.monitor.getPulse).toHaveBeenCalledOnce();
  });

  it('GET /pulse returns 500 on error', async () => {
    consciousness.monitor.getPulse.mockImplementation(() => {
      throw new Error('monitor failure');
    });

    const res = await request(app).get('/api/v1/consciousness/pulse');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('monitor failure');
  });

  // --- GET /self-model ---

  it('GET /self-model returns synthesized model', async () => {
    const snapshot = { identity: 'auxiora', traits: ['helpful'], version: 1 };
    consciousness.model.synthesize.mockResolvedValue(snapshot);

    const res = await request(app).get('/api/v1/consciousness/self-model');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(snapshot);
    expect(consciousness.model.synthesize).toHaveBeenCalledOnce();
  });

  it('GET /self-model returns 500 on error', async () => {
    consciousness.model.synthesize.mockRejectedValue(new Error('synthesis failed'));

    const res = await request(app).get('/api/v1/consciousness/self-model');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('synthesis failed');
  });

  // --- GET /journal/sessions ---

  it('GET /journal/sessions returns recent sessions with default limit', async () => {
    const sessions = [{ id: 's1', startedAt: Date.now() }];
    consciousness.journal.getRecentSessions.mockResolvedValue(sessions);

    const res = await request(app).get('/api/v1/consciousness/journal/sessions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(sessions);
    expect(consciousness.journal.getRecentSessions).toHaveBeenCalledWith(10);
  });

  it('GET /journal/sessions respects limit query param', async () => {
    consciousness.journal.getRecentSessions.mockResolvedValue([]);

    const res = await request(app).get('/api/v1/consciousness/journal/sessions?limit=5');
    expect(res.status).toBe(200);
    expect(consciousness.journal.getRecentSessions).toHaveBeenCalledWith(5);
  });

  it('GET /journal/sessions returns 500 on error', async () => {
    consciousness.journal.getRecentSessions.mockRejectedValue(new Error('journal error'));

    const res = await request(app).get('/api/v1/consciousness/journal/sessions');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('journal error');
  });

  // --- GET /journal/sessions/:sessionId ---

  it('GET /journal/sessions/:sessionId returns session', async () => {
    const session = { id: 'abc-123', messages: [], startedAt: Date.now() };
    consciousness.journal.getSession.mockResolvedValue(session);

    const res = await request(app).get('/api/v1/consciousness/journal/sessions/abc-123');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(session);
    expect(consciousness.journal.getSession).toHaveBeenCalledWith('abc-123');
  });

  it('GET /journal/sessions/:sessionId returns 500 on error', async () => {
    consciousness.journal.getSession.mockRejectedValue(new Error('not found'));

    const res = await request(app).get('/api/v1/consciousness/journal/sessions/bad-id');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('not found');
  });

  // --- GET /repairs ---

  it('GET /repairs returns repair history with default limit', async () => {
    const history = [{ id: 'r1', action: 'restart', timestamp: Date.now() }];
    consciousness.repair.getRepairHistory.mockResolvedValue(history);

    const res = await request(app).get('/api/v1/consciousness/repairs');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(history);
    expect(consciousness.repair.getRepairHistory).toHaveBeenCalledWith(20);
  });

  it('GET /repairs respects limit query param', async () => {
    consciousness.repair.getRepairHistory.mockResolvedValue([]);

    const res = await request(app).get('/api/v1/consciousness/repairs?limit=5');
    expect(res.status).toBe(200);
    expect(consciousness.repair.getRepairHistory).toHaveBeenCalledWith(5);
  });

  it('GET /repairs returns 500 on error', async () => {
    consciousness.repair.getRepairHistory.mockRejectedValue(new Error('repair db error'));

    const res = await request(app).get('/api/v1/consciousness/repairs');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('repair db error');
  });

  // --- GET /repairs/pending ---

  it('GET /repairs/pending returns pending approvals', async () => {
    const pending = [{ id: 'p1', description: 'restart service', severity: 'low' }];
    consciousness.repair.getPendingApprovals.mockResolvedValue(pending);

    const res = await request(app).get('/api/v1/consciousness/repairs/pending');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(pending);
    expect(consciousness.repair.getPendingApprovals).toHaveBeenCalledOnce();
  });

  it('GET /repairs/pending returns 500 on error', async () => {
    consciousness.repair.getPendingApprovals.mockRejectedValue(new Error('approval error'));

    const res = await request(app).get('/api/v1/consciousness/repairs/pending');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('approval error');
  });

  // --- 503 when consciousness is not initialized ---

  describe('503 when consciousness is not initialized', () => {
    let uninitApp: express.Express;

    beforeEach(() => {
      uninitApp = express();
      uninitApp.use(express.json());
      uninitApp.use('/api/v1/consciousness', createTestConsciousnessRouter(undefined));
    });

    it('GET /pulse returns 503', async () => {
      const res = await request(uninitApp).get('/api/v1/consciousness/pulse');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Consciousness not initialized');
    });

    it('GET /self-model returns 503', async () => {
      const res = await request(uninitApp).get('/api/v1/consciousness/self-model');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Consciousness not initialized');
    });

    it('GET /journal/sessions returns 503', async () => {
      const res = await request(uninitApp).get('/api/v1/consciousness/journal/sessions');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Consciousness not initialized');
    });

    it('GET /journal/sessions/:sessionId returns 503', async () => {
      const res = await request(uninitApp).get('/api/v1/consciousness/journal/sessions/abc');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Consciousness not initialized');
    });

    it('GET /repairs returns 503', async () => {
      const res = await request(uninitApp).get('/api/v1/consciousness/repairs');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Consciousness not initialized');
    });

    it('GET /repairs/pending returns 503', async () => {
      const res = await request(uninitApp).get('/api/v1/consciousness/repairs/pending');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Consciousness not initialized');
    });
  });
});
