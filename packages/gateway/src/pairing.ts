import * as crypto from 'node:crypto';

interface PairingCode {
  code: string;
  senderId: string;
  channelType: string;
  createdAt: number;
  expiresAt: number;
}

export interface PairingConfig {
  codeLength: number;
  expiryMinutes: number;
}

export class PairingManager {
  private pendingCodes: Map<string, PairingCode> = new Map();
  private allowedSenders: Set<string> = new Set();
  private codeLength: number;
  private expiryMs: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: PairingConfig) {
    this.codeLength = config.codeLength;
    this.expiryMs = config.expiryMinutes * 60 * 1000;

    // Cleanup expired codes every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  generateCode(senderId: string, channelType: string): string {
    // Generate a hex code (e.g., "A3F2B1")
    const code = crypto
      .randomBytes(Math.ceil(this.codeLength / 2))
      .toString('hex')
      .toUpperCase()
      .slice(0, this.codeLength);

    const now = Date.now();
    this.pendingCodes.set(code, {
      code,
      senderId,
      channelType,
      createdAt: now,
      expiresAt: now + this.expiryMs,
    });

    return code;
  }

  validateCode(code: string): PairingCode | null {
    const normalizedCode = code.toUpperCase().trim();
    const pending = this.pendingCodes.get(normalizedCode);

    if (!pending) {
      return null;
    }

    if (Date.now() >= pending.expiresAt) {
      this.pendingCodes.delete(normalizedCode);
      return null;
    }

    return pending;
  }

  acceptCode(code: string): boolean {
    const pending = this.validateCode(code);
    if (!pending) {
      return false;
    }

    this.allowedSenders.add(this.makeSenderKey(pending.senderId, pending.channelType));
    this.pendingCodes.delete(code.toUpperCase().trim());
    return true;
  }

  rejectCode(code: string): boolean {
    const normalizedCode = code.toUpperCase().trim();
    if (this.pendingCodes.has(normalizedCode)) {
      this.pendingCodes.delete(normalizedCode);
      return true;
    }
    return false;
  }

  isAllowed(senderId: string, channelType: string): boolean {
    return this.allowedSenders.has(this.makeSenderKey(senderId, channelType));
  }

  revoke(senderId: string, channelType: string): boolean {
    const key = this.makeSenderKey(senderId, channelType);
    if (this.allowedSenders.has(key)) {
      this.allowedSenders.delete(key);
      return true;
    }
    return false;
  }

  getAllowedSenders(): Array<{ senderId: string; channelType: string }> {
    return Array.from(this.allowedSenders).map((key) => {
      const [channelType, senderId] = key.split(':', 2);
      return { senderId, channelType };
    });
  }

  getPendingCodes(): PairingCode[] {
    const now = Date.now();
    return Array.from(this.pendingCodes.values()).filter(
      (code) => now < code.expiresAt
    );
  }

  private makeSenderKey(senderId: string, channelType: string): string {
    return `${channelType}:${senderId}`;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [code, pending] of this.pendingCodes) {
      if (now >= pending.expiresAt) {
        this.pendingCodes.delete(code);
      }
    }
  }

  // Persistence methods for saving/loading allowed senders
  exportAllowlist(): string[] {
    return Array.from(this.allowedSenders);
  }

  importAllowlist(list: string[]): void {
    for (const key of list) {
      this.allowedSenders.add(key);
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.pendingCodes.clear();
  }
}
