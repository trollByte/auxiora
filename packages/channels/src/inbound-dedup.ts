/**
 * In-memory TTL-based deduplication cache for inbound channel messages.
 *
 * Prevents duplicate processing when webhook platforms retry delivery.
 * Key: channelType|channelId|messageId. Entries auto-expire after ttlMs.
 */

const DEFAULT_TTL_MS = 20 * 60_000; // 20 minutes
const DEFAULT_MAX_SIZE = 5000;

const cache = new Map<string, number>();

function buildKey(channelType: string, channelId: string, messageId: string): string {
  return `${channelType}|${channelId}|${messageId}`;
}

function evictExpired(now: number): void {
  for (const [key, insertedAt] of cache) {
    if (now - insertedAt > DEFAULT_TTL_MS) {
      cache.delete(key);
    }
  }
}

function evictOldest(): void {
  if (cache.size <= DEFAULT_MAX_SIZE) return;
  // Map iterates in insertion order — first entry is oldest
  const firstKey = cache.keys().next().value;
  if (firstKey !== undefined) {
    cache.delete(firstKey);
  }
}

/**
 * Check if a message is a duplicate.
 *
 * Returns `true` if this exact channelType+channelId+messageId was seen
 * within the TTL window. Returns `false` (and records the message) if new.
 * Empty messageId always returns `false` (bypass dedup).
 */
export function isDuplicate(channelType: string, channelId: string, messageId: string): boolean {
  if (!messageId) return false;

  const now = Date.now();
  evictExpired(now);

  const key = buildKey(channelType, channelId, messageId);
  const insertedAt = cache.get(key);

  if (insertedAt !== undefined && now - insertedAt <= DEFAULT_TTL_MS) {
    return true;
  }

  cache.set(key, now);
  evictOldest();
  return false;
}

/** Clear all cached entries. For testing. */
export function resetInboundDedup(): void {
  cache.clear();
}
