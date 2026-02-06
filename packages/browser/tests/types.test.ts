import { describe, it, expect } from 'vitest';
import type { BrowserConfig, PageInfo, BrowseStep } from '../src/types.js';
import { DEFAULT_BROWSER_CONFIG, BLOCKED_PROTOCOLS } from '../src/types.js';
import { isPrivateIP, parseIPv4ToNumber, isNumericHostname, normalizeIPv6 } from '../src/url-validator.js';

describe('Browser types', () => {
  it('should provide sensible default config', () => {
    expect(DEFAULT_BROWSER_CONFIG.headless).toBe(true);
    expect(DEFAULT_BROWSER_CONFIG.viewport).toEqual({ width: 1280, height: 720 });
    expect(DEFAULT_BROWSER_CONFIG.navigationTimeout).toBe(30_000);
    expect(DEFAULT_BROWSER_CONFIG.actionTimeout).toBe(10_000);
    expect(DEFAULT_BROWSER_CONFIG.maxConcurrentPages).toBe(10);
    expect(DEFAULT_BROWSER_CONFIG.screenshotDir).toBe('screenshots');
  });

  it('should block dangerous protocols', () => {
    expect(BLOCKED_PROTOCOLS).toContain('file:');
    expect(BLOCKED_PROTOCOLS).toContain('javascript:');
    expect(BLOCKED_PROTOCOLS).not.toContain('https:');
  });

  it('should detect private IPv4 addresses numerically', () => {
    expect(isPrivateIP('127.0.0.1')).toBe(true);
    expect(isPrivateIP('10.0.0.1')).toBe(true);
    expect(isPrivateIP('192.168.1.1')).toBe(true);
    expect(isPrivateIP('169.254.169.254')).toBe(true);
    expect(isPrivateIP('172.16.0.1')).toBe(true);
    expect(isPrivateIP('172.31.255.255')).toBe(true);
    expect(isPrivateIP('0.0.0.0')).toBe(true);
    // Public IPs should not be private
    expect(isPrivateIP('8.8.8.8')).toBe(false);
    expect(isPrivateIP('172.32.0.1')).toBe(false);
    expect(isPrivateIP('1.1.1.1')).toBe(false);
  });

  it('should detect private IPv6 addresses', () => {
    expect(isPrivateIP('::1')).toBe(true);
    expect(isPrivateIP('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIP('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateIP('fe80::1')).toBe(true);
    expect(isPrivateIP('fd00::1')).toBe(true);
  });

  it('should detect numeric hostname encodings', () => {
    expect(isNumericHostname('2130706433')).toBe(true);
    expect(isNumericHostname('0x7f000001')).toBe(true);
    expect(isNumericHostname('0177.0.0.1')).toBe(true);
    expect(isNumericHostname('example.com')).toBe(false);
    expect(isNumericHostname('127.0.0.1')).toBe(false); // standard dotted-decimal is not "numeric encoding"
  });

  it('should have correct TypeScript types (compile check)', () => {
    const config: BrowserConfig = {
      ...DEFAULT_BROWSER_CONFIG,
      headless: false,
    };
    expect(config.headless).toBe(false);

    const pageInfo: PageInfo = {
      url: 'https://example.com',
      title: 'Example',
    };
    expect(pageInfo.url).toBe('https://example.com');

    const step: BrowseStep = {
      action: 'navigate',
      params: { url: 'https://example.com' },
      result: 'Navigated to Example',
    };
    expect(step.action).toBe('navigate');
  });
});
