import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VisionProvider } from '../src/providers/vision.js';
import type { Attachment } from '../src/types.js';

describe('VisionProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should have id and capabilities', () => {
    const provider = new VisionProvider({ apiKey: 'test-key', provider: 'anthropic' });
    expect(provider.id).toBe('vision-anthropic');
    expect(provider.capabilities).toContain('image');
    expect(provider.capabilities).toContain('video');
  });

  it('should describe image from URL (Anthropic)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from('fake-png').buffer),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'A golden retriever sitting on grass' }],
        }),
      })
    );

    const provider = new VisionProvider({ apiKey: 'test-key', provider: 'anthropic' });
    const attachment: Attachment = { type: 'image', url: 'https://example.com/photo.jpg', mimeType: 'image/jpeg' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(true);
    expect(result.text).toBe('A golden retriever sitting on grass');

    vi.unstubAllGlobals();
  });

  it('should describe image from URL (OpenAI)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'A sunset over mountains' } }],
        }),
      })
    );

    const provider = new VisionProvider({ apiKey: 'test-key', provider: 'openai' });
    const attachment: Attachment = { type: 'image', url: 'https://example.com/photo.jpg', mimeType: 'image/jpeg' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(true);
    expect(result.text).toBe('A sunset over mountains');

    vi.unstubAllGlobals();
  });

  it('should handle video attachments', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from('fake-video').buffer),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'A person walking in a park' }],
        }),
      })
    );

    const provider = new VisionProvider({ apiKey: 'test-key', provider: 'anthropic' });
    const attachment: Attachment = { type: 'video', url: 'https://example.com/clip.mp4', mimeType: 'video/mp4' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(true);
    expect(result.text).toBe('A person walking in a park');

    vi.unstubAllGlobals();
  });

  it('should handle API errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from('fake').buffer),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
      })
    );

    const provider = new VisionProvider({ apiKey: 'test-key', provider: 'anthropic' });
    const attachment: Attachment = { type: 'image', url: 'https://example.com/photo.jpg', mimeType: 'image/jpeg' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(false);
    expect(result.error).toContain('500');

    vi.unstubAllGlobals();
  });

  it('should handle missing data and URL', async () => {
    const provider = new VisionProvider({ apiKey: 'test-key', provider: 'anthropic' });
    const attachment: Attachment = { type: 'image' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(false);
  });
});
