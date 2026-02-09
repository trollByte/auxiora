import { getLogger } from '@auxiora/logger';
import type { TTSProvider, TTSOptions } from './types.js';
import { MAX_TTS_TEXT_LENGTH } from './types.js';

const logger = getLogger('tts:elevenlabs');

export interface ElevenLabsTTSConfig {
  apiKey: string;
  voiceId?: string;
  model?: string;
  apiUrl?: string;
}

const FORMAT_MAP: Record<string, string> = {
  mp3: 'mp3_44100_128',
  pcm: 'pcm_16000',
  opus: 'opus_16000',
};

export class ElevenLabsTTS implements TTSProvider {
  readonly name = 'elevenlabs-tts';
  private apiKey: string;
  private voiceId: string;
  private model: string;
  private apiUrl: string;

  constructor(config: ElevenLabsTTSConfig) {
    this.apiKey = config.apiKey;
    this.voiceId = config.voiceId ?? '21m00Tcm4TlvDq8ikWAM';
    this.model = config.model ?? 'eleven_multilingual_v2';
    this.apiUrl = config.apiUrl ?? 'https://api.elevenlabs.io/v1';
  }

  async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
    if (text.length > MAX_TTS_TEXT_LENGTH) {
      throw new Error(`Text length (${text.length}) exceeds maximum (${MAX_TTS_TEXT_LENGTH})`);
    }

    const voiceId = options?.voice ?? this.voiceId;
    const outputFormat = FORMAT_MAP[options?.format ?? 'pcm'] ?? 'pcm_16000';
    const url = `${this.apiUrl}/text-to-speech/${voiceId}?output_format=${outputFormat}`;

    const body = {
      text,
      model_id: this.model,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    };

    logger.info('Synthesizing speech', { textLength: text.length, voiceId });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('ElevenLabs API error', { error: new Error(errorText), status: response.status });
      throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async *stream(text: string, options?: TTSOptions): AsyncGenerator<Buffer> {
    if (text.length > MAX_TTS_TEXT_LENGTH) {
      throw new Error(`Text length (${text.length}) exceeds maximum (${MAX_TTS_TEXT_LENGTH})`);
    }

    const voiceId = options?.voice ?? this.voiceId;
    const outputFormat = FORMAT_MAP[options?.format ?? 'pcm'] ?? 'pcm_16000';
    const url = `${this.apiUrl}/text-to-speech/${voiceId}/stream?output_format=${outputFormat}`;

    const body = {
      text,
      model_id: this.model,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    };

    logger.info('Streaming speech synthesis', { textLength: text.length, voiceId });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
    }

    const reader = response.body!.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield Buffer.from(value);
    }
  }
}
