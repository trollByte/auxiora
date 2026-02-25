import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SlackAdapter } from '../src/adapters/slack.js';

// Mock audit
vi.mock('@auxiora/audit', () => ({
  audit: vi.fn(),
}));

// Track registered event handlers
let messageHandlers: Array<(args: unknown) => Promise<void>> = [];
let mentionHandlers: Array<(args: unknown) => Promise<void>> = [];
let errorHandlers: Array<(error: Error) => Promise<void>> = [];

// Mock @slack/bolt
vi.mock('@slack/bolt', () => {
  class MockApp {
    client = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: 'U_BOT' }) },
      chat: { postMessage: vi.fn().mockResolvedValue({ ts: '1234567890.123456' }) },
    };
    message = vi.fn((handler: (args: unknown) => Promise<void>) => {
      messageHandlers.push(handler);
    });
    event = vi.fn((eventName: string, handler: (args: unknown) => Promise<void>) => {
      if (eventName === 'app_mention') {
        mentionHandlers.push(handler);
      }
    });
    error = vi.fn((handler: (error: Error) => Promise<void>) => {
      errorHandlers.push(handler);
    });
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
  }

  return {
    App: MockApp,
    LogLevel: { WARN: 'warn' },
  };
});

describe('SlackAdapter', () => {
  let adapter: SlackAdapter;

  beforeEach(() => {
    messageHandlers = [];
    mentionHandlers = [];
    errorHandlers = [];

    adapter = new SlackAdapter({
      botToken: 'xoxb-test-token',
      appToken: 'xapp-test-token',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(adapter.type).toBe('slack');
    expect(adapter.name).toBe('Slack');
    expect(adapter.isConnected()).toBe(false);
  });

  it('should connect and disconnect', async () => {
    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('should handle incoming messages', async () => {
    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.connect();

    // Simulate a message event
    const handler = messageHandlers[0];
    await handler({
      message: {
        ts: '1700000000.000001',
        channel: 'C123',
        user: 'U_ALICE',
        text: 'Hello Slack!',
      },
      say: vi.fn(),
      client: { auth: { test: vi.fn().mockResolvedValue({ user_id: 'U_BOT' }) } },
    });

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as { content: string; senderId: string; channelId: string };
    expect(msg.content).toBe('Hello Slack!');
    expect(msg.senderId).toBe('U_ALICE');
    expect(msg.channelId).toBe('C123');

    await adapter.disconnect();
  });

  it('should handle app_mention events', async () => {
    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.connect();

    const handler = mentionHandlers[0];
    await handler({
      event: {
        ts: '1700000000.000002',
        channel: 'C123',
        user: 'U_BOB',
        text: '<@U_BOT> hello!',
      },
      client: { auth: { test: vi.fn().mockResolvedValue({ user_id: 'U_BOT' }) } },
    });

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as { content: string };
    expect(msg.content).toBe('hello!');

    await adapter.disconnect();
  });

  describe('sender filtering', () => {
    it('should allow all messages when allowlists are not set', async () => {
      const receivedMessages: unknown[] = [];
      adapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await adapter.connect();

      const handler = messageHandlers[0];
      await handler({
        message: {
          ts: '1700000000.000003',
          channel: 'C_ANY',
          user: 'U_ANYONE',
          text: 'Anyone!',
        },
        say: vi.fn(),
        client: { auth: { test: vi.fn().mockResolvedValue({ user_id: 'U_BOT' }) } },
      });

      expect(receivedMessages).toHaveLength(1);
      await adapter.disconnect();
    });

    it('should allow messages from allowed users in allowed channels', async () => {
      messageHandlers = [];
      mentionHandlers = [];
      const filteredAdapter = new SlackAdapter({
        botToken: 'xoxb-test-token',
        appToken: 'xapp-test-token',
        allowedChannels: ['C123'],
        allowedUsers: ['U_ALICE'],
      });

      const receivedMessages: unknown[] = [];
      filteredAdapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await filteredAdapter.connect();

      const handler = messageHandlers[0];
      await handler({
        message: {
          ts: '1700000000.000004',
          channel: 'C123',
          user: 'U_ALICE',
          text: 'Allowed!',
        },
        say: vi.fn(),
        client: { auth: { test: vi.fn().mockResolvedValue({ user_id: 'U_BOT' }) } },
      });

      expect(receivedMessages).toHaveLength(1);
      await filteredAdapter.disconnect();
    });

    it('should block messages from non-allowed channels', async () => {
      const { audit } = await import('@auxiora/audit');
      messageHandlers = [];
      mentionHandlers = [];
      const filteredAdapter = new SlackAdapter({
        botToken: 'xoxb-test-token',
        appToken: 'xapp-test-token',
        allowedChannels: ['C123'],
      });

      const receivedMessages: unknown[] = [];
      filteredAdapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await filteredAdapter.connect();

      const handler = messageHandlers[0];
      await handler({
        message: {
          ts: '1700000000.000005',
          channel: 'C_WRONG',
          user: 'U_ALICE',
          text: 'Wrong channel!',
        },
        say: vi.fn(),
        client: { auth: { test: vi.fn().mockResolvedValue({ user_id: 'U_BOT' }) } },
      });

      expect(receivedMessages).toHaveLength(0);
      expect(audit).toHaveBeenCalledWith('message.filtered', expect.objectContaining({
        channelType: 'slack',
        channelId: 'C_WRONG',
        reason: 'channel_not_allowed',
      }));
      await filteredAdapter.disconnect();
    });

    it('should block messages from non-allowed users', async () => {
      const { audit } = await import('@auxiora/audit');
      messageHandlers = [];
      mentionHandlers = [];
      const filteredAdapter = new SlackAdapter({
        botToken: 'xoxb-test-token',
        appToken: 'xapp-test-token',
        allowedUsers: ['U_ALICE'],
      });

      const receivedMessages: unknown[] = [];
      filteredAdapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await filteredAdapter.connect();

      const handler = messageHandlers[0];
      await handler({
        message: {
          ts: '1700000000.000006',
          channel: 'C123',
          user: 'U_EVE',
          text: 'Blocked user!',
        },
        say: vi.fn(),
        client: { auth: { test: vi.fn().mockResolvedValue({ user_id: 'U_BOT' }) } },
      });

      expect(receivedMessages).toHaveLength(0);
      expect(audit).toHaveBeenCalledWith('message.filtered', expect.objectContaining({
        channelType: 'slack',
        senderId: 'U_EVE',
        reason: 'user_not_allowed',
      }));
      await filteredAdapter.disconnect();
    });

    it('should block app_mention from non-allowed channels', async () => {
      const { audit } = await import('@auxiora/audit');
      messageHandlers = [];
      mentionHandlers = [];
      const filteredAdapter = new SlackAdapter({
        botToken: 'xoxb-test-token',
        appToken: 'xapp-test-token',
        allowedChannels: ['C123'],
      });

      const receivedMessages: unknown[] = [];
      filteredAdapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await filteredAdapter.connect();

      const handler = mentionHandlers[0];
      await handler({
        event: {
          ts: '1700000000.000007',
          channel: 'C_WRONG',
          user: 'U_ALICE',
          text: '<@U_BOT> blocked mention!',
        },
        client: { auth: { test: vi.fn().mockResolvedValue({ user_id: 'U_BOT' }) } },
      });

      expect(receivedMessages).toHaveLength(0);
      expect(audit).toHaveBeenCalledWith('message.filtered', expect.objectContaining({
        channelType: 'slack',
        channelId: 'C_WRONG',
        reason: 'channel_not_allowed',
      }));
      await filteredAdapter.disconnect();
    });

    it('should block app_mention from non-allowed users', async () => {
      const { audit } = await import('@auxiora/audit');
      messageHandlers = [];
      mentionHandlers = [];
      const filteredAdapter = new SlackAdapter({
        botToken: 'xoxb-test-token',
        appToken: 'xapp-test-token',
        allowedUsers: ['U_ALICE'],
      });

      const receivedMessages: unknown[] = [];
      filteredAdapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await filteredAdapter.connect();

      const handler = mentionHandlers[0];
      await handler({
        event: {
          ts: '1700000000.000008',
          channel: 'C123',
          user: 'U_EVE',
          text: '<@U_BOT> blocked mention!',
        },
        client: { auth: { test: vi.fn().mockResolvedValue({ user_id: 'U_BOT' }) } },
      });

      expect(receivedMessages).toHaveLength(0);
      expect(audit).toHaveBeenCalledWith('message.filtered', expect.objectContaining({
        channelType: 'slack',
        senderId: 'U_EVE',
        reason: 'user_not_allowed',
      }));
      await filteredAdapter.disconnect();
    });
  });

  describe('groupContext', () => {
    it('should set groupContext.isGroup for channel messages', async () => {
      const receivedMessages: unknown[] = [];
      adapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await adapter.connect();

      const handler = messageHandlers[0];
      await handler({
        message: {
          ts: '1700000000.000010',
          channel: 'C123',
          user: 'U_ALICE',
          text: 'Channel message',
          channel_type: 'channel',
        },
        say: vi.fn(),
        client: { auth: { test: vi.fn().mockResolvedValue({ user_id: 'U_BOT' }) } },
      });

      expect(receivedMessages).toHaveLength(1);
      const msg = receivedMessages[0] as { groupContext?: { isGroup: boolean } };
      expect(msg.groupContext).toEqual({ isGroup: true });

      await adapter.disconnect();
    });

    it('should leave groupContext undefined for DM messages', async () => {
      const receivedMessages: unknown[] = [];
      adapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await adapter.connect();

      const handler = messageHandlers[0];
      await handler({
        message: {
          ts: '1700000000.000011',
          channel: 'D123',
          user: 'U_ALICE',
          text: 'DM message',
          channel_type: 'im',
        },
        say: vi.fn(),
        client: { auth: { test: vi.fn().mockResolvedValue({ user_id: 'U_BOT' }) } },
      });

      expect(receivedMessages).toHaveLength(1);
      const msg = receivedMessages[0] as { groupContext?: unknown };
      expect(msg.groupContext).toBeUndefined();

      await adapter.disconnect();
    });

    it('should set groupContext with groupName for app_mention in channels', async () => {
      const receivedMessages: unknown[] = [];
      adapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await adapter.connect();

      const handler = mentionHandlers[0];
      await handler({
        event: {
          ts: '1700000000.000012',
          channel: 'C123',
          user: 'U_BOB',
          text: '<@U_BOT> hi!',
          channel_type: 'channel',
          channel_name: 'general',
        },
        client: { auth: { test: vi.fn().mockResolvedValue({ user_id: 'U_BOT' }) } },
      });

      expect(receivedMessages).toHaveLength(1);
      const msg = receivedMessages[0] as { groupContext?: { isGroup: boolean; groupName?: string } };
      expect(msg.groupContext).toEqual({ isGroup: true, groupName: 'general' });

      await adapter.disconnect();
    });

    it('should leave groupContext undefined for app_mention in DMs', async () => {
      const receivedMessages: unknown[] = [];
      adapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await adapter.connect();

      const handler = mentionHandlers[0];
      await handler({
        event: {
          ts: '1700000000.000013',
          channel: 'D123',
          user: 'U_BOB',
          text: '<@U_BOT> hi!',
          channel_type: 'im',
        },
        client: { auth: { test: vi.fn().mockResolvedValue({ user_id: 'U_BOT' }) } },
      });

      expect(receivedMessages).toHaveLength(1);
      const msg = receivedMessages[0] as { groupContext?: unknown };
      expect(msg.groupContext).toBeUndefined();

      await adapter.disconnect();
    });
  });

  it('should register error handler', () => {
    const handler = vi.fn();
    adapter.onError(handler);
  });
});
