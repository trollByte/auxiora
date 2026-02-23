import { describe, expect, it } from 'vitest';
import type { InboundMessage } from '../src/types.js';

describe('InboundMessage type', () => {
  it('accepts groupContext field', () => {
    const msg: InboundMessage = {
      id: '1',
      channelType: 'discord',
      channelId: 'ch1',
      senderId: 'u1',
      content: 'hello',
      timestamp: Date.now(),
      groupContext: {
        isGroup: true,
        groupName: 'Test Group',
        participantCount: 5,
      },
    };
    expect(msg.groupContext?.isGroup).toBe(true);
    expect(msg.groupContext?.groupName).toBe('Test Group');
    expect(msg.groupContext?.participantCount).toBe(5);
  });

  it('allows groupContext to be undefined', () => {
    const msg: InboundMessage = {
      id: '1',
      channelType: 'discord',
      channelId: 'ch1',
      senderId: 'u1',
      content: 'hello',
      timestamp: Date.now(),
    };
    expect(msg.groupContext).toBeUndefined();
  });
});
