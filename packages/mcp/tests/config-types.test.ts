import { describe, it, expect } from 'vitest';
import { McpServerConfigSchema, McpClientConfigSchema, type McpServerConfig, type McpClientConfig } from '../src/config-types.js';

describe('McpServerConfigSchema', () => {
  it('validates a stdio server config', () => {
    const config = {
      transport: 'stdio' as const,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    };
    const result = McpServerConfigSchema.parse(config);
    expect(result.transport).toBe('stdio');
    expect(result.command).toBe('npx');
    expect(result.enabled).toBe(true);
    expect(result.timeoutMs).toBe(30_000);
    expect(result.retryAttempts).toBe(3);
    expect(result.retryDelayMs).toBe(1_000);
  });

  it('validates an SSE server config', () => {
    const config = {
      transport: 'sse' as const,
      url: 'https://example.com/sse',
      headers: { Authorization: 'Bearer token' },
    };
    const result = McpServerConfigSchema.parse(config);
    expect(result.transport).toBe('sse');
    expect(result.url).toBe('https://example.com/sse');
    expect(result.headers).toEqual({ Authorization: 'Bearer token' });
  });

  it('validates a streamable-http server config', () => {
    const config = {
      transport: 'streamable-http' as const,
      url: 'https://example.com/mcp',
    };
    const result = McpServerConfigSchema.parse(config);
    expect(result.transport).toBe('streamable-http');
  });

  it('rejects invalid transport', () => {
    expect(() => McpServerConfigSchema.parse({ transport: 'websocket' })).toThrow();
  });

  it('applies defaults for optional fields', () => {
    const config = { transport: 'stdio' as const, command: 'echo' };
    const result = McpServerConfigSchema.parse(config);
    expect(result.enabled).toBe(true);
    expect(result.timeoutMs).toBe(30_000);
    expect(result.retryAttempts).toBe(3);
    expect(result.retryDelayMs).toBe(1_000);
  });
});

describe('McpClientConfigSchema', () => {
  it('validates a config with multiple servers', () => {
    const config = {
      servers: {
        fs: { transport: 'stdio' as const, command: 'npx', args: ['server-fs'] },
        search: { transport: 'sse' as const, url: 'https://example.com/sse' },
      },
    };
    const result = McpClientConfigSchema.parse(config);
    expect(Object.keys(result.servers)).toEqual(['fs', 'search']);
  });

  it('validates an empty servers config', () => {
    const result = McpClientConfigSchema.parse({ servers: {} });
    expect(result.servers).toEqual({});
  });
});
