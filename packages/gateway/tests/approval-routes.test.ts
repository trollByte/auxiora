import { describe, it, expect, vi } from 'vitest';
import { mountApprovalRoutes } from '../src/approval-routes.js';
import type { ApprovalRoutesDeps } from '../src/approval-routes.js';

interface MockResponse {
  statusCode: number;
  body: unknown;
  status(code: number): MockResponse;
  json(data: unknown): void;
}

const makeRes = (): MockResponse => {
  const res: MockResponse = {
    statusCode: 200,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
    },
  };
  return res;
};

function setup(deps: ApprovalRoutesDeps) {
  const routes: Record<string, (req: unknown, res: MockResponse) => void> = {};
  const app = {
    get: vi.fn((path: string, handler: (req: unknown, res: MockResponse) => void) => { routes[path] = handler; }),
    post: vi.fn((path: string, handler: (req: unknown, res: MockResponse) => void) => { routes[path] = handler; }),
  };
  mountApprovalRoutes(app as never, deps);
  return { routes, app };
}

describe('Approval Routes', () => {
  it('GET /api/v1/tool-approvals/pending returns pending approvals', async () => {
    const deps: ApprovalRoutesDeps = {
      getPending: vi.fn().mockReturnValue([
        { id: 'apr_abc', toolName: 'run_shell', args: { command: 'ls' }, createdAt: 1000 },
      ]),
      resolve: vi.fn(),
    };

    const { routes } = setup(deps);
    const res = makeRes();
    await routes['/api/v1/tool-approvals/pending']!({}, res);

    expect(res.body).toEqual([
      { id: 'apr_abc', toolName: 'run_shell', args: { command: 'ls' }, createdAt: 1000 },
    ]);
  });

  it('POST /api/v1/tool-approvals/:id/resolve with approved:true', async () => {
    const resolved = { id: 'apr_abc', toolName: 'run_shell', args: { command: 'ls' }, createdAt: 1000 };
    const deps: ApprovalRoutesDeps = {
      getPending: vi.fn(),
      resolve: vi.fn().mockReturnValue(resolved),
    };

    const { routes } = setup(deps);
    const res = makeRes();
    const req = { params: { id: 'apr_abc' }, body: { approved: true } };
    await routes['/api/v1/tool-approvals/:id/resolve']!(req, res);

    expect(deps.resolve).toHaveBeenCalledWith('apr_abc', true, undefined);
    expect(res.body).toEqual({ ok: true, approval: resolved });
  });

  it('POST /api/v1/tool-approvals/:id/resolve with approved:false and comment', async () => {
    const resolved = { id: 'apr_abc', toolName: 'run_shell', args: { command: 'ls' }, createdAt: 1000 };
    const deps: ApprovalRoutesDeps = {
      getPending: vi.fn(),
      resolve: vi.fn().mockReturnValue(resolved),
    };

    const { routes } = setup(deps);
    const res = makeRes();
    const req = { params: { id: 'apr_abc' }, body: { approved: false, comment: 'Not safe' } };
    await routes['/api/v1/tool-approvals/:id/resolve']!(req, res);

    expect(deps.resolve).toHaveBeenCalledWith('apr_abc', false, 'Not safe');
    expect(res.body).toEqual({ ok: true, approval: resolved });
  });

  it('returns 400 when approved is missing', async () => {
    const deps: ApprovalRoutesDeps = {
      getPending: vi.fn(),
      resolve: vi.fn(),
    };

    const { routes } = setup(deps);
    const res = makeRes();
    const req = { params: { id: 'apr_abc' }, body: {} };
    await routes['/api/v1/tool-approvals/:id/resolve']!(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as Record<string, string>).error).toContain('approved');
  });

  it('returns 404 when resolve returns undefined', async () => {
    const deps: ApprovalRoutesDeps = {
      getPending: vi.fn(),
      resolve: vi.fn().mockReturnValue(undefined),
    };

    const { routes } = setup(deps);
    const res = makeRes();
    const req = { params: { id: 'apr_notfound' }, body: { approved: true } };
    await routes['/api/v1/tool-approvals/:id/resolve']!(req, res);

    expect(res.statusCode).toBe(404);
  });
});
