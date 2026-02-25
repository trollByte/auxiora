import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Router } from 'express';
import * as crypto from 'node:crypto';
import { SandboxManager } from '@auxiora/sandbox';
import type { DockerApi, ExecResult } from '@auxiora/sandbox';

function createMockDockerApi(): DockerApi {
  const containers = new Map<string, { running: boolean }>();

  return {
    createContainer: vi.fn(async (options) => {
      const id = `container-${crypto.randomUUID().slice(0, 8)}`;
      containers.set(id, { running: false });
      return id;
    }),
    startContainer: vi.fn(async (containerId: string) => {
      const c = containers.get(containerId);
      if (c) c.running = true;
    }),
    stopContainer: vi.fn(async (containerId: string) => {
      const c = containers.get(containerId);
      if (c) c.running = false;
    }),
    removeContainer: vi.fn(async (containerId: string) => {
      containers.delete(containerId);
    }),
    execInContainer: vi.fn(async (_containerId: string, command: string[], _timeoutMs: number): Promise<ExecResult> => {
      return {
        exitCode: 0,
        stdout: `Executed: ${command.join(' ')}`,
        stderr: '',
        timedOut: false,
      };
    }),
    inspectContainer: vi.fn(async (containerId: string) => {
      const c = containers.get(containerId);
      return { running: c?.running ?? false };
    }),
  };
}

function createSandboxRouter(sandboxManager: SandboxManager) {
  const router = Router();

  router.post('/sessions', async (req: any, res: any) => {
    const { workspaceDir } = req.body as { workspaceDir?: string };
    if (!workspaceDir || typeof workspaceDir !== 'string') {
      return res.status(400).json({ error: 'workspaceDir is required' });
    }
    try {
      const sessionId = crypto.randomUUID();
      const session = await sandboxManager.createSession(sessionId, workspaceDir);
      res.status(201).json(session.getInfo());
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/sessions/:id/run', async (req: any, res: any) => {
    const { command } = req.body as { command?: string[] };
    if (!command || !Array.isArray(command)) {
      return res.status(400).json({ error: 'command array is required' });
    }
    try {
      const result = await sandboxManager.runInSandbox(req.params.id, command);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('No sandbox session found')) {
        return res.status(404).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  });

  router.get('/sessions/:id', (req: any, res: any) => {
    const session = sandboxManager.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session.getInfo());
  });

  router.delete('/sessions/:id', async (req: any, res: any) => {
    try {
      const removed = await sandboxManager.destroySession(req.params.id);
      if (!removed) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

describe('Sandbox REST API', () => {
  let app: express.Express;
  let sandboxManager: SandboxManager;
  let mockDocker: DockerApi;

  beforeEach(() => {
    mockDocker = createMockDockerApi();
    sandboxManager = new SandboxManager({ dockerApi: mockDocker });
    app = express();
    app.use(express.json());
    app.use('/api/v1/sandbox', createSandboxRouter(sandboxManager));
  });

  describe('POST /sessions', () => {
    it('creates a new sandbox session', async () => {
      const res = await request(app)
        .post('/api/v1/sandbox/sessions')
        .send({ workspaceDir: '/tmp/workspace' });
      expect(res.status).toBe(201);
      expect(res.body.sessionId).toBeDefined();
      expect(res.body.status).toBe('running');
      expect(res.body.image).toBe('node:22-slim');
    });

    it('returns 400 when workspaceDir is missing', async () => {
      const res = await request(app)
        .post('/api/v1/sandbox/sessions')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('workspaceDir is required');
    });

    it('calls docker createContainer and startContainer', async () => {
      await request(app)
        .post('/api/v1/sandbox/sessions')
        .send({ workspaceDir: '/tmp/test' });
      expect(mockDocker.createContainer).toHaveBeenCalledTimes(1);
      expect(mockDocker.startContainer).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /sessions/:id/run', () => {
    it('runs a command in the sandbox', async () => {
      const createRes = await request(app)
        .post('/api/v1/sandbox/sessions')
        .send({ workspaceDir: '/tmp/workspace' });
      const sessionId = createRes.body.sessionId;

      const res = await request(app)
        .post(`/api/v1/sandbox/sessions/${sessionId}/run`)
        .send({ command: ['echo', 'hello'] });
      expect(res.status).toBe(200);
      expect(res.body.exitCode).toBe(0);
      expect(res.body.stdout).toContain('echo hello');
      expect(res.body.timedOut).toBe(false);
    });

    it('returns 400 when command is missing', async () => {
      const res = await request(app)
        .post('/api/v1/sandbox/sessions/some-id/run')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('command array is required');
    });

    it('returns 404 for unknown session', async () => {
      const res = await request(app)
        .post('/api/v1/sandbox/sessions/nonexistent/run')
        .send({ command: ['ls'] });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /sessions/:id', () => {
    it('returns session info', async () => {
      const createRes = await request(app)
        .post('/api/v1/sandbox/sessions')
        .send({ workspaceDir: '/tmp/workspace' });
      const sessionId = createRes.body.sessionId;

      const res = await request(app).get(`/api/v1/sandbox/sessions/${sessionId}`);
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(sessionId);
      expect(res.body.status).toBe('running');
    });

    it('returns 404 for unknown session', async () => {
      const res = await request(app).get('/api/v1/sandbox/sessions/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Session not found');
    });
  });

  describe('DELETE /sessions/:id', () => {
    it('stops and removes a session', async () => {
      const createRes = await request(app)
        .post('/api/v1/sandbox/sessions')
        .send({ workspaceDir: '/tmp/workspace' });
      const sessionId = createRes.body.sessionId;

      const res = await request(app).delete(`/api/v1/sandbox/sessions/${sessionId}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);

      // Verify it is gone
      const getRes = await request(app).get(`/api/v1/sandbox/sessions/${sessionId}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for unknown session', async () => {
      const res = await request(app).delete('/api/v1/sandbox/sessions/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Session not found');
    });
  });
});
