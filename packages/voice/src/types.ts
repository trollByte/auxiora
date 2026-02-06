export type VoiceSessionState = 'idle' | 'recording' | 'transcribing' | 'synthesizing' | 'cancelled';

export interface VoiceConfig {
  enabled: boolean;
  defaultVoice: string;
  language: string;
  maxAudioDuration: number;
  sampleRate: number;
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  enabled: false,
  defaultVoice: 'alloy',
  language: 'en',
  maxAudioDuration: 30,
  sampleRate: 16000,
};

export interface VoiceSessionOptions {
  voice?: string;
  language?: string;
}

// Max audio buffer: 30s at 16kHz, 16-bit mono = 960,000 bytes
export const MAX_AUDIO_BUFFER_SIZE = 960_000;

// Min audio: 0.5s at 16kHz, 16-bit mono = 16,000 bytes
export const MIN_AUDIO_BUFFER_SIZE = 16_000;

// Max single frame: 64KB
export const MAX_FRAME_SIZE = 64 * 1024;
