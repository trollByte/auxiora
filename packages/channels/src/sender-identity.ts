import { getLogger } from '@auxiora/logger';
import type { ChannelType } from './types.js';

const logger = getLogger('channels:sender-identity');

export interface NormalizedSender {
  /** Canonical unique identifier across all channels */
  canonicalId: string;
  /** Display name (best available) */
  displayName: string;
  /** All known channel identities for this sender */
  identities: ChannelIdentity[];
  /** Whether this sender has been verified/paired */
  verified: boolean;
  /** Trust level */
  trustLevel: 'unknown' | 'paired' | 'verified' | 'admin';
  /** When this sender was first seen */
  firstSeen: number;
  /** When this sender was last seen */
  lastSeen: number;
}

export interface ChannelIdentity {
  channelType: ChannelType;
  channelId: string;
  senderId: string;
  senderName?: string;
}

export interface PairingRequest {
  /** Short code for pairing (e.g., "A3F9") */
  code: string;
  /** Channel identity requesting pairing */
  identity: ChannelIdentity;
  /** When the code was generated */
  createdAt: number;
  /** When the code expires */
  expiresAt: number;
}

export class SenderIdentityManager {
  private senders = new Map<string, NormalizedSender>();
  private channelIndex = new Map<string, string>(); // channelKey -> canonicalId
  private pendingPairings = new Map<string, PairingRequest>();
  private codeLength: number;
  private pairingTtlMs: number;

  constructor(options?: { codeLength?: number; pairingTtlMs?: number }) {
    this.codeLength = options?.codeLength ?? 4;
    this.pairingTtlMs = options?.pairingTtlMs ?? 600_000; // 10 minutes
  }

  /** Build a channel index key */
  private channelKey(channelType: ChannelType, senderId: string): string {
    return `${channelType}:${senderId}`;
  }

  /** Look up or create a sender from a channel message */
  resolve(channelType: ChannelType, senderId: string, senderName?: string): NormalizedSender {
    const key = this.channelKey(channelType, senderId);
    const existingId = this.channelIndex.get(key);

    if (existingId) {
      const sender = this.senders.get(existingId)!;
      sender.lastSeen = Date.now();
      if (senderName) sender.displayName = senderName;
      return sender;
    }

    // New sender
    const canonicalId = `sender_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const identity: ChannelIdentity = { channelType, channelId: '', senderId, senderName };
    const sender: NormalizedSender = {
      canonicalId,
      displayName: senderName ?? senderId,
      identities: [identity],
      verified: false,
      trustLevel: 'unknown',
      firstSeen: Date.now(),
      lastSeen: Date.now(),
    };

    this.senders.set(canonicalId, sender);
    this.channelIndex.set(key, canonicalId);

    logger.debug('New sender registered', { canonicalId, channelType, senderId });
    return sender;
  }

  /** Get a sender by canonical ID */
  get(canonicalId: string): NormalizedSender | undefined {
    return this.senders.get(canonicalId);
  }

  /** Generate a short pairing code for cross-channel identity linking */
  generatePairingCode(channelType: ChannelType, senderId: string): PairingRequest {
    const key = this.channelKey(channelType, senderId);
    const canonicalId = this.channelIndex.get(key);
    if (!canonicalId) {
      throw new Error(`Unknown sender: ${channelType}:${senderId}`);
    }

    const code = this.randomCode();
    const identity: ChannelIdentity = { channelType, channelId: '', senderId };
    const request: PairingRequest = {
      code,
      identity,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.pairingTtlMs,
    };

    this.pendingPairings.set(code, request);
    logger.info('Pairing code generated', { code, channelType, senderId });
    return request;
  }

  /** Complete pairing: link a new channel identity to an existing sender using a code */
  completePairing(
    code: string,
    newChannelType: ChannelType,
    newSenderId: string,
    newSenderName?: string,
  ): NormalizedSender | null {
    const request = this.pendingPairings.get(code);
    if (!request) return null;

    // Check expiry
    if (Date.now() > request.expiresAt) {
      this.pendingPairings.delete(code);
      return null;
    }

    // Find the original sender
    const originalKey = this.channelKey(request.identity.channelType, request.identity.senderId);
    const canonicalId = this.channelIndex.get(originalKey);
    if (!canonicalId) {
      this.pendingPairings.delete(code);
      return null;
    }

    const sender = this.senders.get(canonicalId)!;

    // Add new identity
    const newIdentity: ChannelIdentity = {
      channelType: newChannelType,
      channelId: '',
      senderId: newSenderId,
      senderName: newSenderName,
    };
    sender.identities.push(newIdentity);
    sender.trustLevel = 'paired';
    sender.verified = true;

    // Index new identity
    const newKey = this.channelKey(newChannelType, newSenderId);
    this.channelIndex.set(newKey, canonicalId);

    // Clean up
    this.pendingPairings.delete(code);

    logger.info('Pairing completed', { canonicalId, newChannelType, newSenderId });
    return sender;
  }

  /** Set trust level for a sender */
  setTrustLevel(canonicalId: string, level: NormalizedSender['trustLevel']): void {
    const sender = this.senders.get(canonicalId);
    if (sender) {
      sender.trustLevel = level;
      if (level === 'verified' || level === 'admin') sender.verified = true;
    }
  }

  /** List all known senders */
  listSenders(): NormalizedSender[] {
    return [...this.senders.values()];
  }

  /** Get count of known senders */
  get senderCount(): number {
    return this.senders.size;
  }

  /** Clean up expired pairing requests */
  cleanExpiredPairings(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [code, req] of this.pendingPairings) {
      if (now > req.expiresAt) {
        this.pendingPairings.delete(code);
        cleaned++;
      }
    }
    return cleaned;
  }

  private randomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous 0/O, 1/I
    let code = '';
    for (let i = 0; i < this.codeLength; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }
}
