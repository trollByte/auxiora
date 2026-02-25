import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleChatAdapter } from '../src/adapters/googlechat.js';

// Mock audit
vi.mock('@auxiora/audit', () => ({
  audit: vi.fn(),
}));

// Mock crypto.subtle for JWT signing
const mockCryptoKey = {} as CryptoKey;
const originalSubtle = globalThis.crypto?.subtle;

const TEST_SERVICE_ACCOUNT = JSON.stringify({
  client_email: 'bot@project.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBg==\n-----END PRIVATE KEY-----',
  token_uri: 'https://oauth2.googleapis.com/token',
});

describe('GoogleChatAdapter', () => {
  let adapter: GoogleChatAdapter;

  beforeEach(() => {
    adapter = new GoogleChatAdapter({
      serviceAccountKey: TEST_SERVICE_ACCOUNT,
    });

    // Mock crypto.subtle
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        subtle: {
          importKey: vi.fn().mockResolvedValue(mockCryptoKey),
          sign: vi.fn().mockResolvedValue(new ArrayBuffer(256)),
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSubtle) {
      Object.defineProperty(globalThis, 'crypto', {
        value: { subtle: originalSubtle },
        writable: true,
        configurable: true,
      });
    }
  });

  it('should have correct metadata', () => {
    expect(adapter.type).toBe('googlechat');
    expect(adapter.name).toBe('Google Chat');
    expect(adapter.isConnected()).toBe(false);
  });

  it('should connect successfully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    } as Response);

    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('should fail to connect with invalid credentials', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);

    await expect(adapter.connect()).rejects.toThrow('Failed to obtain Google Chat token');
  });

  it('should handle incoming MESSAGE event', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    } as Response);
    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.handleWebhook({
      type: 'MESSAGE',
      eventTime: '2024-01-01T00:00:00Z',
      message: {
        name: 'spaces/space-1/messages/msg-1',
        sender: {
          name: 'users/user-1',
          displayName: 'Alice',
          type: 'HUMAN',
        },
        createTime: '2024-01-01T00:00:00Z',
        text: 'Hello Google Chat!',
        space: {
          name: 'spaces/space-1',
          type: 'ROOM',
          displayName: 'Test Space',
        },
        argumentText: 'Hello Google Chat!',
      },
    });

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as {
      content: string;
      senderId: string;
      senderName: string;
      channelId: string;
    };
    expect(msg.content).toBe('Hello Google Chat!');
    expect(msg.senderId).toBe('users/user-1');
    expect(msg.senderName).toBe('Alice');
    expect(msg.channelId).toBe('spaces/space-1');

    await adapter.disconnect();
  });

  it('should use argumentText to strip mentions', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    } as Response);
    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.handleWebhook({
      type: 'MESSAGE',
      eventTime: '2024-01-01T00:00:00Z',
      message: {
        name: 'spaces/space-1/messages/msg-2',
        sender: {
          name: 'users/user-1',
          displayName: 'Alice',
          type: 'HUMAN',
        },
        createTime: '2024-01-01T00:00:00Z',
        text: '@Bot what is the weather?',
        space: {
          name: 'spaces/space-1',
          type: 'ROOM',
        },
        argumentText: ' what is the weather?',
      },
    });

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as { content: string };
    expect(msg.content).toBe('what is the weather?');

    await adapter.disconnect();
  });

  it('should ignore non-MESSAGE events', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    } as Response);
    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.handleWebhook({
      type: 'ADDED_TO_SPACE',
      eventTime: '2024-01-01T00:00:00Z',
      space: {
        name: 'spaces/space-1',
        type: 'ROOM',
      },
      user: {
        name: 'users/user-1',
        displayName: 'Alice',
        type: 'HUMAN',
      },
    });

    expect(receivedMessages).toHaveLength(0);

    await adapter.disconnect();
  });

  it('should send a message successfully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    } as Response);
    await adapter.connect();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'spaces/space-1/messages/msg-sent-1',
        sender: { name: 'users/bot', displayName: 'Bot' },
        createTime: '2024-01-01T00:00:01Z',
        text: 'Hello from bot!',
        thread: { name: 'spaces/space-1/threads/thread-1' },
      }),
    } as Response);

    const result = await adapter.send('spaces/space-1', {
      content: 'Hello from bot!',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('spaces/space-1/messages/msg-sent-1');

    await adapter.disconnect();
  });

  it('should handle send errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    } as Response);
    await adapter.connect();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'Bot not authorized',
    } as unknown as Response);

    const result = await adapter.send('spaces/space-1', {
      content: 'Should fail',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('403');

    await adapter.disconnect();
  });

  it('should cache access token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    } as Response);
    await adapter.connect();

    // Send two messages - should only call token endpoint once
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'spaces/space-1/messages/msg-1',
        sender: { name: 'users/bot', displayName: 'Bot' },
        createTime: '2024-01-01T00:00:01Z',
        text: 'Message 1',
        thread: { name: 'spaces/space-1/threads/t1' },
      }),
    } as Response);
    await adapter.send('spaces/space-1', { content: 'Message 1' });

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'spaces/space-1/messages/msg-2',
        sender: { name: 'users/bot', displayName: 'Bot' },
        createTime: '2024-01-01T00:00:02Z',
        text: 'Message 2',
        thread: { name: 'spaces/space-1/threads/t1' },
      }),
    } as Response);
    await adapter.send('spaces/space-1', { content: 'Message 2' });

    // 1 token call (connect) + 2 send calls = 3 total
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    await adapter.disconnect();
  });

  it('should register error handler', () => {
    const handler = vi.fn();
    adapter.onError(handler);
  });

  it('should return noop for startTyping', async () => {
    const cleanup = await adapter.startTyping('spaces/space-1');
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  describe('space filtering', () => {
    it('should allow all messages when allowedSpaces is not set', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      } as Response);
      await adapter.connect();

      const receivedMessages: unknown[] = [];
      adapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await adapter.handleWebhook({
        type: 'MESSAGE',
        eventTime: '2024-01-01T00:00:00Z',
        message: {
          name: 'spaces/any-space/messages/msg-1',
          sender: { name: 'users/user-1', displayName: 'Alice', type: 'HUMAN' },
          createTime: '2024-01-01T00:00:00Z',
          text: 'Hello!',
          space: { name: 'spaces/any-space', type: 'ROOM' },
        },
      });

      expect(receivedMessages).toHaveLength(1);
      await adapter.disconnect();
    });

    it('should block messages from non-allowed spaces', async () => {
      const { audit } = await import('@auxiora/audit');
      const filteredAdapter = new GoogleChatAdapter({
        serviceAccountKey: TEST_SERVICE_ACCOUNT,
        allowedSpaces: ['spaces/allowed-space'],
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      } as Response);
      await filteredAdapter.connect();

      const receivedMessages: unknown[] = [];
      filteredAdapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await filteredAdapter.handleWebhook({
        type: 'MESSAGE',
        eventTime: '2024-01-01T00:00:00Z',
        message: {
          name: 'spaces/blocked-space/messages/msg-1',
          sender: { name: 'users/user-1', displayName: 'Alice', type: 'HUMAN' },
          createTime: '2024-01-01T00:00:00Z',
          text: 'Blocked!',
          space: { name: 'spaces/blocked-space', type: 'ROOM' },
        },
      });

      expect(receivedMessages).toHaveLength(0);
      expect(audit).toHaveBeenCalledWith(
        'message.filtered',
        expect.objectContaining({
          channelType: 'googlechat',
          reason: 'space_not_allowed',
        }),
      );
      await filteredAdapter.disconnect();
    });
  });

  it('should handle message handler errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    } as Response);
    await adapter.connect();

    const errorHandler = vi.fn();
    adapter.onError(errorHandler);
    adapter.onMessage(async () => {
      throw new Error('Handler error');
    });

    await adapter.handleWebhook({
      type: 'MESSAGE',
      eventTime: '2024-01-01T00:00:00Z',
      message: {
        name: 'spaces/space-1/messages/msg-err',
        sender: { name: 'users/user-1', displayName: 'Alice', type: 'HUMAN' },
        createTime: '2024-01-01T00:00:00Z',
        text: 'Trigger error',
        space: { name: 'spaces/space-1', type: 'ROOM' },
      },
    });

    expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));

    await adapter.disconnect();
  });
});
