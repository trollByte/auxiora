import { BLOCKED_PROTOCOLS, PRIVATE_IP_RANGES } from './types.js';

interface ValidatorOptions {
  allowedUrls?: string[];
  blockedUrls?: string[];
}

/**
 * Validates a URL for browser navigation.
 * Returns null if valid, or an error message string.
 */
export function validateUrl(url: string, options?: ValidatorOptions): string | null {
  if (!url || typeof url !== 'string') {
    return 'URL must be a non-empty string';
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL format';
  }

  // Check blocked protocols
  if (BLOCKED_PROTOCOLS.includes(parsed.protocol)) {
    return `Blocked protocol: ${parsed.protocol} — only http: and https: are allowed`;
  }

  // Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Blocked protocol: ${parsed.protocol} — only http: and https: are allowed`;
  }

  const hostname = parsed.hostname;

  // Check blocklist first (takes priority)
  if (options?.blockedUrls?.some((pattern) => hostname.includes(pattern))) {
    return `URL blocked by blocklist: ${hostname}`;
  }

  // Check if in allowlist (skip private IP check if allowed)
  const isAllowed = options?.allowedUrls?.some((pattern) => hostname.includes(pattern));
  if (isAllowed) {
    return null;
  }

  // Check private/internal IPs
  const isPrivate = PRIVATE_IP_RANGES.some((range) => hostname.startsWith(range) || hostname === range);
  if (isPrivate) {
    return `Blocked private/internal address: ${hostname}`;
  }

  return null;
}
