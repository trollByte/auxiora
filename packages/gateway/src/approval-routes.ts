/**
 * Tool Approval REST routes — allows the dashboard to list and resolve
 * pending tool-approval requests.
 */

// ── Types ───────────────────────────────────────────────────────────

export interface ApprovalRoutesDeps {
  getPending: () => Array<{ id: string; [key: string]: unknown }>;
  resolve: (id: string, approved: boolean, comment?: string) => { id: string; [key: string]: unknown } | undefined;
}

interface AppLike {
  get(path: string, handler: (req: unknown, res: unknown) => void): void;
  post(path: string, handler: (req: unknown, res: unknown) => void): void;
}

interface Req {
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}

interface Res {
  status(code: number): Res;
  json(data: unknown): void;
}

// ── Mount ───────────────────────────────────────────────────────────

export function mountApprovalRoutes(app: AppLike, deps: ApprovalRoutesDeps): void {
  app.get('/api/v1/tool-approvals/pending', (_req: unknown, res: unknown) => {
    const r = res as Res;
    const pending = deps.getPending();
    r.json(pending);
  });

  app.post('/api/v1/tool-approvals/:id/resolve', (req: unknown, res: unknown) => {
    const r = res as Res;
    const request = req as Req;
    const id = request.params?.id;
    const body = request.body ?? {};
    const { approved, comment } = body as { approved?: boolean; comment?: string };

    if (typeof approved !== 'boolean') {
      r.status(400).json({ error: '"approved" (boolean) field is required' });
      return;
    }

    const result = deps.resolve(id!, approved, comment);
    if (!result) {
      r.status(404).json({ error: `Approval request "${id}" not found` });
      return;
    }

    r.json({ ok: true, approval: result });
  });
}
