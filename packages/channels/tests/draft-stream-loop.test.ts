import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DraftStreamLoop } from '../src/draft-stream-loop.js';

describe('DraftStreamLoop', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('update and flush', () => {
    it('should call sendOrEdit on first update after throttle', async () => {
      vi.useFakeTimers();
      const sendOrEdit = vi.fn().mockResolvedValue(true);
      const loop = new DraftStreamLoop(sendOrEdit, 1000);

      loop.update('Hello');
      vi.advanceTimersByTime(0);
      await vi.runAllTimersAsync();

      expect(sendOrEdit).toHaveBeenCalledWith('Hello');
      loop.stop();
      vi.useRealTimers();
    });

    it('should throttle rapid updates', async () => {
      vi.useFakeTimers();
      const sendOrEdit = vi.fn().mockResolvedValue(true);
      const loop = new DraftStreamLoop(sendOrEdit, 1000);

      loop.update('Hello');
      await vi.advanceTimersByTimeAsync(0);
      expect(sendOrEdit).toHaveBeenCalledTimes(1);

      loop.update('Hello world');
      loop.update('Hello world!');
      await vi.advanceTimersByTimeAsync(500);
      expect(sendOrEdit).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(500);
      expect(sendOrEdit).toHaveBeenCalledTimes(2);
      expect(sendOrEdit).toHaveBeenLastCalledWith('Hello world!');

      loop.stop();
      vi.useRealTimers();
    });

    it('should use latest text when flushing (coalesce updates)', async () => {
      vi.useFakeTimers();
      const sendOrEdit = vi.fn().mockResolvedValue(true);
      const loop = new DraftStreamLoop(sendOrEdit, 1000);

      loop.update('A');
      loop.update('AB');
      loop.update('ABC');
      await vi.advanceTimersByTimeAsync(0);

      expect(sendOrEdit).toHaveBeenCalledTimes(1);
      expect(sendOrEdit).toHaveBeenCalledWith('ABC');

      loop.stop();
      vi.useRealTimers();
    });
  });

  describe('flush', () => {
    it('should force delivery of pending text', async () => {
      vi.useFakeTimers();
      const sendOrEdit = vi.fn().mockResolvedValue(true);
      const loop = new DraftStreamLoop(sendOrEdit, 1000);

      loop.update('Hello');
      await vi.advanceTimersByTimeAsync(0);
      loop.update('Hello World');

      await loop.flush();

      expect(sendOrEdit).toHaveBeenCalledTimes(2);
      expect(sendOrEdit).toHaveBeenLastCalledWith('Hello World');

      loop.stop();
      vi.useRealTimers();
    });

    it('should wait for in-flight request before sending', async () => {
      vi.useFakeTimers();
      let resolveInFlight: () => void;
      const sendOrEdit = vi.fn().mockImplementation(() => new Promise<boolean>((resolve) => {
        resolveInFlight = () => resolve(true);
      }));

      const loop = new DraftStreamLoop(sendOrEdit, 1000);

      loop.update('First');
      await vi.advanceTimersByTimeAsync(0);

      loop.update('Second');
      const flushPromise = loop.flush();

      expect(sendOrEdit).toHaveBeenCalledTimes(1);

      resolveInFlight!();
      await flushPromise;

      expect(sendOrEdit).toHaveBeenCalledTimes(2);
      expect(sendOrEdit).toHaveBeenLastCalledWith('Second');

      loop.stop();
      vi.useRealTimers();
    });
  });

  describe('stop', () => {
    it('should cancel pending timer and clear pending text', async () => {
      vi.useFakeTimers();
      const sendOrEdit = vi.fn().mockResolvedValue(true);
      const loop = new DraftStreamLoop(sendOrEdit, 1000);

      loop.update('Hello');
      await vi.advanceTimersByTimeAsync(0);
      loop.update('Hello World');

      loop.stop();
      await vi.advanceTimersByTimeAsync(2000);

      expect(sendOrEdit).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe('back-pressure', () => {
    it('should re-queue text when sendOrEdit returns false', async () => {
      vi.useFakeTimers();
      const sendOrEdit = vi.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true);

      const loop = new DraftStreamLoop(sendOrEdit, 1000);

      loop.update('Hello');
      await vi.advanceTimersByTimeAsync(0);
      expect(sendOrEdit).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(sendOrEdit).toHaveBeenCalledTimes(2);

      loop.stop();
      vi.useRealTimers();
    });
  });

  describe('no-op on empty', () => {
    it('should not call sendOrEdit when no pending text', async () => {
      vi.useFakeTimers();
      const sendOrEdit = vi.fn().mockResolvedValue(true);
      const loop = new DraftStreamLoop(sendOrEdit, 1000);

      await loop.flush();

      expect(sendOrEdit).not.toHaveBeenCalled();

      loop.stop();
      vi.useRealTimers();
    });
  });

  describe('real timers (integration-style)', () => {
    it('should deliver text within throttle window', async () => {
      const sendOrEdit = vi.fn().mockResolvedValue(true);
      const loop = new DraftStreamLoop(sendOrEdit, 50);

      loop.update('Hello');
      await new Promise(r => setTimeout(r, 100));

      expect(sendOrEdit).toHaveBeenCalledWith('Hello');
      loop.stop();
    });
  });
});
