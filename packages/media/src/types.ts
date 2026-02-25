export interface Attachment {
  type: 'image' | 'audio' | 'video' | 'file';
  url?: string;
  data?: Buffer;
  mimeType?: string;
  filename?: string;
  size?: number;
}

export interface MediaResult {
  type: 'audio' | 'image' | 'video' | 'file';
  success: boolean;
  text?: string;
  filename?: string;
  error?: string;
}

export interface MediaProvider {
  readonly id: string;
  readonly capabilities: ReadonlyArray<'audio' | 'image' | 'video' | 'file'>;
  processAttachment(attachment: Attachment): Promise<MediaResult>;
}

export interface MediaConfig {
  maxAudioBytes?: number;
  maxImageBytes?: number;
  maxVideoBytes?: number;
  maxFileBytes?: number;
  timeoutMs?: number;
}

export const DEFAULT_LIMITS: Required<MediaConfig> = {
  maxAudioBytes: 20 * 1024 * 1024,
  maxImageBytes: 10 * 1024 * 1024,
  maxVideoBytes: 50 * 1024 * 1024,
  maxFileBytes: 5 * 1024 * 1024,
  timeoutMs: 60_000,
};
