import { describe, it, expect } from 'vitest';
import { AnthropicProvider } from '../src/anthropic.js';
import { OpenAIProvider } from '../src/openai.js';

describe('setActiveKey', () => {
  it('should exist on AnthropicProvider', () => {
    const provider = new AnthropicProvider({ apiKey: 'sk-test-key-1' });
    expect(typeof provider.setActiveKey).toBe('function');
  });

  it('should exist on OpenAIProvider', () => {
    const provider = new OpenAIProvider({ apiKey: 'sk-test-key-1' });
    expect(typeof provider.setActiveKey).toBe('function');
  });

  it('should not throw when setting a new key on AnthropicProvider', () => {
    const provider = new AnthropicProvider({ apiKey: 'sk-test-key-1' });
    expect(() => provider.setActiveKey('sk-test-key-2')).not.toThrow();
  });

  it('should not throw when setting a new key on OpenAIProvider', () => {
    const provider = new OpenAIProvider({ apiKey: 'sk-test-key-1' });
    expect(() => provider.setActiveKey('sk-test-key-2')).not.toThrow();
  });
});
