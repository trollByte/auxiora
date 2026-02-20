import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Router } from 'express';
import request from 'supertest';
import { EvalRunner, EvalStore, exactMatch, containsExpected, lengthRatio, keywordCoverage, sentenceCompleteness, responseRelevance, toxicityScore } from '@auxiora/evaluation';
import type { EvalCase, EvalSuiteResult } from '@auxiora/evaluation';

/**
 * Tests the evaluation REST API routes in isolation by building a router
 * that mirrors createEvalRouter() from the runtime, wired to real
 * EvalRunner and EvalStore instances. This avoids needing to instantiate
 * the full AuxioraRuntime.
 */

function createTestEvalRouter(
  evalRunner: EvalRunner | undefined,
  evalStore: EvalStore | undefined,
) {
  const router = Router();

  router.get('/history/:suiteName', (_req: any, res: any) => {
    if (!evalStore) {
      return res.status(503).json({ error: 'Evaluation system not initialized' });
    }
    try {
      const history = evalStore.getHistory(_req.params.suiteName);
      res.json({ history });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/latest/:suiteName', (_req: any, res: any) => {
    if (!evalStore) {
      return res.status(503).json({ error: 'Evaluation system not initialized' });
    }
    try {
      const latest = evalStore.getLatest(_req.params.suiteName);
      if (!latest) {
        return res.status(404).json({ error: 'No results found for suite' });
      }
      res.json(latest);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/trend/:suiteName/:metricName', (_req: any, res: any) => {
    if (!evalStore) {
      return res.status(503).json({ error: 'Evaluation system not initialized' });
    }
    try {
      const trend = evalStore.getTrend(_req.params.suiteName, _req.params.metricName);
      res.json({ trend });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/run', async (req: any, res: any) => {
    if (!evalRunner || !evalStore) {
      return res.status(503).json({ error: 'Evaluation system not initialized' });
    }
    try {
      const { suiteName, cases, mode } = req.body as {
        suiteName?: string;
        cases?: EvalCase[];
        mode?: string;
      };
      if (!suiteName || !cases || !Array.isArray(cases) || cases.length === 0) {
        return res.status(400).json({ error: 'suiteName and non-empty cases array required' });
      }
      const handler: (input: string) => Promise<string> =
        mode === 'echo' || !mode
          ? async (input: string) => input
          : async (input: string) => input;
      const result = await evalRunner.runSuite(suiteName, cases, handler);
      evalStore.record(result);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/compare', (_req: any, res: any) => {
    if (!evalRunner || !evalStore) {
      return res.status(503).json({ error: 'Evaluation system not initialized' });
    }
    try {
      const { suiteNameA, suiteNameB } = _req.body as {
        suiteNameA?: string;
        suiteNameB?: string;
      };
      if (!suiteNameA || !suiteNameB) {
        return res.status(400).json({ error: 'suiteNameA and suiteNameB required' });
      }
      const latestA = evalStore.getLatest(suiteNameA);
      const latestB = evalStore.getLatest(suiteNameB);
      if (!latestA) {
        return res.status(404).json({ error: `No results found for suite: ${suiteNameA}` });
      }
      if (!latestB) {
        return res.status(404).json({ error: `No results found for suite: ${suiteNameB}` });
      }
      const comparison = evalRunner.compareSuites(latestA, latestB);
      res.json(comparison);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}

describe('Evaluation REST API', () => {
  let app: express.Express;
  let evalRunner: EvalRunner;
  let evalStore: EvalStore;

  const sampleCases: EvalCase[] = [
    {
      id: 'case-1',
      input: 'hello world',
      expectedOutput: 'hello world',
    },
    {
      id: 'case-2',
      input: 'foo bar',
      expectedOutput: 'foo bar',
    },
  ];

  beforeEach(() => {
    evalStore = new EvalStore();
    evalRunner = new EvalRunner({
      exactMatch,
      containsExpected,
      lengthRatio,
      keywordCoverage,
      sentenceCompleteness,
      responseRelevance,
      toxicityScore,
    });
    app = express();
    app.use(express.json());
    app.use('/api/v1/eval', createTestEvalRouter(evalRunner, evalStore));
  });

  // --- POST /run ---

  describe('POST /run', () => {
    it('runs a suite in echo mode and returns results', async () => {
      const res = await request(app)
        .post('/api/v1/eval/run')
        .send({ suiteName: 'test-suite', cases: sampleCases, mode: 'echo' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('test-suite');
      expect(res.body.results).toHaveLength(2);
      expect(res.body.summary.totalCases).toBe(2);
      expect(res.body.summary.passed).toBeGreaterThanOrEqual(0);
      expect(res.body.suiteId).toBeDefined();
      expect(res.body.runAt).toBeGreaterThan(0);
    });

    it('records results in the store after running', async () => {
      await request(app)
        .post('/api/v1/eval/run')
        .send({ suiteName: 'recorded-suite', cases: sampleCases });

      const histRes = await request(app)
        .get('/api/v1/eval/history/recorded-suite');

      expect(histRes.status).toBe(200);
      expect(histRes.body.history).toHaveLength(1);
      expect(histRes.body.history[0].name).toBe('recorded-suite');
    });

    it('returns 400 when suiteName is missing', async () => {
      const res = await request(app)
        .post('/api/v1/eval/run')
        .send({ cases: sampleCases });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('suiteName');
    });

    it('returns 400 when cases is empty', async () => {
      const res = await request(app)
        .post('/api/v1/eval/run')
        .send({ suiteName: 'empty', cases: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('cases');
    });

    it('returns 400 when cases is missing', async () => {
      const res = await request(app)
        .post('/api/v1/eval/run')
        .send({ suiteName: 'no-cases' });

      expect(res.status).toBe(400);
    });

    it('defaults to echo handler when mode is omitted', async () => {
      const res = await request(app)
        .post('/api/v1/eval/run')
        .send({ suiteName: 'default-mode', cases: sampleCases });

      expect(res.status).toBe(200);
      // Echo handler returns input as output, so actualOutput should match input
      expect(res.body.results[0].actualOutput).toBe('hello world');
    });
  });

  // --- GET /history/:suiteName ---

  describe('GET /history/:suiteName', () => {
    it('returns empty history for unknown suite', async () => {
      const res = await request(app)
        .get('/api/v1/eval/history/nonexistent');

      expect(res.status).toBe(200);
      expect(res.body.history).toEqual([]);
    });

    it('returns history after multiple runs', async () => {
      await request(app)
        .post('/api/v1/eval/run')
        .send({ suiteName: 'multi-run', cases: sampleCases });

      await request(app)
        .post('/api/v1/eval/run')
        .send({ suiteName: 'multi-run', cases: sampleCases });

      const res = await request(app)
        .get('/api/v1/eval/history/multi-run');

      expect(res.status).toBe(200);
      expect(res.body.history).toHaveLength(2);
    });
  });

  // --- GET /latest/:suiteName ---

  describe('GET /latest/:suiteName', () => {
    it('returns 404 when no results exist', async () => {
      const res = await request(app)
        .get('/api/v1/eval/latest/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No results found');
    });

    it('returns latest result after a run', async () => {
      await request(app)
        .post('/api/v1/eval/run')
        .send({ suiteName: 'latest-test', cases: sampleCases });

      const res = await request(app)
        .get('/api/v1/eval/latest/latest-test');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('latest-test');
      expect(res.body.results).toHaveLength(2);
    });
  });

  // --- GET /trend/:suiteName/:metricName ---

  describe('GET /trend/:suiteName/:metricName', () => {
    it('returns empty trend for unknown suite', async () => {
      const res = await request(app)
        .get('/api/v1/eval/trend/nonexistent/exactMatch');

      expect(res.status).toBe(200);
      expect(res.body.trend).toEqual([]);
    });

    it('returns trend data after runs', async () => {
      await request(app)
        .post('/api/v1/eval/run')
        .send({ suiteName: 'trend-test', cases: sampleCases });

      await request(app)
        .post('/api/v1/eval/run')
        .send({ suiteName: 'trend-test', cases: sampleCases });

      const res = await request(app)
        .get('/api/v1/eval/trend/trend-test/exactMatch');

      expect(res.status).toBe(200);
      expect(res.body.trend).toHaveLength(2);
      expect(res.body.trend[0]).toHaveProperty('runAt');
      expect(res.body.trend[0]).toHaveProperty('score');
    });
  });

  // --- POST /compare ---

  describe('POST /compare', () => {
    it('compares two suites', async () => {
      // Run suite A with exact match cases
      await request(app)
        .post('/api/v1/eval/run')
        .send({ suiteName: 'suite-a', cases: sampleCases });

      // Run suite B with different cases
      await request(app)
        .post('/api/v1/eval/run')
        .send({
          suiteName: 'suite-b',
          cases: [
            { id: 'c1', input: 'x', expectedOutput: 'y' },
          ],
        });

      const res = await request(app)
        .post('/api/v1/eval/compare')
        .send({ suiteNameA: 'suite-a', suiteNameB: 'suite-b' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('improved');
      expect(res.body).toHaveProperty('regressed');
      expect(res.body).toHaveProperty('unchanged');
      expect(Array.isArray(res.body.improved)).toBe(true);
      expect(Array.isArray(res.body.regressed)).toBe(true);
      expect(Array.isArray(res.body.unchanged)).toBe(true);
    });

    it('returns 400 when suiteNameA is missing', async () => {
      const res = await request(app)
        .post('/api/v1/eval/compare')
        .send({ suiteNameB: 'b' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('suiteNameA');
    });

    it('returns 400 when suiteNameB is missing', async () => {
      const res = await request(app)
        .post('/api/v1/eval/compare')
        .send({ suiteNameA: 'a' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('suiteNameB');
    });

    it('returns 404 when suite A has no results', async () => {
      await request(app)
        .post('/api/v1/eval/run')
        .send({ suiteName: 'only-b', cases: sampleCases });

      const res = await request(app)
        .post('/api/v1/eval/compare')
        .send({ suiteNameA: 'missing-a', suiteNameB: 'only-b' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('missing-a');
    });

    it('returns 404 when suite B has no results', async () => {
      await request(app)
        .post('/api/v1/eval/run')
        .send({ suiteName: 'only-a', cases: sampleCases });

      const res = await request(app)
        .post('/api/v1/eval/compare')
        .send({ suiteNameA: 'only-a', suiteNameB: 'missing-b' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('missing-b');
    });
  });

  // --- 503 when eval system is not initialized ---

  describe('503 when evaluation system is not initialized', () => {
    let uninitApp: express.Express;

    beforeEach(() => {
      uninitApp = express();
      uninitApp.use(express.json());
      uninitApp.use('/api/v1/eval', createTestEvalRouter(undefined, undefined));
    });

    it('GET /history returns 503', async () => {
      const res = await request(uninitApp).get('/api/v1/eval/history/test');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Evaluation system not initialized');
    });

    it('GET /latest returns 503', async () => {
      const res = await request(uninitApp).get('/api/v1/eval/latest/test');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Evaluation system not initialized');
    });

    it('GET /trend returns 503', async () => {
      const res = await request(uninitApp).get('/api/v1/eval/trend/test/metric');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Evaluation system not initialized');
    });

    it('POST /run returns 503', async () => {
      const res = await request(uninitApp)
        .post('/api/v1/eval/run')
        .send({ suiteName: 'test', cases: sampleCases });
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Evaluation system not initialized');
    });

    it('POST /compare returns 503', async () => {
      const res = await request(uninitApp)
        .post('/api/v1/eval/compare')
        .send({ suiteNameA: 'a', suiteNameB: 'b' });
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Evaluation system not initialized');
    });
  });
});
