import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaProvider } from '../src/ollama.js';
import { OpenAICompatibleProvider } from '../src/openai-compatible.js';
import { GoogleProvider } from '../src/google.js';
import { ProviderFactory } from '../src/factory.js';

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider({ model: 'llama3' });
  });

  it('should have correct metadata', () => {
    expect(provider.name).toBe('ollama');
    expect(provider.metadata.name).toBe('ollama');
    expect(provider.metadata.displayName).toBe('Ollama (Local)');
    expect(provider.metadata.models['llama3']).toBeDefined();
    expect(provider.metadata.models['llama3'].isLocal).toBe(true);
    expect(provider.metadata.models['llama3'].costPer1kInput).toBe(0);
    expect(provider.metadata.models['llama3'].costPer1kOutput).toBe(0);
  });

  it('should use custom base URL', () => {
    const custom = new OllamaProvider({ baseUrl: 'http://192.168.1.5:11434', model: 'mistral' });
    expect(custom.metadata.models['mistral']).toBeDefined();
  });

  it('should make correct API call for complete', async () => {
    const mockResponse = {
      message: { role: 'assistant', content: 'Hello! How can I help?' },
      done: true,
      eval_count: 10,
      prompt_eval_count: 5,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await provider.complete([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toBe('Hello! How can I help?');
    expect(result.usage.inputTokens).toBe(5);
    expect(result.usage.outputTokens).toBe(10);
    expect(result.finishReason).toBe('stop');

    vi.restoreAllMocks();
  });

  it('should handle API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    await expect(provider.complete([{ role: 'user', content: 'Hello' }]))
      .rejects.toThrow('Ollama API error: 500');

    vi.restoreAllMocks();
  });

  it('should check availability via /api/tags', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true } as Response);
    const available = await provider.metadata.isAvailable();
    expect(available).toBe(true);
    vi.restoreAllMocks();
  });

  it('should return false when Ollama is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));
    const available = await provider.metadata.isAvailable();
    expect(available).toBe(false);
    vi.restoreAllMocks();
  });
});

describe('OpenAICompatibleProvider', () => {
  let provider: OpenAICompatibleProvider;

  beforeEach(() => {
    provider = new OpenAICompatibleProvider({
      baseUrl: 'http://localhost:1234/v1',
      model: 'local-model',
      name: 'lm-studio',
    });
  });

  it('should have correct metadata', () => {
    expect(provider.name).toBe('lm-studio');
    expect(provider.metadata.name).toBe('lm-studio');
    expect(provider.metadata.displayName).toContain('lm-studio');
    expect(provider.metadata.models['local-model']).toBeDefined();
    expect(provider.metadata.models['local-model'].isLocal).toBe(true);
    expect(provider.metadata.models['local-model'].costPer1kInput).toBe(0);
  });

  it('should default name to openai-compatible', () => {
    const unnamed = new OpenAICompatibleProvider({
      baseUrl: 'http://localhost:1234/v1',
      model: 'test-model',
    });
    expect(unnamed.name).toBe('openai-compatible');
  });
});

describe('GoogleProvider', () => {
  it('should have correct metadata', () => {
    const provider = new GoogleProvider({ apiKey: 'test-key' });
    expect(provider.name).toBe('google');
    expect(provider.metadata.name).toBe('google');
    expect(provider.metadata.displayName).toBe('Google Gemini');
    expect(provider.metadata.models['gemini-2.5-flash']).toBeDefined();
    expect(provider.metadata.models['gemini-2.5-pro']).toBeDefined();
    expect(provider.metadata.models['gemini-2.5-flash'].supportsVision).toBe(true);
    expect(provider.metadata.models['gemini-2.5-pro'].maxContextTokens).toBe(1048576);
  });
});

describe('ProviderFactory with new providers', () => {
  it('should create ollama provider when config present', () => {
    const factory = new ProviderFactory({
      primary: 'ollama',
      config: {
        ollama: { model: 'llama3' },
      },
    });
    const provider = factory.getProvider('ollama');
    expect(provider.name).toBe('ollama');
  });

  it('should create google provider when API key present', () => {
    const factory = new ProviderFactory({
      primary: 'google',
      config: {
        google: { apiKey: 'test-google-key' },
      },
    });
    const provider = factory.getProvider('google');
    expect(provider.name).toBe('google');
  });

  it('should create openai-compatible provider when baseUrl present', () => {
    const factory = new ProviderFactory({
      primary: 'lm-studio',
      config: {
        openaiCompatible: {
          baseUrl: 'http://localhost:1234/v1',
          model: 'local-model',
          name: 'lm-studio',
        },
      },
    });
    const provider = factory.getProvider('lm-studio');
    expect(provider.name).toBe('lm-studio');
  });

  it('should list all available providers', () => {
    const factory = new ProviderFactory({
      primary: 'ollama',
      config: {
        ollama: { model: 'llama3' },
        google: { apiKey: 'test-key' },
        openaiCompatible: {
          baseUrl: 'http://localhost:1234/v1',
          model: 'test',
          name: 'vllm',
        },
      },
    });
    const available = factory.listAvailable();
    expect(available).toContain('ollama');
    expect(available).toContain('google');
    expect(available).toContain('vllm');
  });

  it('should throw when getting unconfigured provider', () => {
    const factory = new ProviderFactory({
      primary: 'anthropic',
      config: {},
    });
    expect(() => factory.getProvider('google')).toThrow('Provider not configured: google');
  });
});
