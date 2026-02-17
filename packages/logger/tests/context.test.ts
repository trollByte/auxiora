import { describe, it, expect } from 'vitest';
import { runWithRequestId, getRequestContext } from '../src/context.js';

describe('requestContext', () => {
  it('returns undefined outside of a run', () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it('provides requestId inside runWithRequestId', async () => {
    await runWithRequestId('req_test_123', async () => {
      const ctx = getRequestContext();
      expect(ctx).toBeDefined();
      expect(ctx!.requestId).toBe('req_test_123');
    });
  });

  it('returns undefined after run completes', async () => {
    await runWithRequestId('req_temp', async () => {
      // inside
    });
    expect(getRequestContext()).toBeUndefined();
  });

  it('supports nested contexts (inner wins)', async () => {
    await runWithRequestId('req_outer', async () => {
      expect(getRequestContext()!.requestId).toBe('req_outer');

      await runWithRequestId('req_inner', async () => {
        expect(getRequestContext()!.requestId).toBe('req_inner');
      });

      expect(getRequestContext()!.requestId).toBe('req_outer');
    });
  });
});
