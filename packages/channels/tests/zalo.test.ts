import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZaloAdapter } from '../src/adapters/zalo.js';

// Mock audit
vi.mock('@auxiora/audit', () => ({
  audit: vi.fn(),
}));

describe('ZaloAdapter', () => {
  let adapter: ZaloAdapter;

  beforeEach(() => {
    adapter = new ZaloAdapter({
      oaAccessToken: 'test-access-token',
      oaSecretKey: 'test-secret-key',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(adapter.type).toBe('zalo');
    expect(adapter.name).toBe('Zalo');
    expect(adapter.isConnected()).toBe(false);
  });

  it('should connect successfully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 0, message: 'Success', data: {} }),
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

    await expect(adapter.connect()).rejects.toThrow('Failed to verify Zalo credentials');
  });

  it('should fail to connect on API error code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: -216, message: 'Invalid access token' }),
    } as Response);

    await expect(adapter.connect()).rejects.toThrow('Zalo API error: Invalid access token');
  });

  it('should handle incoming text message', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 0, message: 'Success', data: {} }),
      } as Response)
      // getUserName call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: 0,
          message: 'Success',
          data: { display_name: 'Alice', user_id: 'user-1' },
        }),
      } as Response);

    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.handleWebhook({
      app_id: 'app-1',
      sender: { id: 'user-1' },
      recipient: { id: 'oa-1' },
      event_name: 'user_send_text',
      message: {
        msg_id: 'msg-1',
        text: 'Hello Zalo!',
      },
      timestamp: '1700000000000',
    });

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as {
      content: string;
      senderId: string;
      senderName: string;
      channelId: string;
    };
    expect(msg.content).toBe('Hello Zalo!');
    expect(msg.senderId).toBe('user-1');
    expect(msg.senderName).toBe('Alice');
    expect(msg.channelId).toBe('user-1');

    await adapter.disconnect();
  });

  it('should handle incoming image message', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 0, message: 'Success', data: {} }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: 0,
          data: { display_name: 'Alice', user_id: 'user-1' },
        }),
      } as Response);

    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.handleWebhook({
      app_id: 'app-1',
      sender: { id: 'user-1' },
      recipient: { id: 'oa-1' },
      event_name: 'user_send_image',
      message: {
        msg_id: 'msg-img-1',
        attachments: [
          {
            type: 'image',
            payload: {
              url: 'https://example.com/photo.jpg',
              thumbnail: 'https://example.com/photo_thumb.jpg',
            },
          },
        ],
      },
      timestamp: '1700000000000',
    });

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as {
      content: string;
      attachments: Array<{ type: string; url: string }>;
    };
    expect(msg.content).toBe('');
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0].type).toBe('image');
    expect(msg.attachments[0].url).toBe('https://example.com/photo.jpg');

    await adapter.disconnect();
  });

  it('should ignore unsupported event types', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 0, message: 'Success', data: {} }),
    } as Response);
    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.handleWebhook({
      app_id: 'app-1',
      sender: { id: 'user-1' },
      recipient: { id: 'oa-1' },
      event_name: 'user_seen_message',
      timestamp: '1700000000000',
    });

    expect(receivedMessages).toHaveLength(0);

    await adapter.disconnect();
  });

  it('should handle reply context', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 0, message: 'Success', data: {} }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 0, data: { display_name: 'Bob', user_id: 'user-2' } }),
      } as Response);

    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.handleWebhook({
      app_id: 'app-1',
      sender: { id: 'user-2' },
      recipient: { id: 'oa-1' },
      event_name: 'user_send_text',
      message: {
        msg_id: 'msg-reply',
        text: 'This is a reply',
        quote_msg_id: 'msg-original',
      },
      timestamp: '1700000000000',
    });

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as { replyToId: string };
    expect(msg.replyToId).toBe('msg-original');

    await adapter.disconnect();
  });

  it('should send a message successfully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 0, message: 'Success', data: {} }),
    } as Response);
    await adapter.connect();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        error: 0,
        message: 'Success',
        data: { message_id: 'msg-sent-1' },
      }),
    } as Response);

    const result = await adapter.send('user-1', {
      content: 'Hello from bot!',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-sent-1');

    await adapter.disconnect();
  });

  it('should handle send errors from HTTP', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 0, message: 'Success', data: {} }),
    } as Response);
    await adapter.connect();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Server error',
    } as unknown as Response);

    const result = await adapter.send('user-1', {
      content: 'Should fail',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');

    await adapter.disconnect();
  });

  it('should handle send errors from API error code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 0, message: 'Success', data: {} }),
    } as Response);
    await adapter.connect();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        error: -201,
        message: 'User not found',
      }),
    } as Response);

    const result = await adapter.send('invalid-user', {
      content: 'Should fail',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('User not found');

    await adapter.disconnect();
  });

  it('should send a reply with quote_message_id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 0, message: 'Success', data: {} }),
    } as Response);
    await adapter.connect();

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        error: 0,
        message: 'Success',
        data: { message_id: 'msg-reply-sent' },
      }),
    } as Response);

    await adapter.send('user-1', {
      content: 'Reply',
      replyToId: 'msg-original',
    });

    const sendCall = fetchSpy.mock.calls.find(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('/message/cs'),
    );
    expect(sendCall).toBeDefined();
    const body = JSON.parse(sendCall![1]?.body as string);
    expect(body.quote_message_id).toBe('msg-original');

    await adapter.disconnect();
  });

  it('should verify webhook signature', () => {
    // The HMAC is deterministic based on key + body
    const body = '{"test":"data"}';
    const signature = adapter.verifyWebhookSignature(body, 'wrong-sig');
    expect(signature).toBe(false);
  });

  it('should register error handler', () => {
    const handler = vi.fn();
    adapter.onError(handler);
  });

  describe('sender filtering', () => {
    it('should allow all messages when allowedUserIds is not set', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ error: 0, message: 'Success', data: {} }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ error: 0, data: { display_name: 'Anyone', user_id: 'any' } }),
        } as Response);

      await adapter.connect();

      const receivedMessages: unknown[] = [];
      adapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await adapter.handleWebhook({
        app_id: 'app-1',
        sender: { id: 'any-user' },
        recipient: { id: 'oa-1' },
        event_name: 'user_send_text',
        message: { msg_id: 'msg-filter-1', text: 'Hello!' },
        timestamp: '1700000000000',
      });

      expect(receivedMessages).toHaveLength(1);
      await adapter.disconnect();
    });

    it('should block messages from non-allowed users', async () => {
      const { audit } = await import('@auxiora/audit');
      const filteredAdapter = new ZaloAdapter({
        oaAccessToken: 'test-access-token',
        oaSecretKey: 'test-secret-key',
        allowedUserIds: ['user-1'],
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 0, message: 'Success', data: {} }),
      } as Response);
      await filteredAdapter.connect();

      const receivedMessages: unknown[] = [];
      filteredAdapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await filteredAdapter.handleWebhook({
        app_id: 'app-1',
        sender: { id: 'user-2' },
        recipient: { id: 'oa-1' },
        event_name: 'user_send_text',
        message: { msg_id: 'msg-filter-blocked', text: 'Blocked!' },
        timestamp: '1700000000000',
      });

      expect(receivedMessages).toHaveLength(0);
      expect(audit).toHaveBeenCalledWith(
        'message.filtered',
        expect.objectContaining({
          channelType: 'zalo',
          senderId: 'user-2',
          reason: 'user_not_allowed',
        }),
      );
      await filteredAdapter.disconnect();
    });
  });

  it('should handle message handler errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 0, message: 'Success', data: {} }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 0, data: { display_name: 'Alice', user_id: 'user-1' } }),
      } as Response);

    await adapter.connect();

    const errorHandler = vi.fn();
    adapter.onError(errorHandler);
    adapter.onMessage(async () => {
      throw new Error('Handler error');
    });

    await adapter.handleWebhook({
      app_id: 'app-1',
      sender: { id: 'user-1' },
      recipient: { id: 'oa-1' },
      event_name: 'user_send_text',
      message: { msg_id: 'msg-err', text: 'Trigger error' },
      timestamp: '1700000000000',
    });

    expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));

    await adapter.disconnect();
  });

  it('should cache user names', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 0, message: 'Success', data: {} }),
      } as Response)
      // First getUserName call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 0, data: { display_name: 'Alice', user_id: 'user-1' } }),
      } as Response);

    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    // First message from user-1
    await adapter.handleWebhook({
      app_id: 'app-1',
      sender: { id: 'user-1' },
      recipient: { id: 'oa-1' },
      event_name: 'user_send_text',
      message: { msg_id: 'msg-cache-1', text: 'Hello 1' },
      timestamp: '1700000000000',
    });

    // Second message from user-1 - should use cache
    await adapter.handleWebhook({
      app_id: 'app-1',
      sender: { id: 'user-1' },
      recipient: { id: 'oa-1' },
      event_name: 'user_send_text',
      message: { msg_id: 'msg-cache-2', text: 'Hello 2' },
      timestamp: '1700000001000',
    });

    expect(receivedMessages).toHaveLength(2);
    // 1 connect + 1 getUserName = 2 total fetch calls (second message uses cache)
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await adapter.disconnect();
  });
});
