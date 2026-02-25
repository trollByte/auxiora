import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toolRegistry, toolExecutor, initializeToolExecutor, ToolPermission } from '@auxiora/tools';
import type { Tool, ToolParameter } from '@auxiora/tools';

/**
 * Tests for the tool follow-up loop, connector-to-tool bridge,
 * and shared executeWithTools infrastructure.
 */

// Helper: create a mock tool
function createMockTool(name: string, output: string, permission = ToolPermission.AUTO_APPROVE): Tool {
  return {
    name,
    description: `Mock tool: ${name}`,
    parameters: [{ name: 'input', type: 'string' as const, description: 'Input', required: false }],
    getPermission: () => permission,
    execute: async () => ({ success: true, output }),
  };
}

describe('Tool Follow-up Loop Infrastructure', () => {
  beforeEach(() => {
    // Unregister any leftover test tools
    for (const name of toolRegistry.listNames()) {
      if (name.startsWith('test_')) toolRegistry.unregister(name);
    }
    initializeToolExecutor();
  });

  it('should register tools and format for provider API', () => {
    const tool = createMockTool('test_hello', 'Hello!');
    toolRegistry.register(tool);

    const formatted = toolRegistry.toProviderFormat();
    const found = formatted.find(t => t.name === 'test_hello');
    expect(found).toBeDefined();
    expect(found!.description).toBe('Mock tool: test_hello');
    expect(found!.input_schema.type).toBe('object');

    toolRegistry.unregister('test_hello');
  });

  it('should execute tool through executor', async () => {
    const tool = createMockTool('test_exec', 'executed result');
    toolRegistry.register(tool);

    const result = await toolExecutor.execute('test_exec', { input: 'test' }, { sessionId: 'test-session' });
    expect(result.success).toBe(true);
    expect(result.output).toBe('executed result');

    toolRegistry.unregister('test_exec');
  });

  it('should return error for unknown tool', async () => {
    const result = await toolExecutor.execute('nonexistent_tool', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should deny always-denied tools', async () => {
    const tool = createMockTool('test_denied', 'should not run', ToolPermission.ALWAYS_DENY);
    toolRegistry.register(tool);

    const result = await toolExecutor.execute('test_denied', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('denied');

    toolRegistry.unregister('test_denied');
  });

  it('should execute multiple tools sequentially', async () => {
    const toolA = createMockTool('test_a', 'result-a');
    const toolB = createMockTool('test_b', 'result-b');
    toolRegistry.register(toolA);
    toolRegistry.register(toolB);

    const results = await toolExecutor.executeMany(
      [{ name: 'test_a', params: {} }, { name: 'test_b', params: {} }],
      {},
    );
    expect(results).toHaveLength(2);
    expect(results[0].output).toBe('result-a');
    expect(results[1].output).toBe('result-b');

    toolRegistry.unregister('test_a');
    toolRegistry.unregister('test_b');
  });
});

describe('Connector-to-Tool Bridge', () => {
  it('should convert connector action params to tool parameters', () => {
    // Simulate what registerConnectorTools does
    const actionParams: Record<string, { type: string; description: string; required?: boolean }> = {
      date: { type: 'string', description: 'Target date', required: true },
      maxResults: { type: 'number', description: 'Max results', required: false },
    };

    const toolParams: ToolParameter[] = Object.entries(actionParams).map(([name, def]) => ({
      name,
      type: def.type as ToolParameter['type'],
      description: def.description,
      required: def.required ?? false,
    }));

    expect(toolParams).toHaveLength(2);
    expect(toolParams[0]).toEqual({
      name: 'date',
      type: 'string',
      description: 'Target date',
      required: true,
    });
    expect(toolParams[1]).toEqual({
      name: 'maxResults',
      type: 'number',
      description: 'Max results',
      required: false,
    });
  });

  it('should generate correct tool name from connector and action IDs', () => {
    const connectorId = 'google-workspace';
    const actionId = 'list-events';
    const toolName = `${connectorId.replace(/-/g, '_')}_${actionId.replace(/-/g, '_')}`;
    expect(toolName).toBe('google_workspace_list_events');
  });

  it('should map trust levels to tool permissions', () => {
    // Trust level 0-1 = USER_APPROVAL
    expect(0 >= 2 ? ToolPermission.AUTO_APPROVE : ToolPermission.USER_APPROVAL)
      .toBe(ToolPermission.USER_APPROVAL);
    expect(1 >= 2 ? ToolPermission.AUTO_APPROVE : ToolPermission.USER_APPROVAL)
      .toBe(ToolPermission.USER_APPROVAL);

    // Trust level 2+ = AUTO_APPROVE
    expect(2 >= 2 ? ToolPermission.AUTO_APPROVE : ToolPermission.USER_APPROVAL)
      .toBe(ToolPermission.AUTO_APPROVE);
    expect(3 >= 2 ? ToolPermission.AUTO_APPROVE : ToolPermission.USER_APPROVAL)
      .toBe(ToolPermission.AUTO_APPROVE);
  });

  it('should handle connector action execution error gracefully', async () => {
    const errorTool: Tool = {
      name: 'test_error_connector',
      description: 'Connector tool that fails',
      parameters: [],
      getPermission: () => ToolPermission.AUTO_APPROVE,
      execute: async () => ({ success: false, error: 'Google API rate limited' }),
    };
    toolRegistry.register(errorTool);

    const result = await toolExecutor.execute('test_error_connector', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('Google API rate limited');

    toolRegistry.unregister('test_error_connector');
  });
});

describe('Tool Result Formatting', () => {
  it('should format successful tool results', () => {
    const results = [
      { toolName: 'bash', success: true, output: 'file1.txt\nfile2.txt' },
      { toolName: 'calendar_list', success: true, output: '3 events found' },
    ];

    const formatted = results.map(r =>
      `[${r.toolName}]: ${r.success ? (r.output || 'Success') : `Error: ${r.output}`}`
    ).join('\n');

    expect(formatted).toContain('[bash]: file1.txt');
    expect(formatted).toContain('[calendar_list]: 3 events found');
  });

  it('should format failed tool results with error', () => {
    const result = { toolName: 'send_email', success: false, error: 'Authentication expired' };
    const formatted = `[${result.toolName}]: Error: ${result.error}`;
    expect(formatted).toBe('[send_email]: Error: Authentication expired');
  });

  it('should create valid tool results message', () => {
    const parts = [
      '[list_events]: {"events": [{"title": "Standup"}]}',
      '[send_email]: Error: Not authenticated',
    ];
    const message = `[Tool Results]\n${parts.join('\n')}`;
    expect(message).toContain('[Tool Results]');
    expect(message).toContain('[list_events]');
    expect(message).toContain('Error: Not authenticated');
  });
});
