import { getLogger } from '@auxiora/logger';
import type { TTSProvider, TTSOptions } from './types.js';
import { MAX_TTS_TEXT_LENGTH } from './types.js';

const logger = getLogger('tts:openai');

export interface OpenAITTSConfig {
  apiKey: string;
  model?: string;
  apiUrl?: string;
  defaultVoice?: string;
}

export class OpenAITTS implements TTSProvider {
  readonly name = 'openai-tts';
  private apiKey: string;
  private model: string;
  private apiUrl: string;
  private defaultVoice: string;

  constructor(config: OpenAITTSConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'tts-1';
    this.apiUrl = config.apiUrl ?? 'https://api.openai.com/v1/audio/speech';
    this.defaultVoice = config.defaultVoice ?? 'alloy';
  }

  async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
    if (text.length > MAX_TTS_TEXT_LENGTH) {
      throw new Error(`Text length (${text.length}) exceeds maximum (${MAX_TTS_TEXT_LENGTH})`);
    }

    const body = {
      model: this.model,
      input: text,
      voice: options?.voice ?? this.defaultVoice,
      response_format: 'pcm',
      speed: options?.speed ?? 1.0,
    };

    logger.info('Synthesizing speech', { textLength: text.length, voice: body.voice });

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('TTS API error', { error: new Error(errorText), status: response.status });
      throw new Error(`TTS API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async *stream(text: string, options?: TTSOptions): AsyncGenerator<Buffer> {
    if (text.length > MAX_TTS_TEXT_LENGTH) {
      throw new Error(`Text length (${text.length}) exceeds maximum (${MAX_TTS_TEXT_LENGTH})`);
    }

    const body = {
      model: this.model,
      input: text,
      voice: options?.voice ?? this.defaultVoice,
      response_format: 'pcm',
      speed: options?.speed ?? 1.0,
    };

    logger.info('Streaming speech synthesis', { textLength: text.length, voice: body.voice });

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TTS API error (${response.status}): ${errorText}`);
    }

    const reader = response.body!.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield Buffer.from(value);
    }
  }
}
