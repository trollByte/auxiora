// Structural types — avoids importing from other packages directly

interface ArchiveCellLike {
  niche: { domain: string; complexity: string };
  variantId: string;
  benchmarkScore: number;
  lastEvaluated: number;
  staleness: number;
}

interface VariantLike {
  id: string;
  generation: number;
  parentIds: string[];
  strategy: string;
  type: string;
  content: string;
  metadata: Record<string, unknown>;
  metrics: { accuracy: number; latencyP50: number; latencyP95: number; errorRate: number };
  securityPassed: boolean;
  reviewScore: number;
  status: string;
  createdAt: number;
}

interface ArchiveStoreLike {
  getAllCells(): ArchiveCellLike[];
  getVariant(id: string): VariantLike | null;
  getVariantsByParent(parentId: string): VariantLike[];
}

interface LoopStatsLike {
  totalCycles: number;
  successfulCycles: number;
  failedCycles: number;
  archiveOccupancy: number;
  totalVariants: number;
}

export interface GovernorStatsLike {
  tokensUsedThisHour: number;
  variantsCreatedToday: number;
  isUserActive?: boolean;
  canRun?: boolean;
  paused?: boolean;
  pauseReason?: string;
  tokenBudgetRemaining?: number;
  variantsRemainingToday?: number;
}

export interface DarwinRoutesDeps {
  archiveStore: ArchiveStoreLike;
  getLoopStats: () => LoopStatsLike;
  getGovernorStats: () => GovernorStatsLike;
  getPendingApprovals: () => Array<{ variantId: string; queuedAt: number }>;
  approveVariant: (id: string) => Promise<boolean>;
  rejectVariant: (id: string) => boolean;
  isRunning: () => boolean;
  pause: () => void;
  resume: () => void;
}

interface RequestLike {
  params?: Record<string, string>;
  query?: Record<string, string>;
}

interface ResponseLike {
  status(code: number): ResponseLike;
  json(data: unknown): void;
}

interface AppLike {
  get(path: string, handler: (req: RequestLike, res: ResponseLike) => void): void;
  post(path: string, handler: (req: RequestLike, res: ResponseLike) => void): void;
}

export function mountDarwinRoutes(app: AppLike, deps: DarwinRoutesDeps): void {
  app.get('/api/v1/darwin/status', (_req: RequestLike, res: ResponseLike) => {
    try {
      const stats = deps.getLoopStats();
      res.json({ ...stats, running: deps.isRunning() });
    } catch {
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  app.get('/api/v1/darwin/archive', (_req: RequestLike, res: ResponseLike) => {
    try {
      res.json(deps.archiveStore.getAllCells());
    } catch {
      res.status(500).json({ error: 'Failed to get archive' });
    }
  });

  app.get('/api/v1/darwin/variants/:id', (req: RequestLike, res: ResponseLike) => {
    try {
      const id = req.params?.id ?? '';
      const variant = deps.archiveStore.getVariant(id);
      if (!variant) {
        res.status(404).json({ error: 'Variant not found' });
        return;
      }
      res.json(variant);
    } catch {
      res.status(500).json({ error: 'Failed to get variant' });
    }
  });

  app.get('/api/v1/darwin/lineage/:id', (req: RequestLike, res: ResponseLike) => {
    try {
      const id = req.params?.id ?? '';
      const children = deps.archiveStore.getVariantsByParent(id);
      res.json(children);
    } catch {
      res.status(500).json({ error: 'Failed to get lineage' });
    }
  });

  app.get('/api/v1/darwin/governor', (_req: RequestLike, res: ResponseLike) => {
    try {
      res.json(deps.getGovernorStats());
    } catch {
      res.status(500).json({ error: 'Failed to get governor stats' });
    }
  });

  app.get('/api/v1/darwin/approvals', (_req: RequestLike, res: ResponseLike) => {
    try {
      res.json(deps.getPendingApprovals());
    } catch {
      res.status(500).json({ error: 'Failed to get approvals' });
    }
  });

  app.post('/api/v1/darwin/approvals/:id/approve', async (req: RequestLike, res: ResponseLike) => {
    try {
      const id = req.params?.id ?? '';
      const result = await deps.approveVariant(id);
      res.json({ approved: result });
    } catch {
      res.status(500).json({ error: 'Failed to approve variant' });
    }
  });

  app.post('/api/v1/darwin/approvals/:id/reject', (req: RequestLike, res: ResponseLike) => {
    try {
      const id = req.params?.id ?? '';
      const result = deps.rejectVariant(id);
      res.json({ rejected: result });
    } catch {
      res.status(500).json({ error: 'Failed to reject variant' });
    }
  });

  app.post('/api/v1/darwin/pause', (_req: RequestLike, res: ResponseLike) => {
    try {
      deps.pause();
      res.json({ paused: true });
    } catch {
      res.status(500).json({ error: 'Failed to pause' });
    }
  });

  app.post('/api/v1/darwin/resume', (_req: RequestLike, res: ResponseLike) => {
    try {
      deps.resume();
      res.json({ resumed: true });
    } catch {
      res.status(500).json({ error: 'Failed to resume' });
    }
  });
}
