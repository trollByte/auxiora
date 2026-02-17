import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../src/token-estimator.js';

describe('estimateTokens', () => {
  describe('English prose', () => {
    it('should estimate ~1 token per 4 characters for plain English', () => {
      const text = 'The quick brown fox jumps over the lazy dog near the river';
      const estimate = estimateTokens(text);
      expect(estimate).toBe(Math.ceil(text.length / 4));
    });

    it('should handle short text', () => {
      expect(estimateTokens('Hi')).toBeGreaterThanOrEqual(1);
    });
  });

  describe('code content', () => {
    it('should estimate higher token density for code', () => {
      const code = 'function foo(bar) { return bar.map((x) => x * 2); }' +
        '\nconst result = foo([1, 2, 3]);' +
        '\nif (result.length > 0) { console.log(result); }';
      const estimate = estimateTokens(code);
      const proseEstimate = Math.ceil(code.length / 4);
      expect(estimate).toBeGreaterThan(proseEstimate);
    });

    it('should detect JSON as code-like', () => {
      const json = '{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]}';
      const estimate = estimateTokens(json);
      const proseEstimate = Math.ceil(json.length / 4);
      expect(estimate).toBeGreaterThan(proseEstimate);
    });
  });

  describe('CJK content', () => {
    it('should estimate higher token density for Chinese text', () => {
      const chinese = '\u4F60\u597D\u4E16\u754C\u6B22\u8FCE\u6765\u5230\u8FD9\u91CC\u6211\u4EEC\u4E00\u8D77\u5B66\u4E60\u4EBA\u5DE5\u667A\u80FD';
      const estimate = estimateTokens(chinese);
      const proseEstimate = Math.ceil(chinese.length / 4);
      expect(estimate).toBeGreaterThan(proseEstimate);
    });

    it('should estimate higher token density for Japanese text', () => {
      const japanese = '\u3053\u3093\u306B\u3061\u306F\u4E16\u754C\u3088\u3046\u3053\u305D\u30D7\u30ED\u30B0\u30E9\u30DF\u30F3\u30B0\u306E\u4E16\u754C\u3078';
      const estimate = estimateTokens(japanese);
      const proseEstimate = Math.ceil(japanese.length / 4);
      expect(estimate).toBeGreaterThan(proseEstimate);
    });

    it('should estimate higher token density for Korean text', () => {
      const korean = '\uC548\uB155\uD558\uC138\uC694 \uC138\uACC4 \uD504\uB85C\uADF8\uB798\uBC0D \uC138\uACC4\uC5D0 \uC624\uC2E0 \uAC83\uC744 \uD658\uC601\uD569\uB2C8\uB2E4';
      const estimate = estimateTokens(korean);
      const proseEstimate = Math.ceil(korean.length / 4);
      expect(estimate).toBeGreaterThan(proseEstimate);
    });
  });

  describe('mixed content', () => {
    it('should blend ratios for mixed prose and code', () => {
      const mixed = 'Here is the implementation:\n' +
        'function add(a, b) { return a + b; }\n' +
        'This function adds two numbers together.';
      const estimate = estimateTokens(mixed);
      const pureProseEstimate = Math.ceil(mixed.length / 4);
      expect(estimate).toBeGreaterThanOrEqual(pureProseEstimate);
    });
  });

  describe('edge cases', () => {
    it('should return 1 for empty string', () => {
      expect(estimateTokens('')).toBe(1);
    });

    it('should return 1 for single character', () => {
      expect(estimateTokens('a')).toBe(1);
    });

    it('should handle whitespace-only content', () => {
      expect(estimateTokens('   \n\t  ')).toBeGreaterThanOrEqual(1);
    });

    it('should handle very long content', () => {
      const long = 'word '.repeat(10000);
      const estimate = estimateTokens(long);
      expect(estimate).toBeGreaterThan(0);
      expect(estimate).toBeLessThan(long.length);
    });
  });
});
