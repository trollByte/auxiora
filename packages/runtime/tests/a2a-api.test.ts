import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Router } from 'express';
import { AgentCardBuilder, TaskManager as A2ATaskManager } from '@auxiora/a2a';
import type { AgentCard } from '@auxiora/a2a';

function createA2ARouter(taskManager: A2ATaskManager, agentCard: AgentCard) {
  const router = Router();

  router.get('/card', (_req: any, res: any) => {
    res.json(agentCard);
  });

  router.post('/tasks', (req: any, res: any) => {
    const { targetUrl, task } = req.body as { targetUrl?: string; task?: { message: string } };
    if (!task?.message) {
      return res.status(400).json({ error: 'task.message is required' });
    }

    const a2aTask = taskManager.createTask({
      role: 'user',
      parts: [{ type: 'text', text: task.message }],
      timestamp: Date.now(),
    });

    if (targetUrl) {
      a2aTask.metadata = { targetUrl };
    }

    res.status(201).json(a2aTask);
  });

  router.get('/tasks/:id', (req: any, res: any) => {
    const task = taskManager.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  });

  router.post('/tasks/:id/cancel', (req: any, res: any) => {
    const task = taskManager.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    try {
      taskManager.cancelTask(req.params.id);
      res.json(taskManager.getTask(req.params.id));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

describe('A2A REST API', () => {
  let app: express.Express;
  let taskManager: A2ATaskManager;
  let agentCard: AgentCard;

  beforeEach(() => {
    taskManager = new A2ATaskManager();
    agentCard = new AgentCardBuilder()
      .setName('TestAgent')
      .setDescription('A test agent')
      .setUrl('http://localhost:3000')
      .setVersion('1.0.0')
      .build();

    app = express();
    app.use(express.json());
    app.use('/api/v1/a2a', createA2ARouter(taskManager, agentCard));
  });

  describe('GET /card', () => {
    it('returns the agent capability card', async () => {
      const res = await request(app).get('/api/v1/a2a/card');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('TestAgent');
      expect(res.body.description).toBe('A test agent');
      expect(res.body.url).toBe('http://localhost:3000');
      expect(res.body.version).toBe('1.0.0');
    });

    it('includes capabilities and skills arrays', async () => {
      const res = await request(app).get('/api/v1/a2a/card');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.capabilities)).toBe(true);
      expect(Array.isArray(res.body.skills)).toBe(true);
    });
  });

  describe('POST /tasks', () => {
    it('creates a new task', async () => {
      const res = await request(app)
        .post('/api/v1/a2a/tasks')
        .send({ task: { message: 'Do something useful' } });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.state).toBe('submitted');
      expect(res.body.messages).toHaveLength(1);
      expect(res.body.messages[0].parts[0].text).toBe('Do something useful');
    });

    it('returns 400 when task.message is missing', async () => {
      const res = await request(app)
        .post('/api/v1/a2a/tasks')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('task.message is required');
    });

    it('stores targetUrl in metadata when provided', async () => {
      const res = await request(app)
        .post('/api/v1/a2a/tasks')
        .send({
          targetUrl: 'http://other-agent:4000',
          task: { message: 'Forward this' },
        });
      expect(res.status).toBe(201);
      expect(res.body.metadata).toBeDefined();
      expect(res.body.metadata.targetUrl).toBe('http://other-agent:4000');
    });

    it('creates tasks with unique IDs', async () => {
      const res1 = await request(app)
        .post('/api/v1/a2a/tasks')
        .send({ task: { message: 'Task 1' } });
      const res2 = await request(app)
        .post('/api/v1/a2a/tasks')
        .send({ task: { message: 'Task 2' } });
      expect(res1.body.id).not.toBe(res2.body.id);
    });
  });

  describe('GET /tasks/:id', () => {
    it('returns task by ID', async () => {
      const createRes = await request(app)
        .post('/api/v1/a2a/tasks')
        .send({ task: { message: 'Get me' } });
      const id = createRes.body.id;

      const res = await request(app).get(`/api/v1/a2a/tasks/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(id);
      expect(res.body.state).toBe('submitted');
    });

    it('returns 404 for unknown task', async () => {
      const res = await request(app).get('/api/v1/a2a/tasks/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });
  });

  describe('POST /tasks/:id/cancel', () => {
    it('cancels a submitted task', async () => {
      const createRes = await request(app)
        .post('/api/v1/a2a/tasks')
        .send({ task: { message: 'Cancel me' } });
      const id = createRes.body.id;

      const res = await request(app)
        .post(`/api/v1/a2a/tasks/${id}/cancel`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.state).toBe('canceled');
    });

    it('returns 404 for unknown task', async () => {
      const res = await request(app)
        .post('/api/v1/a2a/tasks/nonexistent/cancel')
        .send({});
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });
  });
});
