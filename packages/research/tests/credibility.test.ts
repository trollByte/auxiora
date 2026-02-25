import { describe, it, expect } from 'vitest';
import { CredibilityScorer } from '../src/credibility.js';

describe('CredibilityScorer', () => {
  const scorer = new CredibilityScorer();

  it('wikipedia.org scores 0.95', () => {
    const score = scorer.score('https://wikipedia.org/wiki/Test');
    expect(score).toBe(0.95);
  });

  it('.gov domain scores 0.9', () => {
    const score = scorer.score('https://data.gov/dataset');
    expect(score).toBe(0.9);
  });

  it('.edu domain scores 0.9', () => {
    const score = scorer.score('https://mit.edu/research');
    expect(score).toBe(0.9);
  });

  it('unknown domain scores 0.5', () => {
    const score = scorer.score('https://randomsite.xyz/page');
    expect(score).toBe(0.5);
  });

  it('HTTPS bonus adds 0.05', () => {
    const base = scorer.score('https://randomsite.xyz/page');
    const withHttps = scorer.score('https://randomsite.xyz/page', { isHttps: true });
    expect(withHttps - base).toBeCloseTo(0.05);
  });

  it('crossReferenced adds 0.1', () => {
    const base = scorer.score('https://randomsite.xyz/page');
    const withCross = scorer.score('https://randomsite.xyz/page', { crossReferenced: true });
    expect(withCross - base).toBeCloseTo(0.1);
  });

  it('score clamped to max 1.0', () => {
    const score = scorer.score('https://wikipedia.org/wiki/Test', {
      isHttps: true,
      hasAuthor: true,
      hasDate: true,
      crossReferenced: true,
    });
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('extractDomain handles full URLs', () => {
    expect(scorer.extractDomain('https://www.example.com/path?q=1')).toBe('example.com');
    expect(scorer.extractDomain('https://sub.domain.org/page')).toBe('sub.domain.org');
  });
});
