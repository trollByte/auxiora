import { Router, type Request, type Response, type NextFunction } from 'express';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import { DashboardAuth } from './auth.js';
import type { DashboardConfig, DashboardDeps } from './types.js';

const logger = getLogger('dashboard:router');

const COOKIE_NAME = 'auxiora_dash_session';

export interface DashboardRouterOptions {
  deps: DashboardDeps;
  config: DashboardConfig;
  verifyPassword: (input: string) => boolean;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const pair of header.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name) cookies[name] = rest.join('=');
  }
  return cookies;
}

export function createDashboardRouter(options: DashboardRouterOptions) {
  const { deps, config, verifyPassword } = options;
  const router = Router();
  const auth = new DashboardAuth(config.sessionTtlMs);

  // --- Auth middleware ---
  function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[COOKIE_NAME];

    if (!sessionId || !auth.validateSession(sessionId)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    next();
  }

  function buildCookieHeader(value: string, req: Request, maxAge?: number): string {
    let cookie = `${COOKIE_NAME}=${value}; HttpOnly; SameSite=Strict; Path=/`;
    if (maxAge !== undefined) cookie += `; Max-Age=${maxAge}`;
    if (req.secure) cookie += '; Secure';
    return cookie;
  }

  // --- Auth routes (no auth required) ---
  router.post('/auth/login', (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    if (auth.isRateLimited(ip)) {
      res.status(429).json({ error: 'Too many login attempts' });
      return;
    }

    const { password } = req.body as { password?: string };
    if (!password) {
      res.status(400).json({ error: 'Password required' });
      return;
    }

    if (!verifyPassword(password)) {
      auth.recordAttempt(ip);
      void audit('dashboard.login_failed', { ip });
      res.status(401).json({ error: 'Invalid password' });
      return;
    }

    const sessionId = auth.createSession(ip);
    void audit('dashboard.login', { ip });

    res.setHeader('Set-Cookie', buildCookieHeader(sessionId, req));
    res.json({ success: true });
  });

  router.post('/auth/logout', (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[COOKIE_NAME];

    if (sessionId) {
      auth.destroySession(sessionId);
      void audit('dashboard.logout', {});
    }

    res.setHeader('Set-Cookie', buildCookieHeader('', req, 0));
    res.json({ success: true });
  });

  router.get('/auth/check', (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[COOKIE_NAME];
    const authenticated = !!sessionId && auth.validateSession(sessionId);
    res.json({ authenticated });
  });

  // --- Protected routes ---
  router.use(requireAuth);

  // Behaviors
  router.get('/behaviors', async (req: Request, res: Response) => {
    if (!deps.behaviors) {
      res.json({ data: [] });
      return;
    }
    const behaviors = await deps.behaviors.list();
    res.json({ data: behaviors });
  });

  router.patch('/behaviors/:id', async (req: Request, res: Response) => {
    if (!deps.behaviors) {
      res.status(503).json({ error: 'Behaviors not available' });
      return;
    }
    const { id } = req.params;
    const updates = req.body;
    const result = await deps.behaviors.update(id, updates);
    if (!result) {
      res.status(404).json({ error: 'Behavior not found' });
      return;
    }
    res.json({ data: result });
  });

  router.delete('/behaviors/:id', async (req: Request, res: Response) => {
    if (!deps.behaviors) {
      res.status(503).json({ error: 'Behaviors not available' });
      return;
    }
    const removed = await deps.behaviors.remove(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Behavior not found' });
      return;
    }
    res.json({ data: { deleted: true } });
  });

  // Webhooks
  router.get('/webhooks', async (req: Request, res: Response) => {
    if (!deps.webhooks) {
      res.json({ data: [] });
      return;
    }
    const webhooks = await deps.webhooks.list();
    // Redact secrets
    const redacted = webhooks.map((w: any) => ({ ...w, secret: '***' }));
    res.json({ data: redacted });
  });

  router.patch('/webhooks/:id', async (req: Request, res: Response) => {
    if (!deps.webhooks?.update) {
      res.status(503).json({ error: 'Webhooks not available' });
      return;
    }
    const result = await deps.webhooks.update(req.params.id, req.body);
    if (!result) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }
    res.json({ data: { ...result, secret: '***' } });
  });

  router.delete('/webhooks/:id', async (req: Request, res: Response) => {
    if (!deps.webhooks) {
      res.status(503).json({ error: 'Webhooks not available' });
      return;
    }
    const removed = await deps.webhooks.delete(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }
    res.json({ data: { deleted: true } });
  });

  // Sessions
  router.get('/sessions', (req: Request, res: Response) => {
    const connections = deps.getConnections();
    res.json({ data: connections });
  });

  // Audit
  router.get('/audit', async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const entries = await deps.getAuditEntries(limit);

    // Filter by type if provided
    const type = req.query.type as string | undefined;
    const filtered = type
      ? entries.filter((e: any) => e.event.startsWith(type))
      : entries;

    res.json({ data: filtered });
  });

  // Status
  router.get('/status', async (req: Request, res: Response) => {
    const connections = deps.getConnections();
    const behaviors = deps.behaviors ? await deps.behaviors.list() : [];
    const webhooks = deps.webhooks ? await deps.webhooks.list() : [];
    const activeBehaviors = behaviors.filter((b: any) => b.status === 'active');

    res.json({
      data: {
        uptime: process.uptime(),
        connections: connections.length,
        activeBehaviors: activeBehaviors.length,
        totalBehaviors: behaviors.length,
        webhooks: webhooks.length,
      },
    });
  });

  return { router, auth };
}
