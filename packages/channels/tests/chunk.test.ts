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
});
