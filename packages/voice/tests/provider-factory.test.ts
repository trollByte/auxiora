import { describe, it, expect, vi } from 'vitest';

// Mock @auxiora/stt
vi.mock('@auxiora/stt', () => {
  class WhisperLocalSTT {
    readonly name = 'whisper-local';
    constructor(public config: { binaryPath: string; modelPath: string }) {}
    async transcribe() { return { text: '', language: 'en', duration: 0 }; }
  }
  class WhisperSTT {
    readonly name = 'openai-whisper';
    constructor(public config: { apiKey: string }) {}
    async transcribe() { return { text: '', language: 'en', duration: 0 }; }
  }
  return { WhisperLocalSTT, WhisperSTT };
});

// Mock @auxiora/tts
vi.mock('@auxiora/tts', () => {
  class PiperTTS {
    readonly name = 'piper-local';
    constructor(public config: { binaryPath: string; modelPath: string }) {}
    async synthesize() { return Buffer.alloc(0); }
    async *stream() { /* empty */ }
  }
  class OpenAITTS {
    readonly name = 'openai-tts';
    constructor(public config: { apiKey: string; defaultVoice?: string }) {}
    async synthesize() { return Buffer.alloc(0); }
    async *stream() { /* empty */ }
  }
  class ElevenLabsTTS {
    readonly name = 'elevenlabs-tts';
    constructor(public config: { apiKey: string }) {}
    async synthesize() { return Buffer.alloc(0); }
    async *stream() { /* empty */ }
  }
  return { PiperTTS, OpenAITTS, ElevenLabsTTS };
});

import { createSTTProvider, createTTSProvider } from '../src/provider-factory.js';

describe('createSTTProvider', () => {
  it('should create whisper-local provider', () => {
    const provider = createSTTProvider('whisper-local', {
      binaryPath: '/usr/bin/whisper-cli',
      modelPath: '/models/ggml-base.en.bin',
    });
    expect(provider.name).toBe('whisper-local');
  });

  it('should create openai-whisper provider', () => {
    const provider = createSTTProvider('openai-whisper', {
      apiKey: 'sk-test',
    });
    expect(provider.name).toBe('openai-whisper');
  });

  it('should throw for unknown STT provider', () => {
    expect(() => createSTTProvider('unknown', {})).toThrow('Unknown STT provider: unknown');
  });
});

describe('createTTSProvider', () => {
  it('should create piper-local provider', () => {
    const provider = createTTSProvider('piper-local', {
      binaryPath: '/usr/bin/piper',
      modelPath: '/models/en_US-lessac-medium.onnx',
    });
    expect(provider.name).toBe('piper-local');
  });

  it('should create openai-tts provider', () => {
    const provider = createTTSProvider('openai-tts', {
      apiKey: 'sk-test',
      defaultVoice: 'nova',
    });
    expect(provider.name).toBe('openai-tts');
  });

  it('should create elevenlabs-tts provider', () => {
    const provider = createTTSProvider('elevenlabs-tts', {
      apiKey: 'el-test',
    });
    expect(provider.name).toBe('elevenlabs-tts');
  });

  it('should throw for unknown TTS provider', () => {
    expect(() => createTTSProvider('unknown', {})).toThrow('Unknown TTS provider: unknown');
  });
});
