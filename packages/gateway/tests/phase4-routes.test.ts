import { describe, it, expect, vi } from 'vitest';
import { mountPhase4Routes } from '../src/phase4-routes.js';
import type { Phase4Deps } from '../src/phase4-routes.js';

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

describe('Phase 4 Routes', () => {
  it('GET /api/v1/callgraph/workflows lists workflows', () => {
    const routes = new Map<string, (req: unknown, res: MockResponse) => void>();
    const app = { get: (path: string, handler: (req: unknown, res: MockResponse) => void) => routes.set(path, handler) };
    const deps: Phase4Deps = {
      callgraphStore: { listWorkflows: () => [{ workflowId: 'wf-1', nodeCount: 3, firstStartedAt: 1000 }] },
    };

    mountPhase4Routes(app, deps);
    const res = makeRes();
    routes.get('/api/v1/callgraph/workflows')!({}, res);

    expect(res.body).toEqual([{ workflowId: 'wf-1', nodeCount: 3, firstStartedAt: 1000 }]);
  });

  it('GET /api/v1/callgraph/snapshot returns workflow snapshot', () => {
    const routes = new Map<string, (req: unknown, res: MockResponse) => void>();
    const app = { get: (path: string, handler: (req: unknown, res: MockResponse) => void) => routes.set(path, handler) };
    const deps: Phase4Deps = {
      callgraphStore: {
        listWorkflows: () => [],
        getSnapshot: (wfId: string) => ({ nodes: [{ id: 'r', name: 'root' }], edges: [], totalTokenUsage: 100 }),
      },
    };

    mountPhase4Routes(app, deps);
    const res = makeRes();
    routes.get('/api/v1/callgraph/snapshot')!({ query: { workflowId: 'wf-1' } }, res);

    expect((res.body as Record<string, unknown>).totalTokenUsage).toBe(100);
  });

  it('GET /api/v1/events/recent returns recent events', () => {
    const routes = new Map<string, (req: unknown, res: MockResponse) => void>();
    const app = { get: (path: string, handler: (req: unknown, res: MockResponse) => void) => routes.set(path, handler) };
    const deps: Phase4Deps = {
      eventStore: { getRecent: (limit: number) => [{ topic: 'test', agentId: 'a1', payload: {}, timestamp: 1000 }] },
    };

    mountPhase4Routes(app, deps);
    const res = makeRes();
    routes.get('/api/v1/events/recent')!({ query: {} }, res);

    expect(res.body).toHaveLength(1);
  });

  it('GET /api/v1/overseer/assessments returns recent assessments', () => {
    const routes = new Map<string, (req: unknown, res: MockResponse) => void>();
    const app = { get: (path: string, handler: (req: unknown, res: MockResponse) => void) => routes.set(path, handler) };
    const deps: Phase4Deps = {
      assessmentStore: { getRecent: (limit: number) => [{ agentId: 'a1', action: 'alert', assessedAt: 1000 }] },
    };

    mountPhase4Routes(app, deps);
    const res = makeRes();
    routes.get('/api/v1/overseer/assessments')!({ query: {} }, res);

    expect(res.body).toHaveLength(1);
  });

  it('GET /api/v1/improvements/proposals returns proposals', () => {
    const routes = new Map<string, (req: unknown, res: MockResponse) => void>();
    const app = { get: (path: string, handler: (req: unknown, res: MockResponse) => void) => routes.set(path, handler) };
    const deps: Phase4Deps = {
      improvementStore: { getRecent: (limit: number) => [{ id: 1, status: 'pending_review', createdAt: 1000 }] },
    };

    mountPhase4Routes(app, deps);
    const res = makeRes();
    routes.get('/api/v1/improvements/proposals')!({ query: {} }, res);

    expect(res.body).toHaveLength(1);
  });

  it('returns 503 when store is not available', () => {
    const routes = new Map<string, (req: unknown, res: MockResponse) => void>();
    const app = { get: (path: string, handler: (req: unknown, res: MockResponse) => void) => routes.set(path, handler) };

    mountPhase4Routes(app, {});
    const res = makeRes();
    routes.get('/api/v1/callgraph/workflows')!({}, res);

    expect(res.statusCode).toBe(503);
    expect((res.body as Record<string, string>).error).toContain('not available');
  });
});
