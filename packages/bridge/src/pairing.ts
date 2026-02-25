import { getLogger } from '@auxiora/logger';
import * as crypto from 'node:crypto';
import type { PairingCode, BridgeConfig } from './types.js';
import { DEFAULT_BRIDGE_CONFIG } from './types.js';

const logger = getLogger('bridge:pairing');

/**
 * Manages pairing code generation, validation, and expiry
 * for the device pairing flow.
 */
export class PairingFlow {
  private activeCodes = new Map<string, PairingCode>();
  private config: BridgeConfig;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<BridgeConfig>) {
    this.config = { ...DEFAULT_BRIDGE_CONFIG, ...config };
  }

  /** Generate a new pairing code. */
  generateCode(): PairingCode {
    const code = this.makeCode(this.config.codeLength);
    const pairingCode: PairingCode = {
      code,
      expiresAt: Date.now() + this.config.codeExpirySeconds * 1000,
      used: false,
    };

    this.activeCodes.set(code, pairingCode);
    logger.info('Pairing code generated', { code });
    return { ...pairingCode };
  }

  /** Validate a pairing code. Returns true if the code is valid and not expired. */
  validate(code: string): boolean {
    const pairingCode = this.activeCodes.get(code);
    if (!pairingCode) {
      return false;
    }
    if (pairingCode.used) {
      return false;
    }
    if (Date.now() > pairingCode.expiresAt) {
      this.activeCodes.delete(code);
      return false;
    }
    return true;
  }

  /** Consume a pairing code, marking it as used. Returns true if successful. */
  consume(code: string): boolean {
    if (!this.validate(code)) {
      return false;
    }
    const pairingCode = this.activeCodes.get(code)!;
    pairingCode.used = true;
    logger.info('Pairing code consumed', { code });
    return true;
  }

  /** Revoke an active pairing code. */
  revoke(code: string): boolean {
    const removed = this.activeCodes.delete(code);
    if (removed) {
      logger.info('Pairing code revoked', { code });
    }
    return removed;
  }

  /** Get all active (non-expired, non-used) codes. */
  getActiveCodes(): PairingCode[] {
    const now = Date.now();
    const active: PairingCode[] = [];

    for (const pc of this.activeCodes.values()) {
      if (!pc.used && now <= pc.expiresAt) {
        active.push({ ...pc });
      }
    }

    return active;
  }

  /** Remove expired codes. */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [code, pc] of this.activeCodes) {
      if (pc.used || now > pc.expiresAt) {
        this.activeCodes.delete(code);
        removed++;
      }
    }

    return removed;
  }

  /** Start automatic cleanup timer. */
  startCleanup(intervalMs = 60_000): void {
    this.stopCleanup();
    this.cleanupTimer = setInterval(() => this.cleanup(), intervalMs);
  }

  /** Stop automatic cleanup timer. */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /** Destroy the pairing flow, clearing all codes and stopping timers. */
  destroy(): void {
    this.stopCleanup();
    this.activeCodes.clear();
  }

  /** Generate a random numeric code of the given length. */
  private makeCode(length: number): string {
    const bytes = crypto.randomBytes(length);
    let code = '';
    for (let i = 0; i < length; i++) {
      code += (bytes[i] % 10).toString();
    }
    return code;
  }
}
