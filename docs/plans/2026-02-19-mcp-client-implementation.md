# MCP Client Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add MCP client support so Auxiora can connect to external MCP servers and use their tools as native Auxiora tools.

**Architecture:** New `packages/mcp/` package implements JSON-RPC 2.0 protocol with three transports (stdio, SSE, Streamable HTTP). MCP tools register directly into the existing `toolRegistry` with `mcp.<server>.<tool>` namespace prefixing. `McpClientManager` orchestrates all connections. Runtime wires it in during `initialize()`.

**Tech Stack:** TypeScript ESM, Node.js child_process (stdio), native fetch (HTTP transports), vitest for tests, zod for config validation.

**Design doc:** `docs/plans/2026-02-19-mcp-client-support-design.md`

---

### Task 1: Package scaffolding and config types

**Files:**
- Create: `packages/mcp/package.json`
- Create: `packages/mcp/tsconfig.json`
- Create: `packages/mcp/src/config-types.ts`
- Create: `packages/mcp/src/index.ts` (initially just re-exports config types)
- Create: `packages/mcp/tests/config-types.test.ts`

**Step 1: Create `packages/mcp/package.json`**

```json
{
  "name": "@auxiora/mcp",
  "version": "1.0.0",
  "description": "MCP client for connecting to external MCP servers",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@auxiora/tools": "workspace:*",
    "@auxiora/logger": "workspace:*"
  },
  "devDependencies": {},
  "engines": {
    "node": ">=22.0.0"
  },
  "publishConfig": {
    "access": "public"
  },
  "files": [
    "dist/"
  ]
}
```

**Step 2: Create `packages/mcp/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 3: Write the failing test for config types**

Create `packages/mcp/tests/config-types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { McpServerConfigSchema, McpClientConfigSchema, type McpServerConfig, type McpClientConfig } from '../src/config-types.js';

describe('McpServerConfigSchema', () => {
  it('validates a stdio server config', () => {
    const config = {
      transport: 'stdio' as const,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    };
    const result = McpServerConfigSchema.parse(config);
    expect(result.transport).toBe('stdio');
    expect(result.command).toBe('npx');
    expect(result.enabled).toBe(true);
    expect(result.timeoutMs).toBe(30_000);
    expect(result.retryAttempts).toBe(3);
    expect(result.retryDelayMs).toBe(1_000);
  });

  it('validates an SSE server config', () => {
    const config = {
      transport: 'sse' as const,
      url: 'https://example.com/sse',
      headers: { Authorization: 'Bearer token' },
    };
    const result = McpServerConfigSchema.parse(config);
    expect(result.transport).toBe('sse');
    expect(result.url).toBe('https://example.com/sse');
    expect(result.headers).toEqual({ Authorization: 'Bearer token' });
  });

  it('validates a streamable-http server config', () => {
    const config = {
      transport: 'streamable-http' as const,
      url: 'https://example.com/mcp',
    };
    const result = McpServerConfigSchema.parse(config);
    expect(result.transport).toBe('streamable-http');
  });

  it('rejects invalid transport', () => {
    expect(() => McpServerConfigSchema.parse({ transport: 'websocket' })).toThrow();
  });

  it('applies defaults for optional fields', () => {
    const config = { transport: 'stdio' as const, command: 'echo' };
    const result = McpServerConfigSchema.parse(config);
    expect(result.enabled).toBe(true);
    expect(result.timeoutMs).toBe(30_000);
    expect(result.retryAttempts).toBe(3);
    expect(result.retryDelayMs).toBe(1_000);
  });
});

describe('McpClientConfigSchema', () => {
  it('validates a config with multiple servers', () => {
    const config = {
      servers: {
        fs: { transport: 'stdio' as const, command: 'npx', args: ['server-fs'] },
        search: { transport: 'sse' as const, url: 'https://example.com/sse' },
      },
    };
    const result = McpClientConfigSchema.parse(config);
    expect(Object.keys(result.servers)).toEqual(['fs', 'search']);
  });

  it('validates an empty servers config', () => {
    const result = McpClientConfigSchema.parse({ servers: {} });
    expect(result.servers).toEqual({});
  });
});
```

**Step 4: Run test to verify it fails**

Run: `npx vitest run packages/mcp/tests/config-types.test.ts`
Expected: FAIL — module `../src/config-types.js` does not exist

**Step 5: Implement config types**

Create `packages/mcp/src/config-types.ts`:

```typescript
import { z } from 'zod';

export const McpServerConfigSchema = z.object({
  transport: z.enum(['stdio', 'sse', 'streamable-http']),
  enabled: z.boolean().default(true),

  // stdio-specific
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),

  // sse / streamable-http specific
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),

  // shared
  timeoutMs: z.number().int().positive().default(30_000),
  retryAttempts: z.number().int().min(0).default(3),
  retryDelayMs: z.number().int().positive().default(1_000),
});

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const McpClientConfigSchema = z.object({
  servers: z.record(z.string(), McpServerConfigSchema),
});

export type McpClientConfig = z.infer<typeof McpClientConfigSchema>;

/**
 * MCP JSON-RPC 2.0 message types
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

/**
 * MCP tool definition as returned by tools/list
 */
export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP tool call result
 */
export interface McpToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * MCP server capabilities from initialize response
 */
export interface McpServerCapabilities {
  tools?: { listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
}

/**
 * MCP initialize result
 */
export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: McpServerCapabilities;
  serverInfo: { name: string; version?: string };
}
```

**Step 6: Create barrel export**

Create `packages/mcp/src/index.ts`:

```typescript
export {
  McpServerConfigSchema,
  McpClientConfigSchema,
  type McpServerConfig,
  type McpClientConfig,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcNotification,
  type JsonRpcMessage,
  type McpToolDefinition,
  type McpToolResult,
  type McpServerCapabilities,
  type McpInitializeResult,
} from './config-types.js';
```

**Step 7: Run `pnpm install` to link the new package**

Run: `pnpm install`

**Step 8: Run test to verify it passes**

Run: `npx vitest run packages/mcp/tests/config-types.test.ts`
Expected: PASS (7 tests)

**Step 9: Commit**

```bash
git add packages/mcp/
git commit -m "feat(mcp): scaffold package with config types and zod schemas"
```

---

### Task 2: Transport interface and stdio transport

**Files:**
- Create: `packages/mcp/src/transports/transport.ts`
- Create: `packages/mcp/src/transports/stdio-transport.ts`
- Create: `packages/mcp/tests/stdio-transport.test.ts`
- Modify: `packages/mcp/src/index.ts` — add transport exports

**Step 1: Write the failing test**

Create `packages/mcp/tests/stdio-transport.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { StdioTransport } from '../src/transports/stdio-transport.js';
import type { JsonRpcMessage } from '../src/config-types.js';

