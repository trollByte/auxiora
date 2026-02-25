export type ImageSize = '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024';
export type ImageFormat = 'png' | 'jpeg' | 'webp';
export type ImageProvider = 'openai' | 'replicate' | 'stability';

export interface ImageGenRequest {
  prompt: string;
  negativePrompt?: string;
  size?: ImageSize;
  format?: ImageFormat;
  count?: number;
  provider?: ImageProvider;
  model?: string;
  seed?: number;
  style?: string;
}

export interface GeneratedImage {
  id: string;
  url?: string;
  base64?: string;
  format: ImageFormat;
  size: ImageSize;
  prompt: string;
  provider: ImageProvider;
  model: string;
  generatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface ImageGenResult {
  success: boolean;
  images: GeneratedImage[];
  error?: string;
  durationMs: number;
  cost?: number;
}

export interface ImageProviderAdapter {
  name: ImageProvider;
  generate(request: ImageGenRequest): Promise<ImageGenResult>;
  supportedSizes: ImageSize[];
  supportedFormats: ImageFormat[];
  defaultModel: string;
}
