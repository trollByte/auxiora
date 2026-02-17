# Draft Streaming (Edit-in-Place) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stream AI responses progressively by editing a single message in place on Telegram, Discord, and Slack, instead of waiting for the full response.

**Architecture:** A channel-agnostic `DraftStreamLoop` handles throttled send/edit. Each adapter implements `editMessage()`. The runtime's `handleChannelMessage()` replaces its no-op `onChunk` with a draft-streaming handler that feeds chunks to the loop.

**Tech Stack:** TypeScript strict ESM, Node >=22, vitest, grammY (Telegram), discord.js (Discord), @slack/bolt (Slack)

---

## Codebase Context

**ChannelAdapter interface** (`packages/channels/src/types.ts:41-62`): Has `send()`, `startTyping?()`, `onMessage()`. No `editMessage`.

**SendResult** (`packages/channels/src/types.ts:35-39`): `{ success, messageId?, error? }` — messageId IS returned.

**ChannelManager** (`packages/channels/src/manager.ts`): Has `send()`, `startTyping()`, `getAdapter()`. No `editMessage()`.

**Telegram adapter** (`packages/channels/src/adapters/telegram.ts`): Uses grammY. `send()` uses `bot.api.sendMessage()`. No edit support. 4096 char limit.

**Discord adapter** (`packages/channels/src/adapters/discord.ts`): Uses discord.js. `send()` uses `channel.send()`. No edit support. 2000 char limit.

**Slack adapter** (`packages/channels/src/adapters/slack.ts`): Uses @slack/bolt. `send()` uses `client.chat.postMessage()`. No edit support. 4000 char limit.

**Runtime handleChannelMessage** (`packages/runtime/src/index.ts:2843-2998`): Passes no-op `onChunk` to `executeWithTools()`, waits for full response, sends once via `channels.send()`.

**Barrel export** (`packages/channels/src/index.ts`): Exports adapters, types, manager, dedup.

---

## Task 1: DraftStreamLoop Core

**Files:**
- Create: `packages/channels/src/draft-stream-loop.ts`
- Create: `packages/channels/tests/draft-stream-loop.test.ts`

**Step 1: Write the failing tests**

Create `packages/channels/tests/draft-stream-loop.test.ts`:

```typescript
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
      vi.advanceTimersByTime(0); // immediate flush (first call, no prior send)
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

      // Rapid updates within throttle window
      loop.update('Hello world');
      loop.update('Hello world!');
      await vi.advanceTimersByTimeAsync(500);
      expect(sendOrEdit).toHaveBeenCalledTimes(1); // still throttled

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
      await vi.advanceTimersByTimeAsync(0); // first send
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
      await vi.advanceTimersByTimeAsync(0); // starts in-flight

      loop.update('Second');
      const flushPromise = loop.flush();

      // In-flight still pending — flush should wait
      expect(sendOrEdit).toHaveBeenCalledTimes(1);

      // Resolve in-flight
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
      await vi.advanceTimersByTimeAsync(0); // first send
      loop.update('Hello World'); // scheduled for next throttle

      loop.stop();
      await vi.advanceTimersByTimeAsync(2000);

      expect(sendOrEdit).toHaveBeenCalledTimes(1); // only the first call
      vi.useRealTimers();
    });
  });

  describe('back-pressure', () => {
    it('should re-queue text when sendOrEdit returns false', async () => {
      vi.useFakeTimers();
      const sendOrEdit = vi.fn()
        .mockResolvedValueOnce(false) // back-pressure
        .mockResolvedValue(true);

      const loop = new DraftStreamLoop(sendOrEdit, 1000);

      loop.update('Hello');
      await vi.advanceTimersByTimeAsync(0);
      expect(sendOrEdit).toHaveBeenCalledTimes(1);

      // Text should be re-queued, sent on next throttle
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
      const loop = new DraftStreamLoop(sendOrEdit, 50); // 50ms throttle

      loop.update('Hello');
      await new Promise(r => setTimeout(r, 100));

      expect(sendOrEdit).toHaveBeenCalledWith('Hello');
      loop.stop();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/channels/tests/draft-stream-loop.test.ts`
