import { describe, it, expect } from 'vitest';
import { ProviderFactory } from '../src/factory.js';
import { ProfileRotator } from '../src/profile-rotator.js';

describe('ProviderFactory — key rotation wrapping', () => {
  it('should wrap provider with ProfileRotator when multiple keys', () => {
    const factory = new ProviderFactory({
      primary: 'openai',
      config: {
        openai: { apiKeys: ['key-1', 'key-2'] },
      },
    });

    const provider = factory.getPrimaryProvider();
    expect(provider).toBeInstanceOf(ProfileRotator);
  });

  it('should NOT wrap provider with single key', () => {
    const factory = new ProviderFactory({
      primary: 'openai',
      config: {
        openai: { apiKey: 'single-key' },
      },
    });

    const provider = factory.getPrimaryProvider();
    expect(provider).not.toBeInstanceOf(ProfileRotator);
  });

  it('should handle apiKey backward compat (treat as single-element array)', () => {
    const factory = new ProviderFactory({
      primary: 'openai',
      config: {
        openai: { apiKey: 'my-key' },
      },
    });

    const provider = factory.getPrimaryProvider();
    expect(provider.name).toBe('openai');
  });

  it('should prioritize apiKeys over apiKey', () => {
    const factory = new ProviderFactory({
      primary: 'openai',
      config: {
        openai: { apiKey: 'ignored', apiKeys: ['key-1', 'key-2'] },
      },
    });

    const provider = factory.getPrimaryProvider();
    expect(provider).toBeInstanceOf(ProfileRotator);
  });
});
