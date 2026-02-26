import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BatteryChangeReviewer } from '../src/battery-change.js';
import { TelemetryTracker } from '../src/tracker.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('BatteryChangeReviewer change log integration', () => {
  let tracker: TelemetryTracker;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `battery-cl-test-${Date.now()}.db`);
    tracker = new TelemetryTracker(dbPath);
  });

  afterEach(() => {
    tracker.close();
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
  });

  it('records flagged tool suggestions to change log', () => {
    // Record enough failures to trigger flagging (>=5 calls, <70% success)
    for (let i = 0; i < 10; i++) {
      tracker.record({ tool: 'web-search', success: i < 2, durationMs: 100 });
    }

    const mockChangeLog = { record: vi.fn().mockReturnValue(1) };
    const reviewer = new BatteryChangeReviewer(tracker, mockChangeLog);
    reviewer.generateReport();

    expect(mockChangeLog.record).toHaveBeenCalled();
    const call = mockChangeLog.record.mock.calls[0][0];
    expect(call.component).toBe('battery-review');
    expect(call.description).toContain('web-search');
    expect(call.reason).toContain('below 70% success rate');
  });

  it('records reflection issues to change log', () => {
    // Add a session reflection with whatToChange items
    tracker.saveReflection({
      sessionId: 'sess-1',
      timestamp: Date.now(),
      toolsUsed: 3,
      successRate: 0.9,
      issues: ['slow responses'],
      whatWorked: ['caching'],
      whatWasSlow: ['db queries'],
      whatToChange: ['Optimize database queries', 'Add response caching'],
      summary: 'Session had slow DB queries',
    });

    const mockChangeLog = { record: vi.fn().mockReturnValue(1) };
    const reviewer = new BatteryChangeReviewer(tracker, mockChangeLog);
    reviewer.generateReport();

    expect(mockChangeLog.record).toHaveBeenCalledTimes(2);
    expect(mockChangeLog.record.mock.calls[0][0].description).toBe('Optimize database queries');
    expect(mockChangeLog.record.mock.calls[0][0].reason).toBe('Identified in session reflection');
    expect(mockChangeLog.record.mock.calls[1][0].description).toBe('Add response caching');
  });

  it('does not call change log when no suggestions are generated', () => {
    const mockChangeLog = { record: vi.fn().mockReturnValue(1) };
    const reviewer = new BatteryChangeReviewer(tracker, mockChangeLog);
    reviewer.generateReport();

    expect(mockChangeLog.record).not.toHaveBeenCalled();
  });

  it('works without a change log (backwards compatible)', () => {
    for (let i = 0; i < 10; i++) {
      tracker.record({ tool: 'web-search', success: i < 2, durationMs: 100 });
    }

    const reviewer = new BatteryChangeReviewer(tracker);
    const report = reviewer.generateReport();

    expect(report).toContain('web-search');
    expect(report).toContain('Suggestions');
  });
});
