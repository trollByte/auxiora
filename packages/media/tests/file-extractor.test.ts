import { describe, it, expect, vi } from 'vitest';
import { FileExtractor } from '../src/providers/file-extractor.js';
import type { Attachment } from '../src/types.js';

describe('FileExtractor', () => {
  const extractor = new FileExtractor();

  it('should have id and capabilities', () => {
    expect(extractor.id).toBe('file-extractor');
    expect(extractor.capabilities).toContain('file');
  });

  it('should extract text from a Buffer', async () => {
    const attachment: Attachment = {
      type: 'file',
      data: Buffer.from('Hello, World!'),
      filename: 'test.txt',
      mimeType: 'text/plain',
    };
    const result = await extractor.processAttachment(attachment);
    expect(result.success).toBe(true);
    expect(result.text).toBe('Hello, World!');
    expect(result.filename).toBe('test.txt');
  });

  it('should fetch and extract from URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"key": "value"}'),
    }));

    const attachment: Attachment = {
      type: 'file',
      url: 'https://example.com/data.json',
      filename: 'data.json',
      mimeType: 'application/json',
    };
    const result = await extractor.processAttachment(attachment);
    expect(result.success).toBe(true);
    expect(result.text).toBe('{"key": "value"}');

    vi.unstubAllGlobals();
  });

  it('should reject non-text MIME types', async () => {
    const attachment: Attachment = {
      type: 'file',
      data: Buffer.from('binary'),
      filename: 'image.png',
      mimeType: 'image/png',
    };
    const result = await extractor.processAttachment(attachment);
    expect(result.success).toBe(false);
    expect(result.error).toContain('unsupported');
  });

  it('should handle missing data and URL gracefully', async () => {
    const attachment: Attachment = { type: 'file', filename: 'empty.txt' };
    const result = await extractor.processAttachment(attachment);
    expect(result.success).toBe(false);
  });

  it('should truncate large files', async () => {
    const bigText = 'x'.repeat(100_000);
    const attachment: Attachment = {
      type: 'file',
      data: Buffer.from(bigText),
      filename: 'big.txt',
      mimeType: 'text/plain',
    };
    const result = await extractor.processAttachment(attachment);
    expect(result.success).toBe(true);
    expect(result.text!.length).toBeLessThanOrEqual(50_001 + 12); // 50k + '\n[truncated]'
  });
});
