import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

describe('ambient REST API', () => {
  function createTestApp() {
    const app = express();
    app.use(express.json());

    const patterns = [
      { id: 'p1', type: 'schedule', description: 'standup', confidence: 0.9, evidence: [], detectedAt: Date.now(), lastConfirmedAt: Date.now(), occurrences: 5 },
    ];

    const mockEngine = {
      getPatterns: vi.fn().mockReturnValue(patterns),
      getPattern: vi.fn().mockImplementation((id: string) => patterns.find(p => p.id === id)),
      detectPatterns: vi.fn().mockReturnValue([]),
      reset: vi.fn(),
      getEventCount: vi.fn().mockReturnValue(10),
    };

    const mockNotifications = {
      getQueue: vi.fn().mockReturnValue([{ id: 'n1', priority: 'nudge', message: 'test', createdAt: Date.now(), dismissed: false, source: 'ambient' }]),
      dismiss: vi.fn().mockReturnValue(true),
      getByPriority: vi.fn().mockReturnValue([]),
      getPendingCount: vi.fn().mockReturnValue(1),
    };

    const mockAnticipation = {
      getAnticipations: vi.fn().mockReturnValue([{ id: 'a1', description: 'upcoming', expectedAt: Date.now() + 3600000, confidence: 0.8, sourcePatterns: ['p1'] }]),
    };

    const mockScheduler = {
      isRunning: vi.fn().mockReturnValue(true),
      start: vi.fn(),
      stop: vi.fn(),
      getConfig: vi.fn().mockReturnValue({ morningCron: '0 7 * * *', eveningCron: '0 18 * * *' }),
    };

    const router = express.Router();

    router.get('/patterns', (_req, res) => {
      res.json({ patterns: mockEngine.getPatterns() });
    });
    router.get('/patterns/:id', (req, res) => {
      const pattern = mockEngine.getPattern(req.params.id);
      if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
      res.json(pattern);
    });
    router.post('/patterns/detect', (_req, res) => {
      const detected = mockEngine.detectPatterns();
      res.json({ detected: detected.length });
    });
    router.delete('/patterns', (_req, res) => {
      mockEngine.reset();
      res.json({ ok: true });
    });
    router.get('/anticipations', (_req, res) => {
      res.json({ anticipations: mockAnticipation.getAnticipations() });
    });
    router.get('/notifications', (_req, res) => {
      res.json({ notifications: mockNotifications.getQueue() });
    });
    router.post('/notifications/:id/dismiss', (req, res) => {
      const ok = mockNotifications.dismiss(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Notification not found' });
      res.json({ ok: true });
    });
    router.get('/notifications/stats', (_req, res) => {
      res.json({ pending: mockNotifications.getPendingCount() });
    });
    router.get('/scheduler/status', (_req, res) => {
      res.json({ running: mockScheduler.isRunning(), config: mockScheduler.getConfig() });
    });
    router.post('/scheduler/start', (_req, res) => {
      mockScheduler.start();
      res.json({ ok: true });
    });
    router.post('/scheduler/stop', (_req, res) => {
      mockScheduler.stop();
      res.json({ ok: true });
    });

    app.use('/api/v1/ambient', router);
    return { app, mockEngine, mockNotifications, mockScheduler };
  }

  it('GET /patterns returns patterns', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/v1/ambient/patterns');
    expect(res.status).toBe(200);
    expect(res.body.patterns).toHaveLength(1);
  });

  it('GET /patterns/:id returns 404 for missing', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/v1/ambient/patterns/missing');
    expect(res.status).toBe(404);
  });

  it('POST /patterns/detect triggers detection', async () => {
    const { app, mockEngine } = createTestApp();
    const res = await request(app).post('/api/v1/ambient/patterns/detect');
    expect(res.status).toBe(200);
    expect(mockEngine.detectPatterns).toHaveBeenCalled();
  });

  it('DELETE /patterns resets all', async () => {
    const { app, mockEngine } = createTestApp();
    const res = await request(app).delete('/api/v1/ambient/patterns');
    expect(res.status).toBe(200);
    expect(mockEngine.reset).toHaveBeenCalled();
  });

  it('GET /anticipations returns upcoming', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/v1/ambient/anticipations');
    expect(res.status).toBe(200);
    expect(res.body.anticipations).toHaveLength(1);
  });

  it('GET /notifications returns queue', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/v1/ambient/notifications');
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
  });

  it('POST /notifications/:id/dismiss marks dismissed', async () => {
    const { app, mockNotifications } = createTestApp();
    const res = await request(app).post('/api/v1/ambient/notifications/n1/dismiss');
    expect(res.status).toBe(200);
    expect(mockNotifications.dismiss).toHaveBeenCalledWith('n1');
  });

  it('GET /scheduler/status returns state', async () => {
    const { app } = createTestApp();
    const res = await request(app).get('/api/v1/ambient/scheduler/status');
    expect(res.status).toBe(200);
    expect(res.body.running).toBe(true);
  });

  it('POST /scheduler/start starts scheduler', async () => {
    const { app, mockScheduler } = createTestApp();
    const res = await request(app).post('/api/v1/ambient/scheduler/start');
    expect(res.status).toBe(200);
    expect(mockScheduler.start).toHaveBeenCalled();
  });

  it('POST /scheduler/stop stops scheduler', async () => {
    const { app, mockScheduler } = createTestApp();
    const res = await request(app).post('/api/v1/ambient/scheduler/stop');
    expect(res.status).toBe(200);
    expect(mockScheduler.stop).toHaveBeenCalled();
  });
});
