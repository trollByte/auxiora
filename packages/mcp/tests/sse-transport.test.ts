import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { SseTransport } from '../src/transports/sse-transport.js';
import type { JsonRpcMessage } from '../src/config-types.js';

describe('SseTransport', () => {
  let server: Server;
  let port: number;
  let transport: SseTransport;
  let sseResponse: ServerResponse | null = null;

  beforeEach(async () => {
    sseResponse = null;
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method === 'GET' && req.url === '/sse') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write(`event: endpoint\ndata: /message\n\n`);
        sseResponse = res;
      } else if (req.method === 'POST' && req.url === '/message') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          const msg = JSON.parse(body);
          const response = {
            jsonrpc: '2.0',
            id: msg.id,
            result: { echo: msg.method },
          };
          if (sseResponse) {
            sseResponse.write(
              `event: message\ndata: ${JSON.stringify(response)}\n\n`,
            );
          }
          res.writeHead(202).end();
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
    try {
      await transport?.close();
    } catch {
      /* ignore */
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('connects via SSE and sends/receives messages', async () => {
    transport = new SseTransport({
      url: `http://127.0.0.1:${port}/sse`,
    });

    const messages: JsonRpcMessage[] = [];
    transport.onMessage((msg) => messages.push(msg));

    await transport.open();

    await transport.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'ping',
      params: {},
    });

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (messages.length > 0) {
          clearInterval(check);
          resolve();
        }
      }, 10);
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { echo: 'ping' },
    });
  });

  it('passes custom headers', async () => {
    let receivedAuth = '';
    server.on('request', (req) => {
      if (req.url === '/message') {
        receivedAuth = req.headers.authorization || '';
      }
    });

    transport = new SseTransport({
      url: `http://127.0.0.1:${port}/sse`,
      headers: { Authorization: 'Bearer test-token' },
    });

    await transport.open();
    await transport.send({ jsonrpc: '2.0', id: 1, method: 'test' });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(receivedAuth).toBe('Bearer test-token');
  });
});
