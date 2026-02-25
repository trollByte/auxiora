/**
 * Integration tests for tool system
 *
 * Tests the full tool execution flow:
 * - Tool registration
 * - Permission checking
 * - Tool execution with various contexts
 * - Error handling
 * - Approval workflow
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ToolRegistry,
  ToolExecutor,
  ToolPermission,
  type Tool,
  type ToolParameter,
  type ExecutionContext,
  type ToolResult,
  type ApprovalCallback,
} from '../src/index.js';

describe('Tool System Integration', () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('Tool Registration and Discovery', () => {
    it('should register and list tools', () => {
      const testTool: Tool = {
        name: 'test_tool',
        description: 'A test tool',
        parameters: [
          { name: 'input', type: 'string', description: 'Test input', required: true },
        ],
        execute: async () => ({ success: true, output: 'test' }),
        getPermission: () => ToolPermission.AUTO_APPROVE,
      };

      registry.register(testTool);

      expect(registry.listNames()).toContain('test_tool');
      expect(registry.get('test_tool')).toBe(testTool);
    });

    it('should convert tools to provider format', () => {
      const testTool: Tool = {
        name: 'calculate',
        description: 'Perform calculation',
        parameters: [
          { name: 'expression', type: 'string', description: 'Math expression', required: true },
          { name: 'precision', type: 'number', description: 'Decimal places', required: false, default: 2 },
        ],
        execute: async () => ({ success: true }),
        getPermission: () => ToolPermission.AUTO_APPROVE,
      };

      registry.register(testTool);

      const providerFormat = registry.toProviderFormat();
      expect(providerFormat).toHaveLength(1);
      expect(providerFormat[0]).toEqual({
        name: 'calculate',
        description: 'Perform calculation',
        input_schema: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: 'Math expression',
            },
            precision: {
              type: 'number',
              description: 'Decimal places',
              default: 2,
            },
          },
          required: ['expression'],
        },
      });
    });

    it('should allow tool unregistration', () => {
      const testTool: Tool = {
        name: 'temp_tool',
        description: 'Temporary tool',
        parameters: [],
        execute: async () => ({ success: true }),
        getPermission: () => ToolPermission.AUTO_APPROVE,
      };

      registry.register(testTool);
      expect(registry.listNames()).toContain('temp_tool');

      registry.unregister('temp_tool');
      expect(registry.listNames()).not.toContain('temp_tool');
    });
  });

  describe('Tool Execution', () => {
    it('should execute auto-approved tools', async () => {
      const mockExecute = vi.fn(async (params: any) => ({
        success: true,
        output: `Executed with ${params.value}`,
      }));

      const tool: Tool = {
        name: 'safe_tool',
        description: 'Safe tool',
        parameters: [{ name: 'value', type: 'string', description: 'Value', required: true }],
        execute: mockExecute,
        getPermission: () => ToolPermission.AUTO_APPROVE,
      };

      registry.register(tool);
      executor = new ToolExecutor(registry);

      const result = await executor.execute('safe_tool', { value: 'test' }, {});

      expect(result.success).toBe(true);
      expect(result.output).toBe('Executed with test');
      expect(mockExecute).toHaveBeenCalledWith({ value: 'test' }, {});
    });

    it('should execute tools requiring approval when approved', async () => {
      const tool: Tool = {
        name: 'dangerous_tool',
        description: 'Requires approval',
        parameters: [],
        execute: async () => ({ success: true, output: 'Executed' }),
        getPermission: () => ToolPermission.USER_APPROVAL,
      };

      registry.register(tool);

      const approvalCallback: ApprovalCallback = vi.fn(async () => true);
      executor = new ToolExecutor(registry, approvalCallback);

      const result = await executor.execute('dangerous_tool', {}, {});

      expect(result.success).toBe(true);
      expect(approvalCallback).toHaveBeenCalledWith('dangerous_tool', {}, {});
    });

    it('should reject tools when user denies approval', async () => {
      const tool: Tool = {
        name: 'write_file',
        description: 'Write to file',
        parameters: [],
        execute: async () => ({ success: true, output: 'Written' }),
        getPermission: () => ToolPermission.USER_APPROVAL,
      };

      registry.register(tool);

      const approvalCallback: ApprovalCallback = vi.fn(async () => false);
      executor = new ToolExecutor(registry, approvalCallback);

      const result = await executor.execute('write_file', {}, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution rejected by user');
      expect(result.metadata?.permission).toBe('user_rejected');
    });

    it('should always deny tools with ALWAYS_DENY permission', async () => {
      const tool: Tool = {
        name: 'forbidden_tool',
        description: 'Always denied',
        parameters: [],
        execute: async () => ({ success: true }),
        getPermission: () => ToolPermission.ALWAYS_DENY,
      };

      registry.register(tool);
      executor = new ToolExecutor(registry);

      const result = await executor.execute('forbidden_tool', {}, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('denied for security reasons');
    });

    it('should handle tool execution errors gracefully', async () => {
      const tool: Tool = {
        name: 'error_tool',
        description: 'Throws error',
        parameters: [],
        execute: async () => {
          throw new Error('Tool execution failed');
        },
        getPermission: () => ToolPermission.AUTO_APPROVE,
      };

      registry.register(tool);
      executor = new ToolExecutor(registry);

      const result = await executor.execute('error_tool', {}, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool execution failed');
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should validate tool parameters', async () => {
      const tool: Tool = {
        name: 'validated_tool',
        description: 'Has validation',
        parameters: [{ name: 'email', type: 'string', description: 'Email', required: true }],
        execute: async () => ({ success: true }),
        getPermission: () => ToolPermission.AUTO_APPROVE,
        validateParams: (params: any) => {
          if (!params.email || !params.email.includes('@')) {
            return 'email must be a valid email address';
          }
          return null;
        },
      };

      registry.register(tool);
      executor = new ToolExecutor(registry);

      const invalidResult = await executor.execute('validated_tool', { email: 'invalid' }, {});
      expect(invalidResult.success).toBe(false);
      expect(invalidResult.error).toContain('Invalid parameters');

      const validResult = await executor.execute('validated_tool', { email: 'test@example.com' }, {});
      expect(validResult.success).toBe(true);
    });

    it('should return error for non-existent tool', async () => {
      executor = new ToolExecutor(registry);

      const result = await executor.execute('nonexistent', {}, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool not found');
    });

    it('should include execution duration in result', async () => {
      const tool: Tool = {
        name: 'slow_tool',
        description: 'Takes time',
        parameters: [],
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { success: true };
        },
        getPermission: () => ToolPermission.AUTO_APPROVE,
      };

      registry.register(tool);
      executor = new ToolExecutor(registry);

      const result = await executor.execute('slow_tool', {}, {});

      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThan(40); // Should take at least 50ms
    });
  });

  describe('Multiple Tool Execution', () => {
    it('should execute multiple tools in sequence', async () => {
      const tool1: Tool = {
        name: 'tool1',
        description: 'First tool',
        parameters: [],
        execute: async () => ({ success: true, output: 'result1' }),
        getPermission: () => ToolPermission.AUTO_APPROVE,
      };

      const tool2: Tool = {
        name: 'tool2',
        description: 'Second tool',
        parameters: [],
        execute: async () => ({ success: true, output: 'result2' }),
        getPermission: () => ToolPermission.AUTO_APPROVE,
      };

      registry.register(tool1);
      registry.register(tool2);
      executor = new ToolExecutor(registry);

      const results = await executor.executeMany(
        [
          { name: 'tool1', params: {} },
          { name: 'tool2', params: {} },
        ],
        {}
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].output).toBe('result1');
      expect(results[1].success).toBe(true);
      expect(results[1].output).toBe('result2');
    });

    it('should stop on first failure when STOP_ON_ERROR is set', async () => {
      const tool1: Tool = {
        name: 'failing_tool',
        description: 'Fails',
        parameters: [],
        execute: async () => ({ success: false, error: 'Failed' }),
        getPermission: () => ToolPermission.AUTO_APPROVE,
      };

      const tool2 = vi.fn(async () => ({ success: true, output: 'Should not run' }));

      const tool2Def: Tool = {
        name: 'tool2',
        description: 'Should not execute',
        parameters: [],
        execute: tool2,
        getPermission: () => ToolPermission.AUTO_APPROVE,
      };

      registry.register(tool1);
      registry.register(tool2Def);
      executor = new ToolExecutor(registry);

      const results = await executor.executeMany(
        [
          { name: 'failing_tool', params: {} },
          { name: 'tool2', params: {} },
        ],
        { environment: { STOP_ON_ERROR: 'true' } }
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(tool2).not.toHaveBeenCalled();
    });

    it('should continue on failure when STOP_ON_ERROR is not set', async () => {
      const tool1: Tool = {
        name: 'failing_tool',
        description: 'Fails',
        parameters: [],
        execute: async () => ({ success: false, error: 'Failed' }),
        getPermission: () => ToolPermission.AUTO_APPROVE,
      };

      const tool2: Tool = {
        name: 'tool2',
        description: 'Continues',
        parameters: [],
        execute: async () => ({ success: true, output: 'Executed' }),
        getPermission: () => ToolPermission.AUTO_APPROVE,
      };

      registry.register(tool1);
      registry.register(tool2);
      executor = new ToolExecutor(registry);

      const results = await executor.executeMany(
        [
          { name: 'failing_tool', params: {} },
          { name: 'tool2', params: {} },
        ],
        {}
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
    });
  });

  describe('Execution Context', () => {
    it('should pass context to tool execution', async () => {
      const mockExecute = vi.fn(async (params: any, context: ExecutionContext) => ({
        success: true,
        output: `User: ${context.userId}, Session: ${context.sessionId}`,
      }));

      const tool: Tool = {
        name: 'context_tool',
        description: 'Uses context',
        parameters: [],
        execute: mockExecute,
        getPermission: () => ToolPermission.AUTO_APPROVE,
      };

      registry.register(tool);
      executor = new ToolExecutor(registry);

      const context: ExecutionContext = {
        userId: 'user123',
        sessionId: 'session456',
        workingDirectory: '/tmp',
        timeout: 5000,
        environment: { TEST: 'value' },
      };

      const result = await executor.execute('context_tool', {}, context);

      expect(result.success).toBe(true);
      expect(result.output).toBe('User: user123, Session: session456');
      expect(mockExecute).toHaveBeenCalledWith({}, context);
    });

    it('should pass context to permission check', async () => {
      const mockGetPermission = vi.fn(() => ToolPermission.AUTO_APPROVE);

      const tool: Tool = {
        name: 'permission_context_tool',
        description: 'Permission uses context',
        parameters: [],
        execute: async () => ({ success: true }),
        getPermission: mockGetPermission,
      };

      registry.register(tool);
      executor = new ToolExecutor(registry);

      const context: ExecutionContext = {
        userId: 'admin',
        sessionId: 'session789',
      };

      await executor.execute('permission_context_tool', { action: 'delete' }, context);

      expect(mockGetPermission).toHaveBeenCalledWith({ action: 'delete' }, context);
    });

    it('should pass context to approval callback', async () => {
      const tool: Tool = {
        name: 'approval_context_tool',
        description: 'Approval uses context',
        parameters: [],
        execute: async () => ({ success: true }),
        getPermission: () => ToolPermission.USER_APPROVAL,
      };

      registry.register(tool);

      const mockApprovalCallback = vi.fn(async () => true);
      executor = new ToolExecutor(registry, mockApprovalCallback);

      const context: ExecutionContext = {
        userId: 'user123',
        sessionId: 'session456',
      };

      await executor.execute('approval_context_tool', { param: 'value' }, context);

      expect(mockApprovalCallback).toHaveBeenCalledWith(
        'approval_context_tool',
        { param: 'value' },
        context
      );
    });
  });

  describe('Error Cases', () => {
    it('should handle tools requiring approval without callback', async () => {
      const tool: Tool = {
        name: 'needs_approval',
        description: 'Needs approval',
        parameters: [],
        execute: async () => ({ success: true }),
        getPermission: () => ToolPermission.USER_APPROVAL,
      };

      registry.register(tool);
      executor = new ToolExecutor(registry); // No approval callback

      const result = await executor.execute('needs_approval', {}, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('no approval callback set');
    });

    it('should handle empty tool registry', () => {
      executor = new ToolExecutor(registry);

      expect(registry.list()).toHaveLength(0);
      expect(registry.toProviderFormat()).toHaveLength(0);
    });
  });
});
