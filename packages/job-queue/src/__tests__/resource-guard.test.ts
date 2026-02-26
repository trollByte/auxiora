import { describe, it, expect } from 'vitest';
import { ResourceGuard } from '../resource-guard.js';

describe('ResourceGuard', () => {
  it('allows dispatch when resources are available', () => {
    const guard = new ResourceGuard({ memoryThresholdPercent: 90, minFreeMemoryMB: 512 });
    const result = guard.checkWith({ usedPercent: 60, freeMB: 4096 });
    expect(result.allowed).toBe(true);
  });

  it('blocks when memory usage exceeds threshold', () => {
    const guard = new ResourceGuard({ memoryThresholdPercent: 90, minFreeMemoryMB: 512 });
    const result = guard.checkWith({ usedPercent: 95, freeMB: 200 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('memory');
  });

  it('blocks when free memory is too low', () => {
    const guard = new ResourceGuard({ memoryThresholdPercent: 90, minFreeMemoryMB: 512 });
    const result = guard.checkWith({ usedPercent: 70, freeMB: 256 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('free memory');
  });

  it('uses defaults when no options provided', () => {
    const guard = new ResourceGuard();
    const result = guard.checkWith({ usedPercent: 50, freeMB: 8000 });
    expect(result.allowed).toBe(true);
  });
});
