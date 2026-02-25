import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BlueBubblesAdapter } from '../src/adapters/bluebubbles.js';

// Mock audit
vi.mock('@auxiora/audit', () => ({
  audit: vi.fn(),
}));

describe('BlueBubblesAdapter', () => {
  let adapter: BlueBubblesAdapter;

  beforeEach(() => {
    adapter = new BlueBubblesAdapter({
      serverUrl: 'http://localhost:1234',
      password: 'test-password',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(adapter.type).toBe('bluebubbles');
    expect(adapter.name).toBe('BlueBubbles (iMessage)');
    expect(adapter.isConnected()).toBe(false);
  });

  it('should connect successfully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, message: 'OK', data: {} }),
    } as Response);

    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('should fail to connect on API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);

    await expect(adapter.connect()).rejects.toThrow('BlueBubbles API error 401');
  });

  it('should handle incoming new-message webhook', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, message: 'OK', data: {} }),
    } as Response);
    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.handleWebhook({
      type: 'new-message',
      data: {
        guid: 'msg-guid-123',
        text: 'Hello iMessage!',
        handle: {
          address: '+1234567890',
          service: 'iMessage',
          uncanonicalizedId: 'alice@icloud.com',
        },
        chats: [
          {
            guid: 'iMessage;-;+1234567890',
            chatIdentifier: '+1234567890',
            displayName: 'Alice',
          },
        ],
        dateCreated: 1700000000000,
        isFromMe: false,
      },
    });

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as {
      content: string;
      senderId: string;
      senderName: string;
      channelId: string;
    };
    expect(msg.content).toBe('Hello iMessage!');
    expect(msg.senderId).toBe('+1234567890');
    expect(msg.senderName).toBe('alice@icloud.com');
    expect(msg.channelId).toBe('iMessage;-;+1234567890');

    await adapter.disconnect();
  });

  it('should ignore own messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, message: 'OK', data: {} }),
    } as Response);
    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.handleWebhook({
      type: 'new-message',
      data: {
        guid: 'msg-guid-own',
        text: 'My own message',
        handle: {
          address: '+1234567890',
          service: 'iMessage',
        },
        chats: [{ guid: 'iMessage;-;+1234567890', chatIdentifier: '+1234567890' }],
        dateCreated: 1700000000000,
        isFromMe: true,
      },
    });

    expect(receivedMessages).toHaveLength(0);

    await adapter.disconnect();
  });

  it('should ignore non-new-message events', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, message: 'OK', data: {} }),
    } as Response);
    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.handleWebhook({
      type: 'updated-message',
      data: {
        guid: 'msg-guid-update',
        text: 'Updated',
        dateCreated: 1700000000000,
        isFromMe: false,
      },
    });

    expect(receivedMessages).toHaveLength(0);

    await adapter.disconnect();
  });

  it('should handle messages with attachments', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, message: 'OK', data: {} }),
    } as Response);
    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.handleWebhook({
      type: 'new-message',
      data: {
        guid: 'msg-guid-attach',
        text: 'Check this photo',
        handle: {
          address: '+1234567890',
          service: 'iMessage',
        },
        chats: [{ guid: 'iMessage;-;+1234567890', chatIdentifier: '+1234567890' }],
        dateCreated: 1700000000000,
        isFromMe: false,
        attachments: [
          {
            guid: 'att-1',
            mimeType: 'image/jpeg',
            transferName: 'photo.jpg',
            totalBytes: 1024000,
          },
        ],
      },
    });

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as {
      attachments: Array<{ type: string; mimeType: string; filename: string }>;
    };
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0].type).toBe('image');
    expect(msg.attachments[0].mimeType).toBe('image/jpeg');
    expect(msg.attachments[0].filename).toBe('photo.jpg');

    await adapter.disconnect();
  });

  it('should handle reply threads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, message: 'OK', data: {} }),
    } as Response);
    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.handleWebhook({
      type: 'new-message',
      data: {
        guid: 'msg-guid-reply',
        text: 'This is a reply',
        handle: { address: '+1234567890', service: 'iMessage' },
        chats: [{ guid: 'iMessage;-;+1234567890', chatIdentifier: '+1234567890' }],
        dateCreated: 1700000000000,
        isFromMe: false,
        threadOriginatorGuid: 'msg-guid-original',
      },
    });

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as { replyToId: string };
    expect(msg.replyToId).toBe('msg-guid-original');

    await adapter.disconnect();
  });

  it('should send a message successfully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, message: 'OK', data: {} }),
    } as Response);
    await adapter.connect();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 200,
        message: 'Message sent!',
        data: {
          guid: 'msg-sent-guid',
          text: 'Hello from bot!',
          dateCreated: 1700000001000,
          isFromMe: true,
        },
      }),
    } as Response);

    const result = await adapter.send('iMessage;-;+1234567890', {
      content: 'Hello from bot!',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-sent-guid');

    await adapter.disconnect();
  });

  it('should handle send errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, message: 'OK', data: {} }),
    } as Response);
    await adapter.connect();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    const result = await adapter.send('iMessage;-;+1234567890', {
      content: 'Should fail',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');

    await adapter.disconnect();
  });

  it('should send reply with selectedMessageGuid', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, message: 'OK', data: {} }),
    } as Response);
    await adapter.connect();

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 200,
        message: 'Message sent!',
        data: {
          guid: 'msg-reply-sent',
          text: 'Reply',
          dateCreated: 1700000001000,
          isFromMe: true,
        },
      }),
    } as Response);

    await adapter.send('iMessage;-;+1234567890', {
      content: 'Reply',
      replyToId: 'msg-guid-original',
    });

    const sendCall = fetchSpy.mock.calls.find(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('/api/v1/message/text'),
    );
    expect(sendCall).toBeDefined();
    const body = JSON.parse(sendCall![1]?.body as string);
    expect(body.selectedMessageGuid).toBe('msg-guid-original');

    await adapter.disconnect();
  });

  it('should register error handler', () => {
    const handler = vi.fn();
    adapter.onError(handler);
  });

  describe('sender filtering', () => {
    it('should allow all messages when allowedAddresses is not set', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 200, message: 'OK', data: {} }),
      } as Response);
      await adapter.connect();

      const receivedMessages: unknown[] = [];
      adapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await adapter.handleWebhook({
        type: 'new-message',
        data: {
          guid: 'msg-filter-1',
          text: 'Hello!',
          handle: { address: '+anyone', service: 'iMessage' },
          chats: [{ guid: 'iMessage;-;+anyone', chatIdentifier: '+anyone' }],
          dateCreated: 1700000000000,
          isFromMe: false,
        },
      });

      expect(receivedMessages).toHaveLength(1);
      await adapter.disconnect();
    });

    it('should block messages from non-allowed addresses', async () => {
      const { audit } = await import('@auxiora/audit');
      const filteredAdapter = new BlueBubblesAdapter({
        serverUrl: 'http://localhost:1234',
        password: 'test-password',
        allowedAddresses: ['+1234567890'],
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 200, message: 'OK', data: {} }),
      } as Response);
      await filteredAdapter.connect();

      const receivedMessages: unknown[] = [];
      filteredAdapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await filteredAdapter.handleWebhook({
        type: 'new-message',
        data: {
          guid: 'msg-filter-blocked',
          text: 'Blocked!',
          handle: { address: '+5555555555', service: 'iMessage' },
          chats: [{ guid: 'iMessage;-;+5555555555', chatIdentifier: '+5555555555' }],
          dateCreated: 1700000000000,
          isFromMe: false,
        },
      });

      expect(receivedMessages).toHaveLength(0);
      expect(audit).toHaveBeenCalledWith(
        'message.filtered',
        expect.objectContaining({
          channelType: 'bluebubbles',
          senderId: '+5555555555',
          reason: 'address_not_allowed',
        }),
      );
      await filteredAdapter.disconnect();
    });
  });

  it('should handle message handler errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, message: 'OK', data: {} }),
    } as Response);
    await adapter.connect();

    const errorHandler = vi.fn();
    adapter.onError(errorHandler);
    adapter.onMessage(async () => {
      throw new Error('Handler error');
    });

    await adapter.handleWebhook({
      type: 'new-message',
      data: {
        guid: 'msg-err',
        text: 'Trigger error',
        handle: { address: '+1234567890', service: 'iMessage' },
        chats: [{ guid: 'iMessage;-;+1234567890', chatIdentifier: '+1234567890' }],
        dateCreated: 1700000000000,
        isFromMe: false,
      },
    });

    expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));

    await adapter.disconnect();
  });
});
