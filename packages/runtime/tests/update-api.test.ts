import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Router } from 'express';
import request from 'supertest';
import type { UpdateChannel } from '@auxiora/updater';

/**
 * Tests the self-update REST API routes in isolation by building a router
 * that mirrors createUpdateRouter() from the runtime, wired to mock
 * sub-components. This avoids needing to instantiate the full AuxioraRuntime.
 */

interface MockInstallationDetector {
  detect: ReturnType<typeof vi.fn>;
}

interface MockVersionChecker {
  check: ReturnType<typeof vi.fn>;
}

interface MockUpdater {
  update: ReturnType<typeof vi.fn>;
  rollback: ReturnType<typeof vi.fn>;
}

function createTestUpdateRouter(
  detector: MockInstallationDetector | undefined,
  versionChecker: MockVersionChecker | undefined,
  updater: MockUpdater | undefined,
) {
  const router = Router();

  router.get('/status', async (_req: any, res: any) => {
    if (!detector || !versionChecker) {
      return res.status(503).json({ error: 'Update system not initialized' });
    }
    try {
      const info = detector.detect();
      res.json({
        method: info.method,
        currentVersion: info.currentVersion,
        installPath: info.installPath,
        canSelfUpdate: info.canSelfUpdate,
        requiresSudo: info.requiresSudo,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/check', async (req: any, res: any) => {
    if (!detector || !versionChecker) {
      return res.status(503).json({ error: 'Update system not initialized' });
    }
    try {
      const channel = (req.body?.channel ?? 'stable') as UpdateChannel;
      const info = detector.detect();
      const result = await versionChecker.check(info.currentVersion, channel);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/apply', async (req: any, res: any) => {
    if (!updater) {
      return res.status(503).json({ error: 'Update system not initialized' });
    }
    try {
      const channel = (req.body?.channel ?? 'stable') as UpdateChannel;
      const result = await updater.update(channel);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/rollback', async (_req: any, res: any) => {
    if (!updater) {
      return res.status(503).json({ error: 'Update system not initialized' });
    }
    try {
      await updater.rollback();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

describe('Update REST API', () => {
  let app: express.Express;
  let detector: MockInstallationDetector;
  let versionChecker: MockVersionChecker;
  let updater: MockUpdater;

  const sampleInfo = {
    method: 'npm' as const,
    currentVersion: '1.3.0',
    installPath: '/usr/lib/node_modules/auxiora',
    canSelfUpdate: true,
    requiresSudo: false,
  };

  const sampleCheckResult = {
    available: true,
    currentVersion: '1.3.0',
    latestVersion: '1.4.0',
    channel: 'stable' as const,
    releaseUrl: 'https://github.com/auxiora/auxiora/releases/v1.4.0',
    releaseNotes: 'Bug fixes and improvements',
    publishedAt: Date.now(),
    assets: [],
  };

  beforeEach(() => {
    detector = { detect: vi.fn().mockReturnValue(sampleInfo) };
    versionChecker = { check: vi.fn().mockResolvedValue(sampleCheckResult) };
    updater = {
      update: vi.fn().mockResolvedValue({
        success: true,
        previousVersion: '1.3.0',
        newVersion: '1.4.0',
        method: 'npm',
        rolledBack: false,
        durationMs: 5000,
      }),
      rollback: vi.fn().mockResolvedValue(undefined),
    };
    app = express();
    app.use(express.json());
    app.use('/api/v1/update', createTestUpdateRouter(detector, versionChecker, updater));
  });

  // --- GET /status ---

  describe('GET /status', () => {
    it('returns installation info', async () => {
      const res = await request(app).get('/api/v1/update/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        method: 'npm',
        currentVersion: '1.3.0',
        installPath: '/usr/lib/node_modules/auxiora',
        canSelfUpdate: true,
        requiresSudo: false,
      });
      expect(detector.detect).toHaveBeenCalledOnce();
    });

    it('returns 500 when detector throws', async () => {
      detector.detect.mockImplementation(() => {
        throw new Error('detection failure');
      });

      const res = await request(app).get('/api/v1/update/status');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('detection failure');
    });
  });

  // --- POST /check ---

  describe('POST /check', () => {
    it('checks for updates with default stable channel', async () => {
      const res = await request(app)
        .post('/api/v1/update/check')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual(sampleCheckResult);
      expect(detector.detect).toHaveBeenCalledOnce();
      expect(versionChecker.check).toHaveBeenCalledWith('1.3.0', 'stable');
    });

    it('checks for updates with specified channel', async () => {
      const res = await request(app)
        .post('/api/v1/update/check')
        .send({ channel: 'beta' });

      expect(res.status).toBe(200);
      expect(versionChecker.check).toHaveBeenCalledWith('1.3.0', 'beta');
    });

    it('returns 500 when check throws', async () => {
      versionChecker.check.mockRejectedValue(new Error('network error'));

      const res = await request(app)
        .post('/api/v1/update/check')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('network error');
    });
  });

  // --- POST /apply ---

  describe('POST /apply', () => {
    it('triggers update with default stable channel', async () => {
      const res = await request(app)
        .post('/api/v1/update/apply')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        previousVersion: '1.3.0',
        newVersion: '1.4.0',
        method: 'npm',
        rolledBack: false,
        durationMs: 5000,
      });
      expect(updater.update).toHaveBeenCalledWith('stable');
    });

    it('triggers update with specified channel', async () => {
      const res = await request(app)
        .post('/api/v1/update/apply')
        .send({ channel: 'nightly' });

      expect(res.status).toBe(200);
      expect(updater.update).toHaveBeenCalledWith('nightly');
    });

    it('returns 500 when update throws', async () => {
      updater.update.mockRejectedValue(new Error('update failed'));

      const res = await request(app)
        .post('/api/v1/update/apply')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('update failed');
    });

    it('returns update result with rolledBack on failure', async () => {
      updater.update.mockResolvedValue({
        success: false,
        previousVersion: '1.3.0',
        newVersion: '1.4.0',
        method: 'npm',
        rolledBack: true,
        error: 'Health check failed after update',
        durationMs: 12000,
      });

      const res = await request(app)
        .post('/api/v1/update/apply')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.rolledBack).toBe(true);
      expect(res.body.error).toBe('Health check failed after update');
    });
  });

  // --- POST /rollback ---

  describe('POST /rollback', () => {
    it('performs rollback successfully', async () => {
      const res = await request(app)
        .post('/api/v1/update/rollback')
        .send();

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(updater.rollback).toHaveBeenCalledOnce();
    });

    it('returns 500 when rollback throws', async () => {
      updater.rollback.mockRejectedValue(new Error('No staged update found to rollback'));

      const res = await request(app)
        .post('/api/v1/update/rollback')
        .send();

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('No staged update found to rollback');
    });
  });

  // --- 503 when update system is not initialized ---

  describe('503 when update system is not initialized', () => {
    let uninitApp: express.Express;

    beforeEach(() => {
      uninitApp = express();
      uninitApp.use(express.json());
      uninitApp.use('/api/v1/update', createTestUpdateRouter(undefined, undefined, undefined));
    });

    it('GET /status returns 503', async () => {
      const res = await request(uninitApp).get('/api/v1/update/status');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Update system not initialized');
    });

    it('POST /check returns 503', async () => {
      const res = await request(uninitApp)
        .post('/api/v1/update/check')
        .send({});
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Update system not initialized');
    });

    it('POST /apply returns 503', async () => {
      const res = await request(uninitApp)
        .post('/api/v1/update/apply')
        .send({});
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Update system not initialized');
    });

    it('POST /rollback returns 503', async () => {
      const res = await request(uninitApp)
        .post('/api/v1/update/rollback')
        .send();
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Update system not initialized');
    });
  });
});
