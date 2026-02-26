import { describe, it, expect, vi } from 'vitest';
import { wireTelemetry } from '../src/telemetry-wiring.js';
import { EventEmitter } from 'node:events';

describe('wireTelemetry learning extraction', () => {
  it('calls extractAndStore on job:completed when learningStore provided', () => {
    const emitter = new EventEmitter();
    const tracker = { recordJob: vi.fn() };
    const learningStore = { extractAndStore: vi.fn().mockReturnValue(0) };

    wireTelemetry(emitter, tracker, learningStore);

    emitter.emit('job:completed', {
      job: { id: 'j1', type: 'build', createdAt: 1000, completedAt: 2000 },
      result: 'Note: Always check types.',
    });

    expect(learningStore.extractAndStore).toHaveBeenCalledWith(
      'Note: Always check types.',
      'j1',
      'build',
    );
  });

  it('works without learningStore (backward compatible)', () => {
    const emitter = new EventEmitter();
    const tracker = { recordJob: vi.fn() };

    wireTelemetry(emitter, tracker);

    emitter.emit('job:completed', {
      job: { id: 'j1', type: 'build', createdAt: 1000, completedAt: 2000 },
    });

    expect(tracker.recordJob).toHaveBeenCalled();
  });

  it('handles non-string results by stringifying', () => {
    const emitter = new EventEmitter();
    const tracker = { recordJob: vi.fn() };
    const learningStore = { extractAndStore: vi.fn().mockReturnValue(0) };

    wireTelemetry(emitter, tracker, learningStore);

    emitter.emit('job:completed', {
      job: { id: 'j1', type: 'build', createdAt: 1000, completedAt: 2000 },
      result: { complex: 'object' },
    });

    expect(learningStore.extractAndStore).toHaveBeenCalledWith(
      JSON.stringify({ complex: 'object' }),
      'j1',
      'build',
    );
  });
});
