import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceManager } from '../src/voice-manager.js';
import { DEFAULT_VOICE_CONFIG, MAX_AUDIO_BUFFER_SIZE, MIN_AUDIO_BUFFER_SIZE } from '../src/types.js';
import type { STTProvider, Transcription } from '@auxiora/stt';
import type { TTSProvider } from '@auxiora/tts';

function createMockSTT(overrides: Partial<STTProvider> = {}): STTProvider {
  return {
    name: 'mock-stt',
    transcribe: vi.fn().mockResolvedValue({
      text: 'Hello world',
      language: 'en',
      duration: 1.5,
    } satisfies Transcription),
    ...overrides,
  };
}

function createMockTTS(overrides: Partial<TTSProvider> = {}): TTSProvider {
  return {
    name: 'mock-tts',
    synthesize: vi.fn().mockResolvedValue(Buffer.from('fake-audio')),
    stream: vi.fn().mockImplementation(async function* () {
      yield Buffer.from('chunk-1');
      yield Buffer.from('chunk-2');
    }),
    ...overrides,
  };
}

describe('VoiceManager', () => {
  let manager: VoiceManager;
  let mockSTT: STTProvider;
  let mockTTS: TTSProvider;

  beforeEach(() => {
    mockSTT = createMockSTT();
    mockTTS = createMockTTS();
    manager = new VoiceManager({
      sttProvider: mockSTT,
      ttsProvider: mockTTS,
      config: DEFAULT_VOICE_CONFIG,
    });
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  describe('session lifecycle', () => {
    it('should start a voice session', () => {
      manager.startSession('client-1');
      expect(manager.hasActiveSession('client-1')).toBe(true);
    });

    it('should end a voice session', () => {
      manager.startSession('client-1');
      manager.endSession('client-1');
      expect(manager.hasActiveSession('client-1')).toBe(false);
    });

    it('should throw when starting duplicate session', () => {
      manager.startSession('client-1');
      expect(() => manager.startSession('client-1')).toThrow('already has an active voice session');
    });

    it('should ignore ending non-existent session', () => {
      expect(() => manager.endSession('nonexistent')).not.toThrow();
    });

    it('should support concurrent sessions for different clients', () => {
      manager.startSession('client-1');
      manager.startSession('client-2');
      expect(manager.hasActiveSession('client-1')).toBe(true);
      expect(manager.hasActiveSession('client-2')).toBe(true);
    });

    it('should clean up all sessions on shutdown', async () => {
      manager.startSession('client-1');
      manager.startSession('client-2');
      await manager.shutdown();
      expect(manager.hasActiveSession('client-1')).toBe(false);
      expect(manager.hasActiveSession('client-2')).toBe(false);
    });
  });

  describe('audio buffer', () => {
    it('should accumulate audio frames', () => {
      manager.startSession('client-1');
      manager.addAudioFrame('client-1', Buffer.alloc(1600));
      manager.addAudioFrame('client-1', Buffer.alloc(1600));
      expect(manager.getBufferSize('client-1')).toBe(3200);
    });

    it('should reject frames without active session', () => {
      expect(() => manager.addAudioFrame('nonexistent', Buffer.alloc(100))).toThrow('No active voice session');
    });

    it('should enforce max buffer size', () => {
      manager.startSession('client-1');
      // Fill up to max
      const bigChunk = Buffer.alloc(MAX_AUDIO_BUFFER_SIZE);
      manager.addAudioFrame('client-1', bigChunk);

      // Next frame should be silently dropped
      manager.addAudioFrame('client-1', Buffer.alloc(1600));
      expect(manager.getBufferSize('client-1')).toBe(MAX_AUDIO_BUFFER_SIZE);
    });

    it('should clear buffer when session ends', () => {
      manager.startSession('client-1');
      manager.addAudioFrame('client-1', Buffer.alloc(1600));
      manager.endSession('client-1');
      expect(manager.getBufferSize('client-1')).toBe(0);
    });
  });

  describe('transcription', () => {
    it('should transcribe buffered audio', async () => {
      manager.startSession('client-1');
      manager.addAudioFrame('client-1', Buffer.alloc(32000)); // 1s

      const result = await manager.transcribe('client-1');
      expect(result.text).toBe('Hello world');
      expect(mockSTT.transcribe).toHaveBeenCalledOnce();
    });

    it('should throw without active session', async () => {
      await expect(manager.transcribe('nonexistent')).rejects.toThrow('No active voice session');
    });

    it('should throw if buffer too short', async () => {
      manager.startSession('client-1');
      manager.addAudioFrame('client-1', Buffer.alloc(100));
      await expect(manager.transcribe('client-1')).rejects.toThrow('too short');
    });

    it('should clear buffer after transcription', async () => {
      manager.startSession('client-1');
      manager.addAudioFrame('client-1', Buffer.alloc(32000));
      await manager.transcribe('client-1');
      expect(manager.getBufferSize('client-1')).toBe(0);
    });
  });

  describe('synthesis', () => {
    it('should stream synthesized audio chunks', async () => {
      manager.startSession('client-1');
      const chunks: Buffer[] = [];
      for await (const chunk of manager.synthesize('client-1', 'Hello')) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(2);
      expect(mockTTS.stream).toHaveBeenCalledOnce();
    });

    it('should throw without active session', async () => {
      const gen = manager.synthesize('nonexistent', 'Hello');
      await expect(gen.next()).rejects.toThrow('No active voice session');
    });

    it('should pass voice option from session', async () => {
      manager.startSession('client-1', { voice: 'nova' });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of manager.synthesize('client-1', 'Test')) { /* consume */ }
      expect(mockTTS.stream).toHaveBeenCalledWith('Test', expect.objectContaining({ voice: 'nova' }));
    });
  });
});
