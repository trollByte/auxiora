import { describe, it, expect } from 'vitest';
import type { ProviderMetadata } from '@auxiora/providers';
import type { ModelRouting } from '@auxiora/config';
import { ModelSelector } from '../selector.js';
import type { TaskClassification } from '../types.js';

function makeProviders(): Map<string, ProviderMetadata> {
  const providers = new Map<string, ProviderMetadata>();
  providers.set('anthropic', {
    name: 'anthropic',
    displayName: 'Anthropic Claude',
    models: {
      'claude-sonnet-4-20250514': {
        maxContextTokens: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.003,
        costPer1kOutput: 0.015,
        strengths: ['reasoning', 'code', 'long-context', 'creative'],
        isLocal: false,
      },
    },
    isAvailable: async () => true,
  });
  providers.set('openai', {
    name: 'openai',
    displayName: 'OpenAI GPT',
    models: {
      'gpt-4o-mini': {
        maxContextTokens: 128000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0.00015,
        costPer1kOutput: 0.0006,
        strengths: ['fast', 'code'],
        isLocal: false,
      },
    },
    isAvailable: async () => true,
  });
  providers.set('ollama', {
    name: 'ollama',
    displayName: 'Ollama (Local)',
    models: {
      'llama3': {
        maxContextTokens: 8000,
        supportsVision: false,
        supportsTools: false,
        supportsStreaming: true,
        supportsImageGen: false,
        costPer1kInput: 0,
        costPer1kOutput: 0,
        strengths: ['fast', 'private'],
        isLocal: true,
      },
    },
    isAvailable: async () => true,
  });
  return providers;
}

function makeRouting(overrides?: Partial<ModelRouting>): ModelRouting {
  return {
    enabled: true,
    rules: [],
    costLimits: { warnAt: 0.8 },
    preferences: {
      preferLocal: false,
      preferCheap: false,
      sensitiveToLocal: false,
    },
    ...overrides,
  };
}

function makeClassification(overrides?: Partial<TaskClassification>): TaskClassification {
  return {
    type: 'code',
    confidence: 0.8,
    inputTokenEstimate: 500,
    requiresTools: false,
    requiresVision: false,
    sensitivityLevel: 'normal',
    ...overrides,
  };
}

describe('ModelSelector', () => {
  it('should select the best model for a code task', () => {
    const selector = new ModelSelector(makeProviders(), makeRouting());
    const result = selector.select(makeClassification({ type: 'code' }));
    // Claude is best for code (has 'code' strength, higher context)
    expect(result.provider).toBe('anthropic');
    expect(result.model).toBe('claude-sonnet-4-20250514');
  });

  it('should use defaultModel override', () => {
    const routing = makeRouting({ defaultModel: 'gpt-4o-mini' });
    const selector = new ModelSelector(makeProviders(), routing);
    const result = selector.select(makeClassification());
    expect(result.model).toBe('gpt-4o-mini');
    expect(result.reason).toContain('Default model override');
  });

  it('should use explicit routing rules', () => {
    const routing = makeRouting({
      rules: [{ task: 'code', provider: 'openai', model: 'gpt-4o-mini', priority: 1 }],
    });
    const selector = new ModelSelector(makeProviders(), routing);
    const result = selector.select(makeClassification({ type: 'code' }));
    expect(result.model).toBe('gpt-4o-mini');
    expect(result.reason).toContain('routing rule');
  });

  it('should prefer local model for private content when preferLocal is set', () => {
    const routing = makeRouting({ preferences: { preferLocal: true, preferCheap: false, sensitiveToLocal: false } });
    const selector = new ModelSelector(makeProviders(), routing);
    const result = selector.select(makeClassification({ type: 'private', sensitivityLevel: 'private' }));
    expect(result.isLocal).toBe(true);
    expect(result.model).toBe('llama3');
  });

  it('should prefer cheapest model when preferCheap is set', () => {
    const routing = makeRouting({ preferences: { preferLocal: false, preferCheap: true, sensitiveToLocal: false } });
    const selector = new ModelSelector(makeProviders(), routing);
    const result = selector.select(makeClassification({ type: 'general' }));
    // llama3 is free (cost 0)
    expect(result.model).toBe('llama3');
  });

  it('should select cheapest when over budget', () => {
    const selector = new ModelSelector(makeProviders(), makeRouting());
    const result = selector.select(makeClassification(), {
      today: 100,
      thisMonth: 500,
      isOverBudget: true,
      warningThresholdReached: true,
    });
    expect(result.model).toBe('llama3');
    expect(result.reason).toContain('Budget exceeded');
  });

  it('should filter out models that do not support vision when needed', () => {
    const selector = new ModelSelector(makeProviders(), makeRouting());
    const result = selector.select(makeClassification({ type: 'vision', requiresVision: true }));
    // llama3 does not support vision, so it should not be selected
    expect(result.model).not.toBe('llama3');
  });

  it('should throw when no models are available', () => {
    const emptyProviders = new Map<string, ProviderMetadata>();
    const selector = new ModelSelector(emptyProviders, makeRouting());
    expect(() => selector.select(makeClassification())).toThrow('No available models');
  });
});
