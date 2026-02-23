import { describe, it, expect } from 'vitest';
import http from 'node:http';

/**
 * Unit test for the /api/v1/features/status endpoint logic.
 *
 * We replicate the handler logic from server.ts in a minimal http server
 * (same approach as marketplace-proxy.test.ts) to avoid importing express.
 */

interface FeatureStatus {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  configured: boolean;
  active: boolean;
  missing?: string[];
  settingsPath?: string | null;
}

function createFeatureStatusHandler(config: {
  channels: Record<string, { enabled?: boolean }>;
  plugins?: { enabled?: boolean };
  webhooks?: { enabled?: boolean };
  voice?: { enabled?: boolean };
  research?: { enabled?: boolean };
  memory?: { enabled?: boolean };
  orchestration?: { enabled?: boolean };
}): http.RequestListener {
  return (_req, res) => {
    const channels = config.channels;
    const channelDefs: Array<{ id: string; name: string; key: string }> = [
      { id: 'discord', name: 'Discord', key: 'discord' },
      { id: 'telegram', name: 'Telegram', key: 'telegram' },
      { id: 'slack', name: 'Slack', key: 'slack' },
      { id: 'signal', name: 'Signal', key: 'signal' },
      { id: 'email', name: 'Email', key: 'email' },
      { id: 'teams', name: 'Teams', key: 'teams' },
      { id: 'matrix', name: 'Matrix', key: 'matrix' },
      { id: 'whatsapp', name: 'WhatsApp', key: 'whatsapp' },
      { id: 'webchat', name: 'Webchat', key: 'webchat' },
    ];

    const channelFeatures: FeatureStatus[] = channelDefs.map(ch => {
      const enabled = (channels as Record<string, { enabled?: boolean }>)[ch.key]?.enabled ?? false;
      return {
        id: ch.id,
        name: ch.name,
        category: 'channel',
        enabled,
        configured: enabled,
        active: enabled,
        settingsPath: '/settings/channels',
      };
    });

    const capabilityDefs: Array<{ id: string; name: string; enabled: boolean }> = [
      { id: 'plugins', name: 'Plugins', enabled: config.plugins?.enabled ?? false },
      { id: 'webhooks', name: 'Webhooks', enabled: config.webhooks?.enabled ?? false },
      { id: 'voice', name: 'Voice', enabled: config.voice?.enabled ?? false },
      { id: 'research', name: 'Research', enabled: config.research?.enabled ?? false },
      { id: 'behaviors', name: 'Behaviors', enabled: true },
      { id: 'memory', name: 'Memory', enabled: config.memory?.enabled ?? false },
      { id: 'orchestration', name: 'Orchestration', enabled: config.orchestration?.enabled ?? false },
    ];

    const capabilityFeatures: FeatureStatus[] = capabilityDefs.map(cap => ({
      id: cap.id,
      name: cap.name,
      category: 'capability',
      enabled: cap.enabled,
      configured: cap.enabled,
      active: cap.enabled,
      settingsPath: null,
    }));

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ features: [...channelFeatures, ...capabilityFeatures] }));
  };
}

function request(
  url: string,
): Promise<{ status: number; json: () => Promise<unknown> }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET' },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          resolve({
            status: res.statusCode ?? 0,
            json: () => Promise.resolve(JSON.parse(body)),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('GET /api/v1/features/status', () => {
  const config = {
    channels: {
      discord: { enabled: true },
      telegram: { enabled: false },
      webchat: { enabled: true },
      slack: { enabled: false },
      signal: { enabled: false },
      email: { enabled: false },
      teams: { enabled: false },
      matrix: { enabled: false },
      whatsapp: { enabled: false },
    },
    plugins: { enabled: true },
    voice: { enabled: false },
    memory: { enabled: true },
    webhooks: { enabled: true },
    research: { enabled: true },
    orchestration: { enabled: false },
  };

  let server: http.Server;
  let baseUrl: string;

  it('should return 200 with features array', async () => {
    server = http.createServer(createFeatureStatusHandler(config));
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const res = await request(`${baseUrl}/api/v1/features/status`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { features: Array<Record<string, unknown>> };
    expect(Array.isArray(body.features)).toBe(true);
    expect(body.features.length).toBeGreaterThan(0);

    server.close();
  });

  it('should include channel and capability entries', async () => {
    server = http.createServer(createFeatureStatusHandler(config));
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const res = await request(`${baseUrl}/`);
    const body = (await res.json()) as { features: Array<{ id: string; name: string; category: string; enabled: boolean; configured: boolean; active: boolean }> };

    const channels = body.features.filter(f => f.category === 'channel');
    const capabilities = body.features.filter(f => f.category === 'capability');

    expect(channels.length).toBe(9);
    expect(capabilities.length).toBe(7);

    const discord = channels.find(c => c.id === 'discord');
    expect(discord).toBeDefined();
    expect(discord!.enabled).toBe(true);
    expect(discord!.name).toBe('Discord');

    const telegram = channels.find(c => c.id === 'telegram');
    expect(telegram).toBeDefined();
    expect(telegram!.enabled).toBe(false);

    const webchat = channels.find(c => c.id === 'webchat');
    expect(webchat).toBeDefined();
    expect(webchat!.enabled).toBe(true);

    server.close();
  });

  it('should reflect capability config', async () => {
    server = http.createServer(createFeatureStatusHandler(config));
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const res = await request(`${baseUrl}/`);
    const body = (await res.json()) as { features: Array<{ id: string; category: string; enabled: boolean; configured: boolean; active: boolean }> };

    const plugins = body.features.find(f => f.id === 'plugins');
    expect(plugins).toBeDefined();
    expect(plugins!.enabled).toBe(true);
    expect(plugins!.configured).toBe(true);
    expect(plugins!.active).toBe(true);

    const voice = body.features.find(f => f.id === 'voice');
    expect(voice).toBeDefined();
    expect(voice!.enabled).toBe(false);

    const behaviors = body.features.find(f => f.id === 'behaviors');
    expect(behaviors).toBeDefined();
    expect(behaviors!.enabled).toBe(true);

    server.close();
  });

  it('each feature has the correct shape', async () => {
    server = http.createServer(createFeatureStatusHandler(config));
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const res = await request(`${baseUrl}/`);
    const body = (await res.json()) as { features: Array<Record<string, unknown>> };

    for (const feature of body.features) {
      expect(typeof feature.id).toBe('string');
      expect(typeof feature.name).toBe('string');
      expect(typeof feature.category).toBe('string');
      expect(typeof feature.enabled).toBe('boolean');
      expect(typeof feature.configured).toBe('boolean');
      expect(typeof feature.active).toBe('boolean');
    }

    server.close();
  });
});
