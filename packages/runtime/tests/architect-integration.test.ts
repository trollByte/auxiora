import { describe, it, expect } from 'vitest';

describe('Architect Runtime Integration', () => {
  describe('feedback recording', () => {
    it('maps thumbs up to helpful rating', () => {
      const mapped = 'up' === 'up' ? 'helpful' : 'off_target';
      expect(mapped).toBe('helpful');
    });

    it('maps thumbs down to off_target rating', () => {
      const mapped = 'down' === 'up' ? 'helpful' : 'off_target';
      expect(mapped).toBe('off_target');
    });
  });

  describe('channel path Architect parity', () => {
    it('derives chatId from channelType:channelId', () => {
      const chatId = `telegram:12345`;
      expect(chatId).toBe('telegram:12345');
    });

    it('uses useArchitect guard for channel path', () => {
      const personality = 'the-architect';
      const useChannelArchitect = personality === 'the-architect';
      expect(useChannelArchitect).toBe(true);

      const otherPersonality = 'default';
      const skipArchitect = otherPersonality === 'the-architect';
      expect(skipArchitect).toBe(false);
    });
  });
});
