import { describe, it, expect } from 'vitest';
import {
  generatePKCE,
  buildAuthorizationUrl,
} from '../src/claude-oauth.js';

describe('PKCE generation', () => {
  it('generates a verifier of 43-128 chars using unreserved chars', () => {
    const { verifier } = generatePKCE();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('generates a base64url-encoded SHA-256 challenge', () => {
    const { challenge } = generatePKCE();
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge.length).toBe(43);
  });

  it('generates unique values each call', () => {
    const a = generatePKCE();
    const b = generatePKCE();
    expect(a.verifier).not.toBe(b.verifier);
  });
});

describe('buildAuthorizationUrl', () => {
  it('includes all required OAuth parameters', () => {
    const url = buildAuthorizationUrl('test-challenge-value');
    const parsed = new URL(url);

    expect(parsed.origin).toBe('https://claude.ai');
    expect(parsed.pathname).toBe('/oauth/authorize');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBeTruthy();
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://console.anthropic.com/oauth/code/callback'
    );
    expect(parsed.searchParams.get('scope')).toContain('user:inference');
    expect(parsed.searchParams.get('code_challenge')).toBe('test-challenge-value');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
  });
});
