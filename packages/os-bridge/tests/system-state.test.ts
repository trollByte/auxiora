import { describe, it, expect } from 'vitest';
import { SystemStateMonitor } from '../src/system-state.js';

describe('SystemStateMonitor', () => {
  it('getState returns valid platform', () => {
    const monitor = new SystemStateMonitor();
    const state = monitor.getState();
    expect(['darwin', 'linux', 'win32']).toContain(state.platform);
  });

  it('getState returns hostname', () => {
    const monitor = new SystemStateMonitor();
    const state = monitor.getState();
    expect(typeof state.hostname).toBe('string');
    expect(state.hostname.length).toBeGreaterThan(0);
  });

  it('getState returns uptime > 0', () => {
    const monitor = new SystemStateMonitor();
    const state = monitor.getState();
    expect(state.uptime).toBeGreaterThan(0);
  });

  it('getMemoryUsage returns valid percentages', () => {
    const monitor = new SystemStateMonitor();
    const mem = monitor.getMemoryUsage();
    expect(mem.total).toBeGreaterThan(0);
    expect(mem.free).toBeGreaterThan(0);
    expect(mem.usedPercent).toBeGreaterThan(0);
    expect(mem.usedPercent).toBeLessThan(100);
  });

  it('getCpuInfo returns model and cores', () => {
    const monitor = new SystemStateMonitor();
    const cpu = monitor.getCpuInfo();
    expect(typeof cpu.model).toBe('string');
    expect(cpu.model.length).toBeGreaterThan(0);
    expect(cpu.cores).toBeGreaterThan(0);
  });

  it('getCpuInfo cores > 0', () => {
    const monitor = new SystemStateMonitor();
    const cpu = monitor.getCpuInfo();
    expect(cpu.cores).toBeGreaterThan(0);
  });

  it('getCpuInfo loadAvg is an array', () => {
    const monitor = new SystemStateMonitor();
    const cpu = monitor.getCpuInfo();
    expect(Array.isArray(cpu.loadAvg)).toBe(true);
    expect(cpu.loadAvg.length).toBe(3);
  });

  it('constructor accepts explicit platform', () => {
    const monitor = new SystemStateMonitor('darwin');
    const state = monitor.getState();
    expect(state.platform).toBe('darwin');
  });
});
