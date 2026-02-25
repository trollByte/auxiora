import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceManager } from '../src/voice-manager.js';
import { DEFAULT_VOICE_CONFIG } from '../src/types.js';
import type { STTProvider, Transcription } from '@auxiora/stt';
import type { TTSProvider } from '@auxiora/tts';

describe('Voice integration', () => {
  let manager: VoiceManager;
  let mockSTT: STTProvider;
  let mockTTS: TTSProvider;

  beforeEach(() => {
    mockSTT = {
      name: 'mock-stt',
      transcribe: vi.fn().mockResolvedValue({
        text: 'What is the weather today?',
        language: 'en',
        duration: 2.1,
      } satisfies Transcription),
    };
    mockTTS = {
      name: 'mock-tts',
      synthesize: vi.fn().mockResolvedValue(Buffer.from('full-audio')),
      stream: vi.fn().mockImplementation(async function* () {
        yield Buffer.from('audio-chunk-1');
        yield Buffer.from('audio-chunk-2');
        yield Buffer.from('audio-chunk-3');
      }),
    };
    manager = new VoiceManager({
      sttProvider: mockSTT,
      ttsProvider: mockTTS,
      config: { ...DEFAULT_VOICE_CONFIG, enabled: true },
    });
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  it('should handle full voice_start → audio → transcribe → synthesize flow', async () => {
    // 1. Start session
    manager.startSession('client-1');
    expect(manager.hasActiveSession('client-1')).toBe(true);

    // 2. Stream audio frames (simulating 2s of audio)
    for (let i = 0; i < 20; i++) {
      manager.addAudioFrame('client-1', Buffer.alloc(3200)); // ~100ms each
    }
    expect(manager.getBufferSize('client-1')).toBe(64000);

    // 3. Transcribe
    const transcription = await manager.transcribe('client-1');
    expect(transcription.text).toBe('What is the weather today?');
    expect(mockSTT.transcribe).toHaveBeenCalledOnce();

    // 4. Synthesize response
    const audioChunks: Buffer[] = [];
    for await (const chunk of manager.synthesize('client-1', 'The weather is sunny.')) {
      audioChunks.push(chunk);
    }
    expect(audioChunks).toHaveLength(3);
    expect(mockTTS.stream).toHaveBeenCalledWith('The weather is sunny.', expect.objectContaining({ voice: 'alloy' }));

    // 5. End session
    manager.endSession('client-1');
    expect(manager.hasActiveSession('client-1')).toBe(false);
  });

  it('should handle STT failure gracefully', async () => {
    (mockSTT.transcribe as any).mockRejectedValueOnce(new Error('API rate limited'));

    manager.startSession('client-1');
    manager.addAudioFrame('client-1', Buffer.alloc(32000));

    await expect(manager.transcribe('client-1')).rejects.toThrow('API rate limited');
    // Session should still be active — caller decides cleanup
    expect(manager.hasActiveSession('client-1')).toBe(true);
  });

  it('should support multiple concurrent voice sessions', async () => {
    manager.startSession('alice');
    manager.startSession('bob');

    manager.addAudioFrame('alice', Buffer.alloc(32000));
    manager.addAudioFrame('bob', Buffer.alloc(16000));

    expect(manager.getBufferSize('alice')).toBe(32000);
    expect(manager.getBufferSize('bob')).toBe(16000);

    const aliceResult = await manager.transcribe('alice');
    expect(aliceResult.text).toBe('What is the weather today?');

    // Bob's buffer is independent
    expect(manager.getBufferSize('bob')).toBe(16000);
  });
});
