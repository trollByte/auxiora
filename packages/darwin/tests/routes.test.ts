import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mountDarwinRoutes } from '../src/routes.js';
import type { DarwinRoutesDeps } from '../src/routes.js';

function makeDeps(overrides: Partial<DarwinRoutesDeps> = {}): DarwinRoutesDeps {
  return {
    archiveStore: {
      getAllCells: () => [
        { niche: { domain: 'coding', complexity: 'simple' }, variantId: 'v-1', benchmarkScore: 0.85, lastEvaluated: 1000, staleness: 0 },
      ],
      getVariant: (id: string) => {
        if (id === 'v-1') {
          return {
            id: 'v-1',
            generation: 1,
            parentIds: [],
            strategy: 'create_new',
            type: 'skill',
            content: 'test content',
            metadata: {},
            metrics: { accuracy: 0.9, latencyP50: 100, latencyP95: 200, errorRate: 0.05 },
            securityPassed: true,
            reviewScore: 0.8,
            status: 'evaluated',
            createdAt: 1000,
          };
        }
        return null;
      },
      getVariantsByParent: (parentId: string) => {
        if (parentId === 'v-1') {
          return [
            {
              id: 'v-2',
              generation: 2,
              parentIds: ['v-1'],
              strategy: 'mutate',
              type: 'skill',
              content: 'child content',
              metadata: {},
              metrics: { accuracy: 0.92, latencyP50: 90, latencyP95: 180, errorRate: 0.03 },
              securityPassed: true,
              reviewScore: 0.85,
              status: 'evaluated',
              createdAt: 2000,
            },
          ];
        }
        return [];
      },
    },
    getLoopStats: () => ({
      totalCycles: 10,
      successfulCycles: 8,
      failedCycles: 2,
      archiveOccupancy: 3,
      totalVariants: 5,
    }),
    getGovernorStats: () => ({
      tokensUsedThisHour: 1200,
      variantsCreatedToday: 5,
      paused: false,
      tokenBudgetRemaining: 48800,
      variantsRemainingToday: 495,
    }),
    getPendingApprovals: () => [
      { variantId: 'v-pending', queuedAt: 3000 },
    ],
    approveVariant: vi.fn().mockResolvedValue(true),
    rejectVariant: vi.fn().mockReturnValue(true),
    isRunning: () => true,
    pause: vi.fn(),
    resume: vi.fn(),
    ...overrides,
  };
}

function createApp(deps: DarwinRoutesDeps) {
  const app = express();
  mountDarwinRoutes(app as never, deps);
  return app;
}

describe('Darwin Routes', () => {
  it('GET /api/v1/darwin/status returns loop stats and running state', async () => {
    const deps = makeDeps();
    const app = createApp(deps);

    const res = await request(app).get('/api/v1/darwin/status');

    expect(res.status).toBe(200);
    expect(res.body.totalCycles).toBe(10);
    expect(res.body.successfulCycles).toBe(8);
    expect(res.body.failedCycles).toBe(2);
    expect(res.body.running).toBe(true);
  });

  it('GET /api/v1/darwin/archive returns all cells', async () => {
    const deps = makeDeps();
    const app = createApp(deps);

    const res = await request(app).get('/api/v1/darwin/archive');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].variantId).toBe('v-1');
    expect(res.body[0].niche.domain).toBe('coding');
  });

  it('GET /api/v1/darwin/variants/:id returns variant by id', async () => {
    const deps = makeDeps();
    const app = createApp(deps);

    const res = await request(app).get('/api/v1/darwin/variants/v-1');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('v-1');
    expect(res.body.metrics.accuracy).toBe(0.9);
  });

  it('GET /api/v1/darwin/variants/:id returns 404 for missing variant', async () => {
    const deps = makeDeps();
    const app = createApp(deps);

    const res = await request(app).get('/api/v1/darwin/variants/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Variant not found');
  });

  it('GET /api/v1/darwin/lineage/:id returns children', async () => {
    const deps = makeDeps();
    const app = createApp(deps);

    const res = await request(app).get('/api/v1/darwin/lineage/v-1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('v-2');
    expect(res.body[0].parentIds).toContain('v-1');
  });

  it('GET /api/v1/darwin/governor returns governor stats', async () => {
    const deps = makeDeps();
    const app = createApp(deps);

    const res = await request(app).get('/api/v1/darwin/governor');

    expect(res.status).toBe(200);
    expect(res.body.tokensUsedThisHour).toBe(1200);
    expect(res.body.variantsCreatedToday).toBe(5);
    expect(res.body.paused).toBe(false);
  });

  it('GET /api/v1/darwin/approvals returns pending approvals', async () => {
    const deps = makeDeps();
    const app = createApp(deps);

    const res = await request(app).get('/api/v1/darwin/approvals');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].variantId).toBe('v-pending');
  });
});
