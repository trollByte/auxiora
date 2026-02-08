import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MatrixAdapter } from '../src/adapters/matrix.js';

// Mock audit
vi.mock('@auxiora/audit', () => ({
  audit: vi.fn(),
}));

describe('MatrixAdapter', () => {
  let adapter: MatrixAdapter;

  beforeEach(() => {
    adapter = new MatrixAdapter({
      homeserverUrl: 'https://matrix.example.com',
      userId: '@bot:example.com',
      accessToken: 'test-access-token',
      autoJoinRooms: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(adapter.type).toBe('matrix');
    expect(adapter.name).toBe('Matrix');
    expect(adapter.isConnected()).toBe(false);
  });

  it('should connect successfully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user_id: '@bot:example.com' }),
    } as Response);

    // Mock the sync call to avoid infinite loop
    const syncResponse = {
      ok: true,
      json: async () => ({ next_batch: 'batch1', rooms: {} }),
    } as Response;
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(syncResponse);

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
      text: async () => 'Unauthorized',
    } as unknown as Response);

    await expect(adapter.connect()).rejects.toThrow('Matrix API error 401');
  });

  it('should send a message successfully', async () => {
    // Connect first
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user_id: '@bot:example.com' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ next_batch: 'batch1', rooms: {} }),
      } as Response);

    await adapter.connect();

    // Mock send
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ event_id: '$event123' }),
    } as Response);

    const result = await adapter.send('!room:example.com', {
      content: 'Hello, Matrix!',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('$event123');

    await adapter.disconnect();
  });

  it('should handle send errors', async () => {
    // Connect first
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user_id: '@bot:example.com' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ next_batch: 'batch1', rooms: {} }),
      } as Response);

    await adapter.connect();

    // Mock failed send
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'Not a member of the room',
    } as unknown as Response);

    const result = await adapter.send('!room:example.com', {
      content: 'Should fail',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('403');

    await adapter.disconnect();
  });

  it('should handle incoming messages via sync', async () => {
    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    const syncResponse = {
      next_batch: 'batch2',
      rooms: {
        join: {
          '!room:example.com': {
            timeline: {
              events: [
                {
                  event_id: '$msg1',
                  type: 'm.room.message',
                  sender: '@alice:example.com',
                  origin_server_ts: 1700000000000,
                  content: {
                    msgtype: 'm.text',
                    body: 'Hello bot!',
                  },
                },
              ],
            },
          },
        },
      },
    };

    // Connect: whoami + first sync (with messages) + second sync (abort)
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user_id: '@bot:example.com' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => syncResponse,
      } as Response)
      .mockImplementation(() => new Promise(() => {})); // Hang on subsequent syncs

    await adapter.connect();

    // Wait for the sync loop to process
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as { content: string; senderId: string; channelId: string };
    expect(msg.content).toBe('Hello bot!');
    expect(msg.senderId).toBe('@alice:example.com');
    expect(msg.channelId).toBe('!room:example.com');

    await adapter.disconnect();
  });

  it('should ignore own messages', async () => {
    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    const syncResponse = {
      next_batch: 'batch2',
      rooms: {
        join: {
          '!room:example.com': {
            timeline: {
              events: [
                {
                  event_id: '$msg1',
                  type: 'm.room.message',
                  sender: '@bot:example.com', // Own message
                  origin_server_ts: 1700000000000,
                  content: {
                    msgtype: 'm.text',
                    body: 'My own message',
                  },
                },
              ],
            },
          },
        },
      },
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user_id: '@bot:example.com' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => syncResponse,
      } as Response)
      .mockImplementation(() => new Promise(() => {}));

    await adapter.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(receivedMessages).toHaveLength(0);

    await adapter.disconnect();
  });

  it('should auto-join rooms when configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const syncResponse = {
      next_batch: 'batch2',
      rooms: {
        invite: {
          '!newroom:example.com': {
            invite_state: {
              events: [],
            },
          },
        },
      },
    };

    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user_id: '@bot:example.com' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => syncResponse,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ room_id: '!newroom:example.com' }),
      } as Response)
      .mockImplementation(() => new Promise(() => {}));

    await adapter.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify that a join request was made
    const joinCall = fetchSpy.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('/join')
    );
    expect(joinCall).toBeDefined();

    await adapter.disconnect();
  });

  it('should send reply with relation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user_id: '@bot:example.com' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ next_batch: 'batch1', rooms: {} }),
      } as Response);

    await adapter.connect();

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ event_id: '$reply123' }),
    } as Response);

    const result = await adapter.send('!room:example.com', {
      content: 'Reply message',
      replyToId: '$original123',
    });

    expect(result.success).toBe(true);

    // Verify the body includes the reply relation
    const sendCall = fetchSpy.mock.calls.find(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('/send/m.room.message/')
    );
    expect(sendCall).toBeDefined();
    const body = JSON.parse(sendCall![1]?.body as string);
    expect(body['m.relates_to']['m.in_reply_to'].event_id).toBe('$original123');

    await adapter.disconnect();
  });

  it('should register error handler', () => {
    const handler = vi.fn();
    adapter.onError(handler);
    // No assertion needed - just verify no error during registration
  });

  it('should strip reply fallback from content', async () => {
    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    const syncResponse = {
      next_batch: 'batch2',
      rooms: {
        join: {
          '!room:example.com': {
            timeline: {
              events: [
                {
                  event_id: '$msg1',
                  type: 'm.room.message',
                  sender: '@alice:example.com',
                  origin_server_ts: 1700000000000,
                  content: {
                    msgtype: 'm.text',
                    body: '> <@bob:example.com> Original message\n\nActual reply',
                    'm.relates_to': {
                      'm.in_reply_to': {
                        event_id: '$original',
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user_id: '@bot:example.com' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => syncResponse,
      } as Response)
      .mockImplementation(() => new Promise(() => {}));

    await adapter.connect();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as { content: string; replyToId: string };
    expect(msg.content).toBe('Actual reply');
    expect(msg.replyToId).toBe('$original');

    await adapter.disconnect();
  });
});
