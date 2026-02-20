import { getLogger } from '@auxiora/logger';
import type {
  ImageFormat,
  ImageGenRequest,
  ImageGenResult,
  ImageProvider,
  ImageProviderAdapter,
  ImageSize,
  GeneratedImage,
} from '../types.js';

const logger = getLogger('image-gen:openai');

const COST_MAP: Record<string, number> = {
  '256x256': 0.016,
  '512x512': 0.018,
  '1024x1024': 0.04,
  '1024x1792': 0.08,
  '1792x1024': 0.08,
};

export class OpenAIImageProvider implements ImageProviderAdapter {
  readonly name: ImageProvider = 'openai';
  readonly supportedSizes: ImageSize[] = ['1024x1024', '1024x1792', '1792x1024'];
  readonly supportedFormats: ImageFormat[] = ['png', 'webp'];
  readonly defaultModel = 'dall-e-3';

  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generate(request: ImageGenRequest): Promise<ImageGenResult> {
    const start = Date.now();
    const model = request.model ?? this.defaultModel;
    const size = request.size ?? '1024x1024';
    const count = request.count ?? 1;

    try {
      const body: Record<string, unknown> = {
        model,
        prompt: request.prompt,
        n: count,
        size,
        response_format: 'b64_json',
      };

      if (request.style) {
        body.quality = request.style === 'vivid' ? 'standard' : request.style;
      }

      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error(`OpenAI API error: ${response.status} ${errorBody}`);
        return {
          success: false,
          images: [],
          error: `OpenAI API error: ${response.status}`,
          durationMs: Date.now() - start,
        };
      }

      const data = (await response.json()) as {
        data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
      };

      const format: ImageFormat = request.format ?? 'png';
      const images: GeneratedImage[] = data.data.map((item, i) => ({
        id: `openai-${Date.now()}-${i}`,
        base64: item.b64_json,
        url: item.url,
        format,
        size,
        prompt: item.revised_prompt ?? request.prompt,
        provider: this.name,
        model,
        generatedAt: Date.now(),
      }));

      const unitCost = COST_MAP[size] ?? 0.04;
      const cost = unitCost * count;

      return {
        success: true,
        images,
        durationMs: Date.now() - start,
        cost,
      };
    } catch (err: unknown) {
      const wrapped: Error = err instanceof Error ? err : new Error(String(err));
      logger.error(wrapped.message);
      return {
        success: false,
        images: [],
        error: wrapped.message,
        durationMs: Date.now() - start,
      };
    }
  }
}
