import { getLogger } from '@auxiora/logger';
import { safeFetch } from '@auxiora/ssrf-guard';
import type { Attachment, MediaProvider, MediaResult } from '../types.js';

const logger = getLogger('media:whisper');

export interface WhisperProviderConfig {
  apiKey: string;
  model?: string;
  apiUrl?: string;
}

export class WhisperProvider implements MediaProvider {
  readonly id = 'whisper';
  readonly capabilities = ['audio'] as const;
  private apiKey: string;
  private model: string;
  private apiUrl: string;

  constructor(config: WhisperProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'whisper-1';
    this.apiUrl = config.apiUrl ?? 'https://api.openai.com/v1/audio/transcriptions';
  }

  async processAttachment(attachment: Attachment): Promise<MediaResult> {
    try {
      let audioBuffer: Buffer;

      if (attachment.data) {
        audioBuffer = attachment.data;
      } else if (attachment.url) {
        const response = await safeFetch(attachment.url);
        if (!response.ok) {
          return { type: 'audio', success: false, error: `Fetch failed: ${response.status}` };
        }
        const arrayBuf = await response.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuf);
      } else {
        return { type: 'audio', success: false, error: 'No data or URL' };
      }

      const mimeType = attachment.mimeType ?? 'audio/ogg';
      const ext = mimeType.includes('mp3') ? 'mp3'
        : mimeType.includes('wav') ? 'wav'
        : mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
        : mimeType.includes('webm') ? 'webm'
        : 'ogg';

      const formData = new FormData();
      formData.append('file', new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), `audio.${ext}`);
      formData.append('model', this.model);
      formData.append('response_format', 'verbose_json');

      logger.info('Sending audio to Whisper API', { bytes: audioBuffer.length });

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { type: 'audio', success: false, error: `Whisper API error (${response.status}): ${errorText}` };
      }

      const result = await response.json() as { text: string; language: string; duration: number };
      logger.info('Audio transcribed', { textLength: result.text.length, duration: result.duration });

      return { type: 'audio', success: true, text: result.text };
    } catch (error) {
      return { type: 'audio', success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
