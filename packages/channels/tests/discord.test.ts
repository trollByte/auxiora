import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { InboundMessage } from '../src/types.js';

// Mock audit
vi.mock('@auxiora/audit', () => ({
  audit: vi.fn(),
}));

// Track registered event handlers
const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};

// Controllable mock channel for send/fetch
const mockChannel = {
  id: 'ch-1',
  isTextBased: () => true,
  send: vi.fn().mockResolvedValue({ id: 'sent-1' }),
  type: 0, // GuildText
};

// Mock discord.js
vi.mock('discord.js', () => {
  class MockClient {
    user: { id: string; tag: string } | null = null;
    channels = {
      cache: new Map(),
      fetch: vi.fn().mockResolvedValue(mockChannel),
    };

    on(event: string, handler: (...args: unknown[]) => void) {
      if (!eventHandlers[event]) eventHandlers[event] = [];
      eventHandlers[event].push(handler);
      return this;
    }

    async login(_token: string) {
      this.user = { id: 'bot-123', tag: 'TestBot#0001' };
      // Fire ready
      for (const h of eventHandlers['ready'] ?? []) h();
    }

    destroy() {
      // noop
    }
  }

  return {
    Client: MockClient,
    GatewayIntentBits: { Guilds: 1, GuildMessages: 2, DirectMessages: 4, MessageContent: 8 },
    Partials: { Channel: 0, Message: 1 },
    ChannelType: { GuildText: 0 },
  };
});

// Import after mocks
const { DiscordAdapter } = await import('../src/adapters/discord.js');

function makeGuildMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'msg-1',
    content: 'Hello guild!',
    author: { id: 'user-1', bot: false, displayName: 'Alice', username: 'alice' },
    channel: {
      id: 'ch-1',
      isDMBased: () => false,
      name: 'general',
      memberCount: 42,
    },
    guild: { id: 'guild-1' },
    createdTimestamp: Date.now(),
    reference: null,
    mentions: { has: () => false },
    attachments: { map: (fn: (a: unknown) => unknown) => [].map(fn) },
    ...overrides,
  };
}

function makeDMMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'msg-2',
    content: 'Hello DM!',
    author: { id: 'user-2', bot: false, displayName: 'Bob', username: 'bob' },
    channel: {
      id: 'dm-1',
      isDMBased: () => true,
    },
    guild: null,
    createdTimestamp: Date.now(),
    reference: null,
    mentions: { has: () => false },
    attachments: { map: (fn: (a: unknown) => unknown) => [].map(fn) },
    ...overrides,
  };
}

describe('DiscordAdapter', () => {
  let adapter: InstanceType<typeof DiscordAdapter>;

  beforeEach(() => {
    // Clear event handlers
    for (const key of Object.keys(eventHandlers)) {
      delete eventHandlers[key];
    }

    adapter = new DiscordAdapter({ token: 'test-token' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(adapter.type).toBe('discord');
    expect(adapter.name).toBe('Discord');
    expect(adapter.isConnected()).toBe(false);
  });

  it('should connect and disconnect', async () => {
    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  describe('groupContext', () => {
    it('should populate groupContext for guild channel messages', async () => {
      const received: InboundMessage[] = [];
      adapter.onMessage(async (msg) => {
        received.push(msg);
      });

      await adapter.connect();

      // Fire messageCreate with a guild message
      const handler = eventHandlers['messageCreate']?.[0];
      expect(handler).toBeDefined();
      await handler!(makeGuildMessage());

      expect(received).toHaveLength(1);
      expect(received[0].groupContext).toEqual({
        isGroup: true,
        groupName: 'general',
        participantCount: 42,
      });
    });

    it('should set groupContext to undefined for DM messages', async () => {
      const received: InboundMessage[] = [];
      adapter.onMessage(async (msg) => {
        received.push(msg);
      });

      await adapter.connect();

      const handler = eventHandlers['messageCreate']?.[0];
      expect(handler).toBeDefined();
      await handler!(makeDMMessage());

      expect(received).toHaveLength(1);
      expect(received[0].groupContext).toBeUndefined();
    });

    it('should handle guild channel with null memberCount', async () => {
      const received: InboundMessage[] = [];
      adapter.onMessage(async (msg) => {
        received.push(msg);
      });

      await adapter.connect();

      const handler = eventHandlers['messageCreate']?.[0];
      await handler!(makeGuildMessage({
        channel: {
          id: 'ch-2',
          isDMBased: () => false,
          name: 'private-room',
          memberCount: null,
        },
      }));

      expect(received).toHaveLength(1);
      expect(received[0].groupContext).toEqual({
        isGroup: true,
        groupName: 'private-room',
        participantCount: undefined,
      });
    });
  });
});
