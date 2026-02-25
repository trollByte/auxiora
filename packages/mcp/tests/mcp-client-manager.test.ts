import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpClientManager } from '../src/mcp-client-manager.js';
import { ToolRegistry } from '@auxiora/tools';
import type { McpClientConfig } from '../src/config-types.js';

// Mock transports so createTransport doesn't fail
vi.mock('../src/transports/stdio-transport.js', () => ({
  StdioTransport: vi.fn().mockImplementation(function () {
    return { type: 'stdio' };
  }),
}));
vi.mock('../src/transports/sse-transport.js', () => ({
  SseTransport: vi.fn().mockImplementation(function () {
    return { type: 'sse' };
  }),
}));
vi.mock('../src/transports/streamable-http-transport.js', () => ({
  StreamableHttpTransport: vi.fn().mockImplementation(function () {
    return { type: 'streamable-http' };
  }),
}));

vi.mock('../src/mcp-connection.js', () => {
  return {
    McpConnection: vi.fn().mockImplementation(function (this: any, name: string) {
      this.name = name;
      this.state = 'disconnected';
      this.tools = [
        {
          name: `tool_from_${name}`,
          description: `Tool from ${name}`,
          inputSchema: { type: 'object', properties: {} },
        },
      ];
      this.connect = vi.fn(async () => {
        this.state = 'ready';
      });
      this.disconnect = vi.fn(async () => {
        this.state = 'disconnected';
      });
      this.callTool = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'result' }],
      });
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

  it('getToolsForServer returns tool names', async () => {
    const manager = new McpClientManager(registry, config);
    await manager.connect('alpha');

    expect(manager.getToolsForServer('alpha')).toEqual(['mcp.alpha.tool_from_alpha']);
    expect(manager.getToolsForServer('nonexistent')).toEqual([]);
  });
});
