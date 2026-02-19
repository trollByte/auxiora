import { describe, it, expect } from 'vitest';
import {
  withTrace,
  getCurrentContext,
  getCurrentTraceId,
} from '../src/trace-context.js';

describe('trace-context', () => {
  describe('withTrace', () => {
    it('provides context within the callback', async () => {
      await withTrace('abc123', 'span456', () => {
        const ctx = getCurrentContext();
        expect(ctx).toEqual({ traceId: 'abc123', spanId: 'span456' });
      });
    });

    it('returns the callback result', async () => {
      const result = await withTrace('t', 's', () => 42);
      expect(result).toBe(42);
    });

    it('works with async callbacks', async () => {
      const result = await withTrace('t', 's', async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getCurrentTraceId();
      });
      expect(result).toBe('t');
    });

    it('propagates through nested async calls', async () => {
      await withTrace('trace1', 'span1', async () => {
        const innerResult = await new Promise<string | undefined>((resolve) => {
          setTimeout(() => resolve(getCurrentTraceId()), 5);
        });
        expect(innerResult).toBe('trace1');
      });
    });
  });

  describe('getCurrentContext', () => {
    it('returns undefined outside of withTrace', () => {
      expect(getCurrentContext()).toBeUndefined();
    });
  });

  describe('getCurrentTraceId', () => {
    it('returns undefined outside of withTrace', () => {
      expect(getCurrentTraceId()).toBeUndefined();
    });

    it('returns trace ID inside withTrace', async () => {
      await withTrace('my-trace', 'my-span', () => {
        expect(getCurrentTraceId()).toBe('my-trace');
      });
    });
  });

  describe('isolation', () => {
    it('isolates context between concurrent traces', async () => {
      const results: string[] = [];

      await Promise.all([
        withTrace('trace-a', 'span-a', async () => {
          await new Promise((r) => setTimeout(r, 10));
          results.push(getCurrentTraceId()!);
        }),
        withTrace('trace-b', 'span-b', async () => {
          await new Promise((r) => setTimeout(r, 5));
          results.push(getCurrentTraceId()!);
        }),
      ]);

      expect(results).toContain('trace-a');
      expect(results).toContain('trace-b');
      expect(results).toHaveLength(2);
    });
  });
});
