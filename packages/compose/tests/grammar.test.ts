import { describe, it, expect } from 'vitest';
import { GrammarChecker } from '../src/grammar.js';

describe('GrammarChecker', () => {
  const checker = new GrammarChecker();

  it('detects double spaces', () => {
    const issues = checker.check('Hello  world.');
    expect(issues.some((i) => i.message === 'Double space detected')).toBe(true);
  });

  it('detects repeated words', () => {
    const issues = checker.check('The the cat sat.');
    expect(issues.some((i) => i.message.includes('Repeated word'))).toBe(true);
  });

  it('detects long sentences (>40 words)', () => {
    const words = Array.from({ length: 45 }, (_, i) => `word${i}`).join(' ') + '.';
    const issues = checker.check(words);
    expect(issues.some((i) => i.message.includes('words long'))).toBe(true);
  });

  it('detects passive voice pattern', () => {
    const issues = checker.check('The report was completed yesterday.');
    expect(issues.some((i) => i.message === 'Possible passive voice')).toBe(true);
  });

  it('detects weasel words', () => {
    const issues = checker.check('This is very important.');
    expect(issues.some((i) => i.message.includes('Weasel word'))).toBe(true);
  });

  it('detects missing period', () => {
    const issues = checker.check('Hello world');
    expect(issues.some((i) => i.message === 'Text does not end with punctuation')).toBe(true);
  });

  it('returns empty for clean text', () => {
    const issues = checker.check('The cat sat on the mat.');
    expect(issues.length).toBe(0);
  });

  it('issues sorted by position', () => {
    const issues = checker.check('The  the  cat is very nice');
    for (let i = 1; i < issues.length; i++) {
      expect(issues[i].position.start).toBeGreaterThanOrEqual(issues[i - 1].position.start);
    }
  });
});
