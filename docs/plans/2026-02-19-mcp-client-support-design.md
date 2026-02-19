# MCP Client Support Design

**Date:** 2026-02-19
**Status:** Approved
**Goal:** Allow Auxiora to connect TO external MCP servers and use their tools as native Auxiora tools.

## Context

Auxiora currently has zero MCP (Model Context Protocol) integration. MCP is the emerging universal standard for AI agent-to-tool connections. Adding MCP client support lets users connect any MCP-compatible server (filesystem, web search, databases, custom tools) and have those tools available in conversations alongside native Auxiora tools.

**Direction:** MCP Client (Auxiora connects to external MCP servers, not the other way around).
**Approach:** Direct Tool Registry Integration (Approach A) — MCP tools register directly into `toolRegistry` with namespace prefixing.

## Package Structure

New package: `packages/mcp/`

```
packages/mcp/
  src/
    index.ts                  # barrel exports
    mcp-client-manager.ts     # orchestrator — manages all MCP server connections
    mcp-connection.ts         # single server connection (wraps transport + protocol)
    tool-adapter.ts           # converts MCP tool definitions → Auxiora Tool objects
    config-types.ts           # McpServerConfig, McpClientConfig types
    transports/
      stdio-transport.ts      # child_process spawn for local servers
      sse-transport.ts        # EventSource-based for remote SSE servers
      streamable-http-transport.ts  # fetch-based for Streamable HTTP servers
```

**Dependencies:** `@auxiora/tools`, `@auxiora/config`, `@auxiora/logger`. No external MCP SDK — JSON-RPC 2.0 protocol implemented directly.

## Configuration

MCP servers configured in `auxiora.yaml` under `mcp.servers`:

```yaml
mcp:
  servers:
    filesystem:
      transport: stdio
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/docs"]
      env:
        NODE_ENV: production
      enabled: true

    web-search:
      transport: sse
      url: https://mcp.example.com/search/sse
      headers:
        Authorization: "Bearer ${SEARCH_API_KEY}"
      enabled: true

    remote-tools:
      transport: streamable-http
      url: https://mcp.example.com/tools
      headers:
        Authorization: "Bearer ${REMOTE_KEY}"
      enabled: true
```

### Config Types

```typescript
interface McpServerConfig {
  transport: 'stdio' | 'sse' | 'streamable-http';
  enabled?: boolean;           // default true
  command?: string;            // stdio only
  args?: string[];             // stdio only
  env?: Record<string, string>; // stdio only
  cwd?: string;                // stdio only
  url?: string;                // sse / streamable-http
  headers?: Record<string, string>; // sse / streamable-http
  timeoutMs?: number;          // default 30_000
  retryAttempts?: number;      // default 3
  retryDelayMs?: number;       // default 1_000
}

interface McpClientConfig {
  servers: Record<string, McpServerConfig>;
}
```

### Dashboard API

- `GET /api/v1/mcp/servers` — list servers with connection status
- `POST /api/v1/mcp/servers/:name/connect` — connect/reconnect
- `POST /api/v1/mcp/servers/:name/disconnect` — disconnect
- `GET /api/v1/mcp/servers/:name/tools` — list tools from a server

## Connection Lifecycle

```
configure → spawn/connect → initialize handshake → discover tools → register tools → ready
                                                                                      ↓
                                                                                monitor health
                                                                                      ↓
                                                                           on error → retry (3x)
                                                                                      ↓
                                                                           on fatal → unregister tools, mark degraded
```

### Transport Interface

```typescript
interface McpTransport {
  open(): Promise<void>;
  close(): Promise<void>;
  send(message: JsonRpcMessage): Promise<void>;
  onMessage(handler: (message: JsonRpcMessage) => void): void;
  onError(handler: (error: Error) => void): void;
  onClose(handler: () => void): void;
}
```

### Transport Implementations

| Transport | Implementation | Connection |
|-----------|---------------|------------|
| stdio | `child_process.spawn()` with `safeExecFile` patterns. JSON-RPC over stdin/stdout. stderr → logger. | Kill child on disconnect. |
| SSE | POST for client→server, EventSource stream for server→client. | Close EventSource on disconnect. |
| Streamable HTTP | Single HTTP endpoint. POST JSON-RPC, receive JSON-RPC responses. Session-based with `Mcp-Session-Id`. | Stateless or session-based. |

### MCP Protocol Handshake

```
Client → Server: initialize { protocolVersion: "2025-03-26", capabilities: { tools: {} }, clientInfo: { name: "auxiora", version: "1.4.0" } }
Server → Client: { protocolVersion, capabilities, serverInfo }
Client → Server: notifications/initialized
Client → Server: tools/list
Server → Client: { tools: [...] }
```

### Reconnection

On transport error, retry up to `retryAttempts` with `retryDelayMs` delay. On final failure, unregister tools and log warning. Server stays in config for manual reconnect via dashboard.

## Tool Adaptation

MCP tool definitions converted to Auxiora `Tool` objects:

```typescript
function adaptMcpTool(serverName: string, mcpTool: McpToolDefinition, connection: McpConnection): Tool {
  return {
    name: `mcp.${serverName}.${mcpTool.name}`,
    description: `[MCP: ${serverName}] ${mcpTool.description}`,
    parameters: jsonSchemaToToolParameters(mcpTool.inputSchema),
    async execute(args) {
      const result = await connection.callTool(mcpTool.name, args);
      return result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
    },
    getPermission() { return 'mcp'; },
  };
}
```

**Namespace:** `mcp.<server>.<tool>` prevents collisions with native tools.

**JSON Schema conversion:** `jsonSchemaToToolParameters()` converts JSON Schema `properties` + `required` into Auxiora's `ToolParameter[]` format.

**Permissions:** All MCP tools get `'mcp'` permission level (requires user approval initially).

**Tool lifecycle:** Tools unregistered on disconnect, re-registered on reconnect. Supports `notifications/tools/list_changed` for dynamic updates.

## Runtime Wiring

In `packages/runtime/src/index.ts`:

```typescript
import { McpClientManager } from '@auxiora/mcp';

// Property
private mcpClientManager?: McpClientManager;

// initialize(): after toolRegistry setup
if (this.config.mcp?.servers) {
  this.mcpClientManager = new McpClientManager(this.toolRegistry, this.config.mcp, this.logger);
  await this.mcpClientManager.connectAll();
}

// shutdown():
await this.mcpClientManager?.disconnectAll();
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Server fails to start | Log error, skip, others still connect |
| Handshake timeout | Retry up to retryAttempts, then mark error |
| Transport drops mid-session | Auto-reconnect with backoff, unregister tools while down |
| tools/call timeout | Throw from execute(), provider handles gracefully |
| Config validation failure | Reject at startup with clear message |
| All MCP servers fail | Runtime continues — MCP is optional |

Health integration: `McpClientManager.getStatus()` feeds into health monitor. Degraded servers appear as anomalies in consciousness self-model.

## Testing Strategy

- **Unit:** ToolAdapter (JSON Schema → ToolParameter), config validation, JSON-RPC framing
- **Integration:** McpConnection with mock transport, McpClientManager with mock connections
- **Transport:** stdio with echo server script, SSE/HTTP with mock HTTP server
- Mock transport layer — no real MCP servers needed in CI
