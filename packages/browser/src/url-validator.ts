import { isIP } from 'node:net';
import { BLOCKED_PROTOCOLS } from './types.js';

interface ValidatorOptions {
  allowedUrls?: string[];
  blockedUrls?: string[];
}

/**
 * Check if an IP address (v4 or v6) falls within private/internal ranges.
 * Uses numeric comparison instead of string prefix matching to prevent
 * bypass via decimal, hex, or octal IP encodings.
 */
function isPrivateIP(ip: string): boolean {
  // IPv6 checks
  if (ip.includes(':')) {
    const normalized = normalizeIPv6(ip);
    // ::1 (loopback)
    if (normalized === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
    // :: (unspecified)
    if (normalized === '0000:0000:0000:0000:0000:0000:0000:0000') return true;
    // fe80::/10 (link-local)
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
        normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
    // fc00::/7 (unique local)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    // ::ffff:x.x.x.x (IPv4-mapped IPv6)
    if (normalized.startsWith('0000:0000:0000:0000:0000:ffff:')) {
      const lastTwo = normalized.slice(30); // e.g., "7f00:0001"
      const hi = parseInt(lastTwo.slice(0, 4), 16);
      const lo = parseInt(lastTwo.slice(5, 9), 16);
      const ipv4 = ((hi << 16) | lo) >>> 0;
      return isPrivateIPv4Numeric(ipv4);
    }
    return false;
  }

  // IPv4: parse to numeric
  const num = parseIPv4ToNumber(ip);
  if (num === null) return false;
  return isPrivateIPv4Numeric(num);
}

/**
 * Parse an IPv4 address string to a 32-bit unsigned number.
 * Handles standard dotted-decimal (e.g. "127.0.0.1").
 */
function parseIPv4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0; // unsigned
}

/**
 * Check if a numeric IPv4 address is in a private/internal range.
 */
function isPrivateIPv4Numeric(ip: number): boolean {
  // 127.0.0.0/8 (loopback)
  if ((ip >>> 24) === 127) return true;
  // 10.0.0.0/8
  if ((ip >>> 24) === 10) return true;
  // 172.16.0.0/12
  if ((ip >>> 20) === (172 << 4 | 1)) return true; // 0xAC1 = 172.16-31
  // 192.168.0.0/16
  if ((ip >>> 16) === (192 << 8 | 168)) return true; // 0xC0A8
  // 169.254.0.0/16 (link-local)
  if ((ip >>> 16) === (169 << 8 | 254)) return true; // 0xA9FE
  // 0.0.0.0
  if (ip === 0) return true;
  return false;
}

/**
 * Normalize an IPv6 address to its full expanded form.
 */
function normalizeIPv6(ip: string): string {
  // Handle IPv4-mapped addresses like ::ffff:127.0.0.1
  const v4MappedMatch = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4MappedMatch) {
    const v4num = parseIPv4ToNumber(v4MappedMatch[1]);
    if (v4num !== null) {
      const hi = (v4num >>> 16) & 0xffff;
      const lo = v4num & 0xffff;
      return `0000:0000:0000:0000:0000:ffff:${hi.toString(16).padStart(4, '0')}:${lo.toString(16).padStart(4, '0')}`;
    }
  }

  let parts = ip.split(':');
  // Handle :: expansion
  const emptyIndex = parts.indexOf('');
  if (ip.includes('::')) {
    const before = ip.split('::')[0].split(':').filter(Boolean);
    const after = ip.split('::')[1].split(':').filter(Boolean);
    const missing = 8 - before.length - after.length;
    parts = [...before, ...Array(missing).fill('0'), ...after];
  }

  return parts.map((p) => (p || '0').padStart(4, '0').toLowerCase()).join(':');
}

/**
 * Check if a hostname looks like a numeric IP (decimal, hex, octal)
 * that could bypass string-based checks.
 */
function isNumericHostname(hostname: string): boolean {
  // Pure decimal number (e.g., 2130706433 for 127.0.0.1)
  if (/^\d+$/.test(hostname)) return true;
  // Hex number (e.g., 0x7f000001)
  if (/^0x[0-9a-fA-F]+$/i.test(hostname)) return true;
  // Octal parts (e.g., 0177.0.0.1)
  if (/^[0-7]+\./.test(hostname) && hostname.startsWith('0') && !hostname.startsWith('0.')) return true;
  return false;
}

/**
 * Validates a URL for browser navigation.
 * Returns null if valid, or an error message string.
 *
 * Blocks:
 * - Non http/https protocols (file:, javascript:, data:, blob:)
 * - Private/internal IP addresses (127.x, 10.x, 192.168.x, 172.16-31.x, 169.254.x, localhost)
 * - Numeric IP bypasses (decimal, hex, octal encodings)
 * - IPv6-mapped IPv4 addresses (::ffff:127.0.0.1)
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

  // Block numeric IP encodings (decimal, hex, octal) that could bypass string checks
  if (isNumericHostname(hostname)) {
    return `Blocked numeric IP encoding: ${hostname}`;
  }

  // Block localhost
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return `Blocked private/internal address: ${hostname}`;
  }

  // Check if hostname is an IP address
  const ipVersion = isIP(hostname);
  if (ipVersion > 0) {
    // It's a direct IP — check against private ranges numerically
    if (isPrivateIP(hostname)) {
      return `Blocked private/internal address: ${hostname}`;
    }
  }

  // Check hostnames that resolve to IPv6 loopback patterns
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    const innerIP = hostname.slice(1, -1);
    if (isPrivateIP(innerIP)) {
      return `Blocked private/internal address: ${hostname}`;
    }
  }

  return null;
}

// Export for testing
export { isPrivateIP, parseIPv4ToNumber, isNumericHostname, normalizeIPv6 };
