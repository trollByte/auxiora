import { describe, it, expect, beforeEach, vi } from 'vitest';
import { A2AServer } from '../src/a2a-server.js';
import { TaskManager } from '../src/task-manager.js';
import { AgentCardBuilder } from '../src/agent-card.js';
import type { A2AMessage, A2ATask, AgentCard } from '../src/types.js';

function makeMessage(role: 'user' | 'agent' = 'user', text = 'hello'): A2AMessage {
  return {
    role,
    parts: [{ type: 'text', text }],
    timestamp: Date.now(),
  };
}

function buildCard(): AgentCard {
  return new AgentCardBuilder()
    .setName('TestAgent')
    .setDescription('Test')
    .setUrl('https://test.example.com')
    .setVersion('1.0.0')
    .build();
}

describe('A2AServer', () => {
  let server: A2AServer;
  let taskManager: TaskManager;
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    taskManager = new TaskManager();
    handler = vi.fn<(task: A2ATask) => Promise<void>>().mockResolvedValue(undefined);
    server = new A2AServer(buildCard(), taskManager, handler);
  });

  describe('GET /.well-known/agent.json', () => {
    it('returns the agent card', async () => {
      const res = await server.handleRequest('GET', '/.well-known/agent.json');

      expect(res.status).toBe(200);
      const body = res.body as AgentCard;
      expect(body.name).toBe('TestAgent');
      expect(body.version).toBe('1.0.0');
    });
  });

  describe('POST /tasks', () => {
    it('creates a task and returns 201', async () => {
      const msg = makeMessage();
      const res = await server.handleRequest('POST', '/tasks', { message: msg });

      expect(res.status).toBe(201);
      const task = res.body as A2ATask;
      expect(task.id).toBeDefined();
      expect(task.state).toBe('working');
      expect(task.messages).toHaveLength(1);
    });

    it('calls the task handler', async () => {
      await server.handleRequest('POST', '/tasks', { message: makeMessage() });

      // handler is fire-and-forget, give it a tick
      await new Promise((r) => setTimeout(r, 10));
      expect(handler).toHaveBeenCalledOnce();
    });

    it('returns 400 when message is missing', async () => {
      const res = await server.handleRequest('POST', '/tasks', {});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /tasks/:id', () => {
    it('returns the task', async () => {
      const createRes = await server.handleRequest('POST', '/tasks', {
        message: makeMessage(),
      });
      const task = createRes.body as A2ATask;

      const res = await server.handleRequest('GET', `/tasks/${task.id}`);
      expect(res.status).toBe(200);
      expect((res.body as A2ATask).id).toBe(task.id);
    });

    it('returns 404 for unknown task', async () => {
      const res = await server.handleRequest('GET', '/tasks/unknown-id');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /tasks/:id/messages', () => {
    it('adds a message to an existing task', async () => {
      const createRes = await server.handleRequest('POST', '/tasks', {
        message: makeMessage(),
      });
      const task = createRes.body as A2ATask;

      const res = await server.handleRequest(
        'POST',
        `/tasks/${task.id}/messages`,
        { message: makeMessage('agent', 'reply') },
      );

      expect(res.status).toBe(200);
      const updated = res.body as A2ATask;
      expect(updated.messages).toHaveLength(2);
    });

    it('returns 404 for unknown task', async () => {
      const res = await server.handleRequest('POST', '/tasks/unknown/messages', {
        message: makeMessage(),
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 when message is missing', async () => {
      const createRes = await server.handleRequest('POST', '/tasks', {
        message: makeMessage(),
      });
      const task = createRes.body as A2ATask;

      const res = await server.handleRequest('POST', `/tasks/${task.id}/messages`, {});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /tasks/:id/cancel', () => {
    it('cancels a task', async () => {
      const createRes = await server.handleRequest('POST', '/tasks', {
        message: makeMessage(),
      });
      const task = createRes.body as A2ATask;

      const res = await server.handleRequest('POST', `/tasks/${task.id}/cancel`);
      expect(res.status).toBe(200);
      expect((res.body as A2ATask).state).toBe('canceled');
    });

    it('returns 404 for unknown task', async () => {
      const res = await server.handleRequest('POST', '/tasks/unknown/cancel');
      expect(res.status).toBe(404);
    });
  });

  describe('unknown routes', () => {
    it('returns 404 for unknown paths', async () => {
      const res = await server.handleRequest('GET', '/unknown');
      expect(res.status).toBe(404);
    });
  });

  describe('error handling', () => {
    it('sets task to failed when handler throws', async () => {
      handler.mockRejectedValue(new Error('handler error'));

      const res = await server.handleRequest('POST', '/tasks', {
        message: makeMessage(),
      });
      const task = res.body as A2ATask;

      // Wait for the fire-and-forget handler to complete
      await new Promise((r) => setTimeout(r, 50));

      const updated = taskManager.getTask(task.id);
      expect(updated?.state).toBe('failed');
    });
  });
});
