import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { ImageGenManager, OpenAIImageProvider, ReplicateImageProvider } from '@auxiora/image-gen';
import type { ImageGenRequest, ImageGenResult, ImageProviderAdapter, ImageProvider, ImageSize, ImageFormat } from '@auxiora/image-gen';
import { Router } from 'express';

/** Minimal in-process provider for tests — no network calls. */
class FakeImageProvider implements ImageProviderAdapter {
  readonly name: ImageProvider = 'openai';
  readonly supportedSizes: ImageSize[] = ['1024x1024', '1024x1792', '1792x1024'];
  readonly supportedFormats: ImageFormat[] = ['png', 'webp'];
  readonly defaultModel = 'fake-model';

  shouldFail = false;

  async generate(req: ImageGenRequest): Promise<ImageGenResult> {
    if (this.shouldFail) {
      return {
        success: false,
        images: [],
        error: 'provider error',
        durationMs: 1,
      };
    }
    const size = req.size ?? '1024x1024';
    const format = req.format ?? 'png';
    return {
      success: true,
      images: [
        {
          id: 'fake-1',
          base64: 'AAAA',
          format,
          size,
          prompt: req.prompt,
          provider: this.name,
          model: this.defaultModel,
          generatedAt: Date.now(),
        },
      ],
      durationMs: 42,
      cost: 0.04,
    };
  }
}

function createImageRouter(imageGenManager: ImageGenManager) {
  const router = Router();

  router.get('/providers', (_req: any, res: any) => {
    const providers = imageGenManager.listProviders();
    const details = providers.map((name) => {
      const p = imageGenManager.getProvider(name);
      return {
        name,
        supportedSizes: p?.supportedSizes ?? [],
        supportedFormats: p?.supportedFormats ?? [],
        defaultModel: p?.defaultModel ?? '',
      };
    });
    res.json({ providers: details });
  });

  router.post('/generate', async (req: any, res: any) => {
    const { prompt, size, format, provider, negativePrompt, count, model, seed, style } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt required' });
    }
    const request: ImageGenRequest = {
      prompt,
      ...(size && { size }),
      ...(format && { format }),
      ...(provider && { provider }),
      ...(negativePrompt && { negativePrompt }),
      ...(count && { count }),
      ...(model && { model }),
      ...(seed !== undefined && { seed }),
      ...(style && { style }),
    };
    const result = await imageGenManager.generate(request);
    if (!result.success) {
      return res.status(502).json({ error: result.error, durationMs: result.durationMs });
    }
    res.json(result);
  });

  return router;
}

describe('Image Generation REST API', () => {
  let app: express.Express;
  let manager: ImageGenManager;
  let fakeProvider: FakeImageProvider;

  beforeEach(() => {
    manager = new ImageGenManager();
    fakeProvider = new FakeImageProvider();
    manager.registerProvider(fakeProvider);

    app = express();
    app.use(express.json());
    app.use('/api/v1/images', createImageRouter(manager));
  });

  // --- GET /providers ---

  describe('GET /providers', () => {
    it('returns registered providers', async () => {
      const res = await request(app).get('/api/v1/images/providers');
      expect(res.status).toBe(200);
      expect(res.body.providers).toHaveLength(1);
      expect(res.body.providers[0].name).toBe('openai');
      expect(res.body.providers[0].supportedSizes).toContain('1024x1024');
      expect(res.body.providers[0].supportedFormats).toContain('png');
      expect(res.body.providers[0].defaultModel).toBe('fake-model');
    });

    it('returns empty list when no providers registered', async () => {
      const emptyManager = new ImageGenManager();
      const emptyApp = express();
      emptyApp.use(express.json());
      emptyApp.use('/api/v1/images', createImageRouter(emptyManager));

      const res = await request(emptyApp).get('/api/v1/images/providers');
      expect(res.status).toBe(200);
      expect(res.body.providers).toEqual([]);
    });
  });

  // --- POST /generate ---

  describe('POST /generate', () => {
    it('generates an image with only a prompt', async () => {
      const res = await request(app)
        .post('/api/v1/images/generate')
        .send({ prompt: 'a sunset over mountains' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.images).toHaveLength(1);
      expect(res.body.images[0].prompt).toBe('a sunset over mountains');
      expect(res.body.images[0].format).toBe('png');
      expect(res.body.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('passes optional parameters through', async () => {
      const res = await request(app)
        .post('/api/v1/images/generate')
        .send({
          prompt: 'a cat',
          size: '1024x1792',
          format: 'webp',
          negativePrompt: 'blurry',
          style: 'vivid',
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.images[0].size).toBe('1024x1792');
      expect(res.body.images[0].format).toBe('webp');
    });

    it('returns 400 when prompt is missing', async () => {
      const res = await request(app)
        .post('/api/v1/images/generate')
        .send({ size: '1024x1024' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('prompt required');
    });

    it('returns 400 when prompt is not a string', async () => {
      const res = await request(app)
        .post('/api/v1/images/generate')
        .send({ prompt: 123 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('prompt required');
    });

    it('returns 502 when provider fails', async () => {
      fakeProvider.shouldFail = true;
      const res = await request(app)
        .post('/api/v1/images/generate')
        .send({ prompt: 'trigger failure' });
      expect(res.status).toBe(502);
      expect(res.body.error).toBe('provider error');
      expect(res.body.durationMs).toBeDefined();
    });

    it('returns 502 when no providers are available', async () => {
      const emptyManager = new ImageGenManager();
      const emptyApp = express();
      emptyApp.use(express.json());
      emptyApp.use('/api/v1/images', createImageRouter(emptyManager));

      const res = await request(emptyApp)
        .post('/api/v1/images/generate')
        .send({ prompt: 'orphan request' });
      expect(res.status).toBe(502);
      expect(res.body.error).toBe('No image provider available');
    });

    it('returns cost when provider supplies it', async () => {
      const res = await request(app)
        .post('/api/v1/images/generate')
        .send({ prompt: 'cost check' });
      expect(res.status).toBe(200);
      expect(res.body.cost).toBe(0.04);
    });

    it('returns 502 when requesting unsupported size', async () => {
      const res = await request(app)
        .post('/api/v1/images/generate')
        .send({ prompt: 'bad size', size: '256x256' });
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('does not support size');
    });

    it('returns 502 when requesting unsupported format', async () => {
      const res = await request(app)
        .post('/api/v1/images/generate')
        .send({ prompt: 'bad format', format: 'jpeg' });
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('does not support format');
    });
  });
});
