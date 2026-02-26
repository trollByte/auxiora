import type { Request, Response, Router } from 'express';

/** Structural type matching ModelRegistry from @auxiora/model-registry */
interface ModelRegistryLike {
  getModels(options?: {
    source?: string;
    query?: string;
    supportsVision?: boolean;
    supportsTools?: boolean;
    enabled?: boolean;
    limit?: number;
    offset?: number;
  }): Array<{
    id: string;
    providerSource: string;
    modelId: string;
    displayName: string;
    contextLength: number;
    supportsVision: boolean;
    supportsTools: boolean;
    supportsStreaming: boolean;
    supportsImageGen: boolean;
    costPer1kInput: number;
    costPer1kOutput: number;
    strengths: string[];
    hfModelCard?: string;
    hfDownloads?: number;
    hfLikes?: number;
    hfTrendingScore?: number;
    hfTags?: string[];
    hfBenchmarkScores?: Record<string, number>;
    hfInferenceProviders?: string[];
    lastRefreshedAt: number;
    createdAt: number;
    enabled: boolean;
  }>;
  getModel(id: string): object | undefined;
  getTrending(limit?: number): object[];
  setEnabled(id: string, enabled: boolean): void;
}

interface JobQueueLike {
  enqueue(type: string, payload: Record<string, unknown>): string;
}

export interface ModelRegistryRoutesDeps {
  modelRegistry?: ModelRegistryLike;
  jobQueue?: JobQueueLike;
}

export function createModelRegistryRouter(
  router: Router,
  deps: ModelRegistryRoutesDeps,
): Router {
  router.get('/discovered', (req: Request, res: Response) => {
    if (!deps.modelRegistry) {
      res.status(503).json({ error: 'Model registry not available' });
      return;
    }

    const options: Parameters<ModelRegistryLike['getModels']>[0] = {};
    if (req.query.source) options.source = String(req.query.source);
    if (req.query.search) options.query = String(req.query.search);
    if (req.query.supportsVision === 'true') options.supportsVision = true;
    if (req.query.supportsVision === 'false') options.supportsVision = false;
    if (req.query.supportsTools === 'true') options.supportsTools = true;
    if (req.query.supportsTools === 'false') options.supportsTools = false;
    if (req.query.enabled === 'true') options.enabled = true;
    if (req.query.enabled === 'false') options.enabled = false;
    if (req.query.limit) options.limit = Math.min(parseInt(String(req.query.limit), 10) || 200, 500);
    if (req.query.offset) options.offset = parseInt(String(req.query.offset), 10) || 0;

    const models = deps.modelRegistry.getModels(options);
    res.json({ models, count: models.length });
  });

  router.get('/trending', (req: Request, res: Response) => {
    if (!deps.modelRegistry) {
      res.status(503).json({ error: 'Model registry not available' });
      return;
    }

    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const trending = deps.modelRegistry.getTrending(limit);
    res.json({ models: trending, count: trending.length });
  });

  router.get('/compare', (req: Request, res: Response) => {
    if (!deps.modelRegistry) {
      res.status(503).json({ error: 'Model registry not available' });
      return;
    }

    const a = String(req.query.a || '');
    const b = String(req.query.b || '');
    if (!a || !b) {
      res.status(400).json({ error: 'Both "a" and "b" query parameters are required' });
      return;
    }

    const modelA = deps.modelRegistry.getModel(a);
    const modelB = deps.modelRegistry.getModel(b);
    if (!modelA || !modelB) {
      res.status(404).json({ error: 'One or both models not found' });
      return;
    }

    res.json({ modelA, modelB });
  });

  router.get('/discovered/detail', (req: Request, res: Response) => {
    if (!deps.modelRegistry) {
      res.status(503).json({ error: 'Model registry not available' });
      return;
    }

    const id = String(req.query.id || '');
    if (!id) {
      res.status(400).json({ error: '"id" query parameter is required' });
      return;
    }

    const model = deps.modelRegistry.getModel(id);
    if (!model) {
      res.status(404).json({ error: 'Model not found' });
      return;
    }
    res.json(model);
  });

  router.post('/refresh', (req: Request, res: Response) => {
    if (!deps.jobQueue) {
      res.status(503).json({ error: 'Job queue not available' });
      return;
    }

    const jobId = deps.jobQueue.enqueue('model-registry-refresh', {});
    res.status(202).json({ message: 'Refresh scheduled', jobId });
  });

  router.patch('/discovered/toggle', (req: Request, res: Response) => {
    if (!deps.modelRegistry) {
      res.status(503).json({ error: 'Model registry not available' });
      return;
    }

    const { id, enabled } = req.body as { id?: string; enabled?: boolean };
    if (!id || typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'id (string) and enabled (boolean) fields are required' });
      return;
    }

    deps.modelRegistry.setEnabled(id, enabled);
    res.json({ id, enabled });
  });

  return router;
}
