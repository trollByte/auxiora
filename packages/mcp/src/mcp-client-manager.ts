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
