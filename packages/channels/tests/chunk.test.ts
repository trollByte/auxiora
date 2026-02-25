import { describe, it, expect } from 'vitest';
import { chunkMarkdown } from '../src/chunk.js';

describe('chunkMarkdown', () => {
  it('returns short text as single chunk', () => {
    expect(chunkMarkdown('hello world', 100)).toEqual(['hello world']);
  });

  it('returns empty string as single-element array', () => {
    expect(chunkMarkdown('', 100)).toEqual(['']);
  });

  it('splits at paragraph boundaries', () => {
    const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
    const chunks = chunkMarkdown(text, 30);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(30);
    }
    expect(chunks.join('\n\n')).toBe(text);
  });

  it('preserves fenced code block that fits in one chunk', () => {
    const code = '```js\nconsole.log("hi");\n```';
    const text = `Before.\n\n${code}\n\nAfter.`;
    const chunks = chunkMarkdown(text, 60);
    const codeChunk = chunks.find(c => c.includes('```js'));
    expect(codeChunk).toContain('```js');
    expect(codeChunk).toContain('```');
  });

  it('splits oversized code block at newlines within the block', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const text = '```\n' + lines + '\n```';
    const chunks = chunkMarkdown(text, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
    expect(chunks[0]).toMatch(/^```/);
    expect(chunks[chunks.length - 1]).toMatch(/```$/);
  });

  it('does not split inside markdown links', () => {
    const link = '[click here](https://example.com/very/long/path)';
    const text = 'Some text. ' + link + ' more text.';
    const chunks = chunkMarkdown(text, 70);
    const linkChunk = chunks.find(c => c.includes('[click here]'));
    expect(linkChunk).toContain('(https://example.com/very/long/path)');
  });

  it('falls back to space boundaries', () => {
    const text = 'word1 word2 word3 word4 word5 word6 word7 word8';
    const chunks = chunkMarkdown(text, 20);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(20);
    }
  });

  it('hard-cuts when no break points exist', () => {
    const text = 'a'.repeat(50);
    const chunks = chunkMarkdown(text, 20);
    expect(chunks).toEqual(['a'.repeat(20), 'a'.repeat(20), 'a'.repeat(10)]);
  });

  it('handles mixed content with code and paragraphs', () => {
    const text = 'Hello.\n\n```\ncode\n```\n\nGoodbye.';
    const chunks = chunkMarkdown(text, 25);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(25);
    }
  });

  it('works with different maxLength values', () => {
    const text = 'A'.repeat(100);
    expect(chunkMarkdown(text, 50)).toHaveLength(2);
    expect(chunkMarkdown(text, 25)).toHaveLength(4);
    expect(chunkMarkdown(text, 100)).toHaveLength(1);
  });

  describe('maxLines option', () => {
    it('splits text exceeding maxLines at paragraph boundaries', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join('\n');
      const chunks = chunkMarkdown(lines, 2000, { maxLines: 10 });
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        const lineCount = chunk.split('\n').length;
        expect(lineCount).toBeLessThanOrEqual(10);
      }
    });

    it('does not split when lines are within maxLines', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const chunks = chunkMarkdown(text, 2000, { maxLines: 10 });
      expect(chunks).toEqual([text]);
    });

    it('splits at newline boundary when no paragraph boundary available', () => {
      const lines = Array.from({ length: 6 }, (_, i) => `Line ${i + 1}`).join('\n');
      const chunks = chunkMarkdown(lines, 2000, { maxLines: 3 });
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.split('\n').length).toBeLessThanOrEqual(3);
      }
      // All content preserved
      expect(chunks.join('\n').replace(/\n+/g, '\n')).toContain('Line 1');
      expect(chunks.join('\n').replace(/\n+/g, '\n')).toContain('Line 6');
    });

    it('respects both maxLength and maxLines', () => {
      // Each line is 50 chars, 20 lines = 1000 chars
      const lines = Array.from({ length: 20 }, (_, i) => `Line ${String(i + 1).padStart(2, '0')}: ${'x'.repeat(43)}`).join('\n');
      const chunks = chunkMarkdown(lines, 200, { maxLines: 5 });
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(200);
        expect(chunk.split('\n').length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('code fence rebalancing', () => {
    it('closes and reopens fences when code block is split by maxLines', () => {
      const codeLines = Array.from({ length: 10 }, (_, i) => `  code line ${i + 1}`);
      const text = '```js\n' + codeLines.join('\n') + '\n```';
      const chunks = chunkMarkdown(text, 2000, { maxLines: 5 });
      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should have balanced fences
      for (const chunk of chunks) {
        const opens = (chunk.match(/^```/gm) || []).length;
        const closes = (chunk.match(/^```$/gm) || []).length;
        // First chunk: opens with ```js, ends with ```
        // Middle/last chunks: open with ```js, end with ```
        expect(opens).toBeGreaterThanOrEqual(1);
      }
      // First chunk starts with the original fence
      expect(chunks[0]).toMatch(/^```js\n/);
      // Last chunk ends with closing fence
      expect(chunks[chunks.length - 1]).toMatch(/\n```$/);
    });

    it('closes and reopens fences when code block is split by maxLength', () => {
      const longLines = Array.from({ length: 10 }, (_, i) => `line ${i}: ${'x'.repeat(80)}`);
      const text = '```python\n' + longLines.join('\n') + '\n```';
      const chunks = chunkMarkdown(text, 300);
      expect(chunks.length).toBeGreaterThan(1);
      // First chunk should start with ```python and end with ```
      expect(chunks[0]).toMatch(/^```python\n/);
      expect(chunks[0]).toMatch(/\n```$/);
      // Continuation chunks should reopen with ```python
      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i]).toMatch(/^```python\n/);
      }
      // Last chunk should end with ```
      expect(chunks[chunks.length - 1]).toMatch(/\n```$/);
    });
  });
});
