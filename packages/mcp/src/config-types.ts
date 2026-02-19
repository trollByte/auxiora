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
