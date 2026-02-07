import { describe, it, expect } from 'vitest';
import { PluginSandbox } from '../src/sandbox.js';

describe('PluginSandbox', () => {
  it('should create a context and execute code', async () => {
    const sandbox = new PluginSandbox({ permissions: [] });
    sandbox.createContext();

    const result = await sandbox.execute<number>('2 + 2');

    expect(result).toBe(4);
    sandbox.destroy();
  });

  it('should allow JSON operations', async () => {
    const sandbox = new PluginSandbox({ permissions: [] });
    sandbox.createContext();

    const result = await sandbox.execute<string>('JSON.stringify({ a: 1 })');

    expect(result).toBe('{"a":1}');
    sandbox.destroy();
  });

  it('should block fetch without NETWORK permission', async () => {
    const sandbox = new PluginSandbox({ permissions: [] });
    sandbox.createContext();

    const result = await sandbox.execute<boolean>('typeof fetch === "undefined"');

    expect(result).toBe(true);
    sandbox.destroy();
  });

  it('should allow fetch with NETWORK permission', async () => {
    const sandbox = new PluginSandbox({ permissions: ['NETWORK'] });
    sandbox.createContext();

    const result = await sandbox.execute<boolean>('typeof fetch === "function"');

    expect(result).toBe(true);
    sandbox.destroy();
  });

  it('should block Buffer without FILESYSTEM permission', async () => {
    const sandbox = new PluginSandbox({ permissions: [] });
    sandbox.createContext();

    const result = await sandbox.execute<boolean>('typeof Buffer === "undefined"');

    expect(result).toBe(true);
    sandbox.destroy();
  });

  it('should allow Buffer with FILESYSTEM permission', async () => {
    const sandbox = new PluginSandbox({ permissions: ['FILESYSTEM'] });
    sandbox.createContext();

    const result = await sandbox.execute<boolean>('typeof Buffer === "function"');

    expect(result).toBe(true);
    sandbox.destroy();
  });

  it('should timeout long-running code', async () => {
    const sandbox = new PluginSandbox({ permissions: [], timeoutMs: 50 });
    sandbox.createContext();

    await expect(sandbox.execute('while(true) {}')).rejects.toThrow();
    sandbox.destroy();
  });

  it('should block setInterval', async () => {
    const sandbox = new PluginSandbox({ permissions: [] });
    sandbox.createContext();

    const result = await sandbox.execute<boolean>('typeof setInterval === "undefined"');

    expect(result).toBe(true);
    sandbox.destroy();
  });

  it('should throw if destroyed', async () => {
    const sandbox = new PluginSandbox({ permissions: [] });
    sandbox.destroy();

    expect(() => sandbox.createContext()).toThrow('destroyed');
    await expect(sandbox.execute('1')).rejects.toThrow('destroyed');
  });

  it('should throw without context', async () => {
    const sandbox = new PluginSandbox({ permissions: [] });

    await expect(sandbox.execute('1')).rejects.toThrow('No sandbox context');
  });

  it('should report destroyed status', () => {
    const sandbox = new PluginSandbox({ permissions: [] });

    expect(sandbox.isDestroyed()).toBe(false);
    sandbox.destroy();
    expect(sandbox.isDestroyed()).toBe(true);
  });

  it('should check permissions', () => {
    const sandbox = new PluginSandbox({ permissions: ['NETWORK', 'SHELL'] });

    expect(sandbox.hasPermission('NETWORK')).toBe(true);
    expect(sandbox.hasPermission('SHELL')).toBe(true);
    expect(sandbox.hasPermission('FILESYSTEM')).toBe(false);
  });

  it('should accept extra globals', async () => {
    const sandbox = new PluginSandbox({ permissions: [] });
    sandbox.createContext({ myGlobal: 42 });

    const result = await sandbox.execute<number>('myGlobal');

    expect(result).toBe(42);
    sandbox.destroy();
  });

  it('should have safe console', async () => {
    const sandbox = new PluginSandbox({ permissions: [] });
    sandbox.createContext();

    // Should not throw
    await sandbox.execute('console.log("test"); console.warn("w"); console.info("i")');

    sandbox.destroy();
  });

  it('should provide standard constructors', async () => {
    const sandbox = new PluginSandbox({ permissions: [] });
    sandbox.createContext();

    const result = await sandbox.execute<boolean>(
      'typeof Map === "function" && typeof Set === "function" && typeof Promise === "function"'
    );

    expect(result).toBe(true);
    sandbox.destroy();
  });
});
