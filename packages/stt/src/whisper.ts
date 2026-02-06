import { getLogger } from '@auxiora/logger';
import type { STTProvider, STTOptions, Transcription } from './types.js';
import { pcmToWav } from './pcm-to-wav.js';

const logger = getLogger('stt:whisper');

const MIN_AUDIO_BYTES = 16000; // 0.5s at 16kHz 16-bit mono

export interface WhisperSTTConfig {
  apiKey: string;
  model?: string;
  apiUrl?: string;
}

export class WhisperSTT implements STTProvider {
  readonly name = 'openai-whisper';
  private apiKey: string;
  private model: string;
  private apiUrl: string;

  constructor(config: WhisperSTTConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'whisper-1';
    this.apiUrl = config.apiUrl ?? 'https://api.openai.com/v1/audio/transcriptions';
  }

  async transcribe(audio: Buffer, options?: STTOptions): Promise<Transcription> {
    if (audio.length < MIN_AUDIO_BYTES) {
      throw new Error('Audio too short (minimum 0.5 seconds)');
    }

    const sampleRate = options?.sampleRate ?? 16000;
    const wav = pcmToWav(audio, sampleRate);

    const formData = new FormData();
    const wavArray = new ArrayBuffer(wav.byteLength);
    new Uint8Array(wavArray).set(new Uint8Array(wav.buffer, wav.byteOffset, wav.byteLength));
    formData.append('file', new Blob([wavArray], { type: 'audio/wav' }), 'audio.wav');
    formData.append('model', this.model);
    formData.append('response_format', 'verbose_json');

    if (options?.language) {
      formData.append('language', options.language);
    }

    logger.info('Sending audio to Whisper API', { audioBytes: audio.length, sampleRate });

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Whisper API error', { error: new Error(errorText), status: response.status });
      throw new Error(`STT API error (${response.status}): ${errorText}`);
    }

    const result = await response.json() as { text: string; language: string; duration: number };

    logger.info('Transcription complete', {
      textLength: result.text.length,
      language: result.language,
      duration: result.duration,
    });

    return {
      text: result.text,
      language: result.language ?? 'en',
      duration: result.duration ?? 0,
    };
  }
}
