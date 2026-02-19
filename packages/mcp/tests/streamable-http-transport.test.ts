import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHttpTransport } from '../src/transports/streamable-http-transport.js';
import type { JsonRpcMessage } from '../src/config-types.js';

describe('StreamableHttpTransport', () => {
  let server: Server;
  let port: number;
  let transport: StreamableHttpTransport;

  beforeEach(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method === 'POST' && req.url === '/mcp') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          const msg = JSON.parse(body);
          res.setHeader('Mcp-Session-Id', 'test-session-123');
          const result = { jsonrpc: '2.0', id: msg.id, result: { echo: msg.method } };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        });
      } else {
        res.writeHead(404).end();
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    try { await transport?.close(); } catch { /* ignore */ }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('sends and receives JSON-RPC over HTTP POST', async () => {
    transport = new StreamableHttpTransport({
      url: `http://127.0.0.1:${port}/mcp`,
    });

    const messages: JsonRpcMessage[] = [];
    transport.onMessage((msg) => messages.push(msg));

    await transport.open();
    await transport.send({ jsonrpc: '2.0', id: 1, method: 'test', params: {} });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ id: 1, result: { echo: 'test' } });
  });

  it('captures Mcp-Session-Id from response headers', async () => {
    transport = new StreamableHttpTransport({
      url: `http://127.0.0.1:${port}/mcp`,
    });

    await transport.open();
    await transport.send({ jsonrpc: '2.0', id: 1, method: 'test' });

    expect(transport.sessionId).toBe('test-session-123');
  });

  it('passes custom headers', async () => {
    let receivedAuth = '';
    server.on('request', (req) => {
      receivedAuth = req.headers.authorization || '';
    });

    transport = new StreamableHttpTransport({
      url: `http://127.0.0.1:${port}/mcp`,
      headers: { Authorization: 'Bearer my-token' },
    });

    await transport.open();
    await transport.send({ jsonrpc: '2.0', id: 1, method: 'test' });

    expect(receivedAuth).toBe('Bearer my-token');
  });
});
