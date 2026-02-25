import { describe, it, expect } from 'vitest';
import { jsonSchemaToToolParameters, adaptMcpTool } from '../src/tool-adapter.js';
import { ToolPermission } from '@auxiora/tools';
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
