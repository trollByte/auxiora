import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DraftStreamLoop } from '../src/draft-stream-loop.js';

describe('DraftStreamLoop with overrides', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('uses default throttle when no override', async () => {
    const send = vi.fn().mockResolvedValue(true);
    const loop = new DraftStreamLoop(send);
    loop.update('first');
    // Default 1000ms throttle — first call is immediate (0 elapsed)
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledWith('first');
  });

  it('uses custom throttle from overrides', async () => {
    const send = vi.fn().mockResolvedValue(true);
    const loop = new DraftStreamLoop(send, { coalescingIdleMs: 500 });
    loop.update('first');
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);

    // Send first, then update again — should throttle at 500ms
    loop.update('second');
    await vi.advanceTimersByTimeAsync(400);
    expect(send).toHaveBeenCalledTimes(1); // Still throttled
    await vi.advanceTimersByTimeAsync(200);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('falls back to defaults for unset overrides', () => {
    const send = vi.fn().mockResolvedValue(true);
    const loop = new DraftStreamLoop(send, { typingDelayMs: 2000 });
    // Should not throw — coalescingIdleMs falls back to default 1000
    loop.update('test');
  });
});
