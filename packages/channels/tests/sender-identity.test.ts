import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SenderIdentityManager } from '../src/sender-identity.js';

describe('SenderIdentityManager', () => {
  let mgr: SenderIdentityManager;

  beforeEach(() => {
    mgr = new SenderIdentityManager();
  });

  describe('resolve', () => {
    it('creates new sender for unknown identity', () => {
      const sender = mgr.resolve('discord', 'user123', 'Alice');
      expect(sender.canonicalId).toMatch(/^sender_/);
      expect(sender.displayName).toBe('Alice');
      expect(sender.identities).toHaveLength(1);
      expect(sender.identities[0].channelType).toBe('discord');
      expect(sender.identities[0].senderId).toBe('user123');
      expect(sender.verified).toBe(false);
      expect(sender.trustLevel).toBe('unknown');
    });

    it('returns existing sender for known identity', () => {
      const first = mgr.resolve('discord', 'user123', 'Alice');
      const second = mgr.resolve('discord', 'user123', 'Alice');
      expect(second.canonicalId).toBe(first.canonicalId);
    });

    it('updates lastSeen and displayName on re-resolve', () => {
      const first = mgr.resolve('discord', 'user123', 'Alice');
      const originalLastSeen = first.lastSeen;

      // Advance time slightly
      vi.spyOn(Date, 'now').mockReturnValue(originalLastSeen + 5000);

      const second = mgr.resolve('discord', 'user123', 'Alice2');
      expect(second.lastSeen).toBe(originalLastSeen + 5000);
      expect(second.displayName).toBe('Alice2');

      vi.restoreAllMocks();
    });

    it('uses senderId as displayName when senderName is omitted', () => {
      const sender = mgr.resolve('telegram', 'tg_999');
      expect(sender.displayName).toBe('tg_999');
    });
  });

  describe('get', () => {
    it('returns sender by canonicalId', () => {
      const created = mgr.resolve('slack', 'U001', 'Bob');
      const found = mgr.get(created.canonicalId);
      expect(found).toBe(created);
    });

    it('returns undefined for unknown id', () => {
      expect(mgr.get('nonexistent')).toBeUndefined();
    });
  });

  describe('generatePairingCode', () => {
    it('creates a code with correct length', () => {
      mgr.resolve('discord', 'user1', 'Alice');
      const req = mgr.generatePairingCode('discord', 'user1');
      expect(req.code).toHaveLength(4);
      expect(req.identity.channelType).toBe('discord');
      expect(req.identity.senderId).toBe('user1');
      expect(req.expiresAt).toBeGreaterThan(req.createdAt);
    });

    it('throws for unknown sender', () => {
      expect(() => mgr.generatePairingCode('discord', 'nobody')).toThrow(
        'Unknown sender: discord:nobody',
      );
    });

    it('respects custom code length', () => {
      const custom = new SenderIdentityManager({ codeLength: 6 });
      custom.resolve('discord', 'user1');
      const req = custom.generatePairingCode('discord', 'user1');
      expect(req.code).toHaveLength(6);
    });
  });

  describe('completePairing', () => {
    it('links identities across channels', () => {
      mgr.resolve('discord', 'user1', 'Alice');
      const req = mgr.generatePairingCode('discord', 'user1');

      const result = mgr.completePairing(req.code, 'telegram', 'tg_alice', 'AliceTG');
      expect(result).not.toBeNull();
      expect(result!.identities).toHaveLength(2);
      expect(result!.trustLevel).toBe('paired');
      expect(result!.verified).toBe(true);
      expect(result!.identities[1].channelType).toBe('telegram');
      expect(result!.identities[1].senderId).toBe('tg_alice');
    });

    it('returns null for invalid code', () => {
      expect(mgr.completePairing('ZZZZ', 'telegram', 'tg_bob')).toBeNull();
    });

    it('returns null for expired code', () => {
      const short = new SenderIdentityManager({ pairingTtlMs: 1 });
      short.resolve('discord', 'user1');
      const req = short.generatePairingCode('discord', 'user1');

      // Force expiry
      vi.spyOn(Date, 'now').mockReturnValue(req.expiresAt + 1);
      const result = short.completePairing(req.code, 'telegram', 'tg_user');
      expect(result).toBeNull();

      vi.restoreAllMocks();
    });

    it('after pairing both identities resolve to same sender', () => {
      const original = mgr.resolve('discord', 'user1', 'Alice');
      const req = mgr.generatePairingCode('discord', 'user1');
      mgr.completePairing(req.code, 'slack', 'slack_alice', 'AliceSlack');

      const fromDiscord = mgr.resolve('discord', 'user1');
      const fromSlack = mgr.resolve('slack', 'slack_alice');
      expect(fromDiscord.canonicalId).toBe(original.canonicalId);
      expect(fromSlack.canonicalId).toBe(original.canonicalId);
    });
  });

  describe('setTrustLevel', () => {
    it('updates trust level', () => {
      const sender = mgr.resolve('discord', 'user1');
      mgr.setTrustLevel(sender.canonicalId, 'verified');
      expect(sender.trustLevel).toBe('verified');
      expect(sender.verified).toBe(true);
    });

    it('sets verified=true for admin level', () => {
      const sender = mgr.resolve('discord', 'user1');
      mgr.setTrustLevel(sender.canonicalId, 'admin');
      expect(sender.verified).toBe(true);
    });

    it('does nothing for unknown canonicalId', () => {
      // Should not throw
      mgr.setTrustLevel('nonexistent', 'admin');
    });
  });

  describe('listSenders', () => {
    it('returns all known senders', () => {
      mgr.resolve('discord', 'user1', 'Alice');
      mgr.resolve('telegram', 'user2', 'Bob');
      const list = mgr.listSenders();
      expect(list).toHaveLength(2);
      expect(list.map((s) => s.displayName).sort()).toEqual(['Alice', 'Bob']);
    });
  });

  describe('senderCount', () => {
    it('returns correct count', () => {
      expect(mgr.senderCount).toBe(0);
      mgr.resolve('discord', 'user1');
      expect(mgr.senderCount).toBe(1);
      mgr.resolve('telegram', 'user2');
      expect(mgr.senderCount).toBe(2);
      // Re-resolving same sender should not increase count
      mgr.resolve('discord', 'user1');
      expect(mgr.senderCount).toBe(2);
    });
  });

  describe('cleanExpiredPairings', () => {
    it('removes expired codes', () => {
      const short = new SenderIdentityManager({ pairingTtlMs: 1 });
      short.resolve('discord', 'user1');
      short.resolve('discord', 'user2');
      short.generatePairingCode('discord', 'user1');
      short.generatePairingCode('discord', 'user2');

      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
      const cleaned = short.cleanExpiredPairings();
      expect(cleaned).toBe(2);

      vi.restoreAllMocks();
    });

    it('returns 0 when no codes are expired', () => {
      mgr.resolve('discord', 'user1');
      mgr.generatePairingCode('discord', 'user1');
      expect(mgr.cleanExpiredPairings()).toBe(0);
    });
  });
});
