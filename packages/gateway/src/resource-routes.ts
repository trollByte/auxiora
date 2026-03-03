import type { Request, Response, Router } from 'express';

/** Structural type for resource snapshot */
interface ResourceSnapshotLike {
  cpu: { cores: number; utilization: number; loadAvg1m: number };
  memory: { totalMB: number; freeMB: number; availableMB: number; usedPercent: number };
  swap: { usedPercent: number };
  timestamp: number;
}

/** Structural type for machine profile */
interface MachineProfileLike {
  machineClass: string;
  hasGpu: boolean;
  recommendedMaxAgents: number;
  cpuCeiling: number;
  ramCeiling: number;
}

export interface ResourceRoutesDeps {
  getSnapshot: () => ResourceSnapshotLike | null;
  getProfile: () => MachineProfileLike | null;
  evaluateBreakers: (snapshot: ResourceSnapshotLike) => { action: string; reasons: string[] };
}

export function mountResourceRoutes(router: Router, deps: ResourceRoutesDeps): Router {
  // GET /api/v1/orchestration/resources
  router.get('/resources', (_req: Request, res: Response) => {
    const snapshot = deps.getSnapshot();
    const profile = deps.getProfile();
    if (!snapshot) {
      res.status(503).json({ error: 'Resource monitoring not available' });
      return;
    }
    res.json({ snapshot, profile });
  });

  // GET /api/v1/orchestration/breakers
  router.get('/breakers', (_req: Request, res: Response) => {
    const snapshot = deps.getSnapshot();
    if (!snapshot) {
      res.status(503).json({ error: 'Resource monitoring not available' });
      return;
    }
    const result = deps.evaluateBreakers(snapshot);
    res.json({ ...result, snapshot });
  });

  return router;
}
