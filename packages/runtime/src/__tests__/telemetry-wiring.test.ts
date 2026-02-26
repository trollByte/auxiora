import { describe, it, expect, vi } from 'vitest';
import { wireTelemetry } from '../telemetry-wiring.js';

describe('wireTelemetry', () => {
  it('records completed jobs to telemetry tracker', () => {
    const tracker = { recordJob: vi.fn() };
    const emitter = { on: vi.fn() };

    wireTelemetry(emitter, tracker);

    const completedHandler = emitter.on.mock.calls.find((c: unknown[]) => c[0] === 'job:completed');
    expect(completedHandler).toBeTruthy();

    completedHandler![1]({
      job: { id: 'j1', type: 'behavior', status: 'completed', createdAt: Date.now() - 5000, completedAt: Date.now() },
      result: {},
    });

    expect(tracker.recordJob).toHaveBeenCalledWith(expect.objectContaining({
      type: 'behavior',
      success: true,
      jobId: 'j1',
    }));
  });

  it('records failed jobs to telemetry tracker', () => {
    const tracker = { recordJob: vi.fn() };
    const emitter = { on: vi.fn() };

    wireTelemetry(emitter, tracker);

    const failedHandler = emitter.on.mock.calls.find((c: unknown[]) => c[0] === 'job:failed');
    failedHandler![1]({
      job: { id: 'j2', type: 'react', status: 'failed', createdAt: Date.now() - 1000, completedAt: Date.now() },
      error: new Error('timeout'),
    });

    expect(tracker.recordJob).toHaveBeenCalledWith(expect.objectContaining({
      type: 'react',
      success: false,
      jobId: 'j2',
      error: 'timeout',
    }));
  });

  it('records dead jobs with default message when no error provided', () => {
    const tracker = { recordJob: vi.fn() };
    const emitter = { on: vi.fn() };

    wireTelemetry(emitter, tracker);

    const deadHandler = emitter.on.mock.calls.find((c: unknown[]) => c[0] === 'job:dead');
    deadHandler![1]({
      job: { id: 'j3', type: 'workflow', status: 'dead', createdAt: Date.now() - 2000, completedAt: Date.now() },
    });

    expect(tracker.recordJob).toHaveBeenCalledWith(expect.objectContaining({
      type: 'workflow',
      success: false,
      jobId: 'j3',
      error: 'dead letter',
    }));
  });

  it('registers listeners for all three event types', () => {
    const tracker = { recordJob: vi.fn() };
    const emitter = { on: vi.fn() };

    wireTelemetry(emitter, tracker);

    const events = emitter.on.mock.calls.map((c: unknown[]) => c[0]);
    expect(events).toContain('job:completed');
    expect(events).toContain('job:failed');
    expect(events).toContain('job:dead');
  });
});
