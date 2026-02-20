import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Router } from 'express';
import request from 'supertest';

function createVoiceRouter(voiceManager?: {
  hasActiveSession: (clientId: string) => boolean;
}) {
  const router = Router();

  router.get('/status', (_req: any, res: any) => {
    try {
      if (!voiceManager) {
        return res.json({ enabled: false });
      }
      res.json({ enabled: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/sessions/:clientId', (req: any, res: any) => {
    try {
      if (!voiceManager) {
        return res.status(503).json({ error: 'Voice not initialized' });
      }
      const active = voiceManager.hasActiveSession(req.params.clientId);
      res.json({ active });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

describe('Voice REST API', () => {
  describe('with voiceManager enabled', () => {
    let app: express.Express;
    let mockVoiceManager: { hasActiveSession: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockVoiceManager = {
        hasActiveSession: vi.fn().mockReturnValue(false),
      };
      app = express();
      app.use(express.json());
      app.use('/api/v1/voice', createVoiceRouter(mockVoiceManager));
    });

    it('GET /status returns enabled true', async () => {
      const res = await request(app).get('/api/v1/voice/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ enabled: true });
    });

    it('GET /sessions/:clientId returns active false for unknown client', async () => {
      const res = await request(app).get('/api/v1/voice/sessions/client-123');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ active: false });
      expect(mockVoiceManager.hasActiveSession).toHaveBeenCalledWith('client-123');
    });

    it('GET /sessions/:clientId returns active true for active session', async () => {
      mockVoiceManager.hasActiveSession.mockReturnValue(true);
      const res = await request(app).get('/api/v1/voice/sessions/client-456');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ active: true });
    });

    it('GET /sessions/:clientId returns 500 on error', async () => {
      mockVoiceManager.hasActiveSession.mockImplementation(() => {
        throw new Error('session lookup failed');
      });
      const res = await request(app).get('/api/v1/voice/sessions/client-789');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'session lookup failed' });
    });
  });

  describe('without voiceManager (voice not initialized)', () => {
    let app: express.Express;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use('/api/v1/voice', createVoiceRouter(undefined));
    });

    it('GET /status returns enabled false', async () => {
      const res = await request(app).get('/api/v1/voice/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ enabled: false });
    });

    it('GET /sessions/:clientId returns 503', async () => {
      const res = await request(app).get('/api/v1/voice/sessions/client-123');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'Voice not initialized' });
    });
  });
});
