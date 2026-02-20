import { describe, it, expect, vi } from 'vitest';
import { ModelIdentityStage } from '../stages/model-identity-stage.js';
import type { EnrichmentContext } from '../types.js';

function makeCtx(overrides: Partial<EnrichmentContext> = {}): EnrichmentContext {
  return {
    basePrompt: 'base',
    userMessage: 'hello',
    history: [],
    channelType: 'webchat',
    chatId: 'c1',
    sessionId: 's1',
    userId: 'u1',
    toolsUsed: [],
    config: { agent: { personality: 'the-architect' } } as any,
    ...overrides,
  };
}

function makeProvider(
  model = 'claude-3-opus',
  displayName = 'Anthropic',
  maxContext = 200000,
  vision = true,
) {
  return {
    defaultModel: model,
    metadata: {
      displayName,
      models: {
        [model]: { maxContextTokens: maxContext, supportsVision: vision },
      },
    },
  };
}

describe('ModelIdentityStage', () => {
  it('appends model identity fragment', async () => {
    const provider = makeProvider('claude-3-opus', 'Anthropic', 200000, true);
    const stage = new ModelIdentityStage(() => ({ provider }));
    const ctx = makeCtx();

    const result = await stage.enrich(ctx, 'current prompt');

    expect(result.prompt).toContain('current prompt');
    expect(result.prompt).toContain('[Model Identity]');
    expect(result.prompt).toContain('claude-3-opus');
    expect(result.prompt).toContain('Anthropic');
    expect(result.prompt).toContain('200,000 tokens');
    expect(result.prompt).toContain('You have vision capabilities.');
  });

  it('uses model override when provided', async () => {
    const provider = makeProvider('claude-3-opus', 'Anthropic', 200000, true);
    // Add the override model to the models map
    provider.metadata.models['claude-3-sonnet'] = {
      maxContextTokens: 180000,
      supportsVision: false,
    };
    const stage = new ModelIdentityStage(() => ({ provider, model: 'claude-3-sonnet' }));
    const ctx = makeCtx();

    const result = await stage.enrich(ctx, 'current prompt');

    expect(result.prompt).toContain('claude-3-sonnet');
    expect(result.prompt).toContain('180,000 tokens');
    expect(result.prompt).not.toContain('claude-3-opus');
  });

  it('omits vision line when not supported', async () => {
    const provider = makeProvider('claude-3-haiku', 'Anthropic', 200000, false);
    const stage = new ModelIdentityStage(() => ({ provider }));
    const ctx = makeCtx();

    const result = await stage.enrich(ctx, 'current prompt');

    expect(result.prompt).not.toContain('vision capabilities');
  });

  it('is always enabled', () => {
    const provider = makeProvider();
    const stage = new ModelIdentityStage(() => ({ provider }));
    const ctx = makeCtx();

    expect(stage.enabled(ctx)).toBe(true);
  });

  it('has order 500', () => {
    const provider = makeProvider();
    const stage = new ModelIdentityStage(() => ({ provider }));

    expect(stage.order).toBe(500);
  });
});
