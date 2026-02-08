import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WhatsAppAdapter } from '../src/adapters/whatsapp.js';

// Mock audit
vi.mock('@auxiora/audit', () => ({
  audit: vi.fn(),
}));

describe('WhatsAppAdapter', () => {
  let adapter: WhatsAppAdapter;

  beforeEach(() => {
    adapter = new WhatsAppAdapter({
      phoneNumberId: '123456789',
      accessToken: 'test-access-token',
      verifyToken: 'test-verify-token',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(adapter.type).toBe('whatsapp');
    expect(adapter.name).toBe('WhatsApp');
    expect(adapter.isConnected()).toBe(false);
  });

  it('should connect successfully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '123456789', display_phone_number: '+1234567890' }),
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

    await expect(adapter.connect()).rejects.toThrow('Failed to verify WhatsApp credentials');
  });

  it('should verify webhook subscription', () => {
    const challenge = adapter.verifyWebhook('subscribe', 'test-verify-token', 'challenge-123');
    expect(challenge).toBe('challenge-123');
  });

  it('should reject invalid webhook verification', () => {
    const challenge = adapter.verifyWebhook('subscribe', 'wrong-token', 'challenge-123');
    expect(challenge).toBeNull();
  });

  it('should reject non-subscribe mode', () => {
    const challenge = adapter.verifyWebhook('unsubscribe', 'test-verify-token', 'challenge-123');
    expect(challenge).toBeNull();
  });

  it('should handle incoming text message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '123456789' }),
    } as Response);
    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.handleWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'entry-1',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+1234567890',
                  phone_number_id: '123456789',
                },
                contacts: [
                  {
                    profile: { name: 'Alice' },
                    wa_id: '0987654321',
                  },
                ],
                messages: [
                  {
                    from: '0987654321',
                    id: 'wamid.abc123',
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'Hello WhatsApp!' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    });

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as {
      content: string;
      senderId: string;
      senderName: string;
      channelId: string;
    };
    expect(msg.content).toBe('Hello WhatsApp!');
    expect(msg.senderId).toBe('0987654321');
    expect(msg.senderName).toBe('Alice');
    expect(msg.channelId).toBe('0987654321');

    await adapter.disconnect();
  });

  it('should handle incoming image message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '123456789' }),
    } as Response);
    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.handleWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'entry-1',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+1234567890',
                  phone_number_id: '123456789',
                },
                messages: [
                  {
                    from: '0987654321',
                    id: 'wamid.img123',
                    timestamp: '1700000000',
                    type: 'image',
                    image: {
                      id: 'media-1',
                      mime_type: 'image/jpeg',
                      sha256: 'abc123',
                      caption: 'Check this out',
                    },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    });

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as {
      content: string;
      attachments: Array<{ type: string; mimeType: string }>;
    };
    expect(msg.content).toBe('Check this out');
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0].type).toBe('image');
    expect(msg.attachments[0].mimeType).toBe('image/jpeg');

    await adapter.disconnect();
  });

  it('should ignore non-whatsapp objects', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '123456789' }),
    } as Response);
    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.handleWebhook({
      object: 'instagram',
      entry: [],
    });

    expect(receivedMessages).toHaveLength(0);

    await adapter.disconnect();
  });

  it('should handle reply context', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '123456789' }),
    } as Response);
    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    await adapter.handleWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'entry-1',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+1234567890',
                  phone_number_id: '123456789',
                },
                messages: [
                  {
                    from: '0987654321',
                    id: 'wamid.reply123',
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'This is a reply' },
                    context: {
                      from: '1234567890',
                      id: 'wamid.original123',
                    },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    });

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as { replyToId: string };
    expect(msg.replyToId).toBe('wamid.original123');

    await adapter.disconnect();
  });

  it('should send a message successfully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '123456789' }),
    } as Response);
    await adapter.connect();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messaging_product: 'whatsapp',
        contacts: [{ wa_id: '0987654321' }],
        messages: [{ id: 'wamid.sent123' }],
      }),
    } as Response);

    const result = await adapter.send('0987654321', {
      content: 'Hello from bot!',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('wamid.sent123');

    await adapter.disconnect();
  });

  it('should send a reply with context', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '123456789' }),
    } as Response);
    await adapter.connect();

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        messaging_product: 'whatsapp',
        contacts: [{ wa_id: '0987654321' }],
        messages: [{ id: 'wamid.reply-sent' }],
      }),
    } as Response);

    await adapter.send('0987654321', {
      content: 'Reply',
      replyToId: 'wamid.original',
    });

    // Verify the context was included in the body
    const sendCall = fetchSpy.mock.calls.find(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('/messages')
    );
    expect(sendCall).toBeDefined();
    const body = JSON.parse(sendCall![1]?.body as string);
    expect(body.context.message_id).toBe('wamid.original');

    await adapter.disconnect();
  });

  it('should handle send errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '123456789' }),
    } as Response);
    await adapter.connect();

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'Invalid phone number',
    } as unknown as Response);

    const result = await adapter.send('invalid', {
      content: 'Should fail',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('400');

    await adapter.disconnect();
  });

  describe('sender filtering', () => {
    it('should allow all messages when allowedNumbers is not set', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '123456789' }),
      } as Response);
      await adapter.connect();

      const receivedMessages: unknown[] = [];
      adapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await adapter.handleWebhook({
        object: 'whatsapp_business_account',
        entry: [{
          id: 'entry-1',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '+1234567890', phone_number_id: '123456789' },
              messages: [{
                from: '0987654321',
                id: 'wamid.filter1',
                timestamp: '1700000000',
                type: 'text',
                text: { body: 'Hello!' },
              }],
            },
            field: 'messages',
          }],
        }],
      });

      expect(receivedMessages).toHaveLength(1);
      await adapter.disconnect();
    });

    it('should allow messages from allowed numbers', async () => {
      const filteredAdapter = new WhatsAppAdapter({
        phoneNumberId: '123456789',
        accessToken: 'test-access-token',
        verifyToken: 'test-verify-token',
        allowedNumbers: ['0987654321'],
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '123456789' }),
      } as Response);
      await filteredAdapter.connect();

      const receivedMessages: unknown[] = [];
      filteredAdapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await filteredAdapter.handleWebhook({
        object: 'whatsapp_business_account',
        entry: [{
          id: 'entry-1',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '+1234567890', phone_number_id: '123456789' },
              messages: [{
                from: '0987654321',
                id: 'wamid.filter2',
                timestamp: '1700000000',
                type: 'text',
                text: { body: 'Allowed!' },
              }],
            },
            field: 'messages',
          }],
        }],
      });

      expect(receivedMessages).toHaveLength(1);
      await filteredAdapter.disconnect();
    });

    it('should block messages from non-allowed numbers', async () => {
      const { audit } = await import('@auxiora/audit');
      const filteredAdapter = new WhatsAppAdapter({
        phoneNumberId: '123456789',
        accessToken: 'test-access-token',
        verifyToken: 'test-verify-token',
        allowedNumbers: ['0987654321'],
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '123456789' }),
      } as Response);
      await filteredAdapter.connect();

      const receivedMessages: unknown[] = [];
      filteredAdapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await filteredAdapter.handleWebhook({
        object: 'whatsapp_business_account',
        entry: [{
          id: 'entry-1',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '+1234567890', phone_number_id: '123456789' },
              messages: [{
                from: '5555555555',
                id: 'wamid.filter3',
                timestamp: '1700000000',
                type: 'text',
                text: { body: 'Blocked!' },
              }],
            },
            field: 'messages',
          }],
        }],
      });

      expect(receivedMessages).toHaveLength(0);
      expect(audit).toHaveBeenCalledWith('message.filtered', expect.objectContaining({
        channelType: 'whatsapp',
        senderId: '5555555555',
        reason: 'number_not_allowed',
      }));
      await filteredAdapter.disconnect();
    });
  });

  it('should handle message handler errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '123456789' }),
    } as Response);
    await adapter.connect();

    const errorHandler = vi.fn();
    adapter.onError(errorHandler);
    adapter.onMessage(async () => {
      throw new Error('Handler error');
    });

    await adapter.handleWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'entry-1',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '+1234567890',
                  phone_number_id: '123456789',
                },
                messages: [
                  {
                    from: '0987654321',
                    id: 'wamid.err123',
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'Trigger error' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    });

    expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));

    await adapter.disconnect();
  });
});
