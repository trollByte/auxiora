import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';

/**
 * Integration test for the marketplace reverse proxy middleware.
 *
 * We spin up a mock "marketplace sidecar" and a proxy server using only
 * node:http (no express dependency needed in tests), then verify that
 * requests to /api/v1/marketplace/* are forwarded correctly.
 */

/** Minimal proxy handler matching the logic in server.ts */
function createProxyHandler(marketplacePort: number): http.RequestListener {
  return (req, res) => {
    const url = req.url ?? '/';

    if (!url.startsWith('/api/v1/marketplace/')) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Collect incoming body
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);

      const targetPath = '/api/v1' + url.replace('/api/v1/marketplace', '');
      const proxyReq = http.request(
        {
          hostname: '127.0.0.1',
          port: marketplacePort,
          path: targetPath,
          method: req.method,
          headers: { ...req.headers, host: `127.0.0.1:${marketplacePort}` },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      proxyReq.on('error', () => {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Marketplace unavailable' }));
      });
      if (body.length > 0) {
        proxyReq.write(body);
      }
      proxyReq.end();
    });
  };
}

function request(
  url: string,
  options: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; json: () => Promise<unknown>; text: () => Promise<string> }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: options.method ?? 'GET',
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          resolve({
            status: res.statusCode ?? 0,
            json: () => Promise.resolve(JSON.parse(text)),
            text: () => Promise.resolve(text),
          });
        });
      },
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

describe('Marketplace reverse proxy', () => {
  let mockSidecar: http.Server;
  let proxyServer: http.Server;
  let sidecarPort: number;
  let proxyPort: number;

  beforeAll(async () => {
    // Mock marketplace sidecar using raw node:http
    mockSidecar = http.createServer((req, res) => {
      const url = req.url ?? '/';

      // Collect body
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = chunks.length > 0 ? Buffer.concat(chunks).toString() : '';

        if (url === '/api/v1/personalities/search' && req.method === 'GET') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ results: [{ name: 'test-personality' }] }));
        } else if (url === '/api/v1/personalities/publish' && req.method === 'POST') {
          const parsed = body ? JSON.parse(body) : {};
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ published: true, body: parsed }));
        } else if (url.startsWith('/api/v1/personalities/') && req.method === 'GET') {
          const id = url.replace('/api/v1/personalities/', '');
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id, name: 'fetched' }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });
    });

    await new Promise<void>((resolve) => {
      mockSidecar.listen(0, '127.0.0.1', () => {
        const addr = mockSidecar.address();
        sidecarPort = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });

    // Proxy server
    proxyServer = http.createServer(createProxyHandler(sidecarPort));
    await new Promise<void>((resolve) => {
      proxyServer.listen(0, '127.0.0.1', () => {
        const addr = proxyServer.address();
        proxyPort = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
    await new Promise<void>((resolve) => mockSidecar.close(() => resolve()));
  });

  it('proxies GET /api/v1/marketplace/personalities/search to sidecar', async () => {
    const res = await request(`http://127.0.0.1:${proxyPort}/api/v1/marketplace/personalities/search`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: Array<{ name: string }> };
    expect(data.results).toEqual([{ name: 'test-personality' }]);
  });

  it('proxies POST with JSON body', async () => {
    const res = await request(`http://127.0.0.1:${proxyPort}/api/v1/marketplace/personalities/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'my-personality' }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { published: boolean; body: { name: string } };
    expect(data.published).toBe(true);
    expect(data.body).toEqual({ name: 'my-personality' });
  });

  it('proxies path parameters correctly', async () => {
    const res = await request(`http://127.0.0.1:${proxyPort}/api/v1/marketplace/personalities/abc-123`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; name: string };
    expect(data.id).toBe('abc-123');
    expect(data.name).toBe('fetched');
  });

  it('returns 502 when sidecar is unreachable', async () => {
    const badProxy = http.createServer(createProxyHandler(19999));
    await new Promise<void>((resolve) => {
      badProxy.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = badProxy.address();
    const badPort = typeof addr === 'object' && addr ? addr.port : 0;

    try {
      const res = await request(`http://127.0.0.1:${badPort}/api/v1/marketplace/personalities/search`);
      expect(res.status).toBe(502);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Marketplace unavailable');
    } finally {
      await new Promise<void>((resolve) => badProxy.close(() => resolve()));
    }
  });
});
