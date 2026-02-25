import { describe, it, expect, beforeEach } from 'vitest';
import {
  ClipboardTransformTool,
  AppLaunchTool,
  SystemInfoTool,
  ToolPermission,
  setClipboardMonitor,
  setAppController,
  setSystemStateMonitor,
} from '../src/index.js';

describe('ClipboardTransformTool', () => {
  it('should have correct name and description', () => {
    expect(ClipboardTransformTool.name).toBe('clipboard_transform');
    expect(ClipboardTransformTool.description).toContain('clipboard');
  });

  it('should have optional operation parameter', () => {
    const op = ClipboardTransformTool.parameters.find(p => p.name === 'operation');
    expect(op?.required).toBe(false);
    expect(op?.default).toBe('read');
  });

  it('should auto-approve (read-only)', () => {
    expect(ClipboardTransformTool.getPermission({}, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });

  it('should fail without monitor', async () => {
    setClipboardMonitor(null);
    const result = await ClipboardTransformTool.execute({}, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not available');
  });

  it('should read clipboard content', async () => {
    setClipboardMonitor({
      getContent: () => ({ content: 'hello world', type: 'text', timestamp: 1000 }),
      transform: () => 'HELLO WORLD',
    });
    const result = await ClipboardTransformTool.execute({ operation: 'read' }, {} as any);
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output!);
    expect(parsed.content).toBe('hello world');
  });

  it('should transform clipboard content', async () => {
    setClipboardMonitor({
      getContent: () => ({ content: 'hello world', type: 'text', timestamp: 1000 }),
      transform: () => 'HELLO WORLD',
    });
    const result = await ClipboardTransformTool.execute({ operation: 'uppercase' }, {} as any);
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output!);
    expect(parsed.transformed).toBe('HELLO WORLD');
    expect(parsed.operation).toBe('uppercase');
  });
});

describe('AppLaunchTool', () => {
  it('should have correct name', () => {
    expect(AppLaunchTool.name).toBe('app_launch');
  });

  it('should require appName', () => {
    const appName = AppLaunchTool.parameters.find(p => p.name === 'appName');
    expect(appName?.required).toBe(true);
  });

  it('should auto-approve for launch and focus', () => {
    expect(AppLaunchTool.getPermission({ action: 'launch' }, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
    expect(AppLaunchTool.getPermission({ action: 'focus' }, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });

  it('should require approval for close', () => {
    expect(AppLaunchTool.getPermission({ action: 'close' }, {} as any)).toBe(ToolPermission.USER_APPROVAL);
  });

  it('should fail without controller', async () => {
    setAppController(null);
    const result = await AppLaunchTool.execute({ appName: 'Firefox' }, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not available');
  });

  it('should launch an app', async () => {
    setAppController({
      launch: async (name: string) => ({ success: true, command: `open "${name}"` }),
    });
    const result = await AppLaunchTool.execute({ appName: 'Firefox' }, {} as any);
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output!);
    expect(parsed.action).toBe('launch');
    expect(parsed.appName).toBe('Firefox');
  });
});

describe('SystemInfoTool', () => {
  it('should have correct name', () => {
    expect(SystemInfoTool.name).toBe('system_info');
  });

  it('should have no required parameters', () => {
    expect(SystemInfoTool.parameters.length).toBe(0);
  });

  it('should auto-approve', () => {
    expect(SystemInfoTool.getPermission({}, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });

  it('should fail without monitor', async () => {
    setSystemStateMonitor(null);
    const result = await SystemInfoTool.execute({}, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not available');
  });

  it('should return system state', async () => {
    setSystemStateMonitor({
      getState: () => ({
        platform: 'linux',
        hostname: 'test-machine',
        uptime: 7200,
        memory: { total: 16e9, free: 8e9, usedPercent: 50 },
        cpu: { model: 'Intel i7', cores: 8, loadAvg: [1.5, 2.0, 1.8] },
      }),
    });
    const result = await SystemInfoTool.execute({}, {} as any);
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output!);
    expect(parsed.platform).toBe('linux');
    expect(parsed.hostname).toBe('test-machine');
    expect(parsed.cpu.cores).toBe(8);
  });
});
