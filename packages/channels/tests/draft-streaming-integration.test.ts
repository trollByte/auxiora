import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DraftStreamLoop } from '../src/draft-stream-loop.js';

describe('draft streaming integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should send initial message then edit on subsequent updates', async () => {
    const calls: Array<{ action: 'send' | 'edit'; text: string }> = [];
    let messageId: string | null = null;

    const sendOrEdit = async (text: string): Promise<boolean> => {
      if (!messageId) {
        messageId = 'msg-1';
        calls.push({ action: 'send', text });
      } else {
        calls.push({ action: 'edit', text });
      }
      return true;
    };

    const loop = new DraftStreamLoop(sendOrEdit, 50);

    loop.update('Hello');
    await new Promise(r => setTimeout(r, 100));

    loop.update('Hello World');
    await new Promise(r => setTimeout(r, 100));

    await loop.flush();

    expect(calls[0]).toEqual({ action: 'send', text: 'Hello' });
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[calls.length - 1].action).toBe('edit');
    expect(calls[calls.length - 1].text).toBe('Hello World');

    loop.stop();
  });

  it('should handle sendOrEdit failure gracefully', async () => {
    let callCount = 0;
    const sendOrEdit = async (_text: string): Promise<boolean> => {
      callCount++;
      if (callCount === 1) return true;
      throw new Error('Edit failed');
    };

    const loop = new DraftStreamLoop(sendOrEdit, 50);

    loop.update('Hello');
    await new Promise(r => setTimeout(r, 100));

    loop.update('Hello World');
    await new Promise(r => setTimeout(r, 100));

    // Should not throw
    await loop.flush();
    loop.stop();
  });

  it('should stop cleanly mid-stream', async () => {
    const sendOrEdit = vi.fn().mockResolvedValue(true);
    const loop = new DraftStreamLoop(sendOrEdit, 50);

    loop.update('Hello');
    await new Promise(r => setTimeout(r, 100));

    loop.update('Hello World');
    loop.stop(); // stop before next flush

    await new Promise(r => setTimeout(r, 200));

    // Should have sent initial but not the update after stop
    expect(sendOrEdit).toHaveBeenCalledTimes(1);
  });
});
