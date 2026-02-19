import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpConnection } from '../src/mcp-connection.js';
import type { McpTransport } from '../src/transports/transport.js';
import type { JsonRpcMessage, JsonRpcRequest } from '../src/config-types.js';

function createMockTransport(): McpTransport & {
  simulateMessage: (msg: JsonRpcMessage) => void;
  simulateError: (err: Error) => void;
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
    simulateError: (err) => {
      for (const handler of errorHandlers) handler(err);
    },
    sentMessages,
  };
}

function autoRespondTransport(transport: ReturnType<typeof createMockTransport>): void {
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
    } else if (req.method === 'tools/call') {
      transport.simulateMessage({
        jsonrpc: '2.0',
        id: req.id!,
        result: {
          content: [{ type: 'text', text: 'hello world' }],
        },
      });
    }
  });
}

describe('McpConnection', () => {
  let transport: ReturnType<typeof createMockTransport>;
  let connection: McpConnection;

  beforeEach(() => {
    transport = createMockTransport();
    connection = new McpConnection('test-server', transport);
  });

  it('starts in disconnected state', () => {
    expect(connection.state).toBe('disconnected');
    expect(connection.tools).toEqual([]);
  });

  it('performs initialize handshake on connect', async () => {
    autoRespondTransport(transport);

    await connection.connect();

    expect(connection.state).toBe('ready');
    expect(transport.open).toHaveBeenCalled();

    const methods = transport.sentMessages.map((m) => (m as JsonRpcRequest).method);
    expect(methods).toContain('initialize');
    expect(methods).toContain('notifications/initialized');
    expect(methods).toContain('tools/list');
  });

  it('sends correct initialize params', async () => {
    autoRespondTransport(transport);

    await connection.connect();

    const initMsg = transport.sentMessages.find(
      (m) => (m as JsonRpcRequest).method === 'initialize',
    ) as JsonRpcRequest;
    expect(initMsg.params).toEqual({
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      clientInfo: { name: 'auxiora', version: '1.4.0' },
    });
  });

  it('discovers tools on connect', async () => {
    transport.send = vi.fn().mockImplementation(async (msg: JsonRpcMessage) => {
      transport.sentMessages.push(msg);
      const req = msg as JsonRpcRequest;
      if (req.method === 'initialize') {
        transport.simulateMessage({
          jsonrpc: '2.0',
          id: req.id!,
          result: {
            protocolVersion: '2025-03-26',
            capabilities: { tools: {} },
            serverInfo: { name: 'mock' },
          },
        });
      } else if (req.method === 'tools/list') {
        transport.simulateMessage({
          jsonrpc: '2.0',
          id: req.id!,
          result: {
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
    autoRespondTransport(transport);

    await connection.connect();
    const result = await connection.callTool('greet', { name: 'test' });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe('hello world');

    const callMsg = transport.sentMessages.find(
      (m) => (m as JsonRpcRequest).method === 'tools/call',
    ) as JsonRpcRequest;
    expect(callMsg.params).toEqual({ name: 'greet', arguments: { name: 'test' } });
  });

  it('refreshTools updates tool list', async () => {
    autoRespondTransport(transport);
    await connection.connect();

    expect(connection.tools).toHaveLength(1);

    // Override to return different tools on next list call
    transport.send = vi.fn().mockImplementation(async (msg: JsonRpcMessage) => {
      transport.sentMessages.push(msg);
      const req = msg as JsonRpcRequest;
      if (req.method === 'tools/list') {
        transport.simulateMessage({
          jsonrpc: '2.0',
          id: req.id!,
          result: {
            tools: [
              { name: 'new_tool', inputSchema: { type: 'object' } },
            ],
          },
        });
      }
    });

    const refreshed = await connection.refreshTools();
    expect(refreshed).toHaveLength(1);
    expect(refreshed[0].name).toBe('new_tool');
    expect(connection.tools).toHaveLength(1);
    expect(connection.tools[0].name).toBe('new_tool');
  });

  it('disconnect closes transport and resets state', async () => {
    autoRespondTransport(transport);

    await connection.connect();
    await connection.disconnect();

    expect(connection.state).toBe('disconnected');
    expect(connection.tools).toEqual([]);
    expect(transport.close).toHaveBeenCalled();
  });

  it('rejects pending requests on transport error', async () => {
    autoRespondTransport(transport);
    await connection.connect();

    // Set up a request that won't auto-respond
    transport.send = vi.fn().mockImplementation(async (msg: JsonRpcMessage) => {
      transport.sentMessages.push(msg);
      // Don't respond - leave it pending
    });

    const callPromise = connection.callTool('slow_tool', {});
    transport.simulateError(new Error('connection lost'));

    await expect(callPromise).rejects.toThrow('connection lost');
    expect(connection.state).toBe('error');
  });

  it('rejects on MCP error response', async () => {
    autoRespondTransport(transport);
    await connection.connect();

    transport.send = vi.fn().mockImplementation(async (msg: JsonRpcMessage) => {
      transport.sentMessages.push(msg);
      const req = msg as JsonRpcRequest;
      transport.simulateMessage({
        jsonrpc: '2.0',
        id: req.id!,
        error: { code: -32601, message: 'Method not found' },
      });
    });

    await expect(connection.callTool('missing', {})).rejects.toThrow(
      'MCP error -32601: Method not found',
    );
  });

  it('exposes name property', () => {
    expect(connection.name).toBe('test-server');
  });
});
