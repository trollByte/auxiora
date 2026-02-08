import { describe, it, expect } from 'vitest';
import { IntentParser } from '../src/parser.js';
import { IntentDecomposer } from '../src/decomposer.js';

describe('IntentDecomposer', () => {
  const parser = new IntentParser();
  const decomposer = new IntentDecomposer(parser);

  it('should return single intent for simple message', () => {
    const intents = decomposer.decompose('Search for TypeScript tutorials');
    expect(intents).toHaveLength(1);
    expect(intents[0].type).toBe('search');
  });

  it('should detect compound intents with "and then"', () => {
    const intents = decomposer.decompose('Search for the file and then delete it');
    expect(intents.length).toBeGreaterThan(1);
  });

  it('should detect compound intents with "then"', () => {
    const intents = decomposer.decompose('Search for the file then summarize it');
    expect(intents.length).toBeGreaterThan(1);
  });

  it('should detect compound intents with semicolons', () => {
    const intents = decomposer.decompose('Send a message; schedule a meeting');
    expect(intents).toHaveLength(2);
  });

  it('should report compound status', () => {
    expect(decomposer.isCompound('do something')).toBe(false);
    expect(decomposer.isCompound('do this then do that')).toBe(true);
  });

  it('should parse each sub-intent independently', () => {
    const intents = decomposer.decompose('Send a message; search for something');
    expect(intents.length).toBe(2);
    // Each should have rawText from its sub-part
    expect(intents[0].rawText).not.toBe(intents[1].rawText);
  });

  it('should handle "after that"', () => {
    const intents = decomposer.decompose('Read the inbox after that send a reply');
    expect(intents.length).toBeGreaterThan(1);
  });
});
