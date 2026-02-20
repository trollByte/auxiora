import { describe, it, expect, vi } from 'vitest';
import { McpClientManager } from '@auxiora/mcp';

describe('MCP runtime integration', () => {
  it('McpClientManager is importable', () => {
    expect(McpClientManager).toBeDefined();
    expect(typeof McpClientManager).toBe('function');
  });

  it('getStatus returns Map', () => {
    const mockRegistry = {
      register: vi.fn(),
      unregister: vi.fn(),
    };
    const manager = new McpClientManager(mockRegistry as any, { servers: {} });
    const status = manager.getStatus();
    expect(status).toBeInstanceOf(Map);
    expect(status.size).toBe(0);
  });

  it('getToolsForServer returns empty for unknown server', () => {
    const mockRegistry = { register: vi.fn(), unregister: vi.fn() };
    const manager = new McpClientManager(mockRegistry as any, { servers: {} });
    expect(manager.getToolsForServer('unknown')).toEqual([]);
  });
});
