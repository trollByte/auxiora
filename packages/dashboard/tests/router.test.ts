import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDashboardRouter } from '../src/router.js';
import type { DashboardDeps } from '../src/types.js';

function createMockDeps(): DashboardDeps {
  return {
    vault: {
      get: vi.fn((name: string) => {
        if (name === 'DASHBOARD_PASSWORD') return 'hashed-pw';
        return undefined;
      }),
      has: vi.fn((name: string) => name === 'DASHBOARD_PASSWORD'),
      add: vi.fn(),
    },
    behaviors: {
      list: vi.fn().mockResolvedValue([
        { id: 'bh-1', type: 'scheduled', status: 'active', action: 'test', runCount: 5, failCount: 0 },
      ]),
      update: vi.fn().mockResolvedValue({ id: 'bh-1', status: 'paused' }),
      remove: vi.fn().mockResolvedValue(true),
    },
    webhooks: {
      list: vi.fn().mockResolvedValue([
        { id: 'wh-1', name: 'hook-1', type: 'generic', enabled: true, secret: 'real-secret' },
      ]),
      update: vi.fn().mockResolvedValue({ id: 'wh-1', name: 'hook-1', enabled: false, secret: 'real-secret' }),
      delete: vi.fn().mockResolvedValue(true),
    },
    getConnections: vi.fn().mockReturnValue([
      { id: 'conn-1', authenticated: true, channelType: 'webchat', lastActive: Date.now(), voiceActive: false },
    ]),
    getAuditEntries: vi.fn().mockResolvedValue([
      { timestamp: '2026-01-01T00:00:00Z', event: 'system.startup', details: {} },
    ]),
  };
}

function createApp(deps: DashboardDeps) {
  const app = express();
  app.use(express.json());
  const { router, auth } = createDashboardRouter({
    deps,
    config: { enabled: true, sessionTtlMs: 86_400_000 },
    verifyPassword: (input: string) => input === 'correct-password',
  });
  app.use('/api/v1/dashboard', router);
  return { app, auth };
}

function loginAndGetCookie(app: express.Express): Promise<string> {
  return request(app)
    .post('/api/v1/dashboard/auth/login')
    .send({ password: 'correct-password' })
    .then((res) => {
      const cookie = res.headers['set-cookie'];
      return Array.isArray(cookie) ? cookie[0] : cookie;
    });
}

describe('Dashboard Router', () => {
  let deps: DashboardDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    ({ app } = createApp(deps));
  });

  describe('auth', () => {
    it('should login with correct password', async () => {
      const res = await request(app)
        .post('/api/v1/dashboard/auth/login')
        .send({ password: 'correct-password' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/dashboard/auth/login')
        .send({ password: 'wrong' });
      expect(res.status).toBe(401);
    });

    it('should rate limit login attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/dashboard/auth/login')
          .send({ password: 'wrong' });
      }
      const res = await request(app)
        .post('/api/v1/dashboard/auth/login')
        .send({ password: 'wrong' });
      expect(res.status).toBe(429);
    });

    it('should check auth status', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/auth/check')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
    });

    it('should logout and invalidate session', async () => {
      const cookie = await loginAndGetCookie(app);
      await request(app)
        .post('/api/v1/dashboard/auth/logout')
        .set('Cookie', cookie);

      const res = await request(app)
        .get('/api/v1/dashboard/auth/check')
        .set('Cookie', cookie);
      expect(res.body.authenticated).toBe(false);
    });

    it('should reject unauthenticated API requests', async () => {
      const res = await request(app).get('/api/v1/dashboard/behaviors');
      expect(res.status).toBe(401);
    });
  });

  describe('behaviors API', () => {
    it('should list behaviors', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/behaviors')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('should patch behavior status', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .patch('/api/v1/dashboard/behaviors/bh-1')
        .set('Cookie', cookie)
        .send({ status: 'paused' });
      expect(res.status).toBe(200);
    });

    it('should delete a behavior', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .delete('/api/v1/dashboard/behaviors/bh-1')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/dashboard/behaviors');
      expect(res.status).toBe(401);
    });
  });

  describe('webhooks API', () => {
    it('should list webhooks with redacted secrets', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/webhooks')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.data[0].secret).toBe('***');
    });

    it('should patch webhook enabled status', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .patch('/api/v1/dashboard/webhooks/wh-1')
        .set('Cookie', cookie)
        .send({ enabled: false });
      expect(res.status).toBe(200);
      expect(res.body.data.secret).toBe('***');
    });

    it('should delete a webhook', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .delete('/api/v1/dashboard/webhooks/wh-1')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
    });
  });

  describe('sessions API', () => {
    it('should list active connections', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/sessions')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('audit API', () => {
    it('should return audit entries', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/audit')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('status API', () => {
    it('should return system status', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/status')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.data.uptime).toBeDefined();
      expect(res.body.data.connections).toBe(1);
    });
  });
});
