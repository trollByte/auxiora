import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TeamsAdapter } from '../src/adapters/teams.js';

// Mock audit
vi.mock('@auxiora/audit', () => ({
  audit: vi.fn(),
}));

describe('TeamsAdapter', () => {
  let adapter: TeamsAdapter;

  beforeEach(() => {
    adapter = new TeamsAdapter({
      microsoftAppId: 'test-app-id',
      microsoftAppPassword: 'test-app-password',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(adapter.type).toBe('teams');
    expect(adapter.name).toBe('Microsoft Teams');
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

    await expect(adapter.connect()).rejects.toThrow('Failed to obtain Teams token');
  });

  it('should handle incoming webhook activity', async () => {
    // Connect first
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

    const activity = {
      type: 'message',
      id: 'activity-123',
      timestamp: '2024-01-01T00:00:00Z',
      channelId: 'msteams',
      from: {
        id: 'user-1',
        name: 'Alice',
      },
      conversation: {
        id: 'conv-1',
        isGroup: false,
      },
      text: 'Hello Teams!',
      serviceUrl: 'https://smba.trafficmanager.net/teams/',
    };

    await adapter.handleWebhook(activity);

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as { content: string; senderId: string; senderName: string };
    expect(msg.content).toBe('Hello Teams!');
    expect(msg.senderId).toBe('user-1');
    expect(msg.senderName).toBe('Alice');

    await adapter.disconnect();
  });

  it('should ignore non-message activities', async () => {
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
      type: 'conversationUpdate',
      id: 'activity-456',
      timestamp: '2024-01-01T00:00:00Z',
      channelId: 'msteams',
      from: { id: 'user-1' },
      conversation: { id: 'conv-1' },
      serviceUrl: 'https://smba.trafficmanager.net/teams/',
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
      json: async () => ({ id: 'msg-1' }),
    } as Response);

    const result = await adapter.send('conv-1', {
      content: 'Hello from the bot!',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-1');

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

    const result = await adapter.send('conv-1', {
      content: 'Should fail',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('403');

    await adapter.disconnect();
  });

  it('should strip bot mention from message text', async () => {
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
      type: 'message',
      id: 'activity-789',
      timestamp: '2024-01-01T00:00:00Z',
      channelId: 'msteams',
      from: { id: 'user-1', name: 'Alice' },
      conversation: { id: 'conv-1' },
      recipient: { id: 'bot-1', name: 'Auxiora' },
      text: '<at>Auxiora</at> what is the weather?',
      serviceUrl: 'https://smba.trafficmanager.net/teams/',
    });

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as { content: string };
    expect(msg.content).toBe('what is the weather?');

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
      json: async () => ({ id: 'msg-1' }),
    } as Response);
    await adapter.send('conv-1', { content: 'Message 1' });

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'msg-2' }),
    } as Response);
    await adapter.send('conv-1', { content: 'Message 2' });

    // Only 1 token call (during connect) + 2 send calls = 3 total
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    await adapter.disconnect();
  });

  it('should register error handler', () => {
    const handler = vi.fn();
    adapter.onError(handler);
  });
});