Expected: FAIL — module not found

**Step 3: Implement DraftStreamLoop**

Create `packages/channels/src/draft-stream-loop.ts`:

```typescript
/**
 * Channel-agnostic throttled send/edit loop for draft streaming.
 *
 * Sends the first chunk immediately, then throttles subsequent updates.
 * Only one API call is in-flight at a time. Latest text wins (coalescing).
 */

export class DraftStreamLoop {
  private pendingText: string | null = null;
  private inFlightPromise: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSentAt = 0;

  constructor(
    private readonly sendOrEdit: (text: string) => Promise<boolean>,
    private readonly throttleMs = 1000,
  ) {}

  /** Set the latest full text to display. Schedules or triggers a flush. */
  update(text: string): void {
    this.pendingText = text;
    this.scheduleFlush();
  }

  /** Force delivery of pending text. Waits for in-flight, loops until drained. */
  async flush(): Promise<void> {
    this.clearTimer();

    // Wait for in-flight
    if (this.inFlightPromise) {
      await this.inFlightPromise;
    }

    // Drain pending
    while (this.pendingText !== null) {
      await this.doSend();
    }
  }

  /** Cancel timer and clear pending text. */
  stop(): void {
    this.clearTimer();
    this.pendingText = null;
  }

  private scheduleFlush(): void {
    if (this.inFlightPromise || this.timer) return;

    const elapsed = Date.now() - this.lastSentAt;
    const delay = Math.max(0, this.throttleMs - elapsed);

    if (delay === 0) {
      void this.doSend();
    } else {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.doSend();
      }, delay);
    }
  }

  private async doSend(): Promise<void> {
    const text = this.pendingText;
    if (text === null) return;
    this.pendingText = null;

    const promise = this.sendOrEdit(text).then((ok) => {
      if (!ok && this.pendingText === null) {
        // Back-pressure: re-queue text and schedule retry
        this.pendingText = text;
        this.scheduleFlush();
      }
    }).catch(() => {
      // Swallow errors — the caller handles failures via the callback
    });

    this.inFlightPromise = promise.finally(() => {
      if (this.inFlightPromise === promise) {
        this.inFlightPromise = null;
        this.lastSentAt = Date.now();
        // If new text arrived during in-flight, schedule next
        if (this.pendingText !== null) {
          this.scheduleFlush();
        }
      }
    });

    await this.inFlightPromise;
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/channels/tests/draft-stream-loop.test.ts`
Expected: PASS (all 8 tests)

**Step 5: Commit**

```bash
git add packages/channels/src/draft-stream-loop.ts packages/channels/tests/draft-stream-loop.test.ts
git commit -m "feat(channels): add DraftStreamLoop for throttled edit-in-place streaming"
```

---

## Task 2: Adapter editMessage — Interface + Implementations

**Files:**
- Modify: `packages/channels/src/types.ts:41-62`
- Modify: `packages/channels/src/adapters/telegram.ts`
- Modify: `packages/channels/src/adapters/discord.ts`
- Modify: `packages/channels/src/adapters/slack.ts`
- Modify: `packages/channels/src/manager.ts`
- Create: `packages/channels/tests/edit-message.test.ts`

**Step 1: Write the failing tests**

