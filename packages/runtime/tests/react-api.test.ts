import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Router } from 'express';
import * as crypto from 'node:crypto';
import { ReActLoop } from '@auxiora/react-loop';
import type { ReActCallbacks, ReActConfig, ReActStep } from '@auxiora/react-loop';

function createReactRouter(
  reactLoops: Map<string, ReActLoop>,
  reactResults: Map<string, unknown>,
) {
  const router = Router();

  router.post('/run', (req: any, res: any) => {
    const { goal, maxSteps } = req.body as { goal?: string; maxSteps?: number };
    if (!goal || typeof goal !== 'string') {
      return res.status(400).json({ error: 'goal is required' });
    }

    const id = crypto.randomUUID();
    const config: ReActConfig = {};
    if (maxSteps) {
      config.maxSteps = maxSteps;
    }

    const callbacks: ReActCallbacks = {
      think: async (g: string, history: ReActStep[]) => {
        if (history.length > 0) {
          return { thought: `Analyzed goal: ${g}`, answer: `Completed goal: ${g}` };
        }
        return { thought: `Planning approach for: ${g}` };
      },
      executeTool: async (_toolName: string, _params: Record<string, unknown>) => {
        return 'stub result';
      },
    };

    const loop = new ReActLoop(callbacks, config);
    reactLoops.set(id, loop);

    loop.run(goal).then((result) => {
      reactResults.set(id, result);
    }).catch(() => {});

    res.status(201).json({ id, status: loop.getStatus() });
  });

  router.get('/:id/status', (req: any, res: any) => {
    const loop = reactLoops.get(req.params.id);
    if (!loop) {
      return res.status(404).json({ error: 'Loop not found' });
    }
    const result = reactResults.get(req.params.id);
    res.json({ status: loop.getStatus(), result: result ?? null });
  });

  router.get('/:id/steps', (req: any, res: any) => {
    const loop = reactLoops.get(req.params.id);
    if (!loop) {
      return res.status(404).json({ error: 'Loop not found' });
    }
    res.json(loop.getSteps());
  });

  router.post('/:id/pause', (req: any, res: any) => {
    const loop = reactLoops.get(req.params.id);
    if (!loop) {
      return res.status(404).json({ error: 'Loop not found' });
    }
    loop.pause();
    res.json({ status: loop.getStatus() });
  });

  router.post('/:id/resume', (req: any, res: any) => {
    const loop = reactLoops.get(req.params.id);
    if (!loop) {
      return res.status(404).json({ error: 'Loop not found' });
    }
    loop.resume();
    res.json({ status: loop.getStatus() });
  });

  router.post('/:id/abort', (req: any, res: any) => {
    const loop = reactLoops.get(req.params.id);
    if (!loop) {
      return res.status(404).json({ error: 'Loop not found' });
    }
    loop.abort(req.body?.reason);
    res.json({ status: loop.getStatus() });
  });

  return router;
}

describe('ReAct Loop REST API', () => {
  let app: express.Express;
  let reactLoops: Map<string, ReActLoop>;
  let reactResults: Map<string, unknown>;

  beforeEach(() => {
    reactLoops = new Map();
    reactResults = new Map();
    app = express();
    app.use(express.json());
    app.use('/api/v1/react', createReactRouter(reactLoops, reactResults));
  });

  describe('POST /run', () => {
    it('creates and starts a new ReAct loop', async () => {
      const res = await request(app)
        .post('/api/v1/react/run')
        .send({ goal: 'Find the answer to life' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('string');
      expect(res.body.status).toBeDefined();
    });

    it('returns 400 when goal is missing', async () => {
      const res = await request(app)
        .post('/api/v1/react/run')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('goal is required');
    });

    it('accepts optional maxSteps', async () => {
      const res = await request(app)
        .post('/api/v1/react/run')
        .send({ goal: 'Test goal', maxSteps: 3 });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('stores the loop in the map', async () => {
      const res = await request(app)
        .post('/api/v1/react/run')
        .send({ goal: 'Stored loop test' });
      expect(reactLoops.has(res.body.id)).toBe(true);
    });
  });

  describe('GET /:id/status', () => {
    it('returns loop status', async () => {
      const createRes = await request(app)
        .post('/api/v1/react/run')
        .send({ goal: 'Status test' });
      const id = createRes.body.id;

      // Wait briefly for the async loop to complete
      await new Promise((r) => setTimeout(r, 100));

      const res = await request(app).get(`/api/v1/react/${id}/status`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBeDefined();
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/api/v1/react/nonexistent/status');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Loop not found');
    });
  });

  describe('GET /:id/steps', () => {
    it('returns loop steps', async () => {
      const createRes = await request(app)
        .post('/api/v1/react/run')
        .send({ goal: 'Steps test' });
      const id = createRes.body.id;

      await new Promise((r) => setTimeout(r, 100));

      const res = await request(app).get(`/api/v1/react/${id}/steps`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/api/v1/react/nonexistent/steps');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /:id/pause', () => {
    it('returns 404 for unknown id', async () => {
      const res = await request(app)
        .post('/api/v1/react/nonexistent/pause')
        .send({});
      expect(res.status).toBe(404);
    });
  });

  describe('POST /:id/resume', () => {
    it('returns 404 for unknown id', async () => {
      const res = await request(app)
        .post('/api/v1/react/nonexistent/resume')
        .send({});
      expect(res.status).toBe(404);
    });
  });

  describe('POST /:id/abort', () => {
    it('aborts a loop', async () => {
      // Create a loop with callbacks that take time
      const slowCallbacks: ReActCallbacks = {
        think: async (g: string) => {
          await new Promise((r) => setTimeout(r, 500));
          return { thought: `Thinking about ${g}` };
        },
        executeTool: async () => 'result',
      };
      const loop = new ReActLoop(slowCallbacks, { maxSteps: 10 });
      const id = 'abort-test-id';
      reactLoops.set(id, loop);

      // Start async
      loop.run('long running goal').catch(() => {});

      const res = await request(app)
        .post(`/api/v1/react/${id}/abort`)
        .send({ reason: 'User cancelled' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('failed');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app)
        .post('/api/v1/react/nonexistent/abort')
        .send({});
      expect(res.status).toBe(404);
    });
  });
});
