import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SignalAdapter } from '../src/adapters/signal.js';

// Mock audit
vi.mock('@auxiora/audit', () => ({
  audit: vi.fn(),
}));

describe('SignalAdapter', () => {
  let adapter: SignalAdapter;

  beforeEach(() => {
    adapter = new SignalAdapter({
      signalCliEndpoint: 'http://localhost:7583',
      phoneNumber: '+1234567890',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(adapter.type).toBe('signal');
    expect(adapter.name).toBe('Signal');
    expect(adapter.isConnected()).toBe(false);
  });

  it('should connect successfully', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: [] }),
      } as Response)
      .mockImplementation(() => new Promise(() => {})); // Hang on poll

    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('should fail to connect on API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    await expect(adapter.connect()).rejects.toThrow('Signal CLI API error 500');
  });

  it('should fail to connect on RPC error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -1, message: 'Account not found' },
      }),
    } as Response);

    await expect(adapter.connect()).rejects.toThrow('Account not found');
  });

  it('should send a direct message', async () => {
    // Connect
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: [] }),
      } as Response)
      .mockImplementation(() => new Promise(() => {}));

    await adapter.connect();

    // Send
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 3,
        result: { timestamp: 1700000000000 },
      }),
    } as Response);

    const result = await adapter.send('+0987654321', {
      content: 'Hello from Signal!',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('1700000000000');

    await adapter.disconnect();
  });

  it('should send a group message', async () => {
    // Connect
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: [] }),
      } as Response)
      .mockImplementation(() => new Promise(() => {}));

    await adapter.connect();

    // Send to group (non-+ prefix = group ID)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 3,
        result: { timestamp: 1700000000001 },
      }),
    } as Response);

    const result = await adapter.send('group-abc123', {
      content: 'Hello group!',
    });

    expect(result.success).toBe(true);

    // Verify the group param was used
    const lastCall = vi.mocked(globalThis.fetch).mock.calls.at(-1);
    const body = JSON.parse(lastCall![1]?.body as string);
    expect(body.params.groupId).toBe('group-abc123');
    expect(body.params.recipient).toBeUndefined();

    await adapter.disconnect();
  });

  it('should handle send errors', async () => {
    // Connect
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: [] }),
      } as Response)
      .mockImplementation(() => new Promise(() => {}));

    await adapter.connect();

    // Fail send
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 3,
        error: { code: -1, message: 'Recipient not found' },
      }),
    } as Response);

    const result = await adapter.send('+0987654321', {
      content: 'Should fail',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Recipient not found');

    await adapter.disconnect();
  });

  it('should receive messages from poll', async () => {
    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    const pollResponse = [
      {
        envelope: {
          source: '+0987654321',
          sourceName: 'Alice',
          sourceNumber: '+0987654321',
          timestamp: 1700000000000,
          dataMessage: {
            message: 'Hello!',
            timestamp: 1700000000000,
          },
        },
      },
    ];

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 2, result: pollResponse }),
      } as Response)
      .mockImplementation(() => new Promise(() => {}));

    await adapter.connect();
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as { content: string; senderId: string };
    expect(msg.content).toBe('Hello!');
    expect(msg.senderId).toBe('+0987654321');

    await adapter.disconnect();
  });

  it('should ignore own messages', async () => {
    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    const pollResponse = [
      {
        envelope: {
          source: '+1234567890',
          sourceNumber: '+1234567890', // Own number
          timestamp: 1700000000000,
          dataMessage: {
            message: 'My own message',
            timestamp: 1700000000000,
          },
        },
      },
    ];

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 2, result: pollResponse }),
      } as Response)
      .mockImplementation(() => new Promise(() => {}));

    await adapter.connect();
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(receivedMessages).toHaveLength(0);

    await adapter.disconnect();
  });

  it('should handle group messages', async () => {
    const receivedMessages: unknown[] = [];
    adapter.onMessage(async (msg) => {
      receivedMessages.push(msg);
    });

    const pollResponse = [
      {
        envelope: {
          source: '+0987654321',
          sourceName: 'Bob',
          sourceNumber: '+0987654321',
          timestamp: 1700000000000,
          dataMessage: {
            message: 'Hello group!',
            timestamp: 1700000000000,
            groupInfo: {
              groupId: 'group-xyz',
              type: 'DELIVER',
            },
          },
        },
      },
    ];

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: 2, result: pollResponse }),
      } as Response)
      .mockImplementation(() => new Promise(() => {}));

    await adapter.connect();
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(receivedMessages).toHaveLength(1);
    const msg = receivedMessages[0] as { channelId: string };
    expect(msg.channelId).toBe('group-xyz');

    await adapter.disconnect();
  });

  it('should register error handler', () => {
    const handler = vi.fn();
    adapter.onError(handler);
  });
});
