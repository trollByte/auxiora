import { describe, it, expect, beforeEach } from 'vitest';
import { JobQueueMetrics } from '../metrics.js';

describe('JobQueueMetrics', () => {
  let metrics: JobQueueMetrics;

  beforeEach(() => {
    metrics = new JobQueueMetrics();
  });

  it('starts with all zeros in snapshot', () => {
    const snap = metrics.getSnapshot();
    expect(snap.enqueuedTotal).toBe(0);
    expect(snap.startedTotal).toBe(0);
    expect(snap.completedTotal).toBe(0);
    expect(snap.failedTotal).toBe(0);
    expect(snap.deadTotal).toBe(0);
    expect(snap.recoveredTotal).toBe(0);
    expect(snap.durationHistogram).toEqual([]);
    expect(snap.byType).toEqual({});
  });

  it('records enqueued and increments total + type', () => {
    metrics.recordEnqueued('email');
    metrics.recordEnqueued('email');
    metrics.recordEnqueued('sms');

    const snap = metrics.getSnapshot();
    expect(snap.enqueuedTotal).toBe(3);
    expect(snap.byType['email']!.enqueued).toBe(2);
    expect(snap.byType['sms']!.enqueued).toBe(1);
  });

  it('records started', () => {
    metrics.recordStarted();
    metrics.recordStarted();

    const snap = metrics.getSnapshot();
    expect(snap.startedTotal).toBe(2);
  });

  it('records completed with duration tracking', () => {
    metrics.recordCompleted('email', 150);
    metrics.recordCompleted('email', 200);

    const snap = metrics.getSnapshot();
    expect(snap.completedTotal).toBe(2);
    expect(snap.durationHistogram).toEqual([150, 200]);
    expect(snap.byType['email']!.completed).toBe(2);
  });

  it('records failed with type tracking', () => {
    metrics.recordFailed('email');
    metrics.recordFailed('sms');
    metrics.recordFailed('sms');

    const snap = metrics.getSnapshot();
    expect(snap.failedTotal).toBe(3);
    expect(snap.byType['email']!.failed).toBe(1);
    expect(snap.byType['sms']!.failed).toBe(2);
  });

  it('records dead with type tracking', () => {
    metrics.recordDead('email');
    metrics.recordDead('email');

    const snap = metrics.getSnapshot();
    expect(snap.deadTotal).toBe(2);
    expect(snap.byType['email']!.dead).toBe(2);
  });

  it('records recovery count', () => {
    metrics.recordRecovery(3);
    metrics.recordRecovery(2);

    const snap = metrics.getSnapshot();
    expect(snap.recoveredTotal).toBe(5);
  });

  it('duration histogram caps at maxDurations', () => {
    for (let i = 0; i < 1050; i++) {
      metrics.recordCompleted('work', i);
    }

    const snap = metrics.getSnapshot();
    expect(snap.durationHistogram.length).toBe(1000);
    expect(snap.durationHistogram[0]).toBe(50);
    expect(snap.durationHistogram[999]).toBe(1049);
  });

  it('getDurationPercentile returns correct values', () => {
    for (let i = 1; i <= 100; i++) {
      metrics.recordCompleted('work', i);
    }

    expect(metrics.getDurationPercentile(50)).toBe(50);
    expect(metrics.getDurationPercentile(95)).toBe(95);
    expect(metrics.getDurationPercentile(99)).toBe(99);
  });

  it('getDurationPercentile returns 0 when empty', () => {
    expect(metrics.getDurationPercentile(50)).toBe(0);
  });

  it('getAverageDuration computes correctly', () => {
    metrics.recordCompleted('a', 100);
    metrics.recordCompleted('b', 200);
    metrics.recordCompleted('c', 300);

    expect(metrics.getAverageDuration()).toBe(200);
  });

  it('getAverageDuration returns 0 when empty', () => {
    expect(metrics.getAverageDuration()).toBe(0);
  });

  it('getSnapshot returns correct byType breakdown', () => {
    metrics.recordEnqueued('email');
    metrics.recordCompleted('email', 100);
    metrics.recordFailed('email');
    metrics.recordDead('email');

    metrics.recordEnqueued('sms');
    metrics.recordEnqueued('sms');

    const snap = metrics.getSnapshot();
    expect(snap.byType).toEqual({
      email: { enqueued: 1, completed: 1, failed: 1, dead: 1 },
      sms: { enqueued: 2, completed: 0, failed: 0, dead: 0 },
    });
  });

  it('reset clears everything', () => {
    metrics.recordEnqueued('email');
    metrics.recordStarted();
    metrics.recordCompleted('email', 100);
    metrics.recordFailed('email');
    metrics.recordDead('email');
    metrics.recordRecovery(5);

    metrics.reset();

    const snap = metrics.getSnapshot();
    expect(snap.enqueuedTotal).toBe(0);
    expect(snap.startedTotal).toBe(0);
    expect(snap.completedTotal).toBe(0);
    expect(snap.failedTotal).toBe(0);
    expect(snap.deadTotal).toBe(0);
    expect(snap.recoveredTotal).toBe(0);
    expect(snap.durationHistogram).toEqual([]);
    expect(snap.byType).toEqual({});
  });
});
