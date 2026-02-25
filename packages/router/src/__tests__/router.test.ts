import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ProviderMetadata } from '@auxiora/providers';
import type { ModelRouting } from '@auxiora/config';
import { TaskClassifier } from '../classifier.js';
import { ModelSelector } from '../selector.js';
import { CostTracker } from '../cost-tracker.js';
import { ModelRouter } from '../router.js';

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
  return providers;
}

function makeRouting(): ModelRouting {
  return {
    enabled: true,
    rules: [],
    costLimits: { warnAt: 0.8 },
    preferences: {
      preferLocal: false,
      preferCheap: false,
      sensitiveToLocal: false,
    },
  };
}

describe('ModelRouter', () => {
  let router: ModelRouter;

  beforeEach(() => {
    const providers = makeProviders();
    const routing = makeRouting();
    const classifier = new TaskClassifier();
    const selector = new ModelSelector(providers, routing);
    const costTracker = new CostTracker(
      routing.costLimits,
      path.join(os.tmpdir(), `router-test-${Date.now()}.json`),
    );
    router = new ModelRouter(classifier, selector, costTracker, providers);
  });

  it('should route a code message to an appropriate model', () => {
    const result = router.route('Write a function that sorts an array');
    expect(result.classification.type).toBe('code');
    expect(result.selection.provider).toBeDefined();
    expect(result.selection.model).toBeDefined();
    expect(result.selection.reason).toBeDefined();
  });

  it('should return alternatives', () => {
    const result = router.route('Explain quantum computing');
    expect(result.alternatives.length).toBeGreaterThan(0);
  });

  it('should track usage after recording', () => {
    router.recordUsage('anthropic', 'claude-sonnet-4-20250514', 1000, 500);
    const summary = router.getCostSummary();
    expect(summary.today).toBeGreaterThan(0);
  });

  it('should explain routing decisions', () => {
    const explanation = router.explainRouting('Write a function that sorts an array');
    expect(explanation).toContain('Task classification: code');
    expect(explanation).toContain('Selected:');
    expect(explanation).toContain('Reason:');
  });

  it('should handle general messages', () => {
    const result = router.route('Hello, how are you?');
    expect(result.classification.type).toBe('general');
    expect(result.selection).toBeDefined();
  });

  it('should handle vision context', () => {
    const result = router.route('What is in this picture?', { hasImages: true });
    expect(result.classification.type).toBe('vision');
    expect(result.classification.requiresVision).toBe(true);
  });
});
