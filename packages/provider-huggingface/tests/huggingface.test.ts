import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HuggingFaceProvider } from '../src/huggingface.js';

describe('HuggingFaceProvider', () => {
  let provider: HuggingFaceProvider;

  beforeEach(() => {
    provider = new HuggingFaceProvider({ apiKey: 'test-key' });
  });

  describe('constructor', () => {
    it('sets correct metadata', () => {
      expect(provider.name).toBe('huggingface');
      expect(provider.metadata.name).toBe('huggingface');
      expect(provider.metadata.displayName).toBe('HuggingFace');
    });

    it('uses default model when none specified', () => {
      expect(provider.defaultModel).toBe('Qwen/Qwen2.5-72B-Instruct');
      expect(provider.metadata.models).toHaveProperty('Qwen/Qwen2.5-72B-Instruct');
    });

    it('uses custom model when specified', () => {
      const custom = new HuggingFaceProvider({ apiKey: 'test', model: 'meta-llama/Llama-3-70B' });
      expect(custom.defaultModel).toBe('meta-llama/Llama-3-70B');
      expect(custom.metadata.models).toHaveProperty('meta-llama/Llama-3-70B');
    });

    it('reports isAvailable as true', async () => {
      const available = await provider.metadata.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('updateModels', () => {
    it('merges new models into metadata', () => {
      provider.updateModels({
        'meta-llama/Llama-3-70B': {
          maxContextTokens: 128000,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true,
          supportsImageGen: false,
          costPer1kInput: 0.0008,
          costPer1kOutput: 0.0008,
          strengths: ['reasoning', 'code'],
          isLocal: false,
        },
      });

      expect(provider.metadata.models).toHaveProperty('meta-llama/Llama-3-70B');
      expect(provider.metadata.models).toHaveProperty('Qwen/Qwen2.5-72B-Instruct');
    });
  });

  describe('complete', () => {
    it('calls OpenAI client and returns result', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'Hello!', tool_calls: undefined },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        model: 'Qwen/Qwen2.5-72B-Instruct',
      };

      const client = (provider as any).client;
      client.chat = {
        completions: {
          create: vi.fn().mockResolvedValue(mockResponse),
        },
      };

      const result = await provider.complete([{ role: 'user', content: 'Hi' }]);

      expect(result.content).toBe('Hello!');
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(5);
      expect(result.model).toBe('Qwen/Qwen2.5-72B-Instruct');
      expect(result.finishReason).toBe('stop');
    });

    it('handles tool calls in response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '',
            tool_calls: [{
              id: 'call_123',
              function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
            }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: { prompt_tokens: 15, completion_tokens: 20 },
        model: 'Qwen/Qwen2.5-72B-Instruct',
      };

      const client = (provider as any).client;
      client.chat = {
        completions: {
          create: vi.fn().mockResolvedValue(mockResponse),
        },
      };

      const result = await provider.complete(
        [{ role: 'user', content: 'Weather in NYC?' }],
        {
          tools: [{
            name: 'get_weather',
            description: 'Get weather',
            input_schema: { type: 'object', properties: { city: { type: 'string' } } },
          }],
        },
      );

      expect(result.finishReason).toBe('tool_use');
      expect(result.toolUse).toHaveLength(1);
      expect(result.toolUse![0].name).toBe('get_weather');
      expect(result.toolUse![0].input).toEqual({ city: 'NYC' });
    });

    it('prepends system prompt when provided', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 1 },
        model: 'test-model',
      };

      const client = (provider as any).client;
      const createFn = vi.fn().mockResolvedValue(mockResponse);
      client.chat = { completions: { create: createFn } };

      await provider.complete(
        [{ role: 'user', content: 'Hi' }],
        { systemPrompt: 'You are helpful.' },
      );

      const callArgs = createFn.mock.calls[0][0];
      expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
      expect(callArgs.messages[1]).toEqual({ role: 'user', content: 'Hi' });
    });

    it('passes inference provider header for model:provider syntax', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 1 },
        model: 'Qwen/Qwen2.5-72B-Instruct',
      };

      const client = (provider as any).client;
      const createFn = vi.fn().mockResolvedValue(mockResponse);
      client.chat = { completions: { create: createFn } };

      await provider.complete(
        [{ role: 'user', content: 'Hi' }],
        { model: 'Qwen/Qwen2.5-72B-Instruct:cerebras' },
      );

      const callArgs = createFn.mock.calls[0][0];
      expect(callArgs.model).toBe('Qwen/Qwen2.5-72B-Instruct');

      const requestOptions = createFn.mock.calls[0][1];
      expect(requestOptions.headers).toEqual({ 'X-HF-Inference-Provider': 'cerebras' });
    });

    it('passes preferred inference provider header from config', async () => {
      const customProvider = new HuggingFaceProvider({
        apiKey: 'test-key',
        preferredInferenceProvider: 'together',
      });

      const mockResponse = {
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 1 },
        model: 'Qwen/Qwen2.5-72B-Instruct',
      };

      const client = (customProvider as any).client;
      const createFn = vi.fn().mockResolvedValue(mockResponse);
      client.chat = { completions: { create: createFn } };

      await customProvider.complete([{ role: 'user', content: 'Hi' }]);

      const requestOptions = createFn.mock.calls[0][1];
      expect(requestOptions.headers).toEqual({ 'X-HF-Inference-Provider': 'together' });
    });
  });
});
