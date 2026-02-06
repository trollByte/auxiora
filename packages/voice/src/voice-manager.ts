import { getLogger } from '@auxiora/logger';
import type { STTProvider, Transcription } from '@auxiora/stt';
import type { TTSProvider } from '@auxiora/tts';
import type { VoiceConfig, VoiceSessionState, VoiceSessionOptions } from './types.js';
import { DEFAULT_VOICE_CONFIG, MAX_AUDIO_BUFFER_SIZE, MIN_AUDIO_BUFFER_SIZE } from './types.js';

const logger = getLogger('voice:manager');

interface VoiceSession {
  clientId: string;
  state: VoiceSessionState;
  voice: string;
  language: string;
  audioFrames: Buffer[];
  bufferSize: number;
}

export interface VoiceManagerOptions {
  sttProvider: STTProvider;
  ttsProvider: TTSProvider;
  config?: VoiceConfig;
}

export class VoiceManager {
  private sessions = new Map<string, VoiceSession>();
  private sttProvider: STTProvider;
  private ttsProvider: TTSProvider;
  private config: VoiceConfig;

  constructor(options: VoiceManagerOptions) {
    this.sttProvider = options.sttProvider;
    this.ttsProvider = options.ttsProvider;
    this.config = options.config ?? DEFAULT_VOICE_CONFIG;
  }

  startSession(clientId: string, options?: VoiceSessionOptions): void {
    if (this.sessions.has(clientId)) {
      throw new Error(`Client ${clientId} already has an active voice session`);
    }

    const session: VoiceSession = {
      clientId,
      state: 'recording',
      voice: options?.voice ?? this.config.defaultVoice,
      language: options?.language ?? this.config.language,
      audioFrames: [],
      bufferSize: 0,
    };

    this.sessions.set(clientId, session);
    logger.info('Voice session started', { clientId, voice: session.voice });
  }

  endSession(clientId: string): void {
    const session = this.sessions.get(clientId);
    if (!session) return;

    session.audioFrames = [];
    session.bufferSize = 0;
    this.sessions.delete(clientId);
    logger.info('Voice session ended', { clientId });
  }

  hasActiveSession(clientId: string): boolean {
    return this.sessions.has(clientId);
  }

  addAudioFrame(clientId: string, frame: Buffer): void {
    const session = this.sessions.get(clientId);
    if (!session) {
      throw new Error('No active voice session for client ' + clientId);
    }

    if (session.bufferSize + frame.length > MAX_AUDIO_BUFFER_SIZE) {
      logger.warn('Audio buffer full, dropping frame', { clientId, bufferSize: session.bufferSize });
      return;
    }

    session.audioFrames.push(frame);
    session.bufferSize += frame.length;
  }

  getBufferSize(clientId: string): number {
    return this.sessions.get(clientId)?.bufferSize ?? 0;
  }

  async transcribe(clientId: string): Promise<Transcription> {
    const session = this.sessions.get(clientId);
    if (!session) {
      throw new Error('No active voice session for client ' + clientId);
    }

    if (session.bufferSize < MIN_AUDIO_BUFFER_SIZE) {
      throw new Error('Audio too short (minimum 0.5 seconds)');
    }

    session.state = 'transcribing';
    const audio = Buffer.concat(session.audioFrames);

    // Clear buffer after extracting
    session.audioFrames = [];
    session.bufferSize = 0;

    logger.info('Transcribing audio', { clientId, audioBytes: audio.length });

    const result = await this.sttProvider.transcribe(audio, {
      language: session.language,
      sampleRate: this.config.sampleRate,
    });

    session.state = 'idle';
    return result;
  }

  async *synthesize(clientId: string, text: string): AsyncGenerator<Buffer> {
    const session = this.sessions.get(clientId);
    if (!session) {
      throw new Error('No active voice session for client ' + clientId);
    }

    session.state = 'synthesizing';
    logger.info('Synthesizing speech', { clientId, textLength: text.length });

    yield* this.ttsProvider.stream(text, {
      voice: session.voice,
    });

    session.state = 'idle';
  }

  async shutdown(): Promise<void> {
    for (const [clientId] of this.sessions) {
      this.endSession(clientId);
    }
    logger.info('Voice manager shutdown complete');
  }
}
