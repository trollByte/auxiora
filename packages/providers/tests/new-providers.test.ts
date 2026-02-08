import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GroqProvider } from '../src/groq.js';
import { ReplicateProvider } from '../src/replicate.js';
import { DeepSeekProvider } from '../src/deepseek.js';
import { CohereProvider } from '../src/cohere.js';
import { XAIProvider } from '../src/xai.js';
import { ProviderFactory } from '../src/factory.js';

// ──────────────────────────────────────────
// Groq Provider
// ──────────────────────────────────────────

describe('GroqProvider', () => {
  let provider: GroqProvider;

  beforeEach(() => {
    provider = new GroqProvider({ apiKey: 'test-groq-key' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(provider.name).toBe('groq');
    expect(provider.metadata.name).toBe('groq');
    expect(provider.metadata.displayName).toBe('Groq');
    expect(provider.metadata.models['llama-3.3-70b-versatile']).toBeDefined();
    expect(provider.metadata.models['llama-3.1-8b-instant']).toBeDefined();
    expect(provider.metadata.models['mixtral-8x7b-32768']).toBeDefined();
    expect(provider.metadata.models['gemma2-9b-it']).toBeDefined();
  });

  it('should have correct model capabilities', () => {
    const model = provider.metadata.models['llama-3.3-70b-versatile'];
    expect(model.supportsTools).toBe(true);
    expect(model.supportsStreaming).toBe(true);
    expect(model.supportsImageGen).toBe(false);
    expect(model.isLocal).toBe(false);
    expect(model.maxContextTokens).toBe(128000);
  });

  it('should use custom model', () => {
    const custom = new GroqProvider({ apiKey: 'key', model: 'mixtral-8x7b-32768' });
    expect(custom.name).toBe('groq');
  });

  it('should make correct API call for complete', async () => {
    const mockResponse = {
      choices: [{ message: { role: 'assistant', content: 'Hello from Groq!' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      model: 'llama-3.3-70b-versatile',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await provider.complete([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toBe('Hello from Groq!');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
    expect(result.finishReason).toBe('stop');
  });

  it('should send correct headers', async () => {
    const mockResponse = {
      choices: [{ message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      model: 'llama-3.3-70b-versatile',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    await provider.complete([{ role: 'user', content: 'Hi' }]);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-groq-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('should handle API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    } as Response);

    await expect(provider.complete([{ role: 'user', content: 'Hello' }]))
      .rejects.toThrow('Groq API error: 429');
  });

  it('should include system prompt in messages', async () => {
    const mockResponse = {
      choices: [{ message: { role: 'assistant', content: 'Ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      model: 'llama-3.3-70b-versatile',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    await provider.complete([{ role: 'user', content: 'Hi' }], {
      systemPrompt: 'You are helpful.',
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hi' });
  });

  it('should check availability via /models endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true } as Response);
    const available = await provider.metadata.isAvailable();
    expect(available).toBe(true);
  });

  it('should return false when unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));
    const available = await provider.metadata.isAvailable();
    expect(available).toBe(false);
  });

  it('should handle streaming errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    const chunks: Array<{ type: string; error?: string }> = [];
    for await (const chunk of provider.stream([{ role: 'user', content: 'Hello' }])) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('error');
    expect(chunks[0].error).toContain('Groq API error: 500');
  });
});

// ──────────────────────────────────────────
// Replicate Provider
// ──────────────────────────────────────────

describe('ReplicateProvider', () => {
  let provider: ReplicateProvider;

  beforeEach(() => {
    provider = new ReplicateProvider({ apiToken: 'test-replicate-token' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(provider.name).toBe('replicate');
    expect(provider.metadata.name).toBe('replicate');
    expect(provider.metadata.displayName).toBe('Replicate');
    expect(provider.metadata.models['meta/meta-llama-3-70b-instruct']).toBeDefined();
    expect(provider.metadata.models['stability-ai/sdxl']).toBeDefined();
  });

  it('should support image generation model', () => {
    const sdxl = provider.metadata.models['stability-ai/sdxl'];
    expect(sdxl.supportsImageGen).toBe(true);
    expect(sdxl.strengths).toContain('image-generation');
  });

  it('should make prediction and poll for result', async () => {
    const createResponse = { id: 'pred-123', status: 'starting' };
    const pollResponse = {
      id: 'pred-123',
      status: 'succeeded',
      output: ['Hello ', 'from ', 'Replicate!'],
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createResponse,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => pollResponse,
      } as Response);

    const result = await provider.complete([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toBe('Hello from Replicate!');
    expect(result.finishReason).toBe('stop');
  });

  it('should handle failed predictions', async () => {
    const createResponse = { id: 'pred-456', status: 'starting' };
    const failResponse = {
      id: 'pred-456',
      status: 'failed',
      error: 'Model not found',
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createResponse,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => failResponse,
      } as Response);

    await expect(provider.complete([{ role: 'user', content: 'Hello' }]))
      .rejects.toThrow('Replicate prediction failed: Model not found');
  });

  it('should handle API errors on create', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);

    await expect(provider.complete([{ role: 'user', content: 'Hello' }]))
      .rejects.toThrow('Replicate API error: 401');
  });

  it('should handle string output', async () => {
    const createResponse = { id: 'pred-789', status: 'starting' };
    const pollResponse = {
      id: 'pred-789',
      status: 'succeeded',
      output: 'Single string output',
    };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createResponse,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => pollResponse,
      } as Response);

    const result = await provider.complete([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toBe('Single string output');
  });

  it('should check availability', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true } as Response);
    const available = await provider.metadata.isAvailable();
    expect(available).toBe(true);
  });

  it('should return false when unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));
    const available = await provider.metadata.isAvailable();
    expect(available).toBe(false);
  });

  it('should use custom poll interval', () => {
    const custom = new ReplicateProvider({ apiToken: 'token', pollInterval: 2000 });
    expect(custom.name).toBe('replicate');
  });
});

// ──────────────────────────────────────────
// DeepSeek Provider
// ──────────────────────────────────────────

describe('DeepSeekProvider', () => {
  let provider: DeepSeekProvider;

  beforeEach(() => {
    provider = new DeepSeekProvider({ apiKey: 'test-deepseek-key' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(provider.name).toBe('deepseek');
    expect(provider.metadata.name).toBe('deepseek');
    expect(provider.metadata.displayName).toBe('DeepSeek');
    expect(provider.metadata.models['deepseek-chat']).toBeDefined();
    expect(provider.metadata.models['deepseek-reasoner']).toBeDefined();
  });

  it('should have correct model capabilities', () => {
    const chat = provider.metadata.models['deepseek-chat'];
    expect(chat.supportsTools).toBe(true);
    expect(chat.supportsStreaming).toBe(true);
    expect(chat.strengths).toContain('reasoning');
    expect(chat.strengths).toContain('code');

    const reasoner = provider.metadata.models['deepseek-reasoner'];
    expect(reasoner.strengths).toContain('reasoning');
    expect(reasoner.strengths).toContain('math');
  });

  it('should make correct API call for complete', async () => {
    const mockResponse = {
      choices: [{ message: { role: 'assistant', content: 'Hello from DeepSeek!' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 8, completion_tokens: 4 },
      model: 'deepseek-chat',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await provider.complete([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toBe('Hello from DeepSeek!');
    expect(result.usage.inputTokens).toBe(8);
    expect(result.usage.outputTokens).toBe(4);
  });

  it('should send correct headers and URL', async () => {
    const mockResponse = {
      choices: [{ message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      model: 'deepseek-chat',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    await provider.complete([{ role: 'user', content: 'Hi' }]);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-deepseek-key',
        }),
      }),
    );
  });

  it('should handle API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    } as Response);

    await expect(provider.complete([{ role: 'user', content: 'Hello' }]))
      .rejects.toThrow('DeepSeek API error: 403');
  });

  it('should check availability', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true } as Response);
    const available = await provider.metadata.isAvailable();
    expect(available).toBe(true);
  });

  it('should return false when unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    const available = await provider.metadata.isAvailable();
    expect(available).toBe(false);
  });

  it('should handle streaming errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    const chunks: Array<{ type: string; error?: string }> = [];
    for await (const chunk of provider.stream([{ role: 'user', content: 'Hello' }])) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('error');
    expect(chunks[0].error).toContain('DeepSeek API error: 500');
  });
});

// ──────────────────────────────────────────
// Cohere Provider
// ──────────────────────────────────────────

describe('CohereProvider', () => {
  let provider: CohereProvider;

  beforeEach(() => {
    provider = new CohereProvider({ apiKey: 'test-cohere-key' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(provider.name).toBe('cohere');
    expect(provider.metadata.name).toBe('cohere');
    expect(provider.metadata.displayName).toBe('Cohere');
    expect(provider.metadata.models['command-r-plus']).toBeDefined();
    expect(provider.metadata.models['command-r']).toBeDefined();
  });

  it('should have correct model capabilities', () => {
    const model = provider.metadata.models['command-r-plus'];
    expect(model.supportsTools).toBe(true);
    expect(model.supportsStreaming).toBe(true);
    expect(model.strengths).toContain('rag');
    expect(model.strengths).toContain('multilingual');
    expect(model.maxContextTokens).toBe(128000);
    expect(model.isLocal).toBe(false);
  });

  it('should make correct API call for complete', async () => {
    const mockResponse = {
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello from Cohere!' }],
      },
      finish_reason: 'COMPLETE',
      usage: {
        tokens: { input_tokens: 12, output_tokens: 6 },
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await provider.complete([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toBe('Hello from Cohere!');
    expect(result.usage.inputTokens).toBe(12);
    expect(result.usage.outputTokens).toBe(6);
  });

  it('should send to correct URL', async () => {
    const mockResponse = {
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      finish_reason: 'COMPLETE',
      usage: { tokens: { input_tokens: 1, output_tokens: 1 } },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    await provider.complete([{ role: 'user', content: 'Hi' }]);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.cohere.com/v2/chat',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-cohere-key',
        }),
      }),
    );
  });

  it('should handle API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);

    await expect(provider.complete([{ role: 'user', content: 'Hello' }]))
      .rejects.toThrow('Cohere API error: 401');
  });

  it('should use billed_units fallback for usage', async () => {
    const mockResponse = {
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi' }],
      },
      finish_reason: 'COMPLETE',
      usage: {
        billed_units: { input_tokens: 5, output_tokens: 3 },
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await provider.complete([{ role: 'user', content: 'Hi' }]);
    expect(result.usage.inputTokens).toBe(5);
    expect(result.usage.outputTokens).toBe(3);
  });

  it('should check availability', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true } as Response);
    const available = await provider.metadata.isAvailable();
    expect(available).toBe(true);
  });

  it('should return false when unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));
    const available = await provider.metadata.isAvailable();
    expect(available).toBe(false);
  });
});

// ──────────────────────────────────────────
// xAI Provider
// ──────────────────────────────────────────

describe('XAIProvider', () => {
  let provider: XAIProvider;

  beforeEach(() => {
    provider = new XAIProvider({ apiKey: 'test-xai-key' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(provider.name).toBe('xai');
    expect(provider.metadata.name).toBe('xai');
    expect(provider.metadata.displayName).toBe('xAI Grok');
    expect(provider.metadata.models['grok-2']).toBeDefined();
    expect(provider.metadata.models['grok-2-mini']).toBeDefined();
  });

  it('should have correct model capabilities', () => {
    const grok2 = provider.metadata.models['grok-2'];
    expect(grok2.supportsTools).toBe(true);
    expect(grok2.supportsStreaming).toBe(true);
    expect(grok2.maxContextTokens).toBe(131072);
    expect(grok2.isLocal).toBe(false);
    expect(grok2.strengths).toContain('reasoning');

    const mini = provider.metadata.models['grok-2-mini'];
    expect(mini.strengths).toContain('fast');
    expect(mini.strengths).toContain('low-cost');
  });

  it('should make correct API call for complete', async () => {
    const mockResponse = {
      choices: [{ message: { role: 'assistant', content: 'Hello from Grok!' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 7, completion_tokens: 3 },
      model: 'grok-2',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await provider.complete([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toBe('Hello from Grok!');
    expect(result.usage.inputTokens).toBe(7);
    expect(result.usage.outputTokens).toBe(3);
  });

  it('should send to correct URL', async () => {
    const mockResponse = {
      choices: [{ message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      model: 'grok-2',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    await provider.complete([{ role: 'user', content: 'Hi' }]);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.x.ai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-xai-key',
        }),
      }),
    );
  });

  it('should handle API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as Response);

    await expect(provider.complete([{ role: 'user', content: 'Hello' }]))
      .rejects.toThrow('xAI API error: 503');
  });

  it('should check availability', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true } as Response);
    const available = await provider.metadata.isAvailable();
    expect(available).toBe(true);
  });

  it('should return false when unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));
    const available = await provider.metadata.isAvailable();
    expect(available).toBe(false);
  });

  it('should handle streaming errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    const chunks: Array<{ type: string; error?: string }> = [];
    for await (const chunk of provider.stream([{ role: 'user', content: 'Hello' }])) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('error');
    expect(chunks[0].error).toContain('xAI API error: 500');
  });
});

// ──────────────────────────────────────────
// ProviderFactory with new providers
// ──────────────────────────────────────────

describe('ProviderFactory with new providers', () => {
  it('should create groq provider when API key present', () => {
    const factory = new ProviderFactory({
      primary: 'groq',
      config: {
        groq: { apiKey: 'test-groq-key' },
      },
    });
    const provider = factory.getProvider('groq');
    expect(provider.name).toBe('groq');
  });

  it('should create replicate provider when API token present', () => {
    const factory = new ProviderFactory({
      primary: 'replicate',
      config: {
        replicate: { apiToken: 'test-replicate-token' },
      },
    });
    const provider = factory.getProvider('replicate');
    expect(provider.name).toBe('replicate');
  });

  it('should create deepseek provider when API key present', () => {
    const factory = new ProviderFactory({
      primary: 'deepseek',
      config: {
        deepseek: { apiKey: 'test-deepseek-key' },
      },
    });
    const provider = factory.getProvider('deepseek');
    expect(provider.name).toBe('deepseek');
  });

  it('should create cohere provider when API key present', () => {
    const factory = new ProviderFactory({
      primary: 'cohere',
      config: {
        cohere: { apiKey: 'test-cohere-key' },
      },
    });
    const provider = factory.getProvider('cohere');
    expect(provider.name).toBe('cohere');
  });

  it('should create xai provider when API key present', () => {
    const factory = new ProviderFactory({
      primary: 'xai',
      config: {
        xai: { apiKey: 'test-xai-key' },
      },
    });
    const provider = factory.getProvider('xai');
    expect(provider.name).toBe('xai');
  });

  it('should list all configured providers including new ones', () => {
    const factory = new ProviderFactory({
      primary: 'groq',
      config: {
        groq: { apiKey: 'key1' },
        deepseek: { apiKey: 'key2' },
        cohere: { apiKey: 'key3' },
        xai: { apiKey: 'key4' },
        replicate: { apiToken: 'token1' },
      },
    });
    const available = factory.listAvailable();
    expect(available).toContain('groq');
    expect(available).toContain('deepseek');
    expect(available).toContain('cohere');
    expect(available).toContain('xai');
    expect(available).toContain('replicate');
  });

  it('should throw when getting unconfigured new provider', () => {
    const factory = new ProviderFactory({
      primary: 'groq',
      config: {},
    });
    expect(() => factory.getProvider('groq')).toThrow('Provider not configured: groq');
  });
});
