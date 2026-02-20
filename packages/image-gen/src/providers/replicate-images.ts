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

const logger = getLogger('image-gen:replicate');

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 150; // 5 minutes max

export class ReplicateImageProvider implements ImageProviderAdapter {
  readonly name: ImageProvider = 'replicate';
  readonly supportedSizes: ImageSize[] = ['256x256', '512x512', '1024x1024', '1024x1792', '1792x1024'];
  readonly supportedFormats: ImageFormat[] = ['png', 'jpeg', 'webp'];
  readonly defaultModel = 'stability-ai/sdxl';

  private readonly apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async generate(request: ImageGenRequest): Promise<ImageGenResult> {
    const start = Date.now();
    const model = request.model ?? this.defaultModel;
    const size = request.size ?? '1024x1024';
    const [width, height] = size.split('x').map(Number);
    const count = request.count ?? 1;

    try {
      const input: Record<string, unknown> = {
        prompt: request.prompt,
        width,
        height,
        num_outputs: count,
      };

      if (request.negativePrompt) {
        input.negative_prompt = request.negativePrompt;
      }
      if (request.seed !== undefined) {
        input.seed = request.seed;
      }

      const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiToken}`,
        },
        body: JSON.stringify({
          version: model,
          input,
        }),
      });

      if (!createResponse.ok) {
        const errorBody = await createResponse.text();
        logger.error(new Error(`Replicate API error: ${createResponse.status} ${errorBody}`));
        return {
          success: false,
          images: [],
          error: `Replicate API error: ${createResponse.status}`,
          durationMs: Date.now() - start,
        };
      }

      const prediction = (await createResponse.json()) as {
        id: string;
        status: string;
        output?: string[];
        error?: string;
        urls: { get: string };
      };

      // Poll for completion
      let result = prediction;
      let attempts = 0;
      while (result.status !== 'succeeded' && result.status !== 'failed') {
        if (attempts >= MAX_POLL_ATTEMPTS) {
          return {
            success: false,
            images: [],
            error: 'Prediction timed out',
            durationMs: Date.now() - start,
          };
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const pollResponse = await fetch(result.urls.get, {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
          },
        });
        result = (await pollResponse.json()) as typeof prediction;
        attempts++;
      }

      if (result.status === 'failed') {
        return {
          success: false,
          images: [],
          error: result.error ?? 'Prediction failed',
          durationMs: Date.now() - start,
        };
      }

      const format: ImageFormat = request.format ?? 'webp';
      const images: GeneratedImage[] = (result.output ?? []).map((url, i) => ({
        id: `replicate-${result.id}-${i}`,
        url,
        format,
        size,
        prompt: request.prompt,
        provider: this.name,
        model,
        generatedAt: Date.now(),
      }));

      return {
        success: true,
        images,
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const wrapped: Error = err instanceof Error ? err : new Error(String(err));
      logger.error(wrapped);
      return {
        success: false,
        images: [],
        error: wrapped.message,
        durationMs: Date.now() - start,
      };
    }
  }
}
