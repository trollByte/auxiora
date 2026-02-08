import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDashboardRouter } from '../src/router.js';
import type { DashboardDeps } from '../src/types.js';

function createMockDeps(): DashboardDeps {
  return {
    vault: {
      get: vi.fn(() => undefined),
      has: vi.fn(() => false),
      add: vi.fn(),
    },
    getConnections: vi.fn().mockReturnValue([]),
    getAuditEntries: vi.fn().mockResolvedValue([]),
    setup: {
      getAgentName: () => 'TestAgent',
      hasSoulFile: async () => true,
    },
    trust: {
      getLevels: vi.fn().mockReturnValue({
        messaging: 2,
        files: 1,
        web: 0,
        shell: 0,
        finance: 0,
        calendar: 0,
        email: 0,
        integrations: 0,
        system: 0,
      }),
      getLevel: vi.fn().mockReturnValue(2),
      setLevel: vi.fn().mockResolvedValue(undefined),
      getAuditEntries: vi.fn().mockReturnValue([
        { id: 'a1', domain: 'messaging', intent: 'send', outcome: 'success', timestamp: Date.now() },
      ]),
      getAuditEntry: vi.fn().mockReturnValue({ id: 'a1' }),
      rollback: vi.fn().mockResolvedValue({ success: true }),
      getPromotions: vi.fn().mockReturnValue([
        { domain: 'messaging', fromLevel: 1, toLevel: 2, reason: 'Test', timestamp: Date.now(), automatic: true },
      ]),
    },
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

describe('Trust dashboard routes', () => {
  let deps: DashboardDeps;
  let app: express.Express;
  let cookie: string;

  beforeEach(async () => {
    deps = createMockDeps();
    const created = createApp(deps);
    app = created.app;
    cookie = await loginAndGetCookie(app);
  });

  describe('GET /trust', () => {
    it('should return all trust levels', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/trust')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.messaging).toBe(2);
      expect(res.body.data.files).toBe(1);
    });

    it('should return 503 when trust not available', async () => {
      const noDeps = createMockDeps();
      delete noDeps.trust;
      const noTrustApp = createApp(noDeps);
      const noCookie = await loginAndGetCookie(noTrustApp.app);

      const res = await request(noTrustApp.app)
        .get('/api/v1/dashboard/trust')
        .set('Cookie', noCookie);

      expect(res.status).toBe(503);
    });
  });

  describe('GET /trust/:domain', () => {
    it('should return trust level for domain', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/trust/messaging')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.domain).toBe('messaging');
      expect(res.body.data.level).toBe(2);
    });
  });

  describe('POST /trust/:domain', () => {
    it('should set trust level', async () => {
      const res = await request(app)
        .post('/api/v1/dashboard/trust/messaging')
        .set('Cookie', cookie)
        .send({ level: 3, reason: 'Approved' });

      expect(res.status).toBe(200);
      expect(res.body.data.level).toBe(3);
      expect(deps.trust!.setLevel).toHaveBeenCalledWith('messaging', 3, 'Approved');
    });

    it('should reject invalid level', async () => {
      const res = await request(app)
        .post('/api/v1/dashboard/trust/messaging')
        .set('Cookie', cookie)
        .send({ level: 5 });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /trust/audit/:id/rollback', () => {
    it('should rollback an action', async () => {
      const res = await request(app)
        .post('/api/v1/dashboard/trust/audit/a1/rollback')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.rolledBack).toBe(true);
    });

    it('should return error on failed rollback', async () => {
      deps.trust!.rollback = vi.fn().mockResolvedValue({ success: false, error: 'Not available' });
      const res = await request(app)
        .post('/api/v1/dashboard/trust/audit/a1/rollback')
        .set('Cookie', cookie);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /trust/promotions', () => {
    it('should return promotion history', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/trust/promotions')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].domain).toBe('messaging');
    });
  });
});
