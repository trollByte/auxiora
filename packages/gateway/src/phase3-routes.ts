import type { Request, Response } from 'express';

/** Structural types — avoids importing Phase 3 packages directly */
interface AlertStoreLike {
  getRecent(limit: number): unknown[];
}

interface BenchmarkStoreLike {
  listSuites(): string[];
  compareLatest(suite: string): unknown | null;
}

interface ReviewStoreLike {
  getApprovalRate(): number;
  getRecent(limit: number): unknown[];
}

export interface Phase3Deps {
  alertStore?: AlertStoreLike;
  benchmarkStore?: BenchmarkStoreLike;
  reviewStore?: ReviewStoreLike;
}

interface AppLike {
  get(path: string, handler: (req: Request, res: Response) => void): void;
}

export function mountPhase3Routes(app: AppLike, deps: Phase3Deps): void {
  app.get('/api/v1/overseer/alerts', (req: Request, res: Response) => {
    if (!deps.alertStore) {
      res.status(503).json({ error: 'Alert store not available' });
      return;
    }

    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
      const alerts = deps.alertStore.getRecent(limit);
      res.json({ alerts });
    } catch {
      res.status(500).json({ error: 'Internal error reading alerts' });
    }
  });

  app.get('/api/v1/benchmarks/suites', (_req: Request, res: Response) => {
    if (!deps.benchmarkStore) {
      res.status(503).json({ error: 'Benchmark store not available' });
      return;
    }

    try {
      const suites = deps.benchmarkStore.listSuites();
      res.json({ suites });
    } catch {
      res.status(500).json({ error: 'Internal error reading benchmark suites' });
    }
  });

  app.get('/api/v1/benchmarks/compare', (req: Request, res: Response) => {
    if (!deps.benchmarkStore) {
      res.status(503).json({ error: 'Benchmark store not available' });
      return;
    }

    const suite = req.query.suite as string | undefined;
    if (!suite) {
      res.status(400).json({ error: 'Missing required query parameter: suite' });
      return;
    }

    try {
      const comparison = deps.benchmarkStore.compareLatest(suite);
      res.json({ comparison });
    } catch {
      res.status(500).json({ error: 'Internal error comparing benchmarks' });
    }
  });

  app.get('/api/v1/reviews/rate', (_req: Request, res: Response) => {
    if (!deps.reviewStore) {
      res.status(503).json({ error: 'Review store not available' });
      return;
    }

    try {
      const approvalRate = deps.reviewStore.getApprovalRate();
      res.json({ approvalRate });
    } catch {
      res.status(500).json({ error: 'Internal error reading approval rate' });
    }
  });

  app.get('/api/v1/reviews/recent', (req: Request, res: Response) => {
    if (!deps.reviewStore) {
      res.status(503).json({ error: 'Review store not available' });
      return;
    }

    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
      const reviews = deps.reviewStore.getRecent(limit);
      res.json({ reviews });
    } catch {
      res.status(500).json({ error: 'Internal error reading reviews' });
    }
  });
}
