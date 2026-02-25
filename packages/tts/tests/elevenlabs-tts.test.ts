import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ElevenLabsTTS } from '../src/elevenlabs-tts.js';
import { MAX_TTS_TEXT_LENGTH } from '../src/types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ElevenLabsTTS', () => {
  let tts: ElevenLabsTTS;

  beforeEach(() => {
    mockFetch.mockReset();
    tts = new ElevenLabsTTS({ apiKey: 'test-key' });
  });

  it('should have the correct name', () => {
    expect(tts.name).toBe('elevenlabs-tts');
  });

  it('should send correct request to ElevenLabs API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1000),
    });

    await tts.synthesize('Hello world');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM?output_format=pcm_16000',
    );
    expect(options.method).toBe('POST');
    expect(options.headers['xi-api-key']).toBe('test-key');

    const body = JSON.parse(options.body);
    expect(body.text).toBe('Hello world');
    expect(body.model_id).toBe('eleven_multilingual_v2');
    expect(body.voice_settings.stability).toBe(0.5);
    expect(body.voice_settings.similarity_boost).toBe(0.75);
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

  it('should use custom voice ID from options', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });

    await tts.synthesize('Test', { voice: 'custom-voice-id' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/text-to-speech/custom-voice-id');
  });

  it('should use custom voice ID from config', async () => {
    const customTts = new ElevenLabsTTS({ apiKey: 'key', voiceId: 'my-voice' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });

    await customTts.synthesize('Test');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/text-to-speech/my-voice');
  });

  it('should map format to ElevenLabs output format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });

    await tts.synthesize('Test', { format: 'mp3' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('output_format=mp3_44100_128');
  });

  it('should throw on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(tts.synthesize('Test')).rejects.toThrow('ElevenLabs API error (401)');
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

  it('should use stream endpoint for streaming', async () => {
    const mockReader = {
      read: vi.fn().mockResolvedValueOnce({ done: true, value: undefined }),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: { getReader: () => mockReader },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of tts.stream('Test')) { /* consume */ }

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream');
  });

  it('should reject streaming text exceeding max length', async () => {
    const longText = 'a'.repeat(MAX_TTS_TEXT_LENGTH + 1);
    const gen = tts.stream(longText);
    await expect(gen.next()).rejects.toThrow('exceeds maximum');
  });

  it('should use custom model from config', async () => {
    const customTts = new ElevenLabsTTS({
      apiKey: 'key',
      model: 'eleven_turbo_v2',
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });

    await customTts.synthesize('Test');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model_id).toBe('eleven_turbo_v2');
  });
});
