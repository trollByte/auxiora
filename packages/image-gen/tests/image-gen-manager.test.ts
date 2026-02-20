import { describe, it, expect, beforeEach } from 'vitest';
import { ImageGenManager } from '../src/image-gen-manager.js';
import type { ImageProviderAdapter, ImageGenRequest, ImageGenResult, ImageProvider } from '../src/types.js';

function createMockProvider(overrides: Partial<ImageProviderAdapter> = {}): ImageProviderAdapter {
  return {
    name: 'openai' as ImageProvider,
    supportedSizes: ['1024x1024', '512x512'],
    supportedFormats: ['png', 'webp'],
    defaultModel: 'test-model',
    generate: async (req: ImageGenRequest): Promise<ImageGenResult> => ({
      success: true,
      images: [
        {
          id: 'test-1',
          base64: 'abc123',
          format: req.format ?? 'png',
          size: req.size ?? '1024x1024',
          prompt: req.prompt,
          provider: 'openai',
          model: 'test-model',
          generatedAt: Date.now(),
        },
      ],
      durationMs: 100,
      cost: 0.04,
    }),
    ...overrides,
  };
}

describe('ImageGenManager', () => {
  let manager: ImageGenManager;

  beforeEach(() => {
    manager = new ImageGenManager();
  });

  describe('registerProvider', () => {
    it('should register a provider', () => {
      const provider = createMockProvider();
      manager.registerProvider(provider);
      expect(manager.listProviders()).toEqual(['openai']);
    });

    it('should overwrite existing provider with same name', () => {
      manager.registerProvider(createMockProvider());
      manager.registerProvider(createMockProvider({ defaultModel: 'new-model' }));
      expect(manager.listProviders()).toEqual(['openai']);
      expect(manager.getProvider('openai')?.defaultModel).toBe('new-model');
    });
  });

  describe('listProviders', () => {
    it('should return empty list when no providers registered', () => {
      expect(manager.listProviders()).toEqual([]);
    });

    it('should list all registered providers', () => {
      manager.registerProvider(createMockProvider({ name: 'openai' }));
      manager.registerProvider(createMockProvider({ name: 'replicate' }));
      expect(manager.listProviders()).toEqual(['openai', 'replicate']);
    });
  });

  describe('getProvider', () => {
    it('should return undefined for unregistered provider', () => {
      expect(manager.getProvider('openai')).toBeUndefined();
    });

    it('should return registered provider', () => {
      const provider = createMockProvider();
      manager.registerProvider(provider);
      expect(manager.getProvider('openai')).toBe(provider);
    });
  });

  describe('generate', () => {
    it('should return error when no providers registered', async () => {
      const result = await manager.generate({ prompt: 'a cat' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('No image provider available');
    });

    it('should return error for unregistered provider', async () => {
      manager.registerProvider(createMockProvider({ name: 'openai' }));
      const result = await manager.generate({ prompt: 'a cat', provider: 'replicate' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not registered');
    });

    it('should route to specified provider', async () => {
      manager.registerProvider(createMockProvider({ name: 'openai' }));
      manager.registerProvider(createMockProvider({ name: 'replicate' }));
      const result = await manager.generate({ prompt: 'a cat', provider: 'replicate' });
      expect(result.success).toBe(true);
    });

    it('should use first registered provider as default', async () => {
      manager.registerProvider(createMockProvider({ name: 'openai' }));
      const result = await manager.generate({ prompt: 'a cat' });
      expect(result.success).toBe(true);
      expect(result.images[0].provider).toBe('openai');
    });

    it('should reject unsupported size', async () => {
      manager.registerProvider(
        createMockProvider({ name: 'openai', supportedSizes: ['1024x1024'] }),
      );
      const result = await manager.generate({ prompt: 'a cat', size: '256x256' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not support size');
    });

    it('should reject unsupported format', async () => {
      manager.registerProvider(
        createMockProvider({ name: 'openai', supportedFormats: ['png'] }),
      );
      const result = await manager.generate({ prompt: 'a cat', format: 'jpeg' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not support format');
    });

    it('should handle provider throwing an error', async () => {
      manager.registerProvider(
        createMockProvider({
          name: 'openai',
          generate: async () => {
            throw new Error('Network failure');
          },
        }),
      );
      const result = await manager.generate({ prompt: 'a cat' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network failure');
    });

    it('should handle provider throwing a non-Error', async () => {
      manager.registerProvider(
        createMockProvider({
          name: 'openai',
          generate: async () => {
            throw 'string error';
          },
        }),
      );
      const result = await manager.generate({ prompt: 'a cat' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });
  });
});
