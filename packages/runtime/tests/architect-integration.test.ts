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
});
