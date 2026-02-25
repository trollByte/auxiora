import { isIP } from 'node:net';
import { BLOCKED_PROTOCOLS, type ValidatorOptions } from './types.js';

function isPrivateIP(ip: string): boolean {
  if (ip.includes(':')) {
    const normalized = normalizeIPv6(ip);
    if (normalized === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
    if (normalized === '0000:0000:0000:0000:0000:0000:0000:0000') return true;
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
        normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (normalized.startsWith('0000:0000:0000:0000:0000:ffff:')) {
      const lastTwo = normalized.slice(30);
      const hi = parseInt(lastTwo.slice(0, 4), 16);
      const lo = parseInt(lastTwo.slice(5, 9), 16);
      const ipv4 = ((hi << 16) | lo) >>> 0;
      return isPrivateIPv4Numeric(ipv4);
    }
    return false;
  }
  const num = parseIPv4ToNumber(ip);
  if (num === null) return false;
  return isPrivateIPv4Numeric(num);
}

function parseIPv4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

function isPrivateIPv4Numeric(ip: number): boolean {
  if ((ip >>> 24) === 127) return true;
  if ((ip >>> 24) === 10) return true;
  if ((ip >>> 20) === (172 << 4 | 1)) return true;
  if ((ip >>> 16) === (192 << 8 | 168)) return true;
  if ((ip >>> 16) === (169 << 8 | 254)) return true;
  if (ip === 0) return true;
  return false;
}

function normalizeIPv6(ip: string): string {
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
  if (ip.includes('::')) {
    const before = ip.split('::')[0].split(':').filter(Boolean);
    const after = ip.split('::')[1].split(':').filter(Boolean);
    const missing = 8 - before.length - after.length;
    parts = [...before, ...Array(missing).fill('0'), ...after];
  }
  return parts.map((p) => (p || '0').padStart(4, '0').toLowerCase()).join(':');
}

function isNumericHostname(hostname: string): boolean {
  if (/^\d+$/.test(hostname)) return true;
  if (/^0x[0-9a-fA-F]+$/i.test(hostname)) return true;
  if (/^[0-7]+\./.test(hostname) && hostname.startsWith('0') && !hostname.startsWith('0.')) return true;
  return false;
}

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
  if (BLOCKED_PROTOCOLS.includes(parsed.protocol)) {
    return `Blocked protocol: ${parsed.protocol} — only http: and https: are allowed`;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Blocked protocol: ${parsed.protocol} — only http: and https: are allowed`;
  }
  const hostname = parsed.hostname;
  if (options?.blockedUrls?.some((pattern) => hostname.includes(pattern))) {
    return `URL blocked by blocklist: ${hostname}`;
  }
  const isAllowed = options?.allowedUrls?.some((pattern) => hostname.includes(pattern));
  if (isAllowed) {
    return null;
  }
  if (isNumericHostname(hostname)) {
    return `Blocked numeric IP encoding: ${hostname}`;
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return `Blocked private/internal address: ${hostname}`;
  }
  const ipVersion = isIP(hostname);
  if (ipVersion > 0) {
    if (isPrivateIP(hostname)) {
      return `Blocked private/internal address: ${hostname}`;
    }
  }
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    const innerIP = hostname.slice(1, -1);
    if (isPrivateIP(innerIP)) {
      return `Blocked private/internal address: ${hostname}`;
    }
  }
  return null;
}

export { isPrivateIP, parseIPv4ToNumber, isNumericHostname, normalizeIPv6 };
