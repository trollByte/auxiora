import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { CodeExecutor, SessionManager as CodeSessionManager } from '@auxiora/code-interpreter';
import type { Language } from '@auxiora/code-interpreter';
import { Router } from 'express';

function createCodeRouter(executor: CodeExecutor, sessionManager: CodeSessionManager) {
  const router = Router();

  router.post('/execute', async (req: any, res: any) => {
    try {
      const { language, code, timeout } = req.body as {
        language?: string;
        code?: string;
        timeout?: number;
      };
      if (!language || typeof language !== 'string') {
        return res.status(400).json({ error: 'language required' });
      }
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'code required' });
      }
      const validLanguages: Language[] = ['javascript', 'typescript', 'python', 'shell'];
      if (!validLanguages.includes(language as Language)) {
        return res.status(400).json({ error: `Invalid language. Allowed: ${validLanguages.join(', ')}` });
      }
      const result = await executor.execute({
        language: language as Language,
        code,
        timeoutMs: timeout,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/sessions', (_req: any, res: any) => {
    const sessions = sessionManager.listSessions().map((s) => ({
      id: s.id,
      language: s.language,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
      historyLength: s.history.length,
    }));
    res.json({ sessions });
  });

  router.post('/sessions', (req: any, res: any) => {
    try {
      const { language } = req.body as { language?: string };
      if (!language || typeof language !== 'string') {
        return res.status(400).json({ error: 'language required' });
      }
      const validLanguages: Language[] = ['javascript', 'typescript', 'python', 'shell'];
      if (!validLanguages.includes(language as Language)) {
        return res.status(400).json({ error: `Invalid language. Allowed: ${validLanguages.join(', ')}` });
      }
      const session = sessionManager.createSession(language as Language);
      res.status(201).json({
        id: session.id,
        language: session.language,
        createdAt: session.createdAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes('Maximum number of sessions') ? 409 : 500;
      res.status(status).json({ error: message });
    }
  });

  router.get('/sessions/:id', (req: any, res: any) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'session not found' });
    }
    res.json({
      id: session.id,
      language: session.language,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      historyLength: session.history.length,
      history: session.history,
    });
  });

  router.post('/sessions/:id/execute', async (req: any, res: any) => {
    try {
      const { code } = req.body as { code?: string };
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'code required' });
      }
      const result = await sessionManager.execute(req.params.id, code);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        return res.status(404).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  });

  router.delete('/sessions/:id', (req: any, res: any) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'session not found' });
    }
    sessionManager.destroySession(req.params.id);
    res.json({ deleted: true });
  });

  return router;
}

