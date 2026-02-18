import * as crypto from 'node:crypto';
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

  const PROVIDER_VAULT_KEYS: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY',
    groq: 'GROQ_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    cohere: 'COHERE_API_KEY',
    xai: 'XAI_API_KEY',
    replicate: 'REPLICATE_API_TOKEN',
  };

  // --- Auth middleware ---
  function requireAuth(req: Request, res: Response, next: NextFunction): void {
    // OAuth callbacks are public — Google redirects here without a session cookie
    if (req.method === 'GET' && /\/connectors\/[^/]+\/callback/.test(req.path)) {
      next();
      return;
    }

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
    // Vault must exist for the app to function
    if (setup.vaultExists && !(await setup.vaultExists())) return true;
    const agentName = setup.getAgentName?.() ?? 'Auxiora';
    const hasSoul = setup.hasSoulFile ? await setup.hasSoulFile() : false;
    return agentName === 'Auxiora' && !hasSoul;
  }

  router.get('/setup/status', async (req: Request, res: Response) => {
    const needsSetup = await checkNeedsSetup();
    const completedSteps: string[] = [];
    let vaultUnlocked = false;
    let dashboardPasswordSet = false;
    const agentName = setup?.getAgentName?.() ?? 'Auxiora';

    if (agentName !== 'Auxiora') completedSteps.push('identity');
    if (setup?.hasSoulFile && await setup.hasSoulFile()) {
      completedSteps.push('personality');
    }
    try {
      if (deps.vault.has('ANTHROPIC_API_KEY') || deps.vault.has('OPENAI_API_KEY')) {
        completedSteps.push('provider');
      }
      vaultUnlocked = true;
      dashboardPasswordSet = deps.vault.has('DASHBOARD_PASSWORD');
    } catch {
      // vault locked
    }

    res.json({ needsSetup, completedSteps, vaultUnlocked, dashboardPasswordSet, agentName });
  });

  router.get('/setup/templates', async (req: Request, res: Response) => {
    if (!setup?.personality) {
      res.json({ data: [] });
      return;
    }
    const templates = await setup.personality.listTemplates();
    res.json({ data: templates });
  });

  router.post('/setup/vault', async (req: Request, res: Response) => {
    const { password } = req.body as { password?: string };
    if (!password || typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    try {
      await deps.vault.unlock(password);
      void audit('setup.vault', {});
      // Initialize channels/providers that need vault access
      if (deps.onVaultUnlocked) {
        await deps.onVaultUnlocked();
      }
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to initialize vault';
      res.status(500).json({ error: msg });
    }
  });

  router.post('/setup/dashboard-password', async (req: Request, res: Response) => {
    const { password } = req.body as { password?: string };
    if (!password || typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    try {
      await deps.vault.add('DASHBOARD_PASSWORD', password);
      void audit('setup.dashboard_password', {});
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to store dashboard password';
      res.status(500).json({ error: msg });
    }
  });

  router.post('/setup/identity', async (req: Request, res: Response) => {
    if (!setup?.saveConfig) {
      res.status(503).json({ error: 'Setup not available' });
      return;
    }

    const { name, pronouns, vibe } = req.body as { name?: string; pronouns?: string; vibe?: string };
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Agent name is required' });
      return;
    }

    await setup.saveConfig({
      agent: {
        name,
        ...(pronouns ? { pronouns } : {}),
        ...(vibe && typeof vibe === 'string' ? { vibe } : {}),
      },
    });

    // Sync name/pronouns into SOUL.md frontmatter so the personality files
    // don't contradict the config (the AI reads both).
    if (setup.getSoulContent && setup.saveSoulContent) {
      try {
        const soul = await setup.getSoulContent();
        if (soul) {
          let updated = soul.replace(/^(name:\s*).+$/m, `$1${name}`);
          if (pronouns) {
            updated = updated.replace(/^(pronouns:\s*).+$/m, `$1${pronouns}`);
          }
          if (updated !== soul) {
            await setup.saveSoulContent(updated);
          }
        }
      } catch {
        // SOUL.md not available yet — will be created during personality step
      }
    }

    void audit('setup.identity', { name, pronouns, vibe });
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
    const { providers: providerList, provider, apiKey } = req.body as {
      providers?: Array<{ name: string; apiKey?: string; endpoint?: string }>;
      provider?: string; apiKey?: string;
    };

    // Support both legacy single-provider and new multi-provider format
    const entries = providerList ?? (provider ? [{ name: provider, apiKey, endpoint: (req.body as any).endpoint }] : []);

    if (entries.length === 0) {
      res.status(400).json({ error: 'At least one provider is required' });
      return;
    }

    let primary: string | undefined;
    const configured: string[] = [];

    for (const entry of entries) {
      if (entry.name === 'ollama') {
        if (setup?.saveConfig) {
          await setup.saveConfig({
            provider: { ollama: { baseUrl: entry.endpoint || 'http://localhost:11434' } },
          });
        }
        configured.push('ollama');
        if (!primary) primary = 'ollama';
        continue;
      }

      const vaultKey = PROVIDER_VAULT_KEYS[entry.name];
      if (!vaultKey) {
        res.status(400).json({ error: `Unknown provider: ${entry.name}` });
        return;
      }

      if (!entry.apiKey) {
        continue; // skip providers with no key provided
      }

      try {
        await deps.vault.add(vaultKey, entry.apiKey);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to store API key';
        res.status(400).json({ error: `Vault error for ${entry.name}: ${msg}` });
        return;
      }

      configured.push(entry.name);
      if (!primary) primary = entry.name;
    }

    if (primary && setup?.saveConfig) {
      await setup.saveConfig({ provider: { primary } });
    }

    void audit('setup.provider', { providers: configured });
    res.json({ success: true, providers: configured, primary });
  });

  router.post('/setup/channels', async (req: Request, res: Response) => {
    if (!setup?.saveConfig) {
      res.status(503).json({ error: 'Setup not available' });
      return;
    }

    const CREDENTIAL_VAULT_KEYS: Record<string, Record<string, string>> = {
      discord: { botToken: 'DISCORD_BOT_TOKEN' },
      telegram: { botToken: 'TELEGRAM_BOT_TOKEN' },
      slack: { botToken: 'SLACK_BOT_TOKEN', appToken: 'SLACK_APP_TOKEN' },
      matrix: { accessToken: 'MATRIX_ACCESS_TOKEN' },
      signal: {},
      teams: { appPassword: 'TEAMS_APP_PASSWORD' },
      whatsapp: { accessToken: 'WHATSAPP_ACCESS_TOKEN', verifyToken: 'WHATSAPP_VERIFY_TOKEN' },
      twilio: { accountSid: 'TWILIO_ACCOUNT_SID', authToken: 'TWILIO_AUTH_TOKEN' },
      email: { password: 'EMAIL_PASSWORD' },
    };

    const { channels } = req.body as { channels?: Array<string | { type: string; enabled: boolean; credentials?: Record<string, string> }> };
    if (!Array.isArray(channels)) {
      res.status(400).json({ error: 'Channels must be an array' });
      return;
    }

    const channelConfig: Record<string, { enabled: boolean }> = {};
    const channelNames: string[] = [];

    for (const ch of channels) {
      if (typeof ch === 'string') {
        channelConfig[ch] = { enabled: true };
        channelNames.push(ch);
      } else if (typeof ch === 'object' && ch.type) {
        channelConfig[ch.type] = { enabled: ch.enabled };
        channelNames.push(ch.type);

        if (ch.credentials) {
          const keyMap = CREDENTIAL_VAULT_KEYS[ch.type];
          if (keyMap) {
            for (const [credKey, credValue] of Object.entries(ch.credentials)) {
              const vaultKey = keyMap[credKey];
              if (vaultKey && credValue && typeof credValue === 'string') {
                try {
                  await deps.vault.add(vaultKey, credValue);
                } catch (error) {
                  const msg = error instanceof Error ? error.message : 'Failed to store credential';
                  res.status(400).json({ error: `Vault is not initialized. Complete the vault setup step first. (${msg})` });
                  return;
                }
              }
            }
          }
        }
      }
    }

    await setup.saveConfig({ channels: channelConfig });
    void audit('setup.channels', { channels: channelNames });
    res.json({ success: true, channels: channelNames });
  });

  router.post('/setup/complete', async (req: Request, res: Response) => {
    setupComplete = true;
    void audit('setup.complete', {});

    // Re-initialize providers now that vault has API keys
    if (setup?.onSetupComplete) {
      await setup.onSetupComplete();
    }

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

  router.post('/behaviors', async (req: Request, res: Response) => {
    if (!deps.behaviors) {
      res.status(503).json({ error: 'Behaviors not available' });
      return;
    }
    const { type, action, cron, timezone, intervalMinutes, condition, runAt } = req.body as {
      type?: string;
      action?: string;
      cron?: string;
      timezone?: string;
      intervalMinutes?: number;
      condition?: string;
      runAt?: string;
    };
    if (!type || !action) {
      res.status(400).json({ error: 'type and action are required' });
      return;
    }
    if (!['scheduled', 'monitor', 'one-shot'].includes(type)) {
      res.status(400).json({ error: 'type must be "scheduled", "monitor", or "one-shot"' });
      return;
    }

    const input: Record<string, unknown> = {
      type,
      action,
      channel: { type: 'webchat', id: 'dashboard', overridden: false },
      createdBy: 'dashboard',
    };

    if (type === 'scheduled') {
      if (!cron) {
        res.status(400).json({ error: 'cron is required for scheduled behaviors' });
        return;
      }
      input.schedule = { cron, timezone: timezone || 'UTC' };
    } else if (type === 'monitor') {
      if (!intervalMinutes || !condition) {
        res.status(400).json({ error: 'intervalMinutes and condition are required for monitor behaviors' });
        return;
      }
      input.polling = { intervalMs: intervalMinutes * 60_000, condition };
    } else if (type === 'one-shot') {
      if (!runAt) {
        res.status(400).json({ error: 'runAt is required for one-shot behaviors' });
        return;
      }
      const ts = new Date(runAt).getTime();
      if (isNaN(ts) || ts <= Date.now()) {
        res.status(400).json({ error: 'runAt must be a valid future timestamp' });
        return;
      }
      input.delay = { runAt: ts };
    }

    try {
      const behavior = await deps.behaviors.create(input);
      void audit('behavior.created', { id: behavior.id, type });
      res.status(201).json({ data: behavior });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to create behavior';
      res.status(400).json({ error: msg });
    }
  });

  router.patch('/behaviors/:id', async (req: Request, res: Response) => {
    if (!deps.behaviors) {
      res.status(503).json({ error: 'Behaviors not available' });
      return;
    }
    const id = String(req.params.id);
    const { action, status, cron, timezone, intervalMinutes, condition, runAt } = req.body as {
      action?: string;
      status?: string;
      cron?: string;
      timezone?: string;
      intervalMinutes?: number;
      condition?: string;
      runAt?: string;
    };

    // Transform flat frontend fields into nested Behavior structure
    const updates: Record<string, unknown> = {};
    if (action !== undefined) updates.action = action;
    if (status !== undefined) updates.status = status;
    if (cron !== undefined) {
      updates.schedule = { cron, timezone: timezone || 'UTC' };
    } else if (timezone !== undefined) {
      // Fetch current to preserve existing cron
      const current = await deps.behaviors.get(id);
      if (current?.schedule) {
        updates.schedule = { ...current.schedule, timezone };
      }
    }
    if (intervalMinutes !== undefined || condition !== undefined) {
      const current = await deps.behaviors.get(id);
      updates.polling = {
        intervalMs: intervalMinutes !== undefined ? intervalMinutes * 60_000 : current?.polling?.intervalMs,
        condition: condition !== undefined ? condition : current?.polling?.condition,
      };
    }
    if (runAt !== undefined) {
      const ts = new Date(runAt).getTime();
      if (!isNaN(ts)) {
        updates.delay = { fireAt: ts };
      }
    }

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

  router.post('/webhooks', async (req: Request, res: Response) => {
    if (!deps.webhooks) {
      res.status(503).json({ error: 'Webhooks not available' });
      return;
    }
    const { name, secret, behaviorId } = req.body as {
      name?: string;
      secret?: string;
      behaviorId?: string;
    };
    if (!name || !secret) {
      res.status(400).json({ error: 'name and secret are required' });
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      res.status(400).json({ error: 'name must be URL-safe (letters, numbers, hyphens, underscores)' });
      return;
    }

    try {
      const webhook = await deps.webhooks.create({
        name,
        secret,
        type: 'generic',
        enabled: true,
        ...(behaviorId ? { behaviorId } : {}),
      });
      void audit('webhook.created', { id: webhook.id, name });
      res.status(201).json({ data: { ...webhook, secret: '***' } });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to create webhook';
      res.status(400).json({ error: msg });
    }
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

  // Chat history for the webchat session
  router.get('/session/messages', async (req: Request, res: Response) => {
    if (!deps.sessions) {
      res.json({ data: [] });
      return;
    }
    const messages = await deps.sessions.getWebchatMessages();
    res.json({ data: messages });
  });

  // Chat management
  router.get('/chats', (req: Request, res: Response) => {
    if (!deps.sessions?.listChats) {
      res.json({ data: [], total: 0 });
      return;
    }
    const archived = req.query.archived === 'true';
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const chats = deps.sessions.listChats({ archived, limit, offset });
    res.json({ data: chats, total: chats.length });
  });

  router.post('/chats', (req: Request, res: Response) => {
    if (!deps.sessions?.createChat) {
      res.status(503).json({ error: 'Sessions not available' });
      return;
    }
    const { title } = req.body as { title?: string };
    const chat = deps.sessions.createChat(title);
    res.status(201).json({ data: chat });
  });

  router.get('/chats/:id/messages', (req: Request, res: Response) => {
    if (!deps.sessions?.getChatMessages) {
      res.json({ data: [] });
      return;
    }
    const messages = deps.sessions.getChatMessages(String(req.params.id));
    res.json({ data: messages });
  });

  router.patch('/chats/:id', (req: Request, res: Response) => {
    if (!deps.sessions) {
      res.status(503).json({ error: 'Sessions not available' });
      return;
    }
    const chatId = String(req.params.id);
    const { title, archived, personality } = req.body as { title?: string; archived?: boolean; personality?: string };
    if (title !== undefined && deps.sessions.renameChat) {
      deps.sessions.renameChat(chatId, title);
    }
    if (archived === true && deps.sessions.archiveChat) {
      deps.sessions.archiveChat(chatId);
    }
    if (personality !== undefined && deps.sessions.updateChatMetadata) {
      const validPersonalities = ['standard', 'the-architect'];
      if (!validPersonalities.includes(personality)) {
        res.status(400).json({ error: `Invalid personality: must be one of ${validPersonalities.join(', ')}` });
        return;
      }
      deps.sessions.updateChatMetadata(chatId, { personality });
    }
    res.json({ data: { ok: true } });
  });

  router.delete('/chats/:id', (req: Request, res: Response) => {
    if (!deps.sessions?.deleteChat) {
      res.status(503).json({ error: 'Sessions not available' });
      return;
    }
    deps.sessions.deleteChat(String(req.params.id));
    res.json({ data: { deleted: true } });
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

    const activeModel = deps.getActiveModel?.() ?? { provider: 'unknown', model: 'unknown' };

    res.json({
      data: {
        uptime: process.uptime(),
        connections: connections.length,
        activeBehaviors: activeBehaviors.length,
        totalBehaviors: behaviors.length,
        webhooks: webhooks.length,
        activeModel,
      },
    });
  });

  // --- Active agents snapshot ---
  router.get('/status/agents', (_req: Request, res: Response) => {
    res.json({ data: deps.getActiveAgents?.() ?? [] });
  });

  router.get('/status/health', (_req: Request, res: Response) => {
    res.json({ data: deps.getHealthState?.() ?? { overall: 'unknown', subsystems: [], issues: [], lastCheck: '' } });
  });

  router.get('/status/capabilities', (_req: Request, res: Response) => {
    res.json({ data: deps.getCapabilities?.() ?? null });
  });

  // --- Settings routes (authenticated) ---

  // Identity
  router.get('/identity', (req: Request, res: Response) => {
    const name = setup?.getAgentName?.() ?? 'Auxiora';
    const pronouns = setup?.getAgentPronouns?.() ?? 'they/them';
    res.json({ data: { name, pronouns } });
  });

  router.post('/identity', async (req: Request, res: Response) => {
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
      agent: { name, ...(pronouns ? { pronouns } : {}) },
    });
    void audit('settings.identity', { name, pronouns });
    res.json({ success: true });
  });

  // Full personality state for the editor
  router.get('/personality/full', async (req: Request, res: Response) => {
    const agent = setup?.getAgentConfig?.() ?? {};

    let soulContent: string | null = null;
    if (setup?.getSoulContent) {
      soulContent = await setup.getSoulContent();
    }

    let activeTemplate: string | null = null;
    if (setup?.personality?.getActiveTemplate) {
      const t = await setup.personality.getActiveTemplate();
      activeTemplate = t?.id ?? null;
    }

    res.json({
      data: {
        name: (agent.name as string) ?? 'Auxiora',
        pronouns: (agent.pronouns as string) ?? 'they/them',
        avatar: (agent.avatar as string) ?? null,
        vibe: (agent.vibe as string) ?? '',
        tone: (agent.tone as Record<string, number>) ?? { warmth: 0.6, directness: 0.5, humor: 0.3, formality: 0.5 },
        errorStyle: (agent.errorStyle as string) ?? 'professional',
        expertise: (agent.expertise as string[]) ?? [],
        catchphrases: (agent.catchphrases as Record<string, string>) ?? {},
        boundaries: (agent.boundaries as Record<string, string[]>) ?? { neverJokeAbout: [], neverAdviseOn: [] },
        customInstructions: (agent.customInstructions as string) ?? '',
        soulContent,
        activeTemplate,
      },
    });
  });

  router.put('/personality/full', async (req: Request, res: Response) => {
    if (!setup?.saveConfig) {
      res.status(503).json({ error: 'Setup not available' });
      return;
    }
    const body = req.body as Record<string, unknown>;

    const agentUpdate: Record<string, unknown> = {};
    if (typeof body.name === 'string') agentUpdate.name = body.name;
    if (typeof body.pronouns === 'string') agentUpdate.pronouns = body.pronouns;
    if (typeof body.avatar === 'string' || body.avatar === null) agentUpdate.avatar = body.avatar ?? undefined;
    if (typeof body.vibe === 'string') agentUpdate.vibe = body.vibe;
    if (typeof body.customInstructions === 'string') agentUpdate.customInstructions = body.customInstructions;
    if (typeof body.errorStyle === 'string') agentUpdate.errorStyle = body.errorStyle;
    if (body.tone && typeof body.tone === 'object') agentUpdate.tone = body.tone;
    if (Array.isArray(body.expertise)) agentUpdate.expertise = body.expertise;
    if (body.catchphrases && typeof body.catchphrases === 'object') agentUpdate.catchphrases = body.catchphrases;
    if (body.boundaries && typeof body.boundaries === 'object') agentUpdate.boundaries = body.boundaries;

    try {
      await setup.saveConfig({ agent: agentUpdate });

      if (typeof body.soulContent === 'string' && setup.saveSoulContent) {
        await setup.saveSoulContent(body.soulContent);
      }

      if (typeof body.template === 'string' && body.template && setup.personality) {
        await setup.personality.applyTemplate(body.template);
      }

      void audit('settings.personality', { source: 'editor', fields: Object.keys(agentUpdate) });
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: msg });
    }
  });

  // Current personality (match SOUL.md against templates)
  router.get('/personality', async (req: Request, res: Response) => {
    if (!setup?.personality?.getActiveTemplate) {
      res.json({ data: { template: null } });
      return;
    }
    const template = await setup.personality.getActiveTemplate();
    res.json({ data: { template } });
  });

  // Personality templates
  router.get('/personality/templates', async (req: Request, res: Response) => {
    if (!setup?.personality) {
      res.json({ data: [] });
      return;
    }
    const templates = await setup.personality.listTemplates();
    res.json({ data: templates });
  });

  router.post('/personality', async (req: Request, res: Response) => {
    if (!setup?.personality) {
      res.status(503).json({ error: 'Personality not available' });
      return;
    }
    const { template } = req.body as { template?: string };
    if (!template) {
      res.status(400).json({ error: 'Template is required' });
      return;
    }
    try {
      await setup.personality.applyTemplate(template);
      void audit('settings.personality', { template });
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(404).json({ error: msg });
    }
  });

  // Provider
  router.post('/provider', async (req: Request, res: Response) => {
    const { provider, apiKey, endpoint } = req.body as { provider?: string; apiKey?: string; endpoint?: string };
    if (!provider) {
      res.status(400).json({ error: 'Provider is required' });
      return;
    }
    if (provider !== 'anthropic' && provider !== 'openai' && provider !== 'ollama') {
      res.status(400).json({ error: 'Provider must be "anthropic", "openai", or "ollama"' });
      return;
    }
    if (provider === 'ollama') {
      if (setup?.saveConfig) {
        await setup.saveConfig({
          provider: { primary: 'ollama', ollama: { baseUrl: endpoint || 'http://localhost:11434' } },
        });
      }
      void audit('settings.provider', { provider });
      res.json({ success: true });
      return;
    }
    if (!apiKey) {
      res.status(400).json({ error: 'API key is required for this provider' });
      return;
    }
    const vaultKey = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    try {
      await deps.vault.add(vaultKey, apiKey);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to store API key';
      res.status(400).json({ error: msg });
      return;
    }
    if (setup?.saveConfig) {
      await setup.saveConfig({ provider: { primary: provider } });
    }
    if (setup?.onSetupComplete) {
      await setup.onSetupComplete();
    }
    void audit('settings.provider', { provider });
    res.json({ success: true });
  });

  // Provider: configure a specific provider's credentials (does NOT change primary/fallback)
  const VALID_PROVIDERS = ['anthropic', 'openai', 'google', 'ollama', 'groq', 'deepseek', 'cohere', 'xai', 'openaiCompatible', 'claudeOAuth'];

  // --- Claude OAuth PKCE flow ---
  const pkceStates = new Map<string, { verifier: string; state: string; createdAt: number }>();
  const PKCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  setInterval(() => {
    const now = Date.now();
    for (const [key, state] of pkceStates) {
      if (now - state.createdAt > PKCE_TTL_MS) {
        pkceStates.delete(key);
      }
    }
  }, 60_000);

  router.post('/provider/claude-oauth/start', async (req: Request, res: Response) => {
    const providersModule = '@auxiora/providers';
    const { generatePKCE, buildAuthorizationUrl } = await import(/* webpackIgnore: true */ providersModule);
    const { verifier, challenge } = generatePKCE();

    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[COOKIE_NAME];
    if (!sessionId) {
      res.status(401).json({ error: 'No session' });
      return;
    }

    const oauthState = crypto.randomBytes(32).toString('hex');
    pkceStates.set(sessionId, { verifier, state: oauthState, createdAt: Date.now() });
    const authUrl = buildAuthorizationUrl(challenge, oauthState);
    void audit('settings.provider', { provider: 'claudeOAuth', action: 'oauth-start' });
    res.json({ authUrl });
  });

  router.post('/provider/claude-oauth/callback', async (req: Request, res: Response) => {
    let { code } = req.body as { code?: string };
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }
    // Anthropic returns code as "code#state" — split to extract both parts
    const codeParts = code.trim().split('#');
    code = codeParts[0];
    const codeState = codeParts[1] || '';

    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[COOKIE_NAME];
    if (!sessionId) {
      res.status(401).json({ error: 'No session' });
      return;
    }

    const pkceState = pkceStates.get(sessionId);
    if (!pkceState) {
      res.status(400).json({ error: 'No pending OAuth flow. Click "Connect" to start again.' });
      return;
    }

    if (Date.now() - pkceState.createdAt > PKCE_TTL_MS) {
      pkceStates.delete(sessionId);
      res.status(400).json({ error: 'OAuth flow expired. Click "Connect" to start again.' });
      return;
    }

    pkceStates.delete(sessionId);

    try {
      const providersModule = '@auxiora/providers';
      const { exchangeCodeForTokens, writeClaudeCliCredentials } = await import(/* webpackIgnore: true */ providersModule);
      const tokens = await exchangeCodeForTokens(code, pkceState.verifier, codeState || pkceState.state);

      // Store all token data in vault for refresh support
      await deps.vault.add('ANTHROPIC_OAUTH_TOKEN', tokens.accessToken);
      await deps.vault.add('CLAUDE_OAUTH_REFRESH_TOKEN', tokens.refreshToken);
      await deps.vault.add('CLAUDE_OAUTH_EXPIRES_AT', String(tokens.expiresAt));

      // Also write to CLI credentials file if it exists (non-critical)
      writeClaudeCliCredentials(tokens);

      if (setup?.onSetupComplete) {
        await setup.onSetupComplete();
      }

      void audit('settings.provider', { provider: 'claudeOAuth', action: 'oauth-complete' });
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Token exchange failed';
      logger.error(`Claude OAuth callback failed: ${msg}`);
      res.status(400).json({ error: msg });
    }
  });

  router.post('/provider/claude-oauth/disconnect', async (req: Request, res: Response) => {
    try {
      await deps.vault.add('ANTHROPIC_OAUTH_TOKEN', '');
      await deps.vault.add('CLAUDE_OAUTH_REFRESH_TOKEN', '');
      await deps.vault.add('CLAUDE_OAUTH_EXPIRES_AT', '');

      if (setup?.onSetupComplete) {
        await setup.onSetupComplete();
      }

      void audit('settings.provider', { provider: 'claudeOAuth', action: 'disconnect' });
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Disconnect failed';
      res.status(500).json({ error: msg });
    }
  });

  router.get('/provider/claude-oauth/status', (_req: Request, res: Response) => {
    const hasToken = deps.vault.has('ANTHROPIC_OAUTH_TOKEN') &&
                     deps.vault.get('ANTHROPIC_OAUTH_TOKEN') !== '';
    res.json({ connected: hasToken });
  });

  router.post('/provider/configure', async (req: Request, res: Response) => {
    const { provider, apiKey, endpoint } = req.body as { provider?: string; apiKey?: string; endpoint?: string };
    if (!provider || !VALID_PROVIDERS.includes(provider)) {
      res.status(400).json({ error: `Provider must be one of: ${VALID_PROVIDERS.join(', ')}` });
      return;
    }

    // For local providers (ollama), save config only
    if (provider === 'ollama') {
      if (setup?.saveConfig) {
        await setup.saveConfig({
          provider: { ollama: { baseUrl: endpoint || 'http://localhost:11434' } },
        });
      }
      void audit('settings.provider', { provider, action: 'configure' });
      res.json({ success: true, provider });
      return;
    }

    if (provider === 'openaiCompatible') {
      if (!endpoint) {
        res.status(400).json({ error: 'Endpoint URL is required for OpenAI-compatible providers' });
        return;
      }
      if (apiKey) {
        try {
          await deps.vault.add('OPENAI_COMPATIBLE_API_KEY', apiKey);
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Failed to store API key';
          res.status(400).json({ error: msg });
          return;
        }
      }
      if (setup?.saveConfig) {
        await setup.saveConfig({
          provider: { openaiCompatible: { baseUrl: endpoint } },
        });
      }
      void audit('settings.provider', { provider, action: 'configure' });
      res.json({ success: true, provider });
      return;
    }

    // Cloud providers: store API key in vault
    if (!apiKey) {
      res.status(400).json({ error: 'API key is required for this provider' });
      return;
    }

    const vaultKey = PROVIDER_VAULT_KEYS[provider];
    if (!vaultKey) {
      res.status(400).json({ error: `Unknown vault key for provider: ${provider}` });
      return;
    }

    try {
      await deps.vault.add(vaultKey, apiKey);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to store API key';
      res.status(400).json({ error: msg });
      return;
    }

    // Re-initialize providers to pick up the new key
    if (setup?.onSetupComplete) {
      await setup.onSetupComplete();
    }

    void audit('settings.provider', { provider, action: 'configure' });
    res.json({ success: true, provider });
  });

  // Provider: update primary/fallback routing
  router.post('/provider/routing', async (req: Request, res: Response) => {
    const { primary, fallback } = req.body as { primary?: string; fallback?: string };
    if (!primary || !VALID_PROVIDERS.includes(primary)) {
      res.status(400).json({ error: 'Valid primary provider is required' });
      return;
    }
    if (fallback && !VALID_PROVIDERS.includes(fallback)) {
      res.status(400).json({ error: `Invalid fallback provider: ${fallback}` });
      return;
    }

    if (setup?.saveConfig) {
      await setup.saveConfig({
        provider: { primary, ...(fallback ? { fallback } : {}) },
      });
    }

    // Re-initialize to apply routing change
    if (setup?.onSetupComplete) {
      await setup.onSetupComplete();
    }

    void audit('settings.provider', { primary, fallback, action: 'routing' });
    res.json({ success: true, primary, fallback });
  });

  // Provider: set default model for a provider
  router.post('/provider/model', async (req: Request, res: Response) => {
    const { provider, model } = req.body as { provider?: string; model?: string };
    if (!provider || !VALID_PROVIDERS.includes(provider)) {
      res.status(400).json({ error: 'Valid provider is required' });
      return;
    }
    if (!model || typeof model !== 'string') {
      res.status(400).json({ error: 'Model name is required' });
      return;
    }

    if (setup?.saveConfig) {
      await setup.saveConfig({
        provider: { [provider]: { model } },
      });
    }

    void audit('settings.provider', { provider, model, action: 'model' });
    res.json({ success: true, provider, model });
  });

  // Channels
  router.get('/channels', (req: Request, res: Response) => {
    const connections = deps.getConnections();
    const connectedTypes = [...new Set(connections.map(c => c.channelType))];
    const configured = deps.getConfiguredChannels?.() ?? [];
    res.json({ data: { connected: connectedTypes, configured } });
  });

  router.post('/channels', async (req: Request, res: Response) => {
    if (!setup?.saveConfig) {
      res.status(503).json({ error: 'Setup not available' });
      return;
    }

    const CREDENTIAL_VAULT_KEYS: Record<string, Record<string, string>> = {
      discord: { botToken: 'DISCORD_BOT_TOKEN' },
      telegram: { botToken: 'TELEGRAM_BOT_TOKEN' },
      slack: { botToken: 'SLACK_BOT_TOKEN', appToken: 'SLACK_APP_TOKEN' },
      matrix: { accessToken: 'MATRIX_ACCESS_TOKEN' },
      signal: {},
      teams: { appPassword: 'TEAMS_APP_PASSWORD' },
      whatsapp: { accessToken: 'WHATSAPP_ACCESS_TOKEN', verifyToken: 'WHATSAPP_VERIFY_TOKEN' },
      twilio: { accountSid: 'TWILIO_ACCOUNT_SID', authToken: 'TWILIO_AUTH_TOKEN' },
      email: { password: 'EMAIL_PASSWORD' },
    };

    const { channels } = req.body as { channels?: Array<{ type: string; enabled: boolean; credentials?: Record<string, string> }> };
    if (!Array.isArray(channels)) {
      res.status(400).json({ error: 'Channels must be an array' });
      return;
    }

    const channelConfig: Record<string, { enabled: boolean }> = {};
    for (const ch of channels) {
      channelConfig[ch.type] = { enabled: ch.enabled };
      if (ch.credentials) {
        const keyMap = CREDENTIAL_VAULT_KEYS[ch.type];
        if (keyMap) {
          for (const [credKey, credValue] of Object.entries(ch.credentials)) {
            const vk = keyMap[credKey];
            if (vk && credValue && typeof credValue === 'string') {
              try {
                await deps.vault.add(vk, credValue);
              } catch (error) {
                const msg = error instanceof Error ? error.message : 'Failed to store credential';
                res.status(400).json({ error: msg });
                return;
              }
            }
          }
        }
      }
    }

    await setup.saveConfig({ channels: channelConfig });
    void audit('settings.channels', { channels: channels.map(c => c.type) });
    res.json({ success: true });
  });

  // Security: Change dashboard password
  router.post('/security/dashboard-password', async (req: Request, res: Response) => {
    const { oldPassword, newPassword } = req.body as { oldPassword?: string; newPassword?: string };
    if (!oldPassword || !newPassword) {
      res.status(400).json({ error: 'Both oldPassword and newPassword are required' });
      return;
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }
    if (!verifyPassword(oldPassword)) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }
    try {
      await deps.vault.add('DASHBOARD_PASSWORD', newPassword);
      void audit('settings.dashboard_password_changed', {});
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to update password';
      res.status(500).json({ error: msg });
    }
  });

  // Security: Change vault password
  router.post('/security/vault-password', async (req: Request, res: Response) => {
    const { newPassword } = req.body as { newPassword?: string };
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }
    try {
      await deps.vault.changePassword(newPassword);
      void audit('settings.vault_password_changed', {});
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to change vault password';
      res.status(500).json({ error: msg });
    }
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
      res.json({ providers: [], routing: {}, cost: {} });
      return;
    }
    const providers = deps.models.listProviders();
    const routing = deps.models.getRoutingConfig();
    const cost = deps.models.getCostSummary();
    res.json({ providers, routing, cost });
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

  // --- [P13] Connector routes ---
  router.get('/connectors', (req: Request, res: Response) => {
    if (!deps.connectors) {
      res.json({ data: [] });
      return;
    }
    const connectors = deps.connectors.list();
    res.json({ data: connectors });
  });

  router.get('/connectors/:id', (req: Request, res: Response) => {
    if (!deps.connectors) {
      res.status(503).json({ error: 'Connectors not available' });
      return;
    }
    const connector = deps.connectors.get(String(req.params.id));
    if (!connector) {
      res.status(404).json({ error: 'Connector not found' });
      return;
    }
    res.json({ data: connector });
  });

  router.post('/connectors/:id', async (req: Request, res: Response) => {
    if (!deps.connectors) {
      res.status(503).json({ error: 'Connectors not available' });
      return;
    }
    const connectorId = String(req.params.id);
    const { credentials, label } = req.body as { credentials?: Record<string, string>; label?: string };
    if (!credentials) {
      res.status(400).json({ error: 'credentials are required' });
      return;
    }
    const result = await deps.connectors.connect(connectorId, credentials, label);
    if (!result) {
      res.status(404).json({ error: 'Connector not found' });
      return;
    }
    void audit('connector.connected', { connectorId });
    res.json({ data: result });
  });

  router.delete('/connectors/:id', async (req: Request, res: Response) => {
    if (!deps.connectors) {
      res.status(503).json({ error: 'Connectors not available' });
      return;
    }
    const removed = await deps.connectors.disconnect(String(req.params.id));
    if (!removed) {
      res.status(404).json({ error: 'Connector not found' });
      return;
    }
    void audit('connector.disconnected', { connectorId: String(req.params.id) });
    res.json({ data: { deleted: true } });
  });

  router.get('/connectors/:id/actions', (req: Request, res: Response) => {
    if (!deps.connectors) {
      res.status(503).json({ error: 'Connectors not available' });
      return;
    }
    const actions = deps.connectors.getActions(String(req.params.id));
    res.json({ data: actions });
  });

  router.post('/connectors/:id/actions/:actionId', async (req: Request, res: Response) => {
    if (!deps.connectors) {
      res.status(503).json({ error: 'Connectors not available' });
      return;
    }
    const connectorId = String(req.params.id);
    const actionId = String(req.params.actionId);
    const params = req.body as Record<string, unknown>;
    const result = await deps.connectors.executeAction(connectorId, actionId, params);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ data: result });
  });

  // --- OAuth2 connector routes ---

  // In-memory CSRF state storage (keyed by state token, value is connectorId)
  const oauthStates = new Map<string, { connectorId: string; createdAt: number }>();

  // Clean up expired states (older than 10 minutes)
  function cleanupOAuthStates(): void {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [key, value] of oauthStates) {
      if (value.createdAt < cutoff) oauthStates.delete(key);
    }
  }

  // Store OAuth client credentials in vault
  router.post('/connectors/:connectorId/credentials', async (req: Request, res: Response) => {
    const connectorId = String(req.params.connectorId);
    const { clientId, clientSecret } = req.body as { clientId?: string; clientSecret?: string };

    if (!clientId || !clientSecret) {
      res.status(400).json({ error: 'clientId and clientSecret are required' });
      return;
    }

    try {
      await deps.vault.add(
        `connectors.${connectorId}.credentials`,
        JSON.stringify({ clientId, clientSecret }),
      );
      void audit('connector.credentials_stored', { connectorId });
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to store credentials';
      res.status(500).json({ error: msg });
    }
  });

  // Start OAuth2 consent flow — redirects user to provider
  router.get('/connectors/:connectorId/auth', async (req: Request, res: Response) => {
    const connectorId = String(req.params.connectorId);

    // Load client credentials from vault
    const credsJson = deps.vault.get(`connectors.${connectorId}.credentials`);
    if (!credsJson) {
      res.status(400).json({ error: 'No client credentials configured. Store credentials first.' });
      return;
    }

    let creds: { clientId: string; clientSecret: string };
    try {
      creds = JSON.parse(credsJson) as { clientId: string; clientSecret: string };
    } catch {
      res.status(500).json({ error: 'Invalid stored credentials' });
      return;
    }

    // Look up connector to get scopes
    const connector = deps.connectors?.get(connectorId);
    const scopes = connector?.auth?.oauth2?.scopes ?? [];

    // Generate CSRF state token
    cleanupOAuthStates();
    const state = crypto.randomUUID();
    oauthStates.set(state, { connectorId, createdAt: Date.now() });

    // Build callback URL from request
    const protocol = req.secure ? 'https' : 'http';
    const host = req.headers.host ?? 'localhost';
    const callbackUrl = `${protocol}://${host}/api/v1/dashboard/connectors/${connectorId}/callback`;

    // Build Google OAuth consent URL
    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    void audit('connector.oauth_started', { connectorId });
    res.redirect(authUrl);
  });

  // OAuth2 callback — exchange code for tokens
  router.get('/connectors/:connectorId/callback', async (req: Request, res: Response) => {
    const connectorId = String(req.params.connectorId);
    const { code, state, error: oauthError } = req.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    if (oauthError) {
      logger.warn('OAuth error from provider', { connectorId, error: new Error(String(oauthError)) });
      res.redirect(`/dashboard/settings/connections?error=${encodeURIComponent(String(oauthError))}`);
      return;
    }

    if (!code || !state) {
      res.status(400).json({ error: 'Missing code or state parameter' });
      return;
    }

    // Validate CSRF state
    const storedState = oauthStates.get(state);
    if (!storedState || storedState.connectorId !== connectorId) {
      res.status(403).json({ error: 'Invalid or expired state token' });
      return;
    }
    oauthStates.delete(state);

    // Load client credentials
    const credsJson = deps.vault.get(`connectors.${connectorId}.credentials`);
    if (!credsJson) {
      res.status(500).json({ error: 'Client credentials not found' });
      return;
    }

    let creds: { clientId: string; clientSecret: string };
    try {
      creds = JSON.parse(credsJson) as { clientId: string; clientSecret: string };
    } catch {
      res.status(500).json({ error: 'Invalid stored credentials' });
      return;
    }

    const protocol = req.secure ? 'https' : 'http';
    const host = req.headers.host ?? 'localhost';
    const callbackUrl = `${protocol}://${host}/api/v1/dashboard/connectors/${connectorId}/callback`;

    // Exchange authorization code for tokens
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code',
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errBody = await tokenResponse.text();
        logger.error(`Token exchange failed: ${tokenResponse.status}`);
        res.redirect(`/dashboard/settings/connections?error=${encodeURIComponent('Token exchange failed')}`);
        return;
      }

      const tokens = await tokenResponse.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        token_type?: string;
        scope?: string;
      };

      // Store tokens in vault
      const storedTokens = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
        tokenType: tokens.token_type ?? 'Bearer',
      };

      await deps.vault.add(
        `connectors.${connectorId}.tokens`,
        JSON.stringify(storedTokens),
      );

      void audit('connector.oauth_completed', { connectorId });
      res.redirect(`/dashboard/settings/connections?connected=${connectorId}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Token exchange failed';
      logger.error(`OAuth callback error: ${msg}`);
      res.redirect(`/dashboard/settings/connections?error=${encodeURIComponent(msg)}`);
    }
  });

  // Connection status
  router.get('/connectors/:connectorId/status', (req: Request, res: Response) => {
    const connectorId = String(req.params.connectorId);

    const hasCredentials = deps.vault.has(`connectors.${connectorId}.credentials`);
    const tokensJson = deps.vault.get(`connectors.${connectorId}.tokens`);
    let connected = false;
    let expiresAt: number | undefined;

    if (tokensJson) {
      try {
        const tokens = JSON.parse(tokensJson) as { accessToken?: string; expiresAt?: number };
        connected = !!tokens.accessToken;
        expiresAt = tokens.expiresAt;
      } catch {
        // Invalid tokens
      }
    }

    res.json({
      data: {
        connectorId,
        hasCredentials,
        connected,
        expiresAt,
      },
    });
  });

  // Disconnect — revoke and delete tokens
  router.post('/connectors/:connectorId/disconnect', async (req: Request, res: Response) => {
    const connectorId = String(req.params.connectorId);

    // Attempt to revoke the access token with Google
    const tokensJson = deps.vault.get(`connectors.${connectorId}.tokens`);
    if (tokensJson) {
      try {
        const tokens = JSON.parse(tokensJson) as { accessToken?: string };
        if (tokens.accessToken) {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.accessToken)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          }).catch(() => {
            // Best-effort revocation
          });
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Clear tokens from vault (store empty string to overwrite)
    try {
      await deps.vault.add(`connectors.${connectorId}.tokens`, '');
    } catch {
      // Best-effort cleanup
    }

    void audit('connector.oauth_disconnected', { connectorId });
    res.json({ success: true });
  });

  // --- [P14] Team / Social routes ---
  router.get('/team', async (req: Request, res: Response) => {
    if (!deps.team) {
      res.json({ data: [] });
      return;
    }
    const users = await deps.team.listUsers();
    res.json({ data: users });
  });

  router.post('/team', async (req: Request, res: Response) => {
    if (!deps.team) {
      res.status(503).json({ error: 'Team management not available' });
      return;
    }
    const { name, role, channels } = req.body as { name?: string; role?: string; channels?: any[] };
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const user = await deps.team.createUser(name, role ?? 'member', channels);
    void audit('team.user_created', { name, role });
    res.status(201).json({ data: user });
  });

  router.delete('/team/:id', async (req: Request, res: Response) => {
    if (!deps.team) {
      res.status(503).json({ error: 'Team management not available' });
      return;
    }
    const deleted = await deps.team.deleteUser(String(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    void audit('team.user_deleted', { id: String(req.params.id) });
    res.json({ data: { deleted: true } });
  });

  // --- [P14] Workflow routes ---
  router.get('/workflows', async (req: Request, res: Response) => {
    if (!deps.workflows) {
      res.json({ data: [] });
      return;
    }
    const all = req.query.all === 'true';
    const workflows = all ? await deps.workflows.listAll() : await deps.workflows.listActive();
    res.json({ data: workflows });
  });

  router.post('/workflows', async (req: Request, res: Response) => {
    if (!deps.workflows) {
      res.status(503).json({ error: 'Workflows not available' });
      return;
    }
    const workflow = await deps.workflows.createWorkflow(req.body);
    void audit('workflow.created', { id: workflow.id });
    res.status(201).json({ data: workflow });
  });

  router.get('/workflows/:id/status', async (req: Request, res: Response) => {
    if (!deps.workflows) {
      res.status(503).json({ error: 'Workflows not available' });
      return;
    }
    const status = await deps.workflows.getStatus(String(req.params.id));
    if (!status) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }
    res.json({ data: status });
  });

  router.post('/workflows/:id/cancel', async (req: Request, res: Response) => {
    if (!deps.workflows) {
      res.status(503).json({ error: 'Workflows not available' });
      return;
    }
    const cancelled = await deps.workflows.cancelWorkflow(String(req.params.id));
    if (!cancelled) {
      res.status(400).json({ error: 'Cannot cancel workflow' });
      return;
    }
    void audit('workflow.cancelled', { id: String(req.params.id) });
    res.json({ data: { cancelled: true } });
  });

  router.get('/workflows/approvals', async (req: Request, res: Response) => {
    if (!deps.workflows) {
      res.json({ data: [] });
      return;
    }
    const userId = req.query.userId as string | undefined;
    const approvals = await deps.workflows.getPendingApprovals(userId);
    res.json({ data: approvals });
  });

  router.post('/workflows/approvals/:id/approve', async (req: Request, res: Response) => {
    if (!deps.workflows) {
      res.status(503).json({ error: 'Workflows not available' });
      return;
    }
    const { userId, reason } = req.body as { userId?: string; reason?: string };
    const result = await deps.workflows.approve(String(req.params.id), userId ?? 'dashboard', reason);
    if (!result) {
      res.status(400).json({ error: 'Cannot approve' });
      return;
    }
    void audit('workflow.approved', { id: String(req.params.id) });
    res.json({ data: result });
  });

  router.post('/workflows/approvals/:id/reject', async (req: Request, res: Response) => {
    if (!deps.workflows) {
      res.status(503).json({ error: 'Workflows not available' });
      return;
    }
    const { userId, reason } = req.body as { userId?: string; reason?: string };
    const result = await deps.workflows.reject(String(req.params.id), userId ?? 'dashboard', reason);
    if (!result) {
      res.status(400).json({ error: 'Cannot reject' });
      return;
    }
    void audit('workflow.rejected', { id: String(req.params.id) });
    res.json({ data: result });
  });

  // --- [P14] Agent Protocol routes ---
  router.get('/agent-protocol/identity', (req: Request, res: Response) => {
    if (!deps.agentProtocol) {
      res.status(503).json({ error: 'Agent protocol not available' });
      return;
    }
    const identity = deps.agentProtocol.getIdentity();
    res.json({ data: identity });
  });

  router.get('/agent-protocol/inbox', (req: Request, res: Response) => {
    if (!deps.agentProtocol) {
      res.json({ data: [] });
      return;
    }
    const limit = parseInt(req.query.limit as string) || 50;
    const messages = deps.agentProtocol.getInbox(limit);
    res.json({ data: messages });
  });

  router.get('/agent-protocol/directory', async (req: Request, res: Response) => {
    if (!deps.agentProtocol) {
      res.json({ data: [] });
      return;
    }
    const entries = await deps.agentProtocol.getDirectory();
    res.json({ data: entries });
  });

  router.post('/agent-protocol/discover', async (req: Request, res: Response) => {
    if (!deps.agentProtocol) {
      res.json({ data: [] });
      return;
    }
    const { query } = req.body as { query?: string };
    if (!query) {
      res.status(400).json({ error: 'query is required' });
      return;
    }
    const results = await deps.agentProtocol.discover(query);
    res.json({ data: results });
  });

  // --- [P15] Screen routes ---
  router.get('/screen/capture', async (req: Request, res: Response) => {
    if (!deps.screen) {
      res.status(503).json({ error: 'Screen capture not available' });
      return;
    }
    const capture = await deps.screen.capture();
    res.json({ data: capture });
  });

  router.post('/screen/analyze', async (req: Request, res: Response) => {
    if (!deps.screen) {
      res.status(503).json({ error: 'Screen analysis not available' });
      return;
    }
    const { question } = req.body as { question?: string };
    const analysis = await deps.screen.analyze(question);
    res.json({ data: { analysis } });
  });

  // --- [P15] Ambient routes ---
  router.get('/ambient/patterns', (req: Request, res: Response) => {
    if (!deps.ambient) {
      res.json({ data: [] });
      return;
    }
    const patterns = deps.ambient.getPatterns();
    res.json({ data: patterns });
  });

  router.get('/ambient/notifications', (req: Request, res: Response) => {
    if (!deps.ambient) {
      res.json({ data: [] });
      return;
    }
    const notifications = deps.ambient.getNotifications();
    res.json({ data: notifications });
  });

  router.post('/ambient/notifications/:id/dismiss', (req: Request, res: Response) => {
    if (!deps.ambient) {
      res.status(503).json({ error: 'Ambient not available' });
      return;
    }
    const dismissed = deps.ambient.dismissNotification(String(req.params.id));
    if (!dismissed) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    res.json({ data: { dismissed: true } });
  });

  router.get('/ambient/briefing', (req: Request, res: Response) => {
    if (!deps.ambient) {
      res.status(503).json({ error: 'Ambient not available' });
      return;
    }
    const time = (req.query.time as string) || 'morning';
    const briefing = deps.ambient.getBriefing(time);
    res.json({ data: briefing });
  });

  router.get('/ambient/anticipations', (req: Request, res: Response) => {
    if (!deps.ambient) {
      res.json({ data: [] });
      return;
    }
    const anticipations = deps.ambient.getAnticipations();
    res.json({ data: anticipations });
  });

  // Ambient config (persisted to vault)
  router.get('/ambient/config', (_req: Request, res: Response) => {
    const raw = deps.vault.get('ambient.config');
    if (!raw) {
      res.json({ data: {} });
      return;
    }
    try {
      res.json({ data: JSON.parse(raw) });
    } catch {
      res.json({ data: {} });
    }
  });

  router.post('/ambient/config', async (req: Request, res: Response) => {
    try {
      const config = req.body as Record<string, unknown>;
      await deps.vault.add('ambient.config', JSON.stringify(config));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to save ambient config' });
    }
  });

  // --- Appearance routes ---
  const VALID_THEMES = ['nebula', 'monolith', 'signal', 'polar', 'neon', 'terra'] as const;

  router.get('/appearance', (_req: Request, res: Response) => {
    const raw = deps.vault.get('appearance.config');
    if (!raw) {
      res.json({ data: { theme: 'nebula' } });
      return;
    }
    try {
      res.json({ data: JSON.parse(raw) });
    } catch {
      res.json({ data: { theme: 'nebula' } });
    }
  });

  router.post('/appearance', async (req: Request, res: Response) => {
    try {
      const { theme } = req.body as { theme: string };
      if (!theme || !VALID_THEMES.includes(theme as (typeof VALID_THEMES)[number])) {
        res.status(400).json({ error: `Invalid theme. Valid themes: ${VALID_THEMES.join(', ')}` });
        return;
      }
      await deps.vault.add('appearance.config', JSON.stringify({ theme }));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to save appearance config' });
    }
  });

  // --- Global personality engine toggle ---
  router.get('/personality/engine', (_req: Request, res: Response) => {
    const engine = deps.getPersonalityEngine ? deps.getPersonalityEngine() : 'standard';
    res.json({ data: { engine } });
  });

  router.put('/personality/engine', async (req: Request, res: Response) => {
    const { engine } = req.body as { engine?: string };
    const validEngines = ['standard', 'the-architect'];
    if (!engine || !validEngines.includes(engine)) {
      res.status(400).json({ error: `Invalid engine: must be one of ${validEngines.join(', ')}` });
      return;
    }
    // Update in-memory
    if (deps.setPersonalityEngine) {
      deps.setPersonalityEngine(engine);
    }
    // Persist to config file
    if (setup?.saveConfig) {
      await setup.saveConfig({ agent: { personality: engine } });
    }
    void audit('settings.personality', { engine });
    res.json({ success: true });
  });

  // --- Architect personality engine routes ---
  const ARCHITECT_DOMAINS = [
    'security_review', 'code_engineering', 'architecture_design', 'debugging',
    'team_leadership', 'one_on_one', 'sales_pitch', 'negotiation',
    'marketing_content', 'strategic_planning', 'crisis_management',
    'creative_work', 'writing_content', 'decision_making',
    'learning_research', 'personal_development', 'general',
  ] as const;

  function architectDefaults() {
    const now = Date.now();
    const history: Record<string, number> = {};
    for (const d of ARCHITECT_DOMAINS) history[d] = 0;
    return {
      corrections: '{"corrections":[]}',
      showContextIndicator: true,
      showSourcesButton: true,
      autoDetectContext: true,
      defaultContext: null,
      contextUsageHistory: history,
      totalInteractions: 0,
      firstUsed: now,
      lastUsed: now,
      version: 1,
    };
  }

  function loadArchitectPrefs(): Record<string, unknown> {
    const raw = deps.vault.get('architect_preferences');
    if (!raw) return architectDefaults();
    try {
      return { ...architectDefaults(), ...JSON.parse(raw) };
    } catch {
      return architectDefaults();
    }
  }

  router.get('/architect/preferences', (_req: Request, res: Response) => {
    res.json({ data: loadArchitectPrefs() });
  });

  router.patch('/architect/preferences', async (req: Request, res: Response) => {
    try {
      const { key, value } = req.body as { key: string; value: unknown };
      if (!key) {
        res.status(400).json({ error: 'Missing preference key' });
        return;
      }
      const prefs = loadArchitectPrefs();
      prefs[key] = value;
      await deps.vault.add('architect_preferences', JSON.stringify(prefs));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to update architect preference' });
    }
  });

  router.delete('/architect/data', async (_req: Request, res: Response) => {
    try {
      await deps.vault.add('architect_preferences', JSON.stringify(architectDefaults()));
      await deps.vault.add('architect.learning', JSON.stringify({}));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to clear architect data' });
    }
  });

  router.get('/architect/data/export', (_req: Request, res: Response) => {
    try {
      const prefs = deps.vault.get('architect_preferences') || '{}';
      const learning = deps.vault.get('architect.learning') || '{}';
      const exportData = JSON.stringify({
        preferences: JSON.parse(prefs),
        learning: JSON.parse(learning),
        exportedAt: new Date().toISOString(),
      }, null, 2);
      res.json({ data: exportData });
    } catch {
      res.status(500).json({ error: 'Failed to export architect data' });
    }
  });

  // --- Notification routes ---
  router.get('/notifications', (_req: Request, res: Response) => {
    const raw = deps.vault.get('notifications.recent');
    if (!raw) {
      res.json({ data: [] });
      return;
    }
    try {
      res.json({ data: JSON.parse(raw) });
    } catch {
      res.json({ data: [] });
    }
  });

  router.post('/notifications/:id/dismiss', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const raw = deps.vault.get('notifications.recent');
    if (!raw) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    try {
      const notifications = JSON.parse(raw) as Array<{ id: string }>;
      const filtered = notifications.filter(n => n.id !== id);
      if (filtered.length === notifications.length) {
        res.status(404).json({ error: 'Notification not found' });
        return;
      }
      await deps.vault.add('notifications.recent', JSON.stringify(filtered));
      res.json({ data: { dismissed: true } });
    } catch {
      res.status(500).json({ error: 'Failed to dismiss notification' });
    }
  });

  router.get('/notifications/preferences', (_req: Request, res: Response) => {
    const raw = deps.vault.get('notifications.preferences');
    if (!raw) {
      res.json({ data: {} });
      return;
    }
    try {
      res.json({ data: JSON.parse(raw) });
    } catch {
      res.json({ data: {} });
    }
  });

  router.post('/notifications/preferences', async (req: Request, res: Response) => {
    try {
      const prefs = req.body as Record<string, unknown>;
      await deps.vault.add('notifications.preferences', JSON.stringify(prefs));
      void audit('settings.notification_preferences', {});
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to save notification preferences' });
    }
  });

  // --- [P15] Conversation routes ---
  router.get('/conversation/state', (req: Request, res: Response) => {
    if (!deps.conversation) {
      res.json({ data: { state: 'unavailable' } });
      return;
    }
    res.json({ data: { state: deps.conversation.getState(), turnCount: deps.conversation.getTurnCount() } });
  });

  router.post('/conversation/start', (req: Request, res: Response) => {
    if (!deps.conversation) {
      res.status(503).json({ error: 'Conversation engine not available' });
      return;
    }
    deps.conversation.start();
    res.json({ data: { state: deps.conversation.getState() } });
  });

  router.post('/conversation/stop', (req: Request, res: Response) => {
    if (!deps.conversation) {
      res.status(503).json({ error: 'Conversation engine not available' });
      return;
    }
    deps.conversation.stop();
    res.json({ data: { state: 'idle' } });
  });

  // --- Trust / Autonomy routes (Phase 12) ---
  // NOTE: specific routes must come before parameterized :domain routes
  router.get('/trust', (req: Request, res: Response) => {
    if (!deps.trust) {
      res.status(503).json({ error: 'Trust engine not available' });
      return;
    }
    const levels = deps.trust.getLevels();
    res.json({ data: levels });
  });

  router.get('/trust/audit', (req: Request, res: Response) => {
    if (!deps.trust) {
      res.status(503).json({ error: 'Trust engine not available' });
      return;
    }
    const limit = parseInt(req.query.limit as string) || 50;
    const entries = deps.trust.getAuditEntries(limit);
    res.json({ data: entries });
  });

  router.post('/trust/audit/:id/rollback', async (req: Request, res: Response) => {
    if (!deps.trust) {
      res.status(503).json({ error: 'Trust engine not available' });
      return;
    }
    const id = String(req.params.id);
    const result = await deps.trust.rollback(id);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    void audit('trust.action_rolled_back', { auditId: id });
    res.json({ data: { rolledBack: true } });
  });

  router.get('/trust/promotions', (req: Request, res: Response) => {
    if (!deps.trust) {
      res.status(503).json({ error: 'Trust engine not available' });
      return;
    }
    const promotions = deps.trust.getPromotions();
    res.json({ data: promotions });
  });

  router.get('/trust/:domain', (req: Request, res: Response) => {
    if (!deps.trust) {
      res.status(503).json({ error: 'Trust engine not available' });
      return;
    }
    const domain = String(req.params.domain);
    const level = deps.trust.getLevel(domain);
    res.json({ data: { domain, level } });
  });

  router.post('/trust/:domain', async (req: Request, res: Response) => {
    if (!deps.trust) {
      res.status(503).json({ error: 'Trust engine not available' });
      return;
    }
    const domain = String(req.params.domain);
    const { level, reason } = req.body as { level?: number; reason?: string };
    if (level === undefined || typeof level !== 'number' || level < 0 || level > 4) {
      res.status(400).json({ error: 'level must be 0-4' });
      return;
    }
    await deps.trust.setLevel(domain, level, reason ?? 'Set via dashboard');
    void audit('trust.level_changed', { domain, level, reason });
    res.json({ data: { domain, level } });
  });

  return { router, auth };
}
