import { describe, it, expect } from 'vitest';
import { ComposeEngine } from '../src/composer.js';

describe('ComposeEngine', () => {
  const engine = new ComposeEngine();

  it('compose returns ComposeResult with text', () => {
    const result = engine.compose({
      content: 'Hello world',
      context: { platform: 'slack' },
    });
    expect(result.text).toContain('Hello world');
    expect(result.platform).toBe('slack');
  });

  it('adaptToneForPlatform email returns formal', () => {
    const result = engine.compose({
      content: 'Test',
      context: { platform: 'email' },
    });
    expect(result.tone).toBe('formal');
  });

  it('adaptToneForPlatform slack returns casual', () => {
    const result = engine.compose({
      content: 'Test',
      context: { platform: 'slack' },
    });
    expect(result.tone).toBe('casual');
  });

  it('adaptToneForPlatform twitter returns brief', () => {
    const result = engine.compose({
      content: 'Test',
      context: { platform: 'twitter' },
    });
    expect(result.tone).toBe('brief');
  });

  it('twitter enforced to 280 chars', () => {
    const longText = 'A'.repeat(300);
    const result = engine.compose({
      content: longText,
      context: { platform: 'twitter' },
    });
    expect(result.text.length).toBeLessThanOrEqual(280);
    expect(result.text.endsWith('...')).toBe(true);
  });

  it('sign-off added for email', () => {
    const result = engine.compose({
      content: 'Hello there',
      context: { platform: 'email' },
    });
    expect(result.text).toContain('Best regards,');
  });

  it('no sign-off for twitter', () => {
    const result = engine.compose({
      content: 'Hello there',
      context: { platform: 'twitter' },
    });
    expect(result.text).toBe('Hello there');
  });

  it('wordCount is accurate', () => {
    const result = engine.compose({
      content: 'one two three four five',
      context: { platform: 'slack' },
    });
    expect(result.wordCount).toBe(5);
  });

  it('characterCount is accurate', () => {
    const result = engine.compose({
      content: 'hello',
      context: { platform: 'slack' },
    });
    expect(result.characterCount).toBe(5);
  });

  it('explicit tone overrides platform default', () => {
    const result = engine.compose({
      content: 'Test',
      context: { platform: 'email', tone: 'casual' },
    });
    expect(result.tone).toBe('casual');
  });
});
