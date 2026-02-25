import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { InboundMessage } from '../src/types.js';
import { TelegramAdapter } from '../src/adapters/telegram.js';

// Mock audit
vi.mock('@auxiora/audit', () => ({
  audit: vi.fn(),
}));

// Track registered grammy event handlers
type MessageTextHandler = (ctx: unknown) => Promise<void>;
let messageTextHandlers: MessageTextHandler[] = [];
let errorHandler: ((error: Error) => void) | undefined;

// Mock grammy
vi.mock('grammy', () => {
  class MockBot {
    api = {
      setWebhook: vi.fn().mockResolvedValue(true),
      sendMessage: vi.fn().mockResolvedValue({ message_id: 42 }),
      editMessageText: vi.fn().mockResolvedValue(true),
      sendChatAction: vi.fn().mockResolvedValue(true),
    };
    on = vi.fn((event: string, handler: MessageTextHandler) => {
      if (event === 'message:text') {
        messageTextHandlers.push(handler);
      }
    });
    catch = vi.fn((handler: (error: Error) => void) => {
      errorHandler = handler;
    });
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
    handleUpdate = vi.fn().mockResolvedValue(undefined);
  }

  return {
    Bot: MockBot,
    Context: class {},
  };
});

function makeCtx(overrides: {
  chatType: 'private' | 'group' | 'supergroup' | 'channel';
  chatTitle?: string;
  chatId?: number;
}) {
  const chat: Record<string, unknown> = {
    id: overrides.chatId ?? 100,
    type: overrides.chatType,
  };
  if (overrides.chatTitle !== undefined) {
    chat.title = overrides.chatTitle;
  }

  return {
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      text: 'hello',
      chat,
      from: {
        id: 999,
        first_name: 'Test',
        last_name: 'User',
      },
      reply_to_message: undefined,
    },
  };
}

describe('TelegramAdapter', () => {
  let adapter: TelegramAdapter;

  beforeEach(() => {
    messageTextHandlers = [];
    errorHandler = undefined;

    adapter = new TelegramAdapter({
      token: 'test-token',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(adapter.type).toBe('telegram');
    expect(adapter.name).toBe('Telegram');
    expect(adapter.isConnected()).toBe(false);
  });

  describe('groupContext', () => {
    it('should set groupContext for group chats', async () => {
      const received: InboundMessage[] = [];
      adapter.onMessage(async (msg) => {
        received.push(msg);
      });

      expect(messageTextHandlers.length).toBeGreaterThan(0);

      const ctx = makeCtx({ chatType: 'group', chatTitle: 'My Group' });
      await messageTextHandlers[0](ctx);

      expect(received).toHaveLength(1);
      expect(received[0].groupContext).toEqual({
        isGroup: true,
        groupName: 'My Group',
      });
    });

    it('should set groupContext for supergroup chats', async () => {
      const received: InboundMessage[] = [];
      adapter.onMessage(async (msg) => {
        received.push(msg);
      });

      const ctx = makeCtx({ chatType: 'supergroup', chatTitle: 'Super Group' });
      await messageTextHandlers[0](ctx);

      expect(received).toHaveLength(1);
      expect(received[0].groupContext).toEqual({
        isGroup: true,
        groupName: 'Super Group',
      });
    });

    it('should have undefined groupContext for private chats', async () => {
      const received: InboundMessage[] = [];
      adapter.onMessage(async (msg) => {
        received.push(msg);
      });

      const ctx = makeCtx({ chatType: 'private' });
      await messageTextHandlers[0](ctx);

      expect(received).toHaveLength(1);
      expect(received[0].groupContext).toBeUndefined();
    });

    it('should handle group without title', async () => {
      const received: InboundMessage[] = [];
      adapter.onMessage(async (msg) => {
        received.push(msg);
      });

      // Group chat without title property
      const ctx = makeCtx({ chatType: 'group' });
      await messageTextHandlers[0](ctx);

      expect(received).toHaveLength(1);
      expect(received[0].groupContext).toEqual({
        isGroup: true,
        groupName: undefined,
      });
    });
  });
});
