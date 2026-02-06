export type AudioFormat = 'pcm' | 'wav' | 'opus' | 'mp3';

export interface STTOptions {
  language?: string;
  format?: AudioFormat;
  sampleRate?: number;
}

export interface Transcription {
  text: string;
  language: string;
  duration: number;
  confidence?: number;
}

export interface STTProvider {
  readonly name: string;
  transcribe(audio: Buffer, options?: STTOptions): Promise<Transcription>;
}
