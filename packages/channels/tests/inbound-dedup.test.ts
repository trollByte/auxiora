import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isDuplicate, resetInboundDedup } from '../src/inbound-dedup.js';

describe('inbound-dedup', () => {
  beforeEach(() => {
    resetInboundDedup();
    vi.restoreAllMocks();
  });

  describe('isDuplicate', () => {
    it('should return false for the first occurrence of a message', () => {
      expect(isDuplicate('telegram', 'chat-123', 'msg-1')).toBe(false);
    });

    it('should return true for a duplicate message ID', () => {
      isDuplicate('telegram', 'chat-123', 'msg-1');
      expect(isDuplicate('telegram', 'chat-123', 'msg-1')).toBe(true);
    });

    it('should treat different channelTypes as distinct', () => {
      isDuplicate('telegram', 'chat-123', 'msg-1');
      expect(isDuplicate('discord', 'chat-123', 'msg-1')).toBe(false);
    });

    it('should treat different channelIds as distinct', () => {
      isDuplicate('telegram', 'chat-A', 'msg-1');
      expect(isDuplicate('telegram', 'chat-B', 'msg-1')).toBe(false);
    });

    it('should return false for empty messageId (bypass dedup)', () => {
      expect(isDuplicate('telegram', 'chat-123', '')).toBe(false);
      expect(isDuplicate('telegram', 'chat-123', '')).toBe(false);
    });
  });

  describe('TTL expiry', () => {
    it('should allow reprocessing after TTL expires', () => {
      vi.useFakeTimers();

      isDuplicate('telegram', 'chat-123', 'msg-1');
      expect(isDuplicate('telegram', 'chat-123', 'msg-1')).toBe(true);

      // Advance past 20-minute TTL
      vi.advanceTimersByTime(21 * 60_000);

      expect(isDuplicate('telegram', 'chat-123', 'msg-1')).toBe(false);

      vi.useRealTimers();
    });

    it('should NOT allow reprocessing before TTL expires', () => {
      vi.useFakeTimers();

      isDuplicate('telegram', 'chat-123', 'msg-1');

      // Advance to just before expiry
      vi.advanceTimersByTime(19 * 60_000);

      expect(isDuplicate('telegram', 'chat-123', 'msg-1')).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('max size eviction', () => {
    it('should evict oldest entries when max size exceeded', () => {
      // Fill cache to max (5000 entries)
      for (let i = 0; i < 5000; i++) {
        isDuplicate('telegram', 'chat', `msg-${i}`);
      }

      // msg-0 should still be there
      expect(isDuplicate('telegram', 'chat', 'msg-0')).toBe(true);

      // Add one more — should evict oldest (msg-0)
      isDuplicate('telegram', 'chat', 'msg-5000');

      // msg-1 should still be there (not evicted yet)
      expect(isDuplicate('telegram', 'chat', 'msg-1')).toBe(true);

      // msg-0 was evicted, should be treated as new
      expect(isDuplicate('telegram', 'chat', 'msg-0')).toBe(false);
    });
  });

  describe('resetInboundDedup', () => {
    it('should clear all cached entries', () => {
      isDuplicate('telegram', 'chat-123', 'msg-1');
      isDuplicate('discord', 'server-1', 'msg-2');

      resetInboundDedup();

      expect(isDuplicate('telegram', 'chat-123', 'msg-1')).toBe(false);
      expect(isDuplicate('discord', 'server-1', 'msg-2')).toBe(false);
    });
  });
});
