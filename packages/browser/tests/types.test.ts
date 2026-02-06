import { describe, it, expect } from 'vitest';
import type { BrowserConfig, PageInfo, BrowseStep } from '../src/types.js';
import { DEFAULT_BROWSER_CONFIG, BLOCKED_PROTOCOLS, PRIVATE_IP_RANGES } from '../src/types.js';

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

  it('should list private IP ranges', () => {
    expect(PRIVATE_IP_RANGES.length).toBeGreaterThan(0);
    expect(PRIVATE_IP_RANGES).toContain('127.');
    expect(PRIVATE_IP_RANGES).toContain('10.');
    expect(PRIVATE_IP_RANGES).toContain('192.168.');
    expect(PRIVATE_IP_RANGES).toContain('169.254.');
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
