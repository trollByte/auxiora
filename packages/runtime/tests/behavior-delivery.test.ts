import { describe, it, expect, vi } from 'vitest';

/**
 * Tests the sendToChannel delivery logic and persistToWebchat error handling.
 * We recreate the closure logic from Auxiora.initialize() with mocked deps.
 */

function createSendToChannel(deps: {
  gateway: { broadcast: ReturnType<typeof vi.fn> };
  channels?: {
    getConnectedChannels: ReturnType<typeof vi.fn>;
    getDefaultChannelId: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
  lastActiveChannels: Map<string, string>;
  persistToWebchat: ReturnType<typeof vi.fn>;
  logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
}) {
  return async (channelType: string, channelId: string, message: { content: string }) => {
    deps.logger.info('sendToChannel called', { channelType, channelId, hasChannels: !!deps.channels });

    let delivered = false;

    deps.gateway.broadcast({
      type: 'message',
      payload: { role: 'assistant', content: message.content },
    });
    deps.persistToWebchat(message.content);
    delivered = true;

    if (deps.channels) {
      const connected = deps.channels.getConnectedChannels();
      deps.logger.info('Connected channels for delivery', { connected });

      for (const ct of connected) {
        const targetId = deps.lastActiveChannels.get(ct)
          ?? deps.channels.getDefaultChannelId(ct);
        deps.logger.info('Channel delivery target', { channel: ct, targetId, fromLastActive: deps.lastActiveChannels.get(ct) });
        if (!targetId) continue;
        const result = await deps.channels.send(ct as any, targetId, { content: message.content });
        if (result.success) {
          delivered = true;
        } else {
          deps.logger.warn('Channel delivery failed', { channel: ct, targetId, error: new Error(result.error ?? 'unknown') });
        }
      }
    }

    return { success: delivered };
  };
}

function makeDeps(overrides?: Partial<Parameters<typeof createSendToChannel>[0]>) {
  return {
    gateway: { broadcast: vi.fn() },
    channels: {
      getConnectedChannels: vi.fn().mockReturnValue(['discord']),
      getDefaultChannelId: vi.fn().mockReturnValue('ch_default'),
      send: vi.fn().mockResolvedValue({ success: true }),
    },
    lastActiveChannels: new Map<string, string>(),
    persistToWebchat: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn() },
    ...overrides,
  };
}

describe('sendToChannel', () => {
  it('returns success when webchat broadcast and channel delivery succeed', async () => {
    const deps = makeDeps();
    const send = createSendToChannel(deps);

    const result = await send('discord', 'ch_1', { content: 'hello' });

    expect(result.success).toBe(true);
    expect(deps.gateway.broadcast).toHaveBeenCalled();
    expect(deps.channels!.send).toHaveBeenCalledWith('discord', 'ch_default', { content: 'hello' });
  });

  it('still returns success when channel delivery fails but webchat succeeds', async () => {
    const deps = makeDeps();
    deps.channels!.send.mockResolvedValue({ success: false, error: 'rate limited' });
    const send = createSendToChannel(deps);

    const result = await send('discord', 'ch_1', { content: 'hello' });

    // webchat broadcast counted as delivered
    expect(result.success).toBe(true);
    expect(deps.logger.warn).toHaveBeenCalled();
  });

  it('returns success even with no external channels (webchat only)', async () => {
    const deps = makeDeps({ channels: undefined });
    const send = createSendToChannel(deps);

    const result = await send('webchat', 'wc_1', { content: 'hello' });

    expect(result.success).toBe(true);
    expect(deps.gateway.broadcast).toHaveBeenCalled();
  });

  it('uses lastActiveChannels when available', async () => {
    const deps = makeDeps();
    deps.lastActiveChannels.set('discord', 'ch_active');
    const send = createSendToChannel(deps);

    await send('discord', 'ch_1', { content: 'hello' });

    expect(deps.channels!.send).toHaveBeenCalledWith('discord', 'ch_active', { content: 'hello' });
  });
});

describe('persistToWebchat error logging', () => {
  it('logs errors instead of silently swallowing', async () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const sessions = {
      getOrCreate: vi.fn().mockRejectedValue(new Error('DB connection lost')),
      addMessage: vi.fn(),
    };

    // Simulate the fixed persistToWebchat
    const persistToWebchat = (content: string) => {
      sessions.getOrCreate('webchat', { channelType: 'webchat' })
        .then((session: { id: string }) => sessions.addMessage(session.id, 'assistant', content))
        .catch((err: unknown) => {
          logger.warn('Failed to persist webchat message', {
            error: err instanceof Error ? err : new Error(String(err)),
          });
        });
    };

    persistToWebchat('test message');

    // Allow promise chain to settle
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to persist webchat message',
      expect.objectContaining({
        error: expect.any(Error),
      }),
    );
  });
});
