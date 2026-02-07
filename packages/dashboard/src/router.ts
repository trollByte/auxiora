import { Router, type Request, type Response, type NextFunction } from 'express';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import { DashboardAuth } from './auth.js';
import type { DashboardConfig, DashboardDeps, SetupDeps } from './types.js';
import type { CloudDeps, CloudSignupRequest, CloudLoginRequest, CloudPlanChangeRequest, CloudPaymentMethodRequest } from './cloud-types.js';

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

export function createDashboardRouter(options: DashboardRouterOptions): { router: Router; auth: DashboardAuth } {
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

  // --- Setup wizard routes (no auth required during first-run) ---
  const setup = deps.setup;
  let setupComplete = false;

  async function checkNeedsSetup(): Promise<boolean> {
    if (setupComplete) return false;
    if (!setup) return false;
    const agentName = setup.getAgentName?.() ?? 'Auxiora';
    const hasSoul = setup.hasSoulFile ? await setup.hasSoulFile() : false;
    return agentName === 'Auxiora' && !hasSoul;
  }

  router.get('/setup/status', async (req: Request, res: Response) => {
    const needsSetup = await checkNeedsSetup();
    const completedSteps: string[] = [];

    if (setup?.getAgentName) {
      const name = setup.getAgentName();
      if (name !== 'Auxiora') completedSteps.push('identity');
    }
    if (setup?.hasSoulFile && await setup.hasSoulFile()) {
      completedSteps.push('personality');
    }
    try {
      if (deps.vault.has('ANTHROPIC_API_KEY') || deps.vault.has('OPENAI_API_KEY')) {
        completedSteps.push('provider');
      }
    } catch {
      // vault locked
    }

    res.json({ needsSetup, completedSteps });
  });

  router.get('/setup/templates', async (req: Request, res: Response) => {
    if (!setup?.personality) {
      res.json({ data: [] });
      return;
    }
    const templates = await setup.personality.listTemplates();
    res.json({ data: templates });
  });

  router.post('/setup/identity', async (req: Request, res: Response) => {
    if (!setup?.saveConfig) {
      res.status(503).json({ error: 'Setup not available' });
      return;
    }

    const { name, pronouns } = req.body as { name?: string; pronouns?: string };
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Agent name is required' });
      return;
    }

    await setup.saveConfig({
      agent: {
        name,
        ...(pronouns ? { pronouns } : {}),
      },
    });

    void audit('setup.identity', { name, pronouns });
    res.json({ success: true, name });
  });

  router.post('/setup/personality', async (req: Request, res: Response) => {
    if (!setup?.personality) {
      res.status(503).json({ error: 'Personality not available' });
      return;
    }

    const { template, custom } = req.body as { template?: string; custom?: Record<string, unknown> };

    if (template) {
      try {
        await setup.personality.applyTemplate(template);
        void audit('setup.personality', { template });
        res.json({ success: true, template });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        res.status(404).json({ error: msg });
      }
    } else if (custom) {
      const content = await setup.personality.buildCustom(custom);
      void audit('setup.personality', { custom: true });
      res.json({ success: true, content });
    } else {
      res.status(400).json({ error: 'Provide either "template" or "custom" in body' });
    }
  });

  router.post('/setup/provider', async (req: Request, res: Response) => {
    const { provider, apiKey } = req.body as { provider?: string; apiKey?: string };
    if (!provider || !apiKey) {
      res.status(400).json({ error: 'Provider and apiKey are required' });
      return;
    }

    if (provider !== 'anthropic' && provider !== 'openai') {
      res.status(400).json({ error: 'Provider must be "anthropic" or "openai"' });
      return;
    }

    const vaultKey = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    await deps.vault.add(vaultKey, apiKey);

    if (setup?.saveConfig) {
      await setup.saveConfig({ provider: { primary: provider } });
    }

    void audit('setup.provider', { provider });
    res.json({ success: true, provider });
  });

  router.post('/setup/channels', async (req: Request, res: Response) => {
    if (!setup?.saveConfig) {
      res.status(503).json({ error: 'Setup not available' });
      return;
    }

    const { channels } = req.body as { channels?: string[] };
    if (!Array.isArray(channels)) {
      res.status(400).json({ error: 'Channels must be an array' });
      return;
    }

    const channelConfig: Record<string, { enabled: boolean }> = {};
    for (const ch of channels) {
      if (typeof ch === 'string') {
        channelConfig[ch] = { enabled: true };
      }
    }

    await setup.saveConfig({ channels: channelConfig });
    void audit('setup.channels', { channels });
    res.json({ success: true, channels });
  });

  router.post('/setup/complete', async (req: Request, res: Response) => {
    setupComplete = true;
    void audit('setup.complete', {});

    const agentName = setup?.getAgentName?.() ?? 'Auxiora';
    res.json({
      success: true,
      greeting: `${agentName} is ready! Setup complete.`,
    });
  });

  // --- Setup guard middleware ---
  router.use(async (req: Request, res: Response, next: NextFunction) => {
    const needsSetup = await checkNeedsSetup();
    if (needsSetup) {
      res.status(403).json({ error: 'Setup required', needsSetup: true });
      return;
    }
    next();
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
    const id = String(req.params.id);
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
    const removed = await deps.behaviors.remove(String(req.params.id));
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
    const result = await deps.webhooks.update(String(req.params.id), req.body);
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
    const removed = await deps.webhooks.delete(String(req.params.id));
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

  // Plugins
  router.get('/plugins', (req: Request, res: Response) => {
    const plugins = deps.getPlugins ? deps.getPlugins() : [];
    res.json({ data: plugins });
  });

  router.get('/plugins/:id', (req: Request, res: Response) => {
    const plugins = deps.getPlugins ? deps.getPlugins() : [];
    const plugin = plugins.find(p => p.name === String(req.params.id));
    if (!plugin) {
      res.status(404).json({ error: 'Plugin not found' });
      return;
    }
    res.json({ data: plugin });
  });

  router.post('/plugins/:id/enable', async (req: Request, res: Response) => {
    if (!deps.pluginManager) {
      res.status(503).json({ error: 'Plugin manager not available' });
      return;
    }
    const success = await deps.pluginManager.enable(String(req.params.id));
    if (!success) {
      res.status(404).json({ error: 'Plugin not found' });
      return;
    }
    void audit('plugin.enabled', { name: String(req.params.id) });
    res.json({ data: { enabled: true } });
  });

  router.post('/plugins/:id/disable', async (req: Request, res: Response) => {
    if (!deps.pluginManager) {
      res.status(503).json({ error: 'Plugin manager not available' });
      return;
    }
    const success = await deps.pluginManager.disable(String(req.params.id));
    if (!success) {
      res.status(404).json({ error: 'Plugin not found' });
      return;
    }
    void audit('plugin.disabled', { name: String(req.params.id) });
    res.json({ data: { disabled: true } });
  });

  router.delete('/plugins/:id', async (req: Request, res: Response) => {
    if (!deps.pluginManager) {
      res.status(503).json({ error: 'Plugin manager not available' });
      return;
    }
    const success = await deps.pluginManager.remove(String(req.params.id));
    if (!success) {
      res.status(404).json({ error: 'Plugin not found' });
      return;
    }
    void audit('plugin.removed', { name: String(req.params.id) });
    res.json({ data: { deleted: true } });
  });

  router.get('/plugins/:id/config', (req: Request, res: Response) => {
    if (!deps.pluginManager) {
      res.status(503).json({ error: 'Plugin manager not available' });
      return;
    }
    const config = deps.pluginManager.getConfig(String(req.params.id));
    if (config === null) {
      res.status(404).json({ error: 'Plugin not found' });
      return;
    }
    res.json({ data: config });
  });

  router.post('/plugins/:id/config', async (req: Request, res: Response) => {
    if (!deps.pluginManager) {
      res.status(503).json({ error: 'Plugin manager not available' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const success = await deps.pluginManager.setConfig(String(req.params.id), body);
    if (!success) {
      res.status(404).json({ error: 'Plugin not found' });
      return;
    }
    void audit('plugin.config_updated', { name: String(req.params.id) });
    res.json({ data: { updated: true } });
  });

  router.get('/plugins/:id/permissions', (req: Request, res: Response) => {
    if (!deps.pluginManager) {
      res.status(503).json({ error: 'Plugin manager not available' });
      return;
    }
    const permissions = deps.pluginManager.getPermissions(String(req.params.id));
    if (permissions === null) {
      res.status(404).json({ error: 'Plugin not found' });
      return;
    }
    res.json({ data: permissions });
  });

  router.post('/plugins/:id/permissions', async (req: Request, res: Response) => {
    if (!deps.pluginManager) {
      res.status(503).json({ error: 'Plugin manager not available' });
      return;
    }
    const { permissions } = req.body as { permissions?: string[] };
    if (!Array.isArray(permissions)) {
      res.status(400).json({ error: 'Permissions must be an array' });
      return;
    }
    const success = await deps.pluginManager.setPermissions(String(req.params.id), permissions);
    if (!success) {
      res.status(404).json({ error: 'Plugin not found' });
      return;
    }
    void audit('plugin.permissions_updated', { name: String(req.params.id), permissions });
    res.json({ data: { updated: true } });
  });

  // Marketplace
  router.get('/marketplace', async (req: Request, res: Response) => {
    if (!deps.marketplace) {
      res.json({ data: [] });
      return;
    }
    const query = (req.query.q as string) || '';
    const results = await deps.marketplace.search(query);
    res.json({ data: results });
  });

  router.get('/marketplace/:id', async (req: Request, res: Response) => {
    if (!deps.marketplace) {
      res.status(503).json({ error: 'Marketplace not available' });
      return;
    }
    const plugin = await deps.marketplace.getPlugin(String(req.params.id));
    if (!plugin) {
      res.status(404).json({ error: 'Plugin not found in marketplace' });
      return;
    }
    res.json({ data: plugin });
  });

  router.post('/marketplace/:id/install', async (req: Request, res: Response) => {
    if (!deps.marketplace) {
      res.status(503).json({ error: 'Marketplace not available' });
      return;
    }
    const result = await deps.marketplace.install(String(req.params.id));
    if (!result.success) {
      res.status(500).json({ error: result.error || 'Install failed' });
      return;
    }
    void audit('marketplace.install', { name: String(req.params.id) });
    res.json({ data: result });
  });

  // Memories
  router.get('/memories', async (req: Request, res: Response) => {
    const memories = deps.getMemories ? await deps.getMemories() : [];
    res.json({ data: memories });
  });

  // Living memory routes
  router.get('/memories/living', async (req: Request, res: Response) => {
    if (!deps.memory) {
      res.status(503).json({ error: 'Living memory not available' });
      return;
    }
    const state = await deps.memory.getLivingState();
    res.json({ data: state });
  });

  router.get('/memories/stats', async (req: Request, res: Response) => {
    if (!deps.memory) {
      res.status(503).json({ error: 'Living memory not available' });
      return;
    }
    const stats = await deps.memory.getStats();
    res.json({ data: stats });
  });

  router.get('/memories/adaptations', async (req: Request, res: Response) => {
    if (!deps.memory) {
      res.status(503).json({ error: 'Living memory not available' });
      return;
    }
    const adaptations = await deps.memory.getAdaptations();
    res.json({ data: adaptations });
  });

  router.delete('/memories/:id', async (req: Request, res: Response) => {
    if (!deps.memory) {
      res.status(503).json({ error: 'Living memory not available' });
      return;
    }
    const deleted = await deps.memory.deleteMemory(String(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }
    res.json({ data: { deleted: true } });
  });

  router.post('/memories/export', async (req: Request, res: Response) => {
    if (!deps.memory) {
      res.status(503).json({ error: 'Living memory not available' });
      return;
    }
    const exported = await deps.memory.exportAll();
    res.json({ data: exported });
  });

  router.post('/memories/import', async (req: Request, res: Response) => {
    if (!deps.memory) {
      res.status(503).json({ error: 'Living memory not available' });
      return;
    }
    const body = req.body as { memories?: any[] };
    if (!body.memories || !Array.isArray(body.memories)) {
      res.status(400).json({ error: 'Request body must contain a "memories" array' });
      return;
    }
    const result = await deps.memory.importAll({ memories: body.memories });
    res.json({ data: result });
  });

  // Orchestration
  router.get('/orchestration/status', (req: Request, res: Response) => {
    if (!deps.orchestration) {
      res.json({ data: { enabled: false, maxConcurrentAgents: 0, allowedPatterns: [] } });
      return;
    }
    const config = deps.orchestration.getConfig();
    res.json({ data: config });
  });

  router.get('/orchestration/history', (req: Request, res: Response) => {
    if (!deps.orchestration) {
      res.json({ data: [] });
      return;
    }
    const limit = parseInt(req.query.limit as string) || 20;
    const history = deps.orchestration.getHistory(limit);
    res.json({ data: history });
  });

  // Models
  router.get('/models', (req: Request, res: Response) => {
    if (!deps.models) {
      res.json({ providers: [] });
      return;
    }
    const providers = deps.models.listProviders();
    res.json({ providers });
  });

  router.get('/models/routing', (req: Request, res: Response) => {
    if (!deps.models) {
      res.json({ enabled: false });
      return;
    }
    const routing = deps.models.getRoutingConfig();
    res.json(routing);
  });

  router.get('/models/cost', (req: Request, res: Response) => {
    if (!deps.models) {
      res.json({ today: 0, thisMonth: 0, isOverBudget: false, warningThresholdReached: false });
      return;
    }
    const summary = deps.models.getCostSummary();
    res.json(summary);
  });

  // --- [P6] Desktop routes ---
  router.get('/desktop/status', (req: Request, res: Response) => {
    if (!deps.desktop) {
      res.status(503).json({ error: 'Desktop not available' });
      return;
    }
    const status = deps.desktop.getStatus();
    res.json({ data: status });
  });

  router.post('/desktop/config', async (req: Request, res: Response) => {
    if (!deps.desktop) {
      res.status(503).json({ error: 'Desktop not available' });
      return;
    }
    const updates = req.body as Record<string, unknown>;
    if (!updates || typeof updates !== 'object') {
      res.status(400).json({ error: 'Request body must be an object' });
      return;
    }
    const result = await deps.desktop.updateConfig(updates);
    void audit('desktop.config_updated', { keys: Object.keys(updates) });
    res.json({ data: result });
  });

  router.post('/desktop/notification', async (req: Request, res: Response) => {
    if (!deps.desktop) {
      res.status(503).json({ error: 'Desktop not available' });
      return;
    }
    const { title, body: notifBody } = req.body as { title?: string; body?: string };
    if (!title || !notifBody) {
      res.status(400).json({ error: 'title and body are required' });
      return;
    }
    await deps.desktop.sendNotification({ title, body: notifBody });
    res.json({ data: { sent: true } });
  });

  router.get('/desktop/updates', async (req: Request, res: Response) => {
    if (!deps.desktop) {
      res.status(503).json({ error: 'Desktop not available' });
      return;
    }
    const updateInfo = await deps.desktop.checkUpdates();
    res.json({ data: updateInfo });
  });

  // --- Cloud routes (Phase 7) ---
  // Signup and login are NOT behind requireAuth — they are public cloud endpoints

  router.post('/cloud/signup', async (req: Request, res: Response) => {
    if (!deps.cloud) {
      res.status(503).json({ error: 'Cloud not available' });
      return;
    }
    const { email, name, password, plan } = req.body as CloudSignupRequest;
    if (!email || !name || !password) {
      res.status(400).json({ error: 'email, name, and password are required' });
      return;
    }
    try {
      const result = await deps.cloud.signup(email, name, password, plan);
      void audit('cloud.signup', { email });
      res.status(201).json({ data: result });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Signup failed';
      res.status(409).json({ error: msg });
    }
  });

  router.post('/cloud/login', async (req: Request, res: Response) => {
    if (!deps.cloud) {
      res.status(503).json({ error: 'Cloud not available' });
      return;
    }
    const { email, password } = req.body as CloudLoginRequest;
    if (!email || !password) {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }
    const result = await deps.cloud.login(email, password);
    if (!result) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    void audit('cloud.login', { email });
    res.json({ data: result });
  });

  router.get('/cloud/tenant', async (req: Request, res: Response) => {
    if (!deps.cloud) {
      res.status(503).json({ error: 'Cloud not available' });
      return;
    }
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      res.status(400).json({ error: 'x-tenant-id header required' });
      return;
    }
    const tenant = await deps.cloud.getTenant(tenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }
    res.json({ data: tenant });
  });

  router.post('/cloud/tenant/plan', async (req: Request, res: Response) => {
    if (!deps.cloud) {
      res.status(503).json({ error: 'Cloud not available' });
      return;
    }
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      res.status(400).json({ error: 'x-tenant-id header required' });
      return;
    }
    const { plan } = req.body as CloudPlanChangeRequest;
    if (!plan) {
      res.status(400).json({ error: 'plan is required' });
      return;
    }
    const result = await deps.cloud.changePlan(tenantId, plan);
    void audit('cloud.plan_change', { tenantId, plan });
    res.json({ data: result });
  });

  router.get('/cloud/tenant/usage', async (req: Request, res: Response) => {
    if (!deps.cloud) {
      res.status(503).json({ error: 'Cloud not available' });
      return;
    }
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      res.status(400).json({ error: 'x-tenant-id header required' });
      return;
    }
    const usage = await deps.cloud.getUsage(tenantId);
    res.json({ data: usage });
  });

  router.get('/cloud/tenant/billing', async (req: Request, res: Response) => {
    if (!deps.cloud) {
      res.status(503).json({ error: 'Cloud not available' });
      return;
    }
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      res.status(400).json({ error: 'x-tenant-id header required' });
      return;
    }
    const billing = await deps.cloud.getBilling(tenantId);
    res.json({ data: billing });
  });

  router.post('/cloud/tenant/billing/payment-method', async (req: Request, res: Response) => {
    if (!deps.cloud) {
      res.status(503).json({ error: 'Cloud not available' });
      return;
    }
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      res.status(400).json({ error: 'x-tenant-id header required' });
      return;
    }
    const { token } = req.body as CloudPaymentMethodRequest;
    if (!token) {
      res.status(400).json({ error: 'token is required' });
      return;
    }
    const result = await deps.cloud.addPaymentMethod(tenantId, token);
    void audit('cloud.payment_method', { tenantId });
    res.json({ data: result });
  });

  router.post('/cloud/tenant/export', async (req: Request, res: Response) => {
    if (!deps.cloud) {
      res.status(503).json({ error: 'Cloud not available' });
      return;
    }
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      res.status(400).json({ error: 'x-tenant-id header required' });
      return;
    }
    const result = await deps.cloud.exportData(tenantId);
    void audit('cloud.export', { tenantId });
    res.json({ data: result });
  });

  router.delete('/cloud/tenant', async (req: Request, res: Response) => {
    if (!deps.cloud) {
      res.status(503).json({ error: 'Cloud not available' });
      return;
    }
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      res.status(400).json({ error: 'x-tenant-id header required' });
      return;
    }
    const result = await deps.cloud.deleteTenant(tenantId);
    void audit('cloud.delete_tenant', { tenantId });
    res.json({ data: result });
  });

  return { router, auth };
}
