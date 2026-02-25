import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from '../src/rate-limiter.js';
import { PairingManager } from '../src/pairing.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      windowMs: 60000, // 1 minute
      maxRequests: 5,
    });
  });

  afterEach(() => {
    limiter.destroy();
  });

  it('should allow requests under limit', () => {
    for (let i = 0; i < 5; i++) {
      const result = limiter.check('client1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it('should block requests over limit', () => {
    for (let i = 0; i < 5; i++) {
      limiter.check('client1');
    }

    const result = limiter.check('client1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should track limits per client', () => {
    // Use up client1's quota
    for (let i = 0; i < 5; i++) {
      limiter.check('client1');
    }

    // client2 should still be allowed
    const result = limiter.check('client2');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('should reset after window expires', async () => {
    vi.useFakeTimers();

    // Use up quota
    for (let i = 0; i < 5; i++) {
      limiter.check('client1');
    }
    expect(limiter.check('client1').allowed).toBe(false);

    // Advance time past window
    vi.advanceTimersByTime(61000);

    // Should be allowed again
    const result = limiter.check('client1');
    expect(result.allowed).toBe(true);

    vi.useRealTimers();
  });

  it('should reset specific client', () => {
    for (let i = 0; i < 5; i++) {
      limiter.check('client1');
    }
    expect(limiter.check('client1').allowed).toBe(false);

    limiter.reset('client1');
    expect(limiter.check('client1').allowed).toBe(true);
  });
});

describe('PairingManager', () => {
  let pairing: PairingManager;

  beforeEach(() => {
    pairing = new PairingManager({
      codeLength: 6,
      expiryMinutes: 15,
    });
  });

  afterEach(() => {
    pairing.destroy();
  });

  describe('generateCode', () => {
    it('should generate code of specified length', () => {
      const code = pairing.generateCode('user123', 'discord');
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[0-9A-F]+$/);
    });

    it('should store code as pending', () => {
      const code = pairing.generateCode('user123', 'telegram');
      const pending = pairing.getPendingCodes();

      expect(pending).toHaveLength(1);
      expect(pending[0].code).toBe(code);
      expect(pending[0].senderId).toBe('user123');
      expect(pending[0].channelType).toBe('telegram');
    });
  });

  describe('validateCode', () => {
    it('should validate existing code', () => {
      const code = pairing.generateCode('user123', 'discord');
      const result = pairing.validateCode(code);

      expect(result).not.toBeNull();
      expect(result?.senderId).toBe('user123');
    });

    it('should return null for invalid code', () => {
      const result = pairing.validateCode('INVALID');
      expect(result).toBeNull();
    });

    it('should be case insensitive', () => {
      const code = pairing.generateCode('user123', 'discord');
      const result = pairing.validateCode(code.toLowerCase());
      expect(result).not.toBeNull();
    });
  });

  describe('acceptCode', () => {
    it('should add sender to allowlist', () => {
      const code = pairing.generateCode('user123', 'discord');
      const accepted = pairing.acceptCode(code);

      expect(accepted).toBe(true);
      expect(pairing.isAllowed('user123', 'discord')).toBe(true);
    });

    it('should remove code from pending', () => {
      const code = pairing.generateCode('user123', 'discord');
      pairing.acceptCode(code);

      const pending = pairing.getPendingCodes();
      expect(pending).toHaveLength(0);
    });

    it('should return false for invalid code', () => {
      const accepted = pairing.acceptCode('INVALID');
      expect(accepted).toBe(false);
    });
  });

  describe('rejectCode', () => {
    it('should remove code from pending', () => {
      const code = pairing.generateCode('user123', 'discord');
      const rejected = pairing.rejectCode(code);

      expect(rejected).toBe(true);
      expect(pairing.getPendingCodes()).toHaveLength(0);
      expect(pairing.isAllowed('user123', 'discord')).toBe(false);
    });
  });

  describe('isAllowed', () => {
    it('should return false for unknown sender', () => {
      expect(pairing.isAllowed('unknown', 'discord')).toBe(false);
    });

    it('should check channel type', () => {
      const code = pairing.generateCode('user123', 'discord');
      pairing.acceptCode(code);

      expect(pairing.isAllowed('user123', 'discord')).toBe(true);
      expect(pairing.isAllowed('user123', 'telegram')).toBe(false);
    });
  });

  describe('revoke', () => {
    it('should remove sender from allowlist', () => {
      const code = pairing.generateCode('user123', 'discord');
      pairing.acceptCode(code);
      expect(pairing.isAllowed('user123', 'discord')).toBe(true);

      pairing.revoke('user123', 'discord');
      expect(pairing.isAllowed('user123', 'discord')).toBe(false);
    });
  });

  describe('expiration', () => {
    it('should expire codes after timeout', async () => {
      vi.useFakeTimers();

      const code = pairing.generateCode('user123', 'discord');
      expect(pairing.validateCode(code)).not.toBeNull();

      // Advance past expiry
      vi.advanceTimersByTime(16 * 60 * 1000); // 16 minutes

      expect(pairing.validateCode(code)).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('persistence', () => {
    it('should export and import allowlist', () => {
      const code1 = pairing.generateCode('user1', 'discord');
      const code2 = pairing.generateCode('user2', 'telegram');
      pairing.acceptCode(code1);
      pairing.acceptCode(code2);

      const exported = pairing.exportAllowlist();
      expect(exported).toHaveLength(2);

      const newPairing = new PairingManager({ codeLength: 6, expiryMinutes: 15 });
      newPairing.importAllowlist(exported);

      expect(newPairing.isAllowed('user1', 'discord')).toBe(true);
      expect(newPairing.isAllowed('user2', 'telegram')).toBe(true);

      newPairing.destroy();
    });
  });

  describe('autoApproveChannels', () => {
    let autoPairing: PairingManager;

    beforeEach(() => {
      autoPairing = new PairingManager({
        codeLength: 6,
        expiryMinutes: 15,
        autoApproveChannels: ['webchat', 'matrix'],
      });
    });

    afterEach(() => {
      autoPairing.destroy();
    });

    it('should auto-approve senders from auto-approved channels', () => {
      expect(autoPairing.isAllowed('anyone', 'webchat')).toBe(true);
      expect(autoPairing.isAllowed('anyone', 'matrix')).toBe(true);
    });

    it('should not auto-approve senders from other channels', () => {
      expect(autoPairing.isAllowed('anyone', 'discord')).toBe(false);
      expect(autoPairing.isAllowed('anyone', 'telegram')).toBe(false);
    });

    it('should report auto-approved status', () => {
      expect(autoPairing.isAutoApproved('webchat')).toBe(true);
      expect(autoPairing.isAutoApproved('discord')).toBe(false);
    });
  });

  describe('disk persistence', () => {
    let persistPairing: PairingManager;
    let testDir: string;
    let persistPath: string;

    beforeEach(async () => {
      const os = await import('node:os');
      const path = await import('node:path');
      const fs = await import('node:fs/promises');
      testDir = path.join(
        os.tmpdir(),
        'auxiora-pairing-test-' + Date.now() + '-' + Math.random().toString(36).slice(2)
      );
      await fs.mkdir(testDir, { recursive: true });
      persistPath = path.join(testDir, 'pairing.json');

      persistPairing = new PairingManager({
        codeLength: 6,
        expiryMinutes: 15,
        persistPath,
      });
    });

    afterEach(async () => {
      persistPairing.destroy();
      const fs = await import('node:fs/promises');
      await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should persist allowlist to disk after accepting code', async () => {
      const code = persistPairing.generateCode('user1', 'discord');
      persistPairing.acceptCode(code);

      // Wait for microtask to flush
      await new Promise((r) => setTimeout(r, 50));

      const fs = await import('node:fs/promises');
      const content = await fs.readFile(persistPath, 'utf-8');
      const data = JSON.parse(content);
      expect(data.allowlist).toContain('discord:user1');
    });

    it('should load allowlist from disk', async () => {
      const fs = await import('node:fs/promises');
      await fs.writeFile(persistPath, JSON.stringify({ allowlist: ['telegram:bob'] }));

      const newPairing = new PairingManager({
        codeLength: 6,
        expiryMinutes: 15,
        persistPath,
      });
      await newPairing.loadFromDisk();

      expect(newPairing.isAllowed('bob', 'telegram')).toBe(true);
      newPairing.destroy();
    });

    it('should handle missing persist file gracefully', async () => {
      const path = await import('node:path');
      const newPairing = new PairingManager({
        codeLength: 6,
        expiryMinutes: 15,
        persistPath: path.join(testDir, 'nonexistent.json'),
      });

      // Should not throw
      await newPairing.loadFromDisk();
      expect(newPairing.isAllowed('anyone', 'discord')).toBe(false);
      newPairing.destroy();
    });
  });
});