describe('StdioTransport', () => {
  let transport: StdioTransport;

  afterEach(async () => {
    try { await transport?.close(); } catch { /* ignore */ }
  });

  it('opens a child process and sends/receives JSON-RPC messages', async () => {
    // Use a simple Node.js echo script as a mock MCP server
    // It reads JSON-RPC from stdin and echoes back a response
    transport = new StdioTransport({
      command: 'node',
      args: ['-e', `
        process.stdin.setEncoding('utf8');
        let buf = '';
        process.stdin.on('data', (chunk) => {
          buf += chunk;
          const lines = buf.split('\\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const msg = JSON.parse(line);
            const response = { jsonrpc: '2.0', id: msg.id, result: { echo: msg.method } };
            process.stdout.write(JSON.stringify(response) + '\\n');
          }
        });
      `],
    });

    const messages: JsonRpcMessage[] = [];
    transport.onMessage((msg) => messages.push(msg));

    await transport.open();

    await transport.send({ jsonrpc: '2.0', id: 1, method: 'test', params: {} });

    // Wait for response
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
      result: { echo: 'test' },
    });
  });

  it('emits onClose when child process exits', async () => {
    transport = new StdioTransport({
      command: 'node',
      args: ['-e', 'setTimeout(() => process.exit(0), 50)'],
    });

    let closed = false;
    transport.onClose(() => { closed = true; });
    await transport.open();

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(closed).toBe(true);
  });

  it('emits onError for invalid command', async () => {
    transport = new StdioTransport({
      command: 'nonexistent-command-12345',
      args: [],
    });

    let error: Error | undefined;
    transport.onError((e) => { error = e; });

    await expect(transport.open()).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/mcp/tests/stdio-transport.test.ts`
Expected: FAIL — module not found

**Step 3: Implement transport interface**

Create `packages/mcp/src/transports/transport.ts`:

```typescript
import type { JsonRpcMessage } from '../config-types.js';

export interface McpTransport {
  open(): Promise<void>;
  close(): Promise<void>;
  send(message: JsonRpcMessage): Promise<void>;
  onMessage(handler: (message: JsonRpcMessage) => void): void;
  onError(handler: (error: Error) => void): void;
  onClose(handler: () => void): void;
}
```

**Step 4: Implement stdio transport**

Create `packages/mcp/src/transports/stdio-transport.ts`:

```typescript
import { spawn, type ChildProcess } from 'node:child_process';
import type { JsonRpcMessage } from '../config-types.js';
import type { McpTransport } from './transport.js';

export interface StdioTransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export class StdioTransport implements McpTransport {
  private process: ChildProcess | null = null;
  private messageHandlers: Array<(msg: JsonRpcMessage) => void> = [];
  private errorHandlers: Array<(err: Error) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private buffer = '';

  constructor(private readonly options: StdioTransportOptions) {}

  async open(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this.process = spawn(this.options.command, this.options.args ?? [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...this.options.env },
          cwd: this.options.cwd,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        for (const handler of this.errorHandlers) handler(error);
        reject(error);
        return;
      }

      let settled = false;

      this.process.on('error', (err) => {
        for (const handler of this.errorHandlers) handler(err);
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      this.process.stdout!.setEncoding('utf8');
      this.process.stdout!.on('data', (chunk: string) => {
        this.buffer += chunk;
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as JsonRpcMessage;
            for (const handler of this.messageHandlers) handler(msg);
          } catch {
            // Skip non-JSON lines (e.g. server logging to stdout)
          }
        }
      });

      this.process.stderr!.setEncoding('utf8');
      this.process.stderr!.on('data', (_chunk: string) => {
        // MCP spec: stderr is for logging, not protocol messages
        // Could pipe to logger here
      });

      this.process.on('close', () => {
        for (const handler of this.closeHandlers) handler();
      });

      // Consider connected once the process has spawned successfully
      // Give it a tick to detect immediate spawn errors
      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve();
        }
      }, 50);
    });
  }

  async close(): Promise<void> {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  async send(message: JsonRpcMessage): Promise<void> {
    if (!this.process?.stdin?.writable) {
      throw new Error('Transport not connected');
    }
    const data = JSON.stringify(message) + '\n';
    return new Promise<void>((resolve, reject) => {
      this.process!.stdin!.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  onMessage(handler: (message: JsonRpcMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }
}
```

**Step 5: Update barrel export**

Add to `packages/mcp/src/index.ts`:

```typescript
export type { McpTransport } from './transports/transport.js';
export { StdioTransport, type StdioTransportOptions } from './transports/stdio-transport.js';
```

**Step 6: Run test to verify it passes**

Run: `npx vitest run packages/mcp/tests/stdio-transport.test.ts`
Expected: PASS (3 tests)

**Step 7: Commit**

```bash
git add packages/mcp/src/transports/ packages/mcp/tests/stdio-transport.test.ts packages/mcp/src/index.ts
git commit -m "feat(mcp): add transport interface and stdio transport"
```

---

### Task 3: SSE transport

**Files:**
- Create: `packages/mcp/src/transports/sse-transport.ts`
- Create: `packages/mcp/tests/sse-transport.test.ts`
- Modify: `packages/mcp/src/index.ts` — add SSE export

**Step 1: Write the failing test**

Create `packages/mcp/tests/sse-transport.test.ts`:

```typescript
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
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
        // SSE endpoint: server → client
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        // Send the POST endpoint as the first event
        res.write(`event: endpoint\ndata: /message\n\n`);
        sseResponse = res;
      } else if (req.method === 'POST' && req.url === '/message') {
        // Message endpoint: client → server
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          const msg = JSON.parse(body);
          // Echo back via SSE
          const response = { jsonrpc: '2.0', id: msg.id, result: { echo: msg.method } };
          if (sseResponse) {
            sseResponse.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
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
    try { await transport?.close(); } catch { /* ignore */ }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('connects via SSE and sends/receives messages', async () => {
    transport = new SseTransport({
      url: `http://127.0.0.1:${port}/sse`,
    });

    const messages: JsonRpcMessage[] = [];
    transport.onMessage((msg) => messages.push(msg));

    await transport.open();

    await transport.send({ jsonrpc: '2.0', id: 1, method: 'ping', params: {} });

    // Wait for response
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/mcp/tests/sse-transport.test.ts`
Expected: FAIL — module not found

**Step 3: Implement SSE transport**

Create `packages/mcp/src/transports/sse-transport.ts`:

```typescript
import type { JsonRpcMessage } from '../config-types.js';
import type { McpTransport } from './transport.js';

export interface SseTransportOptions {
  url: string;
  headers?: Record<string, string>;
}

export class SseTransport implements McpTransport {
  private messageHandlers: Array<(msg: JsonRpcMessage) => void> = [];
  private errorHandlers: Array<(err: Error) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private abortController: AbortController | null = null;
  private postEndpoint: string | null = null;
  private readonly baseUrl: string;

  constructor(private readonly options: SseTransportOptions) {
    const parsed = new URL(options.url);
    this.baseUrl = `${parsed.protocol}//${parsed.host}`;
  }

  async open(): Promise<void> {
    this.abortController = new AbortController();

    const response = await fetch(this.options.url, {
      headers: {
        Accept: 'text/event-stream',
        ...this.options.headers,
      },
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('SSE response has no body');
    }

    // Process SSE stream in background
    this.processStream(response.body).catch((err) => {
      if (err.name !== 'AbortError') {
        for (const handler of this.errorHandlers) handler(err);
      }
    });

    // Wait for the endpoint event
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for SSE endpoint event')), 10_000);
      const check = setInterval(() => {
        if (this.postEndpoint) {
          clearTimeout(timeout);
          clearInterval(check);
          resolve();
        }
      }, 10);
    });
  }

  private async processStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventType = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (eventType === 'endpoint') {
              this.postEndpoint = data.trim();
            } else if (eventType === 'message') {
              try {
                const msg = JSON.parse(data) as JsonRpcMessage;
                for (const handler of this.messageHandlers) handler(msg);
              } catch { /* skip non-JSON */ }
            }
            eventType = '';
          } else if (line === '') {
            eventType = '';
          }
        }
      }
    } finally {
      reader.releaseLock();
      for (const handler of this.closeHandlers) handler();
    }
  }

  async close(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
    this.postEndpoint = null;
  }

  async send(message: JsonRpcMessage): Promise<void> {
    if (!this.postEndpoint) {
      throw new Error('Transport not connected');
    }

    const url = this.postEndpoint.startsWith('http')
      ? this.postEndpoint
      : `${this.baseUrl}${this.postEndpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.options.headers,
      },
      body: JSON.stringify(message),
    });

    if (!response.ok && response.status !== 202) {
      throw new Error(`POST failed: ${response.status} ${response.statusText}`);
    }
  }

  onMessage(handler: (message: JsonRpcMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }
}
```

**Step 4: Add export to barrel**

Add to `packages/mcp/src/index.ts`:

```typescript
export { SseTransport, type SseTransportOptions } from './transports/sse-transport.js';
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run packages/mcp/tests/sse-transport.test.ts`
Expected: PASS (2 tests)

**Step 6: Commit**

```bash
git add packages/mcp/src/transports/sse-transport.ts packages/mcp/tests/sse-transport.test.ts packages/mcp/src/index.ts
git commit -m "feat(mcp): add SSE transport"
```

---

### Task 4: Streamable HTTP transport

**Files:**
- Create: `packages/mcp/src/transports/streamable-http-transport.ts`
- Create: `packages/mcp/tests/streamable-http-transport.test.ts`
- Modify: `packages/mcp/src/index.ts` — add export

**Step 1: Write the failing test**

Create `packages/mcp/tests/streamable-http-transport.test.ts`:

```typescript
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

          // Return session ID header
          res.setHeader('Mcp-Session-Id', 'test-session-123');

          if (msg.method === 'initialize') {
            const result = {
              jsonrpc: '2.0',
              id: msg.id,
              result: {
                protocolVersion: '2025-03-26',
                capabilities: { tools: {} },
                serverInfo: { name: 'test', version: '1.0' },
              },
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } else {
            const result = { jsonrpc: '2.0', id: msg.id, result: { echo: msg.method } };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          }
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

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ id: 1, result: { echo: 'test' } });
  });

  it('captures Mcp-Session-Id from response headers', async () => {
    transport = new StreamableHttpTransport({
      url: `http://127.0.0.1:${port}/mcp`,
    });

    await transport.open();
    await transport.send({ jsonrpc: '2.0', id: 1, method: 'test' });

    await new Promise((resolve) => setTimeout(resolve, 100));

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

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(receivedAuth).toBe('Bearer my-token');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/mcp/tests/streamable-http-transport.test.ts`
Expected: FAIL — module not found

**Step 3: Implement streamable HTTP transport**

Create `packages/mcp/src/transports/streamable-http-transport.ts`:

```typescript
import type { JsonRpcMessage } from '../config-types.js';
import type { McpTransport } from './transport.js';

export interface StreamableHttpTransportOptions {
  url: string;
  headers?: Record<string, string>;
}

export class StreamableHttpTransport implements McpTransport {
  private messageHandlers: Array<(msg: JsonRpcMessage) => void> = [];
  private errorHandlers: Array<(err: Error) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private _sessionId: string | null = null;

  constructor(private readonly options: StreamableHttpTransportOptions) {}

  get sessionId(): string | null {
    return this._sessionId;
  }

  async open(): Promise<void> {
    // Streamable HTTP is stateless per-request.
    // Connection is validated on first send.
  }

  async close(): Promise<void> {
    this._sessionId = null;
    for (const handler of this.closeHandlers) handler();
  }

  async send(message: JsonRpcMessage): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...this.options.headers,
    };

    if (this._sessionId) {
      headers['Mcp-Session-Id'] = this._sessionId;
    }

    const response = await fetch(this.options.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
    });

    // Capture session ID
    const sessionHeader = response.headers.get('Mcp-Session-Id');
    if (sessionHeader) {
      this._sessionId = sessionHeader;
    }

    if (!response.ok) {
      throw new Error(`HTTP POST failed: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('Content-Type') || '';

    if (contentType.includes('text/event-stream')) {
      // Server is streaming responses via SSE
      await this.processSSEResponse(response);
    } else {
      // Standard JSON response
      const text = await response.text();
      if (text.trim()) {
        try {
          const msg = JSON.parse(text) as JsonRpcMessage;
          for (const handler of this.messageHandlers) handler(msg);
        } catch {
          // Non-JSON response, ignore
        }
      }
    }
  }

  private async processSSEResponse(response: Response): Promise<void> {
    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const msg = JSON.parse(data) as JsonRpcMessage;
              for (const handler of this.messageHandlers) handler(msg);
            } catch { /* skip */ }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  onMessage(handler: (message: JsonRpcMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }
}
```

**Step 4: Add export to barrel**

Add to `packages/mcp/src/index.ts`:

```typescript
export { StreamableHttpTransport, type StreamableHttpTransportOptions } from './transports/streamable-http-transport.js';
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run packages/mcp/tests/streamable-http-transport.test.ts`
Expected: PASS (3 tests)

**Step 6: Commit**

```bash
git add packages/mcp/src/transports/streamable-http-transport.ts packages/mcp/tests/streamable-http-transport.test.ts packages/mcp/src/index.ts
git commit -m "feat(mcp): add Streamable HTTP transport"
```

---

### Task 5: Tool adapter (JSON Schema → Auxiora Tool)

**Files:**
- Create: `packages/mcp/src/tool-adapter.ts`
- Create: `packages/mcp/tests/tool-adapter.test.ts`
- Modify: `packages/mcp/src/index.ts` — add export

**Step 1: Write the failing test**

Create `packages/mcp/tests/tool-adapter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { jsonSchemaToToolParameters, adaptMcpTool } from '../src/tool-adapter.js';
import { ToolPermission, type ToolResult } from '@auxiora/tools';
import type { McpToolDefinition, McpToolResult } from '../src/config-types.js';

describe('jsonSchemaToToolParameters', () => {
  it('converts simple properties', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path' },
        count: { type: 'number', description: 'How many' },
        verbose: { type: 'boolean', description: 'Verbose output' },
      },
      required: ['path'],
    };

    const params = jsonSchemaToToolParameters(schema);

    expect(params).toHaveLength(3);
    expect(params[0]).toEqual({
      name: 'path',
      type: 'string',
      description: 'File path',
      required: true,
    });
    expect(params[1]).toEqual({
      name: 'count',
      type: 'number',
      description: 'How many',
      required: false,
    });
    expect(params[2]).toEqual({
      name: 'verbose',
      type: 'boolean',
      description: 'Verbose output',
      required: false,
    });
  });

  it('handles array and object types', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        tags: { type: 'array', description: 'Tags', items: { type: 'string' } },
        options: { type: 'object', description: 'Options', properties: { key: { type: 'string' } } },
      },
    };

    const params = jsonSchemaToToolParameters(schema);

    expect(params[0]).toMatchObject({ name: 'tags', type: 'array', items: { type: 'string' } });
    expect(params[1]).toMatchObject({ name: 'options', type: 'object', properties: { key: { type: 'string' } } });
  });

  it('handles empty schema', () => {
    const params = jsonSchemaToToolParameters({ type: 'object' });
    expect(params).toEqual([]);
  });

  it('handles missing description', () => {
    const schema = {
      type: 'object' as const,
      properties: { name: { type: 'string' } },
    };
    const params = jsonSchemaToToolParameters(schema);
    expect(params[0].description).toBe('');
  });
});

describe('adaptMcpTool', () => {
  it('creates an Auxiora Tool from an MCP tool definition', () => {
    const mcpTool: McpToolDefinition = {
      name: 'read_file',
      description: 'Read a file from disk',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path' } },
        required: ['path'],
      },
    };

    const callTool = async (_name: string, _args: Record<string, unknown>): Promise<McpToolResult> => ({
      content: [{ type: 'text', text: 'file contents here' }],
    });

    const tool = adaptMcpTool('filesystem', mcpTool, callTool);

    expect(tool.name).toBe('mcp.filesystem.read_file');
    expect(tool.description).toBe('[MCP: filesystem] Read a file from disk');
    expect(tool.parameters).toHaveLength(1);
    expect(tool.parameters[0].name).toBe('path');
    expect(tool.getPermission({}, {})).toBe(ToolPermission.USER_APPROVAL);
  });

  it('execute() calls through to callTool and extracts text', async () => {
    const mcpTool: McpToolDefinition = {
      name: 'search',
      description: 'Search the web',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    };

    const callTool = async (_name: string, args: Record<string, unknown>): Promise<McpToolResult> => ({
      content: [
        { type: 'text', text: `Results for: ${args.query}` },
        { type: 'text', text: 'Second result' },
      ],
    });

    const tool = adaptMcpTool('web', mcpTool, callTool);
    const result = await tool.execute({ query: 'test' }, {});

    expect(result.success).toBe(true);
    expect(result.output).toBe('Results for: test\nSecond result');
  });

  it('execute() handles errors from callTool', async () => {
    const mcpTool: McpToolDefinition = {
      name: 'fail',
      inputSchema: { type: 'object' },
    };

    const callTool = async (): Promise<McpToolResult> => {
      throw new Error('connection lost');
    };

    const tool = adaptMcpTool('broken', mcpTool, callTool);
    const result = await tool.execute({}, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('connection lost');
  });

  it('execute() handles isError in MCP result', async () => {
    const mcpTool: McpToolDefinition = {
      name: 'err',
      inputSchema: { type: 'object' },
    };

    const callTool = async (): Promise<McpToolResult> => ({
      content: [{ type: 'text', text: 'Something went wrong' }],
      isError: true,
    });

    const tool = adaptMcpTool('srv', mcpTool, callTool);
    const result = await tool.execute({}, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('Something went wrong');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/mcp/tests/tool-adapter.test.ts`
Expected: FAIL — module not found

**Step 3: Implement tool adapter**

Create `packages/mcp/src/tool-adapter.ts`:

```typescript
import {
  ToolPermission,
  type Tool,
  type ToolParameter,
  type ToolResult,
  type ExecutionContext,
} from '@auxiora/tools';
import type { McpToolDefinition, McpToolResult } from './config-types.js';

const JSON_SCHEMA_TYPE_MAP: Record<string, ToolParameter['type']> = {
  string: 'string',
  number: 'number',
  integer: 'number',
  boolean: 'boolean',
  array: 'array',
  object: 'object',
};

export function jsonSchemaToToolParameters(
  schema: McpToolDefinition['inputSchema'],
): ToolParameter[] {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  return Object.entries(properties).map(([name, prop]: [string, any]) => {
    const param: ToolParameter = {
      name,
      type: JSON_SCHEMA_TYPE_MAP[prop.type] ?? 'string',
      description: prop.description ?? '',
      required: required.has(name),
    };

    if (prop.items) {
      param.items = prop.items;
    }
    if (prop.properties) {
      param.properties = prop.properties;
    }

    return param;
  });
}

export type CallToolFn = (
  name: string,
  args: Record<string, unknown>,
) => Promise<McpToolResult>;

export function adaptMcpTool(
  serverName: string,
  mcpTool: McpToolDefinition,
  callTool: CallToolFn,
): Tool {
  return {
    name: `mcp.${serverName}.${mcpTool.name}`,
    description: `[MCP: ${serverName}] ${mcpTool.description ?? mcpTool.name}`,
    parameters: jsonSchemaToToolParameters(mcpTool.inputSchema),

    async execute(
      params: Record<string, unknown>,
      _context: ExecutionContext,
    ): Promise<ToolResult> {
      try {
        const result = await callTool(mcpTool.name, params);
        const textParts = result.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text!);
        const output = textParts.join('\n');

        if (result.isError) {
          return { success: false, error: output || 'MCP tool returned error' };
        }

        return { success: true, output };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    getPermission(): ToolPermission {
      return ToolPermission.USER_APPROVAL;
    },
  };
}
```

**Step 4: Add export to barrel**

Add to `packages/mcp/src/index.ts`:

```typescript
export { jsonSchemaToToolParameters, adaptMcpTool, type CallToolFn } from './tool-adapter.js';
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run packages/mcp/tests/tool-adapter.test.ts`
Expected: PASS (8 tests)

**Step 6: Commit**

```bash
git add packages/mcp/src/tool-adapter.ts packages/mcp/tests/tool-adapter.test.ts packages/mcp/src/index.ts
git commit -m "feat(mcp): add tool adapter (MCP tools → Auxiora tools)"
```

---

### Task 6: MCP connection (protocol + tool discovery)

**Files:**
- Create: `packages/mcp/src/mcp-connection.ts`
- Create: `packages/mcp/tests/mcp-connection.test.ts`
- Modify: `packages/mcp/src/index.ts` — add export

**Step 1: Write the failing test**

Create `packages/mcp/tests/mcp-connection.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpConnection } from '../src/mcp-connection.js';
import type { McpTransport } from '../src/transports/transport.js';
import type { JsonRpcMessage, JsonRpcRequest } from '../src/config-types.js';

function createMockTransport(): McpTransport & {
  simulateMessage: (msg: JsonRpcMessage) => void;
  sentMessages: JsonRpcMessage[];
} {
  const messageHandlers: Array<(msg: JsonRpcMessage) => void> = [];
  const errorHandlers: Array<(err: Error) => void> = [];
  const closeHandlers: Array<() => void> = [];
  const sentMessages: JsonRpcMessage[] = [];

  return {
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockImplementation(async (msg: JsonRpcMessage) => {
      sentMessages.push(msg);
    }),
    onMessage: (handler) => messageHandlers.push(handler),
    onError: (handler) => errorHandlers.push(handler),
    onClose: (handler) => closeHandlers.push(handler),
    simulateMessage: (msg) => {
      for (const handler of messageHandlers) handler(msg);
    },
    sentMessages,
  };
}

describe('McpConnection', () => {
  let transport: ReturnType<typeof createMockTransport>;
  let connection: McpConnection;

  beforeEach(() => {
    transport = createMockTransport();
    connection = new McpConnection('test-server', transport);
  });

  it('performs initialize handshake on connect', async () => {
    // When connect() sends initialize, respond with server capabilities
    transport.send = vi.fn().mockImplementation(async (msg: JsonRpcMessage) => {
      transport.sentMessages.push(msg);
      const req = msg as JsonRpcRequest;
      if (req.method === 'initialize') {
        transport.simulateMessage({
          jsonrpc: '2.0',
          id: req.id!,
          result: {
            protocolVersion: '2025-03-26',
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: 'mock', version: '1.0.0' },
          },
        });
      } else if (req.method === 'tools/list') {
        transport.simulateMessage({
          jsonrpc: '2.0',
          id: req.id!,
          result: {
            tools: [
              {
                name: 'read_file',
                description: 'Read a file',
                inputSchema: {
                  type: 'object',
                  properties: { path: { type: 'string', description: 'Path' } },
                  required: ['path'],
                },
              },
            ],
          },
        });
      }
    });

    await connection.connect();

    expect(connection.state).toBe('ready');
    expect(transport.open).toHaveBeenCalled();

    // Should have sent: initialize, notifications/initialized, tools/list
    const methods = transport.sentMessages.map((m) => (m as JsonRpcRequest).method);
    expect(methods).toContain('initialize');
    expect(methods).toContain('notifications/initialized');
    expect(methods).toContain('tools/list');
  });

  it('discovers tools on connect', async () => {
    transport.send = vi.fn().mockImplementation(async (msg: JsonRpcMessage) => {
      transport.sentMessages.push(msg);
      const req = msg as JsonRpcRequest;
      if (req.method === 'initialize') {
        transport.simulateMessage({
          jsonrpc: '2.0', id: req.id!, result: {
            protocolVersion: '2025-03-26',
            capabilities: { tools: {} },
            serverInfo: { name: 'mock' },
          },
        });
      } else if (req.method === 'tools/list') {
        transport.simulateMessage({
          jsonrpc: '2.0', id: req.id!, result: {
            tools: [
              { name: 'tool_a', inputSchema: { type: 'object' } },
              { name: 'tool_b', description: 'B', inputSchema: { type: 'object' } },
            ],
          },
        });
      }
    });

    await connection.connect();
    const tools = connection.tools;

    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('tool_a');
    expect(tools[1].name).toBe('tool_b');
  });

  it('callTool sends tools/call and returns result', async () => {
    transport.send = vi.fn().mockImplementation(async (msg: JsonRpcMessage) => {
      transport.sentMessages.push(msg);
      const req = msg as JsonRpcRequest;
      if (req.method === 'initialize') {
        transport.simulateMessage({
          jsonrpc: '2.0', id: req.id!, result: {
            protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'mock' },
          },
        });
      } else if (req.method === 'tools/list') {
        transport.simulateMessage({
          jsonrpc: '2.0', id: req.id!, result: { tools: [] },
        });
      } else if (req.method === 'tools/call') {
        transport.simulateMessage({
          jsonrpc: '2.0', id: req.id!, result: {
            content: [{ type: 'text', text: 'hello world' }],
          },
        });
      }
    });

    await connection.connect();
    const result = await connection.callTool('greet', { name: 'test' });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe('hello world');
  });

  it('disconnect closes transport', async () => {
    transport.send = vi.fn().mockImplementation(async (msg: JsonRpcMessage) => {
      transport.sentMessages.push(msg);
      const req = msg as JsonRpcRequest;
      if (req.method === 'initialize') {
        transport.simulateMessage({
          jsonrpc: '2.0', id: req.id!, result: {
            protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'mock' },
          },
        });
      } else if (req.method === 'tools/list') {
        transport.simulateMessage({
          jsonrpc: '2.0', id: req.id!, result: { tools: [] },
        });
      }
    });

    await connection.connect();
    await connection.disconnect();

    expect(connection.state).toBe('disconnected');
    expect(transport.close).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/mcp/tests/mcp-connection.test.ts`
Expected: FAIL — module not found

**Step 3: Implement McpConnection**

Create `packages/mcp/src/mcp-connection.ts`:

```typescript
import type { McpTransport } from './transports/transport.js';
import type {
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcResponse,
  McpToolDefinition,
  McpToolResult,
  McpInitializeResult,
} from './config-types.js';

type ConnectionState = 'disconnected' | 'connecting' | 'ready' | 'error';

export class McpConnection {
  private _state: ConnectionState = 'disconnected';
  private _tools: McpToolDefinition[] = [];
  private serverInfo: McpInitializeResult | null = null;
  private nextId = 1;
  private pendingRequests = new Map<
    string | number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >();

  constructor(
    readonly name: string,
    private readonly transport: McpTransport,
  ) {
    this.transport.onMessage((msg) => this.handleMessage(msg));
    this.transport.onError((err) => {
      this._state = 'error';
      // Reject all pending requests
      for (const [, pending] of this.pendingRequests) {
        pending.reject(err);
      }
      this.pendingRequests.clear();
    });
  }

  get state(): ConnectionState {
    return this._state;
  }

  get tools(): McpToolDefinition[] {
    return this._tools;
  }

  async connect(): Promise<void> {
    this._state = 'connecting';
    await this.transport.open();

    // Step 1: Initialize handshake
    const initResult = (await this.sendRequest('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      clientInfo: { name: 'auxiora', version: '1.4.0' },
    })) as McpInitializeResult;

    this.serverInfo = initResult;

    // Step 2: Send initialized notification
    await this.transport.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    // Step 3: Discover tools
    const toolsResult = (await this.sendRequest('tools/list', {})) as {
      tools: McpToolDefinition[];
    };
    this._tools = toolsResult.tools;

    this._state = 'ready';
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
    this._state = 'disconnected';
    this._tools = [];
    this.pendingRequests.clear();
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const result = (await this.sendRequest('tools/call', {
      name,
      arguments: args,
    })) as McpToolResult;
    return result;
  }

  async refreshTools(): Promise<McpToolDefinition[]> {
    const result = (await this.sendRequest('tools/list', {})) as {
      tools: McpToolDefinition[];
    };
    this._tools = result.tools;
    return this._tools;
  }

  private async sendRequest(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, 30_000);

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.transport.send(request).catch((err) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(err);
      });
    });
  }

  private handleMessage(msg: JsonRpcMessage): void {
    // Check if it's a response (has id and result/error)
    if ('id' in msg && msg.id !== undefined) {
      const response = msg as JsonRpcResponse;
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        this.pendingRequests.delete(response.id);
        if (response.error) {
          pending.reject(
            new Error(`MCP error ${response.error.code}: ${response.error.message}`),
          );
        } else {
          pending.resolve(response.result);
        }
      }
    }
    // Notifications (no id) could be handled here for tools/list_changed etc.
  }
}
```

**Step 4: Add export to barrel**

Add to `packages/mcp/src/index.ts`:

```typescript
export { McpConnection } from './mcp-connection.js';
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run packages/mcp/tests/mcp-connection.test.ts`
Expected: PASS (4 tests)

**Step 6: Commit**

```bash
git add packages/mcp/src/mcp-connection.ts packages/mcp/tests/mcp-connection.test.ts packages/mcp/src/index.ts
git commit -m "feat(mcp): add McpConnection with protocol handshake and tool discovery"
```

---

### Task 7: MCP client manager (orchestrator)

**Files:**
- Create: `packages/mcp/src/mcp-client-manager.ts`
- Create: `packages/mcp/tests/mcp-client-manager.test.ts`
- Modify: `packages/mcp/src/index.ts` — add export

**Step 1: Write the failing test**

Create `packages/mcp/tests/mcp-client-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpClientManager } from '../src/mcp-client-manager.js';
import { ToolRegistry } from '@auxiora/tools';
import type { McpClientConfig } from '../src/config-types.js';

// We mock McpConnection at the module level since McpClientManager creates them
vi.mock('../src/mcp-connection.js', () => {
  return {
    McpConnection: vi.fn().mockImplementation((name: string) => {
      return {
        name,
        state: 'disconnected',
        tools: [
          {
            name: `tool_from_${name}`,
            description: `Tool from ${name}`,
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        connect: vi.fn().mockImplementation(async function (this: any) {
          this.state = 'ready';
        }),
        disconnect: vi.fn().mockImplementation(async function (this: any) {
          this.state = 'disconnected';
        }),
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'result' }],
        }),
      };
    }),
  };
});

describe('McpClientManager', () => {
  let registry: ToolRegistry;
  let config: McpClientConfig;

  beforeEach(() => {
    registry = new ToolRegistry();
    config = {
      servers: {
        alpha: { transport: 'stdio', command: 'echo', enabled: true, timeoutMs: 30000, retryAttempts: 3, retryDelayMs: 1000 },
        beta: { transport: 'stdio', command: 'echo', enabled: true, timeoutMs: 30000, retryAttempts: 3, retryDelayMs: 1000 },
        disabled: { transport: 'stdio', command: 'echo', enabled: false, timeoutMs: 30000, retryAttempts: 3, retryDelayMs: 1000 },
      },
    };
  });

  it('connectAll connects enabled servers and registers tools', async () => {
    const manager = new McpClientManager(registry, config);
    await manager.connectAll();

    // Should have registered tools for alpha and beta, not disabled
    const names = registry.listNames();
    expect(names).toContain('mcp.alpha.tool_from_alpha');
    expect(names).toContain('mcp.beta.tool_from_beta');
    expect(names.some((n) => n.includes('disabled'))).toBe(false);
  });

  it('getStatus returns connection states', async () => {
    const manager = new McpClientManager(registry, config);
    await manager.connectAll();

    const status = manager.getStatus();
    expect(status.get('alpha')).toMatchObject({ state: 'ready', toolCount: 1 });
    expect(status.get('beta')).toMatchObject({ state: 'ready', toolCount: 1 });
    expect(status.has('disabled')).toBe(false);
  });

  it('disconnect removes tools from registry', async () => {
    const manager = new McpClientManager(registry, config);
    await manager.connectAll();

    expect(registry.listNames()).toContain('mcp.alpha.tool_from_alpha');

    await manager.disconnect('alpha');

    expect(registry.listNames()).not.toContain('mcp.alpha.tool_from_alpha');
  });

  it('disconnectAll disconnects all servers', async () => {
    const manager = new McpClientManager(registry, config);
    await manager.connectAll();

    await manager.disconnectAll();

    const status = manager.getStatus();
    expect(status.size).toBe(0);
    expect(registry.listNames().filter((n) => n.startsWith('mcp.'))).toHaveLength(0);
  });

  it('connect single server by name', async () => {
    const manager = new McpClientManager(registry, config);
    await manager.connect('alpha');

    expect(registry.listNames()).toContain('mcp.alpha.tool_from_alpha');
    expect(registry.listNames().filter((n) => n.includes('beta'))).toHaveLength(0);
  });

  it('skips servers that fail to connect', async () => {
    // Make alpha fail
    const { McpConnection } = await import('../src/mcp-connection.js');
    (McpConnection as any).mockImplementationOnce((name: string) => ({
      name,
      state: 'disconnected',
      tools: [],
      connect: vi.fn().mockRejectedValue(new Error('spawn failed')),
      disconnect: vi.fn(),
      callTool: vi.fn(),
    }));

    const manager = new McpClientManager(registry, config);
    await manager.connectAll(); // Should not throw

    // beta should still connect
    const status = manager.getStatus();
    expect(status.get('beta')?.state).toBe('ready');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/mcp/tests/mcp-client-manager.test.ts`
Expected: FAIL — module not found

**Step 3: Implement McpClientManager**

Create `packages/mcp/src/mcp-client-manager.ts`:

```typescript
import { type ToolRegistry } from '@auxiora/tools';
import { McpConnection } from './mcp-connection.js';
import { adaptMcpTool } from './tool-adapter.js';
import { StdioTransport } from './transports/stdio-transport.js';
import { SseTransport } from './transports/sse-transport.js';
import { StreamableHttpTransport } from './transports/streamable-http-transport.js';
import type { McpTransport } from './transports/transport.js';
import type { McpClientConfig, McpServerConfig } from './config-types.js';

export class McpClientManager {
  private connections = new Map<string, McpConnection>();
  private registeredTools = new Map<string, string[]>(); // serverName → tool names

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly config: McpClientConfig,
  ) {}

  async connectAll(): Promise<void> {
    const entries = Object.entries(this.config.servers).filter(
      ([, cfg]) => cfg.enabled !== false,
    );

    await Promise.allSettled(
      entries.map(([name]) => this.connect(name)),
    );
  }

  async connect(serverName: string): Promise<void> {
    const serverConfig = this.config.servers[serverName];
    if (!serverConfig) {
      throw new Error(`MCP server "${serverName}" not found in config`);
    }

    // Disconnect existing connection if any
    if (this.connections.has(serverName)) {
      await this.disconnect(serverName);
    }

    const transport = this.createTransport(serverConfig);
    const connection = new McpConnection(serverName, transport);

    try {
      await connection.connect();
    } catch (err) {
      // Log and skip — don't break other connections
      // In production this would use @auxiora/logger
      return;
    }

    this.connections.set(serverName, connection);

    // Register tools
    const toolNames: string[] = [];
    for (const mcpTool of connection.tools) {
      const tool = adaptMcpTool(
        serverName,
        mcpTool,
        (name, args) => connection.callTool(name, args),
      );
      this.toolRegistry.register(tool);
      toolNames.push(tool.name);
    }
    this.registeredTools.set(serverName, toolNames);
  }

  async disconnect(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    if (!connection) return;

    // Unregister tools
    const toolNames = this.registeredTools.get(serverName) ?? [];
    for (const name of toolNames) {
      this.toolRegistry.unregister(name);
    }
    this.registeredTools.delete(serverName);

    await connection.disconnect();
    this.connections.delete(serverName);
  }

  async disconnectAll(): Promise<void> {
    const names = [...this.connections.keys()];
    await Promise.allSettled(names.map((name) => this.disconnect(name)));
  }

  getStatus(): Map<string, { state: string; toolCount: number }> {
    const status = new Map<string, { state: string; toolCount: number }>();
    for (const [name, connection] of this.connections) {
      status.set(name, {
        state: connection.state,
        toolCount: this.registeredTools.get(name)?.length ?? 0,
      });
    }
    return status;
  }

  getToolsForServer(serverName: string): string[] {
    return this.registeredTools.get(serverName) ?? [];
  }

  private createTransport(config: McpServerConfig): McpTransport {
    switch (config.transport) {
      case 'stdio':
        return new StdioTransport({
          command: config.command!,
          args: config.args,
          env: config.env,
          cwd: config.cwd,
        });
      case 'sse':
        return new SseTransport({
          url: config.url!,
          headers: config.headers,
        });
      case 'streamable-http':
        return new StreamableHttpTransport({
          url: config.url!,
          headers: config.headers,
        });
      default:
        throw new Error(`Unknown transport: ${config.transport}`);
    }
  }
}
```

**Step 4: Add export to barrel**

Add to `packages/mcp/src/index.ts`:

```typescript
export { McpClientManager } from './mcp-client-manager.js';
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run packages/mcp/tests/mcp-client-manager.test.ts`
Expected: PASS (6 tests)

**Step 6: Commit**

```bash
git add packages/mcp/src/mcp-client-manager.ts packages/mcp/tests/mcp-client-manager.test.ts packages/mcp/src/index.ts
git commit -m "feat(mcp): add McpClientManager orchestrator"
```

---

### Task 8: Config schema integration

**Files:**
- Modify: `packages/config/src/index.ts` — add `mcp` field to ConfigSchema
- Modify: `packages/mcp/package.json` — add zod dependency

**Step 1: Add zod dependency to mcp package**

The `McpServerConfigSchema` and `McpClientConfigSchema` use zod. Add it:

Edit `packages/mcp/package.json` dependencies:

```json
"dependencies": {
  "@auxiora/tools": "workspace:*",
  "@auxiora/logger": "workspace:*",
  "zod": "^3.24.0"
}
```

Run: `pnpm install`

**Step 2: Add MCP config to the main config schema**

Edit `packages/config/src/index.ts`. Add after the existing schema definitions (before `export const ConfigSchema`):

```typescript
const McpServerConfigSchema = z.object({
  transport: z.enum(['stdio', 'sse', 'streamable-http']),
  enabled: z.boolean().default(true),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().positive().default(30_000),
  retryAttempts: z.number().int().min(0).default(3),
  retryDelayMs: z.number().int().positive().default(1_000),
});

const McpConfigSchema = z.object({
  servers: z.record(z.string(), McpServerConfigSchema).default({}),
});
```

Then add `mcp: McpConfigSchema.default({})` to the `ConfigSchema` object.

**Step 3: Run typecheck**

Run: `npx tsc --noEmit -p packages/config/tsconfig.json`
Expected: no errors

**Step 4: Run existing config tests**

Run: `npx vitest run packages/config/`
Expected: all existing tests pass

**Step 5: Commit**

```bash
git add packages/config/src/index.ts packages/mcp/package.json pnpm-lock.yaml
git commit -m "feat(config): add MCP server configuration schema"
```

---

### Task 9: Runtime wiring

**Files:**
- Modify: `packages/runtime/package.json` — add `@auxiora/mcp` dependency
- Modify: `packages/runtime/src/index.ts` — import McpClientManager, initialize, shutdown

**Step 1: Add dependency**

Add `"@auxiora/mcp": "workspace:*"` to `packages/runtime/package.json` dependencies.

Run: `pnpm install`

**Step 2: Add import and property**

At the top of `packages/runtime/src/index.ts`, add:

```typescript
import { McpClientManager } from '@auxiora/mcp';
```

Add property alongside the other private properties (near `private consciousness?`):

```typescript
private mcpClientManager?: McpClientManager;
```

**Step 3: Initialize McpClientManager in `initialize()`**

After `initializeToolExecutor(...)` and tool registration (around where toolRegistry is set up), add:

```typescript
// Initialize MCP client connections
if (this.config.mcp && Object.keys(this.config.mcp.servers).length > 0) {
  try {
    this.mcpClientManager = new McpClientManager(toolRegistry, this.config.mcp);
    await this.mcpClientManager.connectAll();
    const status = this.mcpClientManager.getStatus();
    this.logger.info('MCP client initialized', {
      servers: status.size,
      tools: [...status.values()].reduce((sum, s) => sum + s.toolCount, 0),
    });
  } catch (err) {
    this.logger.warn('Failed to initialize MCP client', {
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }
}
```

**Step 4: Add MCP API routes**

Near the existing API route handlers, add:

```typescript
app.get('/api/v1/mcp/servers', (_req, res) => {
  if (!this.mcpClientManager) {
    res.json({ servers: {} });
    return;
  }
  const status = this.mcpClientManager.getStatus();
  const result: Record<string, { state: string; toolCount: number }> = {};
  for (const [name, info] of status) {
    result[name] = info;
  }
  res.json({ servers: result });
});

app.post('/api/v1/mcp/servers/:name/connect', async (req, res) => {
  if (!this.mcpClientManager) {
    res.status(503).json({ error: 'MCP not configured' });
    return;
  }
  try {
    await this.mcpClientManager.connect(req.params.name);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/v1/mcp/servers/:name/disconnect', async (req, res) => {
  if (!this.mcpClientManager) {
    res.status(503).json({ error: 'MCP not configured' });
    return;
  }
  try {
    await this.mcpClientManager.disconnect(req.params.name);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/v1/mcp/servers/:name/tools', (req, res) => {
  if (!this.mcpClientManager) {
    res.status(503).json({ error: 'MCP not configured' });
    return;
  }
  const tools = this.mcpClientManager.getToolsForServer(req.params.name);
  res.json({ tools });
});
```

**Step 5: Add shutdown**

Before `this.sessions.destroy()` (near the existing `this.consciousness?.shutdown()`), add:

```typescript
await this.mcpClientManager?.disconnectAll();
```

**Step 6: Typecheck**

Run: `npx tsc --noEmit -p packages/runtime/tsconfig.json`
Expected: no errors

**Step 7: Run runtime tests**

Run: `npx vitest run packages/runtime/`
Expected: all existing tests pass (MCP code is guarded by config check)

**Step 8: Commit**

```bash
git add packages/runtime/package.json packages/runtime/src/index.ts pnpm-lock.yaml
git commit -m "feat(runtime): wire MCP client manager with API routes"
```

---

### Task 10: Full test suite verification

**Step 1: Run all MCP tests**

Run: `npx vitest run packages/mcp/`
Expected: All tests pass (config-types, stdio-transport, sse-transport, streamable-http-transport, tool-adapter, mcp-connection, mcp-client-manager)

**Step 2: Run full project typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new MCP tests)

**Step 4: Commit if any fixes needed**

If any fixes are needed, commit them:

```bash
git commit -m "fix(mcp): address test/type issues from integration"
```
