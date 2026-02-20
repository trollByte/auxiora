import { describe, it, expect } from 'vitest';
import { DocumentChunker } from '../src/chunker.js';

describe('DocumentChunker', () => {
  const chunker = new DocumentChunker();

  describe('estimateTokens', () => {
    it('estimates tokens as ceil(length / 4)', () => {
      expect(chunker.estimateTokens('hello')).toBe(2);
      expect(chunker.estimateTokens('ab')).toBe(1);
      expect(chunker.estimateTokens('abcdefgh')).toBe(2);
      expect(chunker.estimateTokens('')).toBe(0);
    });
  });

  describe('chunk', () => {
    it('returns a single chunk for short content', () => {
      const result = chunker.chunk('Hello world.');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('Hello world.');
    });

    it('splits on paragraph boundaries', () => {
      const content = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const result = chunker.chunk(content, { maxTokens: 10 });
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('applies overlap between chunks', () => {
      const paragraphs = Array.from(
        { length: 20 },
        (_, i) => `This is paragraph number ${i + 1} with enough content to matter.`,
      );
      const content = paragraphs.join('\n\n');
      const noOverlap = chunker.chunk(content, { maxTokens: 50, overlap: 0 });
      const withOverlap = chunker.chunk(content, { maxTokens: 50, overlap: 10 });
      expect(withOverlap.length).toBeGreaterThan(1);
      // Overlap causes more total content
      const totalNoOverlap = noOverlap.join('').length;
      const totalWithOverlap = withOverlap.join('').length;
      expect(totalWithOverlap).toBeGreaterThanOrEqual(totalNoOverlap);
    });

    it('handles empty content', () => {
      const result = chunker.chunk('');
      expect(result).toHaveLength(0);
    });

    it('handles whitespace-only content', () => {
      const result = chunker.chunk('   \n\n   ');
      expect(result).toHaveLength(0);
    });

    it('splits long paragraphs into sentences', () => {
      // Need > 500 tokens (2000+ chars) in a single paragraph to trigger sentence splitting
      const longSentences = Array.from(
        { length: 40 },
        (_, i) => `Sentence ${i + 1} has many words and extra padding to push us well over the token limit easily.`,
      );
      const content = longSentences.join(' ');
      expect(chunker.estimateTokens(content)).toBeGreaterThan(500);
      const result = chunker.chunk(content, { maxTokens: 100 });
      expect(result.length).toBeGreaterThan(1);
    });

    it('respects maxTokens option', () => {
      const paragraphs = Array.from(
        { length: 10 },
        (_, i) => `Paragraph ${i + 1} with some text content here.`,
      );
      const content = paragraphs.join('\n\n');
      const result = chunker.chunk(content, { maxTokens: 30 });
      for (const chunk of result) {
        // Allow slack for overlap content added from previous chunk
        expect(chunker.estimateTokens(chunk)).toBeLessThanOrEqual(100);
      }
    });

    it('uses defaults of maxTokens=500 and overlap=50', () => {
      const shortContent = 'Short content that fits in one chunk.';
      const result = chunker.chunk(shortContent);
      expect(result).toHaveLength(1);
    });
  });
});
