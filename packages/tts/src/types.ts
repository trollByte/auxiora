export type AudioFormat = 'pcm' | 'wav' | 'opus' | 'mp3';

export interface TTSOptions {
  voice?: string;
  speed?: number;
  format?: AudioFormat;
}

export interface TTSProvider {
  readonly name: string;
  synthesize(text: string, options?: TTSOptions): Promise<Buffer>;
  stream(text: string, options?: TTSOptions): AsyncGenerator<Buffer>;
}

export const MAX_TTS_TEXT_LENGTH = 4096;
