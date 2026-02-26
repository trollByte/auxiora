import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StaleJobDetector } from '../src/stale-detector.js';

describe('StaleJobDetector', () => {
  let detector: StaleJobDetector;
  const mockDb = {
    getRunningJobs: vi.fn().mockReturnValue([]),
    killJob: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    detector = new StaleJobDetector(mockDb, { staleAfterMs: 60_000 });
  });

  afterEach(() => {
    detector.stop();
    vi.useRealTimers();
  });

  it('detects jobs running longer than staleAfterMs', () => {
    const now = Date.now();
    mockDb.getRunningJobs.mockReturnValue([
      { id: 'j1', type: 'build', startedAt: now - 120_000 },
      { id: 'j2', type: 'build', startedAt: now - 30_000 },
    ]);

    const stale = detector.check();
    expect(stale).toHaveLength(1);
    expect(stale[0].id).toBe('j1');
  });

  it('kills stale jobs when autoKill is true', () => {
    const now = Date.now();
    mockDb.getRunningJobs.mockReturnValue([
      { id: 'j1', type: 'build', startedAt: now - 120_000 },
    ]);

    detector = new StaleJobDetector(mockDb, { staleAfterMs: 60_000, autoKill: true });
    detector.check();

    expect(mockDb.killJob).toHaveBeenCalledWith('j1');
  });

  it('does not kill stale jobs when autoKill is false', () => {
    const now = Date.now();
    mockDb.getRunningJobs.mockReturnValue([
      { id: 'j1', type: 'build', startedAt: now - 120_000 },
    ]);

    detector.check();
    expect(mockDb.killJob).not.toHaveBeenCalled();
  });

  it('returns empty array when no jobs are stale', () => {
    const now = Date.now();
    mockDb.getRunningJobs.mockReturnValue([
      { id: 'j1', type: 'build', startedAt: now - 10_000 },
    ]);

    const stale = detector.check();
    expect(stale).toHaveLength(0);
  });
});
