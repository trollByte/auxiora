import type { Express, Request, Response } from 'express';

/** Structural types — avoids importing @auxiora/telemetry directly */
interface LearningStoreLike {
  getRecent(limit: number): Array<{
    id: number;
    content: string;
    category: string;
    jobType: string;
    occurrences: number;
    createdAt: number;
  }>;
  getByCategory(category: string): Array<{
    id: number;
    content: string;
    category: string;
    jobType: string;
    occurrences: number;
    createdAt: number;
  }>;
}

interface ChangeLogLike {
  getRecent(limit: number): Array<{
    id: number;
    component: string;
    description: string;
    reason: string;
    impact?: { outcome: string; metric?: string; before?: number; after?: number };
    createdAt: number;
  }>;
  getByComponent(component: string): Array<{
    id: number;
    component: string;
    description: string;
    reason: string;
    impact?: { outcome: string; metric?: string; before?: number; after?: number };
    createdAt: number;
  }>;
}

export interface SelfImprovingRoutesDeps {
  learningStore?: LearningStoreLike;
  changeLog?: ChangeLogLike;
}

export function mountSelfImprovingRoutes(app: Express, deps: SelfImprovingRoutesDeps): void {
  app.get('/api/v1/learnings', (req: Request, res: Response) => {
    if (!deps.learningStore) {
      res.status(503).json({ error: 'Learning store not available' });
      return;
    }

    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
      const category = req.query.category as string | undefined;

      const learnings = category
        ? deps.learningStore.getByCategory(category)
        : deps.learningStore.getRecent(limit);

      res.json({ learnings, count: learnings.length });
    } catch {
      res.status(500).json({ error: 'Internal error reading learnings' });
    }
  });

  app.get('/api/v1/changelog', (req: Request, res: Response) => {
    if (!deps.changeLog) {
      res.status(503).json({ error: 'Change log not available' });
      return;
    }

    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
      const component = req.query.component as string | undefined;

      const entries = component
        ? deps.changeLog.getByComponent(component)
        : deps.changeLog.getRecent(limit);

      res.json({ entries, count: entries.length });
    } catch {
      res.status(500).json({ error: 'Internal error reading changelog' });
    }
  });
}
