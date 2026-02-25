/**
 * ProfileRotator — wraps a Provider with multiple API keys for
 * within-provider key rotation.
 *
 * Implements Provider interface transparently. On each call:
 * 1. Selects the best key (round-robin by lastUsed, skip cooldown)
 * 2. Injects the key via setActiveKey()
 * 3. Delegates to the underlying provider
 * 4. On error: classifies, marks key cooldown, tries next key
 */

import { getLogger } from '@auxiora/logger';
import {
  coerceToFailoverError,
  FailoverError,
  isContextOverflow,
  isUserAbort,
} from './failover-error.js';
import {
  isProfileInCooldown,
  markProfileCooldown,
  clearProfileCooldown,
  shouldProbeProfile,
} from './profile-cooldown.js';
import type {
  Provider,
  ProviderMetadata,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
} from './types.js';

const logger = getLogger('profile-rotator');

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Provider that supports hot-swapping API keys. */
export interface RotatableProvider extends Provider {
  setActiveKey(key: string): void;
}

interface KeyState {
  index: number;
  key: string;
  lastUsed: number;
}

/* ------------------------------------------------------------------ */
/*  ProfileRotator                                                     */
/* ------------------------------------------------------------------ */

export class ProfileRotator implements Provider {
  readonly name: string;
  readonly defaultModel: string;
  readonly metadata: ProviderMetadata;

  private keys: KeyState[];

  constructor(
    private readonly underlying: RotatableProvider,
    apiKeys: string[],
  ) {
    if (apiKeys.length === 0) {
      throw new Error('ProfileRotator requires at least one API key');
    }
    this.name = underlying.name;
    this.defaultModel = underlying.defaultModel;
    this.metadata = underlying.metadata;
    this.keys = apiKeys.map((key, index) => ({ index, key, lastUsed: 0 }));
  }

  /**
   * Select the best available key: skip cooldown, sort by lastUsed (oldest first).
   * Returns null if all keys are in cooldown and not probe-eligible.
   */
  private selectKey(): KeyState | null {
    const available = this.keys
      .filter((k) => !isProfileInCooldown(this.name, k.index) || shouldProbeProfile(this.name, k.index))
      .sort((a, b) => {
        // Prefer keys not in cooldown over probe-eligible keys
        const aCooldown = isProfileInCooldown(this.name, a.index) ? 1 : 0;
        const bCooldown = isProfileInCooldown(this.name, b.index) ? 1 : 0;
        if (aCooldown !== bCooldown) return aCooldown - bCooldown;
        return a.lastUsed - b.lastUsed;
      });

    return available[0] ?? null;
  }

  async complete(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): Promise<CompletionResult> {
    let lastError: Error | undefined;
    const tried = new Set<number>();

    while (tried.size < this.keys.length) {
      const selected = this.selectKey();
      if (!selected || tried.has(selected.index)) break;
      tried.add(selected.index);

      this.underlying.setActiveKey(selected.key);
      selected.lastUsed = Date.now();

      try {
        const result = await this.underlying.complete(messages, options);
        clearProfileCooldown(this.name, selected.index);
        return result;
      } catch (err) {
        if (isUserAbort(err)) throw err;
        if (isContextOverflow(err)) throw err;

        const failoverErr = coerceToFailoverError(err, this.name, this.underlying.defaultModel);
        if (failoverErr) {
          markProfileCooldown(this.name, selected.index, failoverErr.reason);
        }

        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn('Key failed, trying next', {
          provider: this.name,
          keyIndex: selected.index,
          reason: failoverErr?.reason ?? 'unknown',
        });
      }
    }

    throw lastError ?? new FailoverError('rate_limit', this.name, this.defaultModel, 'All keys exhausted');
  }

  async *stream(
    messages: ChatMessage[],
    options?: CompletionOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    let lastError: Error | undefined;
    const tried = new Set<number>();

    while (tried.size < this.keys.length) {
      const selected = this.selectKey();
      if (!selected || tried.has(selected.index)) break;
      tried.add(selected.index);

      this.underlying.setActiveKey(selected.key);
      selected.lastUsed = Date.now();

      let chunksYielded = false;

      try {
        const stream = this.underlying.stream(messages, options);
        for await (const chunk of stream) {
          chunksYielded = true;
          yield chunk;
        }
        clearProfileCooldown(this.name, selected.index);
        return;
      } catch (err) {
        if (isUserAbort(err)) throw err;
        if (isContextOverflow(err)) throw err;

        const failoverErr = coerceToFailoverError(err, this.name, this.underlying.defaultModel);
        if (failoverErr) {
          markProfileCooldown(this.name, selected.index, failoverErr.reason);
        }

        // Mid-stream: can't retry, yield error chunk
        if (chunksYielded) {
          yield { type: 'error', error: err instanceof Error ? err.message : String(err) };
          return;
        }

        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn('Key stream failed, trying next', {
          provider: this.name,
          keyIndex: selected.index,
          reason: failoverErr?.reason ?? 'unknown',
        });
      }
    }

    throw lastError ?? new FailoverError('rate_limit', this.name, this.defaultModel, 'All keys exhausted (stream)');
  }
}
