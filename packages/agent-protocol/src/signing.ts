import * as crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';

const logger = getLogger('agent-protocol:signing');

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Ed25519-based message signing and verification for agent-to-agent communication.
 */
export class MessageSigner {
  private publicKey: crypto.KeyObject | undefined;
  private privateKey: crypto.KeyObject | undefined;

  constructor(keyPair?: KeyPair) {
    if (keyPair) {
      this.importKeys(keyPair);
    }
  }

  /** Generate a new Ed25519 key pair. */
  static generateKeyPair(): KeyPair {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

    return {
      publicKey: publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString(),
      privateKey: privateKey
        .export({ type: 'pkcs8', format: 'pem' })
        .toString(),
    };
  }

  /** Import keys from PEM strings. */
  importKeys(keyPair: KeyPair): void {
    this.publicKey = crypto.createPublicKey(keyPair.publicKey);
    this.privateKey = crypto.createPrivateKey(keyPair.privateKey);
  }

  /** Import only a public key (for verification). */
  importPublicKey(pem: string): void {
    this.publicKey = crypto.createPublicKey(pem);
  }

  /** Sign a message payload. Returns base64-encoded signature. */
  sign(payload: string): string {
    if (!this.privateKey) {
      throw new Error('Private key not available for signing');
    }

    const signature = crypto.sign(null, Buffer.from(payload, 'utf-8'), this.privateKey);
    return signature.toString('base64');
  }

  /** Verify a signature against a payload. */
  verify(payload: string, signature: string, publicKeyPem?: string): boolean {
    const key = publicKeyPem ? crypto.createPublicKey(publicKeyPem) : this.publicKey;
    if (!key) {
      throw new Error('Public key not available for verification');
    }

    try {
      return crypto.verify(
        null,
        Buffer.from(payload, 'utf-8'),
        key,
        Buffer.from(signature, 'base64'),
      );
    } catch (error) {
      logger.debug('Signature verification failed', { error: error as Error });
      return false;
    }
  }

  /** Get the public key PEM string. */
  getPublicKeyPem(): string | undefined {
    return this.publicKey
      ?.export({ type: 'spki', format: 'pem' })
      .toString();
  }
}
