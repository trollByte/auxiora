import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhisperProvider } from '../src/providers/whisper.js';
import type { Attachment } from '../src/types.js';

describe('WhisperProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should have id and capabilities', () => {
    const provider = new WhisperProvider({ apiKey: 'test-key' });
    expect(provider.id).toBe('whisper');
    expect(provider.capabilities).toContain('audio');
  });

  it('should transcribe audio from URL', async () => {
    const audioBuffer = Buffer.alloc(32000);

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, arrayBuffer: () => Promise.resolve(audioBuffer.buffer) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ text: 'Hello world', language: 'en', duration: 1.5 }),
      })
    );

    const provider = new WhisperProvider({ apiKey: 'test-key' });
    const attachment: Attachment = { type: 'audio', url: 'https://example.com/audio.ogg' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(true);
    expect(result.text).toBe('Hello world');
    expect(result.type).toBe('audio');

    vi.unstubAllGlobals();
  });

  it('should transcribe audio from Buffer data', async () => {
    const audioBuffer = Buffer.alloc(32000);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'Buffer audio', language: 'en', duration: 2.0 }),
    }));

    const provider = new WhisperProvider({ apiKey: 'test-key' });
    const attachment: Attachment = { type: 'audio', data: audioBuffer };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(true);
    expect(result.text).toBe('Buffer audio');

    vi.unstubAllGlobals();
  });

  it('should handle API errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, arrayBuffer: () => Promise.resolve(Buffer.alloc(32000).buffer) })
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('Rate limited'), status: 429 })
    );

    const provider = new WhisperProvider({ apiKey: 'test-key' });
    const attachment: Attachment = { type: 'audio', url: 'https://example.com/audio.ogg' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(false);
    expect(result.error).toContain('429');

    vi.unstubAllGlobals();
  });

  it('should block SSRF attempts on private URLs', async () => {
    const provider = new WhisperProvider({ apiKey: 'test-key' });
    const attachment: Attachment = { type: 'audio', url: 'http://10.0.0.1/internal-audio' };
    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(false);
    expect(result.error).toContain('SSRF');
  });

  it('should handle missing data and URL', async () => {
    const provider = new WhisperProvider({ apiKey: 'test-key' });
    const attachment: Attachment = { type: 'audio' };

    const result = await provider.processAttachment(attachment);
    expect(result.success).toBe(false);
  });
});