Create `packages/channels/tests/edit-message.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { ChannelAdapter, OutboundMessage, SendResult } from '../src/types.js';

describe('editMessage interface', () => {
  it('should be an optional method on ChannelAdapter', () => {
    // Compile-time check: an adapter without editMessage is valid
    const adapter: ChannelAdapter = {
      type: 'telegram',
      name: 'Test',
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnected: () => true,
      send: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };
    expect(adapter.editMessage).toBeUndefined();
  });

  it('should accept channelId, messageId, and message', () => {
    // Compile-time check: an adapter with editMessage is valid
    const adapter: ChannelAdapter = {
      type: 'telegram',
      name: 'Test',
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnected: () => true,
      send: vi.fn(),
      editMessage: vi.fn().mockResolvedValue({ success: true, messageId: '123' }),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };
    expect(adapter.editMessage).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/channels/tests/edit-message.test.ts`
Expected: FAIL — editMessage not in interface (TypeScript error)

**Step 3: Add editMessage to interface and adapters**

In `packages/channels/src/types.ts`, add after `startTyping?()` (line 54):

```typescript
  editMessage?(channelId: string, messageId: string, message: OutboundMessage): Promise<SendResult>;
```

In `packages/channels/src/adapters/telegram.ts`, add after the `send()` method:

```typescript
  async editMessage(channelId: string, messageId: string, message: OutboundMessage): Promise<SendResult> {
    try {
      const chatId = Number(channelId);
      await this.bot.api.editMessageText(chatId, Number(messageId), message.content);
      return { success: true, messageId };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Edit failed' };
    }
  }
```

In `packages/channels/src/adapters/discord.ts`, add after the `send()` method:

```typescript
  async editMessage(channelId: string, messageId: string, message: OutboundMessage): Promise<SendResult> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel?.isTextBased() || !('messages' in channel)) {
        return { success: false, error: 'Channel not text-based' };
      }
      const msg = await channel.messages.fetch(messageId);
      await msg.edit(message.content);
      return { success: true, messageId };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Edit failed' };
    }
  }
```

In `packages/channels/src/adapters/slack.ts`, add after the `send()` method:

```typescript
  async editMessage(channelId: string, messageId: string, message: OutboundMessage): Promise<SendResult> {
    try {
      await this.app.client.chat.update({
        channel: channelId,
        ts: messageId,
        text: message.content,
      });
      return { success: true, messageId };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Edit failed' };
    }
  }
```

In `packages/channels/src/manager.ts`, add after `startTyping()`:

```typescript
  async editMessage(
    channelType: ChannelType,
    channelId: string,
    messageId: string,
    message: OutboundMessage,
  ): Promise<SendResult> {
    const adapter = this.adapters.get(channelType);
    if (!adapter?.editMessage || !adapter.isConnected()) {
      return { success: false, error: `Edit not supported for ${channelType}` };
    }
    return adapter.editMessage(channelId, messageId, message);
  }
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/channels/tests/edit-message.test.ts`
Expected: PASS (2 tests)

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/channels/tests/`
Expected: PASS (all channel tests)

**Step 5: Commit**

```bash
git add packages/channels/src/types.ts packages/channels/src/adapters/telegram.ts packages/channels/src/adapters/discord.ts packages/channels/src/adapters/slack.ts packages/channels/src/manager.ts packages/channels/tests/edit-message.test.ts
git commit -m "feat(channels): add editMessage to Telegram, Discord, and Slack adapters"
```

---

## Task 3: Runtime Draft Streaming Integration

**Files:**
- Modify: `packages/runtime/src/index.ts` (handleChannelMessage, ~2920-2950)
- Modify: `packages/channels/src/index.ts` (barrel export DraftStreamLoop)
- Create: `packages/channels/tests/draft-streaming-integration.test.ts`

**Step 1: Write the failing tests**

Create `packages/channels/tests/draft-streaming-integration.test.ts`:

```typescript
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

    // Simulate streaming chunks
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
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ai-work/git/auxiora && npx vitest run packages/channels/tests/draft-streaming-integration.test.ts`
Expected: PASS — these tests use DraftStreamLoop directly (already implemented). They should pass now.

**Step 3: Update runtime handleChannelMessage**

In `packages/runtime/src/index.ts`, modify `handleChannelMessage()`. Find the section around line 2920-2950 where the no-op `onChunk` is passed to `executeWithTools`. Replace it with draft streaming logic.

Import at top of file (near other channel imports):
```typescript
import { DraftStreamLoop } from '@auxiora/channels/draft-stream-loop';
```

Wait — the runtime imports from the channels barrel. Check if the import path is `@auxiora/channels` or relative. Use whatever the existing pattern is.

Replace the no-op onChunk section in `handleChannelMessage()`. Currently:

```typescript
    const fallbackCandidates = this.providers.resolveFallbackCandidates();
    const { response: channelResponse, usage: channelUsage } = await this.executeWithTools(
      session.id,
      chatMessages,
      enrichedPrompt,
      provider,
      (_type, _data) => {
        // Channels: don't stream individual chunks — send complete response at end
      },
      { tools, fallbackCandidates },
    );
