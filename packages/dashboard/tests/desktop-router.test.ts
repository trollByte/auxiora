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
    desktop: {
      getStatus: vi.fn().mockReturnValue({
        status: 'running',
        autoStart: false,
        hotkey: 'CommandOrControl+Shift+A',
        notificationsEnabled: true,
        ollamaRunning: false,
        updateChannel: 'stable',
      }),
      updateConfig: vi.fn().mockResolvedValue({
        autoStart: true,
        hotkey: 'CommandOrControl+Shift+A',
      }),
      sendNotification: vi.fn().mockResolvedValue(undefined),
      checkUpdates: vi.fn().mockResolvedValue({
        available: false,
        currentVersion: '2.0.0',
        channel: 'stable',
      }),
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

describe('Desktop dashboard routes', () => {
  let deps: DashboardDeps;
  let app: express.Express;
  let cookie: string;

  beforeEach(async () => {
    deps = createMockDeps();
    const created = createApp(deps);
    app = created.app;
    cookie = await loginAndGetCookie(app);
  });

  describe('GET /desktop/status', () => {
    it('should return desktop status', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/desktop/status')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('running');
      expect(res.body.data.hotkey).toBe('CommandOrControl+Shift+A');
    });

    it('should return 503 when desktop not available', async () => {
      const noDeps = createMockDeps();
      delete noDeps.desktop;
      const noDesktopApp = createApp(noDeps);
      const noCookie = await loginAndGetCookie(noDesktopApp.app);

      const res = await request(noDesktopApp.app)
        .get('/api/v1/dashboard/desktop/status')
        .set('Cookie', noCookie);

      expect(res.status).toBe(503);
    });
  });

  describe('POST /desktop/config', () => {
    it('should update desktop config', async () => {
      const res = await request(app)
        .post('/api/v1/dashboard/desktop/config')
        .set('Cookie', cookie)
        .send({ autoStart: true });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(deps.desktop!.updateConfig).toHaveBeenCalledWith({ autoStart: true });
    });
  });

  describe('POST /desktop/notification', () => {
    it('should send a notification', async () => {
      const res = await request(app)
        .post('/api/v1/dashboard/desktop/notification')
        .set('Cookie', cookie)
        .send({ title: 'Test', body: 'Hello' });

      expect(res.status).toBe(200);
      expect(res.body.data.sent).toBe(true);
      expect(deps.desktop!.sendNotification).toHaveBeenCalledWith({
        title: 'Test',
        body: 'Hello',
      });
    });

    it('should require title and body', async () => {
      const res = await request(app)
        .post('/api/v1/dashboard/desktop/notification')
        .set('Cookie', cookie)
        .send({ title: 'No body' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /desktop/updates', () => {
    it('should check for updates', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/desktop/updates')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(false);
      expect(res.body.data.currentVersion).toBe('2.0.0');
    });
  });
});
