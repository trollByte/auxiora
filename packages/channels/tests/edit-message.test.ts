import { describe, it, expect, vi } from 'vitest';
import type { ChannelAdapter } from '../src/types.js';

describe('editMessage interface', () => {
  it('should be an optional method on ChannelAdapter', () => {
    const adapter: ChannelAdapter = {
      type: 'telegram',
      name: 'Test',
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnected: () => true,
      send: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };
    expect(adapter.editMessage).toBeUndefined();
  });

  it('should accept channelId, messageId, and message', () => {
    const adapter: ChannelAdapter = {
      type: 'telegram',
      name: 'Test',
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnected: () => true,
      send: vi.fn(),
      editMessage: vi.fn().mockResolvedValue({ success: true, messageId: '123' }),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };
    expect(adapter.editMessage).toBeDefined();
  });
});
