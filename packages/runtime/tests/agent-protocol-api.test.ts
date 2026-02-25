import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

function createTestAgentProtocolRouter(agentProtocol: any, agentDirectory: any) {
  const router = express.Router();

  router.get('/identity', (_req, res) => {
    if (!agentProtocol || !agentDirectory) {
      return res.status(503).json({ error: 'Agent protocol not initialized' });
    }
    try {
      const identity = agentProtocol.getIdentity();
      res.json(identity);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/inbox', (_req, res) => {
    if (!agentProtocol || !agentDirectory) {
      return res.status(503).json({ error: 'Agent protocol not initialized' });
    }
    try {
      const limit = _req.query.limit ? parseInt(_req.query.limit as string, 10) : 50;
      const messages = agentProtocol.getInbox(limit);
      res.json({ messages });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/messages', async (req, res) => {
    if (!agentProtocol || !agentDirectory) {
      return res.status(503).json({ error: 'Agent protocol not initialized' });
    }
    try {
      const { to, type, payload, replyTo } = req.body;
      const message = await agentProtocol.send(to, type, payload, replyTo);
      res.json(message);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/receive', async (req, res) => {
    if (!agentProtocol || !agentDirectory) {
      return res.status(503).json({ error: 'Agent protocol not initialized' });
    }
    try {
      const response = await agentProtocol.receive(req.body);
      res.json(response ?? { accepted: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/directory', async (_req, res) => {
    if (!agentProtocol || !agentDirectory) {
      return res.status(503).json({ error: 'Agent protocol not initialized' });
    }
    try {
      const agents = await agentDirectory.listAll();
      res.json({ agents });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/directory/search', async (req, res) => {
    if (!agentProtocol || !agentDirectory) {
      return res.status(503).json({ error: 'Agent protocol not initialized' });
    }
    try {
      const results = await agentDirectory.search(req.query.q as string);
      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

const BASE = '/api/v1/agent-protocol';

describe('Agent Protocol REST API', () => {
  let app: express.Express;

  describe('with no agent protocol', () => {
    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use(BASE, createTestAgentProtocolRouter(null, null));
    });

    it('GET /identity returns 503', async () => {
      const res = await request(app).get(`${BASE}/identity`);
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Agent protocol not initialized');
    });

    it('GET /inbox returns 503', async () => {
      const res = await request(app).get(`${BASE}/inbox`);
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Agent protocol not initialized');
    });

    it('POST /messages returns 503', async () => {
      const res = await request(app).post(`${BASE}/messages`).send({ to: { user: 'a', host: 'b' }, type: 'text', payload: 'hi' });
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Agent protocol not initialized');
    });

    it('POST /receive returns 503', async () => {
      const res = await request(app).post(`${BASE}/receive`).send({ id: 'msg-1' });
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Agent protocol not initialized');
    });

    it('GET /directory returns 503', async () => {
      const res = await request(app).get(`${BASE}/directory`);
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Agent protocol not initialized');
    });

    it('GET /directory/search returns 503', async () => {
      const res = await request(app).get(`${BASE}/directory/search?q=test`);
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Agent protocol not initialized');
    });
  });

  describe('with agent protocol initialized', () => {
    const mockIdentity = { user: 'auxiora', host: 'localhost', name: 'Auxiora Agent' };
    const mockMessage = { id: 'msg-1', from: { user: 'auxiora', host: 'localhost' }, to: { user: 'bob', host: 'remote' }, type: 'text', payload: 'hello' };
    const mockAgent = { identifier: { user: 'bob', host: 'remote' }, name: 'Bob Agent', endpoint: 'https://remote/agent' };

    let mockProtocol: any;
    let mockDirectory: any;

    beforeEach(() => {
      mockProtocol = {
        getIdentity: vi.fn().mockReturnValue(mockIdentity),
        getInbox: vi.fn().mockReturnValue([mockMessage]),
        send: vi.fn().mockResolvedValue(mockMessage),
        receive: vi.fn().mockResolvedValue(undefined),
        discover: vi.fn().mockResolvedValue([]),
      };
      mockDirectory = {
        listAll: vi.fn().mockResolvedValue([mockAgent]),
        search: vi.fn().mockResolvedValue([mockAgent]),
        lookup: vi.fn().mockResolvedValue(mockAgent),
        register: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      };

      app = express();
      app.use(express.json());
      app.use(BASE, createTestAgentProtocolRouter(mockProtocol, mockDirectory));
    });

    it('GET /identity returns agent identity', async () => {
      const res = await request(app).get(`${BASE}/identity`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockIdentity);
      expect(mockProtocol.getIdentity).toHaveBeenCalled();
    });

    it('GET /inbox returns messages with default limit', async () => {
      const res = await request(app).get(`${BASE}/inbox`);
      expect(res.status).toBe(200);
      expect(res.body.messages).toEqual([mockMessage]);
      expect(mockProtocol.getInbox).toHaveBeenCalledWith(50);
    });

    it('GET /inbox respects custom limit', async () => {
      const res = await request(app).get(`${BASE}/inbox?limit=10`);
      expect(res.status).toBe(200);
      expect(mockProtocol.getInbox).toHaveBeenCalledWith(10);
    });

    it('POST /messages sends a message', async () => {
      const body = { to: { user: 'bob', host: 'remote' }, type: 'text', payload: 'hello' };
      const res = await request(app).post(`${BASE}/messages`).send(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockMessage);
      expect(mockProtocol.send).toHaveBeenCalledWith(body.to, body.type, body.payload, undefined);
    });

    it('POST /messages passes replyTo when provided', async () => {
      const body = { to: { user: 'bob', host: 'remote' }, type: 'text', payload: 'reply', replyTo: 'msg-0' };
      await request(app).post(`${BASE}/messages`).send(body);
      expect(mockProtocol.send).toHaveBeenCalledWith(body.to, body.type, body.payload, 'msg-0');
    });

    it('POST /receive accepts an incoming message', async () => {
      const res = await request(app).post(`${BASE}/receive`).send(mockMessage);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ accepted: true });
      expect(mockProtocol.receive).toHaveBeenCalledWith(mockMessage);
    });

    it('POST /receive returns response when handler provides one', async () => {
      const responsePayload = { reply: 'acknowledged', id: 'resp-1' };
      mockProtocol.receive.mockResolvedValue(responsePayload);
      const res = await request(app).post(`${BASE}/receive`).send(mockMessage);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(responsePayload);
    });

    it('GET /directory returns all agents', async () => {
      const res = await request(app).get(`${BASE}/directory`);
      expect(res.status).toBe(200);
      expect(res.body.agents).toEqual([mockAgent]);
      expect(mockDirectory.listAll).toHaveBeenCalled();
    });

    it('GET /directory/search returns search results', async () => {
      const res = await request(app).get(`${BASE}/directory/search?q=bob`);
      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([mockAgent]);
      expect(mockDirectory.search).toHaveBeenCalledWith('bob');
    });
  });

  describe('error handling', () => {
    let mockProtocol: any;
    let mockDirectory: any;

    beforeEach(() => {
      mockProtocol = {
        getIdentity: () => { throw new Error('Identity unavailable'); },
        getInbox: () => { throw new Error('Inbox error'); },
        send: async () => { throw new Error('Send failed'); },
        receive: async () => { throw new Error('Receive failed'); },
        discover: async () => { throw new Error('Discover failed'); },
      };
      mockDirectory = {
        listAll: async () => { throw new Error('Directory unavailable'); },
        search: async () => { throw new Error('Search failed'); },
      };

      app = express();
      app.use(express.json());
      app.use(BASE, createTestAgentProtocolRouter(mockProtocol, mockDirectory));
    });

    it('GET /identity returns 500 on error', async () => {
      const res = await request(app).get(`${BASE}/identity`);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Identity unavailable');
    });

    it('GET /inbox returns 500 on error', async () => {
      const res = await request(app).get(`${BASE}/inbox`);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Inbox error');
    });

    it('POST /messages returns 500 on error', async () => {
      const res = await request(app).post(`${BASE}/messages`).send({ to: { user: 'a', host: 'b' }, type: 'text', payload: 'hi' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Send failed');
    });

    it('POST /receive returns 500 on error', async () => {
      const res = await request(app).post(`${BASE}/receive`).send({ id: 'msg-1' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Receive failed');
    });

    it('GET /directory returns 500 on error', async () => {
      const res = await request(app).get(`${BASE}/directory`);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Directory unavailable');
    });

    it('GET /directory/search returns 500 on error', async () => {
      const res = await request(app).get(`${BASE}/directory/search?q=test`);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Search failed');
    });
  });
});
