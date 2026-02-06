import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhisperSTT } from '../src/whisper.js';
import { pcmToWav } from '../src/pcm-to-wav.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('pcmToWav', () => {
  it('should produce a valid WAV header', () => {
    const pcm = Buffer.alloc(3200); // 0.1s of 16kHz 16-bit mono
    const wav = pcmToWav(pcm, 16000);

    // WAV header is 44 bytes
    expect(wav.length).toBe(44 + pcm.length);

    // RIFF header
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8); // file size - 8
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');

    // fmt chunk
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.readUInt16LE(20)).toBe(1); // PCM format
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(16000); // sample rate
    expect(wav.readUInt16LE(34)).toBe(16); // bits per sample

    // data chunk
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
  });

  it('should handle different sample rates', () => {
    const pcm = Buffer.alloc(1000);
    const wav = pcmToWav(pcm, 44100);
    expect(wav.readUInt32LE(24)).toBe(44100);
  });
});

describe('WhisperSTT', () => {
  let stt: WhisperSTT;

  beforeEach(() => {
    mockFetch.mockReset();
    stt = new WhisperSTT({ apiKey: 'test-key' });
  });

  it('should have the correct name', () => {
    expect(stt.name).toBe('openai-whisper');
  });

  it('should send correct request to OpenAI API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        text: 'Hello world',
        language: 'en',
        duration: 1.5,
      }),
    });

    const audio = Buffer.alloc(32000); // 1s of 16kHz 16-bit mono
    await stt.transcribe(audio);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer test-key');
    expect(options.body).toBeInstanceOf(FormData);
  });

  it('should return structured transcription', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        text: 'Hello world',
        language: 'en',
        duration: 1.5,
      }),
    });

    const audio = Buffer.alloc(32000);
    const result = await stt.transcribe(audio);

    expect(result.text).toBe('Hello world');
    expect(result.language).toBe('en');
    expect(result.duration).toBe(1.5);
  });

  it('should respect language option', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        text: 'Bonjour le monde',
        language: 'fr',
        duration: 2.0,
      }),
    });

    const audio = Buffer.alloc(32000);
    await stt.transcribe(audio, { language: 'fr' });

    const body = mockFetch.mock.calls[0][1].body as FormData;
    expect(body.get('language')).toBe('fr');
  });

  it('should throw on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid API key',
    });

    const audio = Buffer.alloc(32000);
    await expect(stt.transcribe(audio)).rejects.toThrow('STT API error (401)');
  });

  it('should reject audio shorter than 0.5s', async () => {
    // 0.5s at 16kHz 16-bit mono = 16000 bytes. Below that should fail.
    const shortAudio = Buffer.alloc(8000); // 0.25s
    await expect(stt.transcribe(shortAudio)).rejects.toThrow('Audio too short');
  });
});
