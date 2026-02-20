import { getLogger } from '@auxiora/logger';
import type {
  ImageGenRequest,
  ImageGenResult,
  ImageProvider,
  ImageProviderAdapter,
} from './types.js';

const logger = getLogger('image-gen:manager');

export class ImageGenManager {
  private providers: Map<ImageProvider, ImageProviderAdapter> = new Map();

  registerProvider(provider: ImageProviderAdapter): void {
    this.providers.set(provider.name, provider);
    logger.info(`Registered image provider: ${provider.name}`);
  }

  listProviders(): ImageProvider[] {
    return [...this.providers.keys()];
  }

  getProvider(name: ImageProvider): ImageProviderAdapter | undefined {
    return this.providers.get(name);
  }

  async generate(request: ImageGenRequest): Promise<ImageGenResult> {
    const start = Date.now();
    const providerName = request.provider ?? this.getDefaultProvider();

    if (!providerName) {
      return {
        success: false,
        images: [],
        error: 'No image provider available',
        durationMs: Date.now() - start,
      };
    }

    const provider = this.providers.get(providerName);
    if (!provider) {
      return {
        success: false,
        images: [],
        error: `Provider "${providerName}" is not registered`,
        durationMs: Date.now() - start,
      };
    }

    const size = request.size ?? '1024x1024';
    if (!provider.supportedSizes.includes(size)) {
      return {
        success: false,
        images: [],
        error: `Provider "${providerName}" does not support size "${size}". Supported: ${provider.supportedSizes.join(', ')}`,
        durationMs: Date.now() - start,
      };
    }

    const format = request.format ?? 'png';
    if (!provider.supportedFormats.includes(format)) {
      return {
        success: false,
        images: [],
        error: `Provider "${providerName}" does not support format "${format}". Supported: ${provider.supportedFormats.join(', ')}`,
        durationMs: Date.now() - start,
      };
    }

    try {
      return await provider.generate(request);
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

  private getDefaultProvider(): ImageProvider | undefined {
    const first = this.providers.keys().next();
    return first.done ? undefined : first.value;
  }
}