```

Replace with:

```typescript
    // Draft streaming: edit message in place if adapter supports it
    const adapter = this.channels?.getAdapter(inbound.channelType);
    const supportsDraft = !!adapter?.editMessage;

    let draftMessageId: string | null = null;
    let accumulatedText = '';
    let draftLoop: DraftStreamLoop | null = null;

    if (supportsDraft && this.channels) {
      const channels = this.channels;
      draftLoop = new DraftStreamLoop(async (text) => {
        try {
          if (!draftMessageId) {
            // First send — create the message
            const result = await channels.send(inbound.channelType, inbound.channelId, {
              content: text,
              replyToId: inbound.id,
            });
            if (result.success && result.messageId) {
              draftMessageId = result.messageId;
            }
            return result.success;
          } else {
            // Subsequent — edit the message
            const result = await channels.editMessage(
              inbound.channelType,
              inbound.channelId,
              draftMessageId,
              { content: text },
            );
            return result.success;
          }
        } catch {
          return false;
        }
      }, 1000);
    }

    const fallbackCandidates = this.providers.resolveFallbackCandidates();
    const { response: channelResponse, usage: channelUsage } = await this.executeWithTools(
      session.id,
      chatMessages,
      enrichedPrompt,
      provider,
      (type, data) => {
        if (type === 'text' && data && draftLoop) {
          accumulatedText += data;
          draftLoop.update(accumulatedText);
        }
      },
      { tools, fallbackCandidates },
    );

    // Flush final text
    if (draftLoop) {
      if (channelResponse && channelResponse !== accumulatedText) {
        draftLoop.update(channelResponse);
      }
      await draftLoop.flush();
      draftLoop.stop();
    }
```

Then update the final send section — skip sending the full response if draft streaming already delivered it:

```typescript
    // Send response (skip if draft streaming already sent it)
    if (!draftMessageId && this.channels) {
      await this.channels.send(inbound.channelType, inbound.channelId, {
        content: channelResponse,
        replyToId: inbound.id,
      });
    }
```

**Step 4: Add barrel export**

In `packages/channels/src/index.ts`, add:

```typescript
// Draft streaming
export { DraftStreamLoop } from './draft-stream-loop.js';
```

**Step 5: Run full test suite**

Run: `cd /home/ai-work/git/auxiora && npx vitest run`
Expected: PASS (all tests)

**Step 6: Commit**

```bash
git add packages/runtime/src/index.ts packages/channels/src/index.ts packages/channels/tests/draft-streaming-integration.test.ts
git commit -m "feat(runtime): wire draft streaming into channel message handling"
```

---

## Test Summary

| Task | Component | Test File | New Tests |
|------|-----------|-----------|-----------|
| 1 | DraftStreamLoop | `draft-stream-loop.test.ts` | 8 |
| 2 | editMessage interface + adapters | `edit-message.test.ts` | 2 |
| 3 | Runtime integration | `draft-streaming-integration.test.ts` | 3 |
| **Total** | | | **13** |
