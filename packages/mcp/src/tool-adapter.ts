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

    getPermission(
      _params: Record<string, unknown>,
      _context: ExecutionContext,
    ): ToolPermission {
      return ToolPermission.USER_APPROVAL;
    },
  };
}
