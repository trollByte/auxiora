// Structural types — avoids importing Phase 4 packages directly

interface CallgraphStoreLike {
  listWorkflows(): unknown[];
  getSnapshot(workflowId: string): unknown;
}

interface EventStoreLike {
  getRecent(limit: number): unknown[];
}

interface AssessmentStoreLike {
  getRecent(limit: number): unknown[];
}

interface ImprovementStoreLike {
  getRecent(limit: number): unknown[];
}

export interface Phase4Deps {
  callgraphStore?: CallgraphStoreLike;
  eventStore?: EventStoreLike;
  assessmentStore?: AssessmentStoreLike;
  improvementStore?: ImprovementStoreLike;
}

interface RequestLike {
  query?: Record<string, string>;
}

interface ResponseLike {
  status(code: number): ResponseLike;
  json(data: unknown): void;
}

interface AppLike {
  get(path: string, handler: (req: RequestLike, res: ResponseLike) => void): void;
}

export function mountPhase4Routes(app: AppLike, deps: Phase4Deps): void {
  app.get('/api/v1/callgraph/workflows', (_req: RequestLike, res: ResponseLike) => {
    if (!deps.callgraphStore) {
      res.status(503).json({ error: 'Callgraph store not available' });
      return;
    }
    try {
      res.json(deps.callgraphStore.listWorkflows());
    } catch {
      res.status(500).json({ error: 'Failed to list workflows' });
    }
  });

  app.get('/api/v1/callgraph/snapshot', (req: RequestLike, res: ResponseLike) => {
    if (!deps.callgraphStore) {
      res.status(503).json({ error: 'Callgraph store not available' });
      return;
    }
    try {
      const workflowId = req.query?.workflowId ?? '';
      res.json(deps.callgraphStore.getSnapshot(workflowId));
    } catch {
      res.status(500).json({ error: 'Failed to get snapshot' });
    }
  });

  app.get('/api/v1/events/recent', (req: RequestLike, res: ResponseLike) => {
    if (!deps.eventStore) {
      res.status(503).json({ error: 'Event store not available' });
      return;
    }
    try {
      const limit = parseInt(req.query?.limit ?? '50', 10);
      res.json(deps.eventStore.getRecent(limit));
    } catch {
      res.status(500).json({ error: 'Failed to get events' });
    }
  });

  app.get('/api/v1/overseer/assessments', (req: RequestLike, res: ResponseLike) => {
    if (!deps.assessmentStore) {
      res.status(503).json({ error: 'Assessment store not available' });
      return;
    }
    try {
      const limit = parseInt(req.query?.limit ?? '50', 10);
      res.json(deps.assessmentStore.getRecent(limit));
    } catch {
      res.status(500).json({ error: 'Failed to get assessments' });
    }
  });

  app.get('/api/v1/improvements/proposals', (req: RequestLike, res: ResponseLike) => {
    if (!deps.improvementStore) {
      res.status(503).json({ error: 'Improvement store not available' });
      return;
    }
    try {
      const limit = parseInt(req.query?.limit ?? '50', 10);
      res.json(deps.improvementStore.getRecent(limit));
    } catch {
      res.status(500).json({ error: 'Failed to get proposals' });
    }
  });
}
