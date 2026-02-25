import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDashboardRouter } from '../src/router.js';
import type { DashboardDeps } from '../src/types.js';
import type { CloudDeps } from '../src/cloud-types.js';

function createMockCloud(): CloudDeps {
  return {
    signup: vi.fn().mockResolvedValue({ tenantId: 'tenant-123', token: 'jwt-token-abc' }),
    login: vi.fn().mockResolvedValue({ tenantId: 'tenant-123', token: 'jwt-token-abc' }),
    getTenant: vi.fn().mockResolvedValue({
      id: 'tenant-123',
      name: 'Alice',
      email: 'alice@test.com',
      plan: 'pro',
      status: 'active',
      createdAt: '2025-01-01T00:00:00Z',
    }),
    changePlan: vi.fn().mockResolvedValue({ success: true }),
    getUsage: vi.fn().mockResolvedValue({
      usage: { maxMessages: 42 },
      quotas: { maxMessages: 5000 },
    }),
    getBilling: vi.fn().mockResolvedValue({
      plan: 'pro',
      invoices: [{ id: 'inv_1', amount: 1900, status: 'paid', created: '2025-01-01' }],
    }),
    addPaymentMethod: vi.fn().mockResolvedValue({ success: true }),
    exportData: vi.fn().mockResolvedValue({ downloadUrl: '/exports/tenant-123.zip' }),
    deleteTenant: vi.fn().mockResolvedValue({ success: true }),
  };
}

function createMockDeps(cloud?: CloudDeps): DashboardDeps {
  return {
    vault: {
      get: vi.fn(),
      has: vi.fn().mockReturnValue(false),
      add: vi.fn(),
    },
    getConnections: vi.fn().mockReturnValue([]),
    getAuditEntries: vi.fn().mockResolvedValue([]),
    cloud,
  };
}

function createApp(deps: DashboardDeps) {
  const app = express();
  app.use(express.json());
  const { router, auth } = createDashboardRouter({
    deps,
    config: { enabled: true, sessionTtlMs: 86_400_000 },
    verifyPassword: (input: string) => input === 'correct-password',
  });
  app.use('/api/v1/dashboard', router);
  return { app, auth };
}

function loginAndGetCookie(app: express.Express): Promise<string> {
  return request(app)
    .post('/api/v1/dashboard/auth/login')
    .send({ password: 'correct-password' })
    .then((res) => {
      const cookie = res.headers['set-cookie'];
      return Array.isArray(cookie) ? cookie[0] : cookie;
    });
}

describe('Cloud Dashboard Routes', () => {
  let cloud: CloudDeps;
  let app: express.Express;

  beforeEach(() => {
    cloud = createMockCloud();
    const deps = createMockDeps(cloud);
    ({ app } = createApp(deps));
  });

  describe('POST /cloud/signup', () => {
    it('should create a new tenant', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .post('/api/v1/dashboard/cloud/signup')
        .set('Cookie', cookie)
        .send({ email: 'alice@test.com', name: 'Alice', password: 'secret123' });
      expect(res.status).toBe(201);
      expect(res.body.data.tenantId).toBe('tenant-123');
      expect(res.body.data.token).toBeDefined();
    });

    it('should reject missing fields', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .post('/api/v1/dashboard/cloud/signup')
        .set('Cookie', cookie)
        .send({ email: 'alice@test.com' });
      expect(res.status).toBe(400);
    });

    it('should return 503 when cloud not configured', async () => {
      const deps = createMockDeps(); // no cloud
      const { app: noCloudApp } = createApp(deps);
      const cookie = await loginAndGetCookie(noCloudApp);
      const res = await request(noCloudApp)
        .post('/api/v1/dashboard/cloud/signup')
        .set('Cookie', cookie)
        .send({ email: 'a@b.com', name: 'A', password: 'pass' });
      expect(res.status).toBe(503);
    });
  });

  describe('POST /cloud/login', () => {
    it('should login a tenant', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .post('/api/v1/dashboard/cloud/login')
        .set('Cookie', cookie)
        .send({ email: 'alice@test.com', password: 'secret123' });
      expect(res.status).toBe(200);
      expect(res.body.data.token).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      (cloud.login as any).mockResolvedValue(null);
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .post('/api/v1/dashboard/cloud/login')
        .set('Cookie', cookie)
        .send({ email: 'alice@test.com', password: 'wrong' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /cloud/tenant', () => {
    it('should return tenant info', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/cloud/tenant')
        .set('Cookie', cookie)
        .set('x-tenant-id', 'tenant-123');
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe('alice@test.com');
    });

    it('should require x-tenant-id header', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/cloud/tenant')
        .set('Cookie', cookie);
      expect(res.status).toBe(400);
    });

    it('should return 404 for unknown tenant', async () => {
      (cloud.getTenant as any).mockResolvedValue(null);
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/cloud/tenant')
        .set('Cookie', cookie)
        .set('x-tenant-id', 'nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /cloud/tenant/plan', () => {
    it('should change plan', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .post('/api/v1/dashboard/cloud/tenant/plan')
        .set('Cookie', cookie)
        .set('x-tenant-id', 'tenant-123')
        .send({ plan: 'team' });
      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
    });
  });

  describe('GET /cloud/tenant/usage', () => {
    it('should return usage data', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/cloud/tenant/usage')
        .set('Cookie', cookie)
        .set('x-tenant-id', 'tenant-123');
      expect(res.status).toBe(200);
      expect(res.body.data.usage.maxMessages).toBe(42);
    });
  });

  describe('GET /cloud/tenant/billing', () => {
    it('should return billing info', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/cloud/tenant/billing')
        .set('Cookie', cookie)
        .set('x-tenant-id', 'tenant-123');
      expect(res.status).toBe(200);
      expect(res.body.data.plan).toBe('pro');
      expect(res.body.data.invoices).toHaveLength(1);
    });
  });

  describe('POST /cloud/tenant/billing/payment-method', () => {
    it('should add payment method', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .post('/api/v1/dashboard/cloud/tenant/billing/payment-method')
        .set('Cookie', cookie)
        .set('x-tenant-id', 'tenant-123')
        .send({ token: 'tok_visa' });
      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
    });

    it('should reject missing token', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .post('/api/v1/dashboard/cloud/tenant/billing/payment-method')
        .set('Cookie', cookie)
        .set('x-tenant-id', 'tenant-123')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /cloud/tenant/export', () => {
    it('should export tenant data', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .post('/api/v1/dashboard/cloud/tenant/export')
        .set('Cookie', cookie)
        .set('x-tenant-id', 'tenant-123');
      expect(res.status).toBe(200);
      expect(res.body.data.downloadUrl).toBeDefined();
    });
  });

  describe('DELETE /cloud/tenant', () => {
    it('should delete tenant', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .delete('/api/v1/dashboard/cloud/tenant')
        .set('Cookie', cookie)
        .set('x-tenant-id', 'tenant-123');
      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
    });
  });
});