describe('Code Interpreter REST API', () => {
  let app: express.Express;
  let executor: CodeExecutor;
  let sessionManager: CodeSessionManager;

  beforeEach(() => {
    executor = new CodeExecutor();
    sessionManager = new CodeSessionManager(executor, { maxSessions: 3 });
    app = express();
    app.use(express.json());
    app.use('/api/v1/code', createCodeRouter(executor, sessionManager));
  });

  afterEach(() => {
    sessionManager.destroyAll();
  });

  // --- One-shot execute ---

  describe('POST /execute', () => {
    it('executes JavaScript and returns result', async () => {
      const res = await request(app)
        .post('/api/v1/code/execute')
        .send({ language: 'javascript', code: 'console.log("hello")' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.stdout).toContain('hello');
      expect(res.body.exitCode).toBe(0);
      expect(typeof res.body.durationMs).toBe('number');
    });

    it('executes shell and returns result', async () => {
      const res = await request(app)
        .post('/api/v1/code/execute')
        .send({ language: 'shell', code: 'echo "world"' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.stdout).toContain('world');
    });

    it('returns error status for failing code', async () => {
      const res = await request(app)
        .post('/api/v1/code/execute')
        .send({ language: 'javascript', code: 'process.exit(1)' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('error');
      expect(res.body.exitCode).not.toBe(0);
    });

    it('returns 400 when language is missing', async () => {
      const res = await request(app)
        .post('/api/v1/code/execute')
        .send({ code: 'console.log(1)' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('language required');
    });

    it('returns 400 when code is missing', async () => {
      const res = await request(app)
        .post('/api/v1/code/execute')
        .send({ language: 'javascript' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('code required');
    });

    it('returns 400 for invalid language', async () => {
      const res = await request(app)
        .post('/api/v1/code/execute')
        .send({ language: 'ruby', code: 'puts 1' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid language');
    });

    it('accepts optional timeout', async () => {
      const res = await request(app)
        .post('/api/v1/code/execute')
        .send({ language: 'javascript', code: 'console.log("fast")', timeout: 10000 });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // --- Session management ---

  describe('GET /sessions', () => {
    it('returns empty list initially', async () => {
      const res = await request(app).get('/api/v1/code/sessions');
      expect(res.status).toBe(200);
      expect(res.body.sessions).toEqual([]);
    });

    it('returns created sessions', async () => {
      sessionManager.createSession('javascript');
      sessionManager.createSession('shell');
      const res = await request(app).get('/api/v1/code/sessions');
      expect(res.status).toBe(200);
      expect(res.body.sessions).toHaveLength(2);
      expect(res.body.sessions[0]).toHaveProperty('id');
      expect(res.body.sessions[0]).toHaveProperty('language');
      expect(res.body.sessions[0]).toHaveProperty('historyLength');
    });
  });

  describe('POST /sessions', () => {
    it('creates a new session', async () => {
      const res = await request(app)
        .post('/api/v1/code/sessions')
        .send({ language: 'javascript' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.language).toBe('javascript');
      expect(res.body.createdAt).toBeTruthy();
    });

    it('returns 400 when language is missing', async () => {
      const res = await request(app)
        .post('/api/v1/code/sessions')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('language required');
    });

    it('returns 400 for invalid language', async () => {
      const res = await request(app)
        .post('/api/v1/code/sessions')
        .send({ language: 'rust' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid language');
    });

    it('returns 409 when max sessions reached', async () => {
      // maxSessions is 3
      sessionManager.createSession('javascript');
      sessionManager.createSession('javascript');
      sessionManager.createSession('javascript');
      const res = await request(app)
        .post('/api/v1/code/sessions')
        .send({ language: 'javascript' });
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Maximum number of sessions');
    });
  });

  describe('GET /sessions/:id', () => {
    it('returns session details', async () => {
      const session = sessionManager.createSession('shell');
      const res = await request(app).get(`/api/v1/code/sessions/${session.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(session.id);
      expect(res.body.language).toBe('shell');
      expect(res.body.historyLength).toBe(0);
      expect(res.body.history).toEqual([]);
    });

    it('returns 404 for unknown session', async () => {
      const res = await request(app).get('/api/v1/code/sessions/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('session not found');
    });
  });

  describe('POST /sessions/:id/execute', () => {
    it('executes code within a session', async () => {
      const session = sessionManager.createSession('javascript');
      const res = await request(app)
        .post(`/api/v1/code/sessions/${session.id}/execute`)
        .send({ code: 'console.log("session exec")' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.stdout).toContain('session exec');
    });

    it('tracks execution history', async () => {
      const session = sessionManager.createSession('javascript');
      await request(app)
        .post(`/api/v1/code/sessions/${session.id}/execute`)
        .send({ code: 'console.log(1)' });
      await request(app)
        .post(`/api/v1/code/sessions/${session.id}/execute`)
        .send({ code: 'console.log(2)' });

      const detail = await request(app).get(`/api/v1/code/sessions/${session.id}`);
      expect(detail.body.historyLength).toBe(2);
      expect(detail.body.history).toHaveLength(2);
    });

    it('returns 400 when code is missing', async () => {
      const session = sessionManager.createSession('javascript');
      const res = await request(app)
        .post(`/api/v1/code/sessions/${session.id}/execute`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('code required');
    });

    it('returns 404 for unknown session', async () => {
      const res = await request(app)
        .post('/api/v1/code/sessions/nonexistent/execute')
        .send({ code: 'console.log(1)' });
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('DELETE /sessions/:id', () => {
    it('destroys a session', async () => {
      const session = sessionManager.createSession('javascript');
      const res = await request(app).delete(`/api/v1/code/sessions/${session.id}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);

      // Verify it is gone
      const check = await request(app).get(`/api/v1/code/sessions/${session.id}`);
      expect(check.status).toBe(404);
    });

    it('returns 404 for unknown session', async () => {
      const res = await request(app).delete('/api/v1/code/sessions/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('session not found');
    });
  });
});
