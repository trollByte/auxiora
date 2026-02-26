import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterProvider } from '../src/openrouter.js';

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    provider = new OpenRouterProvider({ apiKey: 'test-key' });
  });

  describe('constructor', () => {
    it('sets correct metadata', () => {
      expect(provider.name).toBe('openrouter');
      expect(provider.metadata.name).toBe('openrouter');
      expect(provider.metadata.displayName).toBe('OpenRouter');
    });

    it('uses default model when none specified', () => {
      expect(provider.defaultModel).toBe('anthropic/claude-sonnet-4-6');
      expect(provider.metadata.models).toHaveProperty('anthropic/claude-sonnet-4-6');
    });

    it('uses custom model when specified', () => {
      const custom = new OpenRouterProvider({ apiKey: 'test', model: 'openai/gpt-4o' });
      expect(custom.defaultModel).toBe('openai/gpt-4o');
      expect(custom.metadata.models).toHaveProperty('openai/gpt-4o');
    });

    it('reports isAvailable as true', async () => {
      const available = await provider.metadata.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('updateModels', () => {
    it('merges new models into metadata', () => {
      provider.updateModels({
        'openai/gpt-4o': {
          maxContextTokens: 128000,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true,
          supportsImageGen: false,
          costPer1kInput: 0.005,
          costPer1kOutput: 0.015,
          strengths: ['reasoning', 'vision'],
          isLocal: false,
        },
      });

      expect(provider.metadata.models).toHaveProperty('openai/gpt-4o');
      expect(provider.metadata.models).toHaveProperty('anthropic/claude-sonnet-4-6');
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
        model: 'anthropic/claude-sonnet-4-6',
      };

      // Access private client via any cast to mock
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
      expect(result.model).toBe('anthropic/claude-sonnet-4-6');
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
        model: 'anthropic/claude-sonnet-4-6',
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
  });
});
