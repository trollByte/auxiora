import { describe, it, expect } from 'vitest';
import { ProviderFactory } from '../src/factory.js';

describe('ProviderFactory — resolveFallbackCandidates', () => {
  it('should return primary first, then fallback, then others', () => {
    const factory = new ProviderFactory({
      primary: 'anthropic',
      fallback: 'openai',
      config: {
        anthropic: { apiKey: 'sk-test-1' },
        openai: { apiKey: 'sk-test-2' },
        google: { apiKey: 'test-3' },
      },
    });

    const candidates = factory.resolveFallbackCandidates();
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    expect(candidates[0]!.name).toBe('anthropic');
    expect(candidates[1]!.name).toBe('openai');
    // google should be in the list somewhere after
    expect(candidates.some((c) => c.name === 'google')).toBe(true);
  });

  it('should return only primary when no other providers configured', () => {
    const factory = new ProviderFactory({
      primary: 'anthropic',
      config: {
        anthropic: { apiKey: 'sk-test' },
      },
    });

    const candidates = factory.resolveFallbackCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.name).toBe('anthropic');
  });

  it('should deduplicate when fallback equals primary', () => {
    const factory = new ProviderFactory({
      primary: 'anthropic',
      fallback: 'anthropic',
      config: {
        anthropic: { apiKey: 'sk-test' },
      },
    });

    const candidates = factory.resolveFallbackCandidates();
    expect(candidates).toHaveLength(1);
  });

  it('should accept model override', () => {
    const factory = new ProviderFactory({
      primary: 'anthropic',
      config: {
        anthropic: { apiKey: 'sk-test' },
      },
    });

    const candidates = factory.resolveFallbackCandidates('claude-sonnet-4-5-20250929');
    expect(candidates[0]!.model).toBe('claude-sonnet-4-5-20250929');
  });
});
