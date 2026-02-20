import { describe, expect, it } from 'vitest';
import {
  containsExpected,
  exactMatch,
  keywordCoverage,
  lengthRatio,
  responseRelevance,
  sentenceCompleteness,
  toxicityScore,
} from '../src/metrics.js';

describe('exactMatch', () => {
  it('returns 1 for exact match (case-insensitive, trimmed)', () => {
    expect(exactMatch('  Hello World  ', 'hello world')).toBe(1);
  });

  it('returns 0 for non-match', () => {
    expect(exactMatch('Hello', 'World')).toBe(0);
  });
});

describe('containsExpected', () => {
  it('returns 1 when output contains expected', () => {
    expect(containsExpected('The answer is 42.', '42')).toBe(1);
  });

  it('returns 0 when output does not contain expected', () => {
    expect(containsExpected('The answer is unknown.', '42')).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(containsExpected('Hello World', 'hello')).toBe(1);
  });
});

describe('lengthRatio', () => {
  it('returns 1 for equal length strings', () => {
    expect(lengthRatio('abc', 'xyz')).toBe(1);
  });

  it('returns ratio for different length strings', () => {
    expect(lengthRatio('ab', 'abcd')).toBe(0.5);
  });

  it('returns 1 for two empty strings', () => {
    expect(lengthRatio('', '')).toBe(1);
  });

  it('returns 0 when one string is empty', () => {
    expect(lengthRatio('', 'hello')).toBe(0);
  });
});

describe('keywordCoverage', () => {
  it('returns 1 when all keywords found', () => {
    expect(keywordCoverage('the cat sat on the mat', 'cat sat mat')).toBe(1);
  });

  it('returns fraction for partial coverage', () => {
    expect(keywordCoverage('the cat ran away', 'cat sat mat')).toBeCloseTo(1 / 3);
  });

  it('returns 1 for empty reference', () => {
    expect(keywordCoverage('anything', '')).toBe(1);
  });

  it('ignores short words (<=2 chars)', () => {
    expect(keywordCoverage('anything', 'a to is')).toBe(1);
  });
});

describe('sentenceCompleteness', () => {
  it('returns 1 when all sentences end with punctuation', () => {
    expect(sentenceCompleteness('Hello. World!')).toBe(1);
  });

  it('returns fraction for incomplete sentences', () => {
    expect(sentenceCompleteness('Hello. World')).toBe(0.5);
  });

  it('returns 0 for empty string', () => {
    expect(sentenceCompleteness('')).toBe(0);
  });
});

describe('responseRelevance', () => {
  it('returns 1 when all input keywords appear in output', () => {
    expect(responseRelevance('TypeScript programming language', 'TypeScript programming language')).toBe(1);
  });

  it('returns fraction for partial overlap', () => {
    const score = responseRelevance('Python is great', 'What is TypeScript programming?');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(1);
  });

  it('returns 1 for empty input', () => {
    expect(responseRelevance('anything', '')).toBe(1);
  });
});

describe('toxicityScore', () => {
  it('returns 1 for clean text', () => {
    expect(toxicityScore('This is a nice and friendly message.')).toBe(1);
  });

  it('returns less than 1 for toxic text', () => {
    expect(toxicityScore('You are an idiot and a moron.')).toBeLessThan(1);
  });

  it('returns value between 0 and 1', () => {
    const score = toxicityScore('hate stupid');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
