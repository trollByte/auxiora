import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { ResearchJob } from '@auxiora/research';

function createTestRouter(jobs: Map<string, ResearchJob>) {
  const router = express.Router();

  router.post('/', (req, res) => {
    const { question, depth = 'deep' } = req.body;
    if (!question) return res.status(400).json({ error: 'question required' });
    const job: ResearchJob = {
      id: `test-${Date.now()}`, question, depth,
      status: 'planning', createdAt: Date.now(), progress: [],
    };
    jobs.set(job.id, job);
    res.status(202).json({ jobId: job.id, status: job.status });
  });

  router.get('/', (req, res) => {
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;
    const all = [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
    res.json({ jobs: all.slice(offset, offset + limit), total: all.length });
  });

  router.get('/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'not found' });
    res.json(job);
  });

  router.delete('/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'not found' });
    if (job.status === 'completed' || job.status === 'failed') {
      return res.status(409).json({ error: 'job already finished' });
    }
    job.status = 'cancelled';
    res.json({ jobId: job.id, status: 'cancelled' });
  });

  router.get('/:jobId/sources', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'not found' });
    res.json({ sources: job.report?.sources ?? [] });
  });

  return router;
}

describe('Research REST API', () => {
  let app: express.Express;
  let jobs: Map<string, ResearchJob>;

  beforeEach(() => {
    jobs = new Map();
    app = express();
    app.use(express.json());
    app.use('/api/v1/research', createTestRouter(jobs));
  });

  it('POST /research creates a job', async () => {
    const res = await request(app).post('/api/v1/research').send({ question: 'Test Q' });
    expect(res.status).toBe(202);
    expect(res.body.jobId).toBeTruthy();
    expect(res.body.status).toBe('planning');
  });

  it('POST /research returns 400 without question', async () => {
    const res = await request(app).post('/api/v1/research').send({});
    expect(res.status).toBe(400);
  });

  it('GET /research lists jobs', async () => {
    jobs.set('j1', { id: 'j1', question: 'Q1', depth: 'deep', status: 'completed', createdAt: Date.now(), progress: [] });
    const res = await request(app).get('/api/v1/research');
    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('GET /research/:jobId returns job', async () => {
    jobs.set('j1', { id: 'j1', question: 'Q1', depth: 'deep', status: 'planning', createdAt: Date.now(), progress: [] });
    const res = await request(app).get('/api/v1/research/j1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('j1');
  });

  it('GET /research/:jobId returns 404 for unknown', async () => {
    const res = await request(app).get('/api/v1/research/nope');
    expect(res.status).toBe(404);
  });

  it('DELETE /research/:jobId cancels running job', async () => {
    jobs.set('j1', { id: 'j1', question: 'Q1', depth: 'deep', status: 'searching', createdAt: Date.now(), progress: [] });
    const res = await request(app).delete('/api/v1/research/j1');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });

  it('DELETE /research/:jobId returns 409 for finished job', async () => {
    jobs.set('j1', { id: 'j1', question: 'Q1', depth: 'deep', status: 'completed', createdAt: Date.now(), progress: [] });
    const res = await request(app).delete('/api/v1/research/j1');
    expect(res.status).toBe(409);
  });

  it('GET /research/:jobId/sources returns sources', async () => {
    jobs.set('j1', {
      id: 'j1', question: 'Q1', depth: 'deep', status: 'completed', createdAt: Date.now(), progress: [],
      report: {
        id: 'r1', question: 'Q1', executiveSummary: 's', sections: [], knowledgeGaps: [],
        sources: [{ id: 's1', url: 'https://example.com', title: 'Ex', domain: 'example.com', credibilityScore: 0.9, citedIn: ['A'] }],
        metadata: { depth: 'deep', totalSources: 1, refinementRounds: 0, duration: 1000, tokenUsage: 500, confidence: 0.8 },
      },
    });
    const res = await request(app).get('/api/v1/research/j1/sources');
    expect(res.status).toBe(200);
    expect(res.body.sources).toHaveLength(1);
  });
});
