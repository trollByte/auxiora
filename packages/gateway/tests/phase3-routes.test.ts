import { describe, it, expect, vi } from 'vitest';
import { mountPhase3Routes } from '../src/phase3-routes.js';

const mockApp = () => {
  const routes: Record<string, Function> = {};
  return {
    get: vi.fn((path: string, handler: Function) => { routes[path] = handler; }),
    routes,
  };
};

const mockRes = () => {
  const res: any = {};
  res.json = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  return res;
};

describe('Phase 3 Routes', () => {
  it('GET /api/v1/overseer/alerts returns recent alerts', () => {
    const app = mockApp();
    const alertStore = {
      getRecent: vi.fn().mockReturnValue([{ id: 1, message: 'CPU high' }]),
    };

    mountPhase3Routes(app, { alertStore });

    const req = { query: {} } as any;
    const res = mockRes();

    app.routes['/api/v1/overseer/alerts'](req, res);

    expect(alertStore.getRecent).toHaveBeenCalledWith(20);
    expect(res.json).toHaveBeenCalledWith({ alerts: [{ id: 1, message: 'CPU high' }] });
  });

  it('GET /api/v1/benchmarks/suites lists available suites', () => {
    const app = mockApp();
    const benchmarkStore = {
      listSuites: vi.fn().mockReturnValue(['latency', 'throughput']),
      compareLatest: vi.fn(),
    };

    mountPhase3Routes(app, { benchmarkStore });

    const req = { query: {} } as any;
    const res = mockRes();

    app.routes['/api/v1/benchmarks/suites'](req, res);

    expect(benchmarkStore.listSuites).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ suites: ['latency', 'throughput'] });
  });

  it('GET /api/v1/benchmarks/compare returns comparison', () => {
    const app = mockApp();
    const benchmarkStore = {
      listSuites: vi.fn(),
      compareLatest: vi.fn().mockReturnValue({ delta: 0.05, improved: true }),
    };

    mountPhase3Routes(app, { benchmarkStore });

    const req = { query: { suite: 'latency' } } as any;
    const res = mockRes();

    app.routes['/api/v1/benchmarks/compare'](req, res);

    expect(benchmarkStore.compareLatest).toHaveBeenCalledWith('latency');
    expect(res.json).toHaveBeenCalledWith({ comparison: { delta: 0.05, improved: true } });
  });

  it('GET /api/v1/reviews/rate returns approval rate', () => {
    const app = mockApp();
    const reviewStore = {
      getApprovalRate: vi.fn().mockReturnValue(0.85),
      getRecent: vi.fn(),
    };

    mountPhase3Routes(app, { reviewStore });

    const req = { query: {} } as any;
    const res = mockRes();

    app.routes['/api/v1/reviews/rate'](req, res);

    expect(reviewStore.getApprovalRate).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ approvalRate: 0.85 });
  });

  it('returns 503 when store unavailable', () => {
    const app = mockApp();

    mountPhase3Routes(app, {});

    const req = { query: {} } as any;

    const res1 = mockRes();
    app.routes['/api/v1/overseer/alerts'](req, res1);
    expect(res1.status).toHaveBeenCalledWith(503);

    const res2 = mockRes();
    app.routes['/api/v1/benchmarks/suites'](req, res2);
    expect(res2.status).toHaveBeenCalledWith(503);

    const res3 = mockRes();
    app.routes['/api/v1/reviews/rate'](req, res3);
    expect(res3.status).toHaveBeenCalledWith(503);
  });
});
