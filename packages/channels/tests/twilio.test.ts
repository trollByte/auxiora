import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TwilioAdapter } from '../src/adapters/twilio.js';
import type { TwilioWebhookBody } from '../src/adapters/twilio.js';

// Mock audit
vi.mock('@auxiora/audit', () => ({
  audit: vi.fn(),
}));

// Mock twilio
vi.mock('twilio', () => {
  const mockCreate = vi.fn().mockResolvedValue({ sid: 'SM123' });
  const mockFetch = vi.fn().mockResolvedValue({ sid: 'AC123' });
  const mockTwilio = vi.fn(() => ({
    api: { accounts: vi.fn(() => ({ fetch: mockFetch })) },
    messages: { create: mockCreate },
  }));
  // Add validateRequest as a static method
  mockTwilio.validateRequest = vi.fn(() => true);
  return { default: mockTwilio };
});

describe('TwilioAdapter', () => {
  let adapter: TwilioAdapter;

  beforeEach(() => {
    adapter = new TwilioAdapter({
      accountSid: 'AC123',
      authToken: 'test-auth-token',
      phoneNumber: '+1234567890',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(adapter.type).toBe('twilio');
    expect(adapter.name).toBe('Twilio');
    expect(adapter.isConnected()).toBe(false);
  });

  it('should connect successfully', async () => {
    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('should handle incoming SMS webhook', async () => {
    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    const body: TwilioWebhookBody = {
      MessageSid: 'SM456',
      AccountSid: 'AC123',
      From: '+0987654321',
      To: '+1234567890',
      Body: 'Hello via SMS!',
    };

    const result = await adapter.handleWebhook(body);

    expect(result).toBeNull();
    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as { content: string; senderId: string; channelId: string };
    expect(msg.content).toBe('Hello via SMS!');
    expect(msg.senderId).toBe('+0987654321');
    expect(msg.channelId).toBe('sms');

    await adapter.disconnect();
  });

  it('should handle incoming WhatsApp webhook', async () => {
    await adapter.connect();

    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    const body: TwilioWebhookBody = {
      MessageSid: 'SM789',
      AccountSid: 'AC123',
      From: 'whatsapp:+0987654321',
      To: 'whatsapp:+1234567890',
      Body: 'Hello via WhatsApp!',
    };

    await adapter.handleWebhook(body);

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as { channelId: string };
    expect(msg.channelId).toBe('whatsapp');

    await adapter.disconnect();
  });

  describe('sender filtering', () => {
    it('should allow all messages when allowedNumbers is not set', async () => {
      await adapter.connect();

      const receivedMessages: unknown[] = [];
      adapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await adapter.handleWebhook({
        MessageSid: 'SM001',
        AccountSid: 'AC123',
        From: '+5555555555',
        To: '+1234567890',
        Body: 'Anyone!',
      });

      expect(receivedMessages).toHaveLength(1);
      await adapter.disconnect();
    });

    it('should allow messages from allowed numbers', async () => {
      const filteredAdapter = new TwilioAdapter({
        accountSid: 'AC123',
        authToken: 'test-auth-token',
        phoneNumber: '+1234567890',
        allowedNumbers: ['+0987654321'],
      });
      await filteredAdapter.connect();

      const receivedMessages: unknown[] = [];
      filteredAdapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await filteredAdapter.handleWebhook({
        MessageSid: 'SM002',
        AccountSid: 'AC123',
        From: '+0987654321',
        To: '+1234567890',
        Body: 'Allowed!',
      });

      expect(receivedMessages).toHaveLength(1);
      await filteredAdapter.disconnect();
    });

    it('should block messages from non-allowed numbers', async () => {
      const { audit } = await import('@auxiora/audit');
      const filteredAdapter = new TwilioAdapter({
        accountSid: 'AC123',
        authToken: 'test-auth-token',
        phoneNumber: '+1234567890',
        allowedNumbers: ['+0987654321'],
      });
      await filteredAdapter.connect();

      const receivedMessages: unknown[] = [];
      filteredAdapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      const result = await filteredAdapter.handleWebhook({
        MessageSid: 'SM003',
        AccountSid: 'AC123',
        From: '+5555555555',
        To: '+1234567890',
        Body: 'Blocked!',
      });

      expect(result).toBeNull();
      expect(receivedMessages).toHaveLength(0);
      expect(audit).toHaveBeenCalledWith('message.filtered', expect.objectContaining({
        channelType: 'twilio',
        senderId: '+5555555555',
        reason: 'number_not_allowed',
      }));
      await filteredAdapter.disconnect();
    });

    it('should strip whatsapp: prefix before matching allowedNumbers', async () => {
      const filteredAdapter = new TwilioAdapter({
        accountSid: 'AC123',
        authToken: 'test-auth-token',
        phoneNumber: '+1234567890',
        allowedNumbers: ['+0987654321'],
      });
      await filteredAdapter.connect();

      const receivedMessages: unknown[] = [];
      filteredAdapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      // WhatsApp message with whatsapp: prefix, but number is in allowedNumbers
      await filteredAdapter.handleWebhook({
        MessageSid: 'SM004',
        AccountSid: 'AC123',
        From: 'whatsapp:+0987654321',
        To: 'whatsapp:+1234567890',
        Body: 'WhatsApp allowed!',
      });

      expect(receivedMessages).toHaveLength(1);
      await filteredAdapter.disconnect();
    });

    it('should block WhatsApp messages from non-allowed numbers', async () => {
      const { audit } = await import('@auxiora/audit');
      const filteredAdapter = new TwilioAdapter({
        accountSid: 'AC123',
        authToken: 'test-auth-token',
        phoneNumber: '+1234567890',
        allowedNumbers: ['+0987654321'],
      });
      await filteredAdapter.connect();

      const receivedMessages: unknown[] = [];
      filteredAdapter.onMessage(async (msg) => {
        receivedMessages.push(msg);
      });

      await filteredAdapter.handleWebhook({
        MessageSid: 'SM005',
        AccountSid: 'AC123',
        From: 'whatsapp:+5555555555',
        To: 'whatsapp:+1234567890',
        Body: 'Blocked WhatsApp!',
      });

      expect(receivedMessages).toHaveLength(0);
      expect(audit).toHaveBeenCalledWith('message.filtered', expect.objectContaining({
        channelType: 'twilio',
        reason: 'number_not_allowed',
      }));
      await filteredAdapter.disconnect();
    });
  });

  it('should handle message handler errors gracefully', async () => {
    await adapter.connect();

    const errorHandler = vi.fn();
    adapter.onError(errorHandler);
    adapter.onMessage(async () => {
      throw new Error('Handler error');
    });

    await adapter.handleWebhook({
      MessageSid: 'SM999',
      AccountSid: 'AC123',
      From: '+0987654321',
      To: '+1234567890',
      Body: 'Trigger error',
    });

    expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    await adapter.disconnect();
  });

  it('should register error handler', () => {
    const handler = vi.fn();
    adapter.onError(handler);
  });
});
