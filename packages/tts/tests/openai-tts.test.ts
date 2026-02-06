import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAITTS } from '../src/openai-tts.js';
import { MAX_TTS_TEXT_LENGTH } from '../src/types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('OpenAITTS', () => {
  let tts: OpenAITTS;

  beforeEach(() => {
    mockFetch.mockReset();
    tts = new OpenAITTS({ apiKey: 'test-key' });
  });

  it('should have the correct name', () => {
    expect(tts.name).toBe('openai-tts');
  });

  it('should send correct request to OpenAI API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1000),
    });

    await tts.synthesize('Hello world');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe('Bearer test-key');

    const body = JSON.parse(options.body);
    expect(body.model).toBe('tts-1');
    expect(body.input).toBe('Hello world');
    expect(body.voice).toBe('alloy');
    expect(body.response_format).toBe('pcm');
  });

  it('should return audio buffer from synthesize', async () => {
    const fakeAudio = new ArrayBuffer(2000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fakeAudio,
    });

    const result = await tts.synthesize('Test');
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(2000);
  });

  it('should respect voice and speed options', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });

    await tts.synthesize('Test', { voice: 'nova', speed: 1.5 });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice).toBe('nova');
    expect(body.speed).toBe(1.5);
  });

  it('should throw on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => 'Rate limit exceeded',
    });

    await expect(tts.synthesize('Test')).rejects.toThrow('TTS API error (429)');
  });

  it('should reject text exceeding max length', async () => {
    const longText = 'a'.repeat(MAX_TTS_TEXT_LENGTH + 1);
    await expect(tts.synthesize(longText)).rejects.toThrow('exceeds maximum');
  });

  it('should stream audio chunks', async () => {
    const chunk1 = new Uint8Array([1, 2, 3]);
    const chunk2 = new Uint8Array([4, 5, 6]);

    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: chunk1 })
        .mockResolvedValueOnce({ done: false, value: chunk2 })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const chunks: Buffer[] = [];
    for await (const chunk of tts.stream('Test')) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual(Buffer.from([1, 2, 3]));
    expect(chunks[1]).toEqual(Buffer.from([4, 5, 6]));
  });
});
