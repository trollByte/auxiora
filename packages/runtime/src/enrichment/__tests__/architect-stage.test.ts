import { describe, it, expect, vi } from 'vitest';
import { ArchitectStage } from '../stages/architect-stage.js';
import type { EnrichmentContext } from '../types.js';

function makeCtx(overrides: Partial<EnrichmentContext> = {}): EnrichmentContext {
  return {
    basePrompt: 'base',
    userMessage: 'review this code for vulnerabilities',
    history: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ],
    channelType: 'webchat',
    chatId: 'c1',
    sessionId: 's1',
    userId: 'u1',
    toolsUsed: [],
    config: { agent: { personality: 'the-architect' } } as any,
    ...overrides,
  };
}

function makeMockArchitect() {
  return {
    generatePrompt: vi.fn().mockReturnValue({
      contextModifier: '[Security Review Mode]',
      detectedContext: {
        domain: 'security_review',
        emotionalRegister: 'neutral',
        complexity: 'high',
        mode: 'analytical',
        stakes: 'high',
      },
      activeTraits: [
        { trait: 'mungerThinking', source: 'base', instruction: 'invert' },
      ],
      emotionalTrajectory: 'stable',
      escalationAlert: false,
      recommendation: undefined,
      relevantDecisions: [],
      feedbackInsight: {
        weakDomains: [],
        trend: 'stable',
        suggestedAdjustments: {},
      },
    }),
    getTraitMix: vi.fn().mockReturnValue({
      mungerThinking: 0.8,
      muskExecution: 0.6,
    }),
  };
}

function makeMockBridge() {
  return {
    afterPrompt: vi.fn(),
  };
}

function makeMockCollector() {
  return {
    updateToolContext: vi.fn(),
  };
}

describe('ArchitectStage', () => {
  it('has order 300', () => {
    const stage = new ArchitectStage(makeMockArchitect());
    expect(stage.order).toBe(300);
  });

  it('is enabled for the-architect personality', () => {
    const stage = new ArchitectStage(makeMockArchitect());
    const ctx = makeCtx();
    expect(stage.enabled(ctx)).toBe(true);
  });

  it('is disabled for non-architect personality', () => {
    const stage = new ArchitectStage(makeMockArchitect());
    const ctx = makeCtx({ config: { agent: { personality: 'default' } } as any });
    expect(stage.enabled(ctx)).toBe(false);
  });

  it('passes conversation history to generatePrompt (GAP 1)', async () => {
    const architect = makeMockArchitect();
    const stage = new ArchitectStage(architect);
    const ctx = makeCtx();

    await stage.enrich(ctx, 'current prompt');

    expect(architect.generatePrompt).toHaveBeenCalledWith(
      ctx.userMessage,
      ctx.history,
    );
  });

  it('feeds tool usage to awareness collector (GAP 2)', async () => {
    const architect = makeMockArchitect();
    const collector = makeMockCollector();
    const tools = [
      { name: 'bash', success: true },
      { name: 'web_browser', success: false },
    ];
    const stage = new ArchitectStage(architect, undefined, collector);
    const ctx = makeCtx({ toolsUsed: tools });

    await stage.enrich(ctx, 'current prompt');

    expect(collector.updateToolContext).toHaveBeenCalledWith(tools);
  });

  it('does not call collector when toolsUsed is empty', async () => {
    const architect = makeMockArchitect();
    const collector = makeMockCollector();
    const stage = new ArchitectStage(architect, undefined, collector);
    const ctx = makeCtx({ toolsUsed: [] });

    await stage.enrich(ctx, 'current prompt');

    expect(collector.updateToolContext).not.toHaveBeenCalled();
  });

  it('adds channel hint for non-webchat channels (GAP 3)', async () => {
    const architect = makeMockArchitect();
    const stage = new ArchitectStage(architect);
    const ctx = makeCtx({ channelType: 'discord' });

    const result = await stage.enrich(ctx, 'current prompt');

    expect(result.prompt).toContain('[Channel: discord]');
  });

  it('omits channel hint for webchat', async () => {
    const architect = makeMockArchitect();
    const stage = new ArchitectStage(architect);
    const ctx = makeCtx({ channelType: 'webchat' });

    const result = await stage.enrich(ctx, 'current prompt');

    expect(result.prompt).not.toContain('[Channel:');
  });

  it('returns full architectMeta in metadata (GAP 4)', async () => {
    const architect = makeMockArchitect();
    const stage = new ArchitectStage(architect);
    const ctx = makeCtx();

    const result = await stage.enrich(ctx, 'current prompt');

    expect(result.metadata).toBeDefined();
    const meta = result.metadata!.architect as Record<string, unknown>;
    expect(meta.detectedContext).toEqual(
      expect.objectContaining({ domain: 'security_review' }),
    );
    expect(meta.activeTraits).toBeDefined();
    expect(meta.traitWeights).toEqual({ mungerThinking: 0.8, muskExecution: 0.6 });
    expect(meta.channelType).toBe('webchat');
    expect(meta.escalationAlert).toBe(false);
  });

  it('calls bridge.afterPrompt with detected context', async () => {
    const architect = makeMockArchitect();
    const bridge = makeMockBridge();
    const stage = new ArchitectStage(architect, bridge);
    const ctx = makeCtx({ chatId: 'chat-42' });

    await stage.enrich(ctx, 'current prompt');

    expect(bridge.afterPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'security_review' }),
      'stable',
      false,
      'chat-42',
    );
  });

  it('appends context modifier to prompt', async () => {
    const architect = makeMockArchitect();
    const stage = new ArchitectStage(architect);
    const ctx = makeCtx();

    const result = await stage.enrich(ctx, 'current prompt');

    expect(result.prompt).toContain('current prompt');
    expect(result.prompt).toContain('[Security Review Mode]');
  });

  it('builds consciousness section with decisions and feedback', async () => {
    const architect = makeMockArchitect();
    architect.generatePrompt.mockReturnValue({
      contextModifier: '[Mode]',
      detectedContext: {
        domain: 'general',
        emotionalRegister: 'neutral',
        complexity: 'moderate',
        mode: 'solo_work',
        stakes: 'moderate',
      },
      activeTraits: [],
      emotionalTrajectory: 'stable',
      escalationAlert: false,
      relevantDecisions: [
        { summary: 'Migrate to ESM', status: 'active' },
        { summary: 'Add caching', status: 'pending' },
      ],
      feedbackInsight: {
        weakDomains: ['sales_pitch'],
        trend: 'declining',
        suggestedAdjustments: { warmth: 0.2 },
      },
    });
    architect.getTraitMix.mockReturnValue({});

    const selfModelGetter = vi.fn().mockResolvedValue({
      selfNarrative: 'I am a security-focused assistant.',
    });
    const userModelGetter = vi.fn().mockReturnValue({
      narrative: 'User prefers concise answers.',
    });

    const stage = new ArchitectStage(
      architect,
      undefined,
      undefined,
      selfModelGetter,
      userModelGetter,
    );
    const ctx = makeCtx();

    const result = await stage.enrich(ctx, 'base');

    expect(result.prompt).toContain('[Consciousness]');
    expect(result.prompt).toContain('Migrate to ESM [active]');
    expect(result.prompt).toContain('Add caching [pending]');
    expect(result.prompt).toContain('Weak domains: sales_pitch');
    expect(result.prompt).toContain('Satisfaction trend: declining');
    expect(result.prompt).toContain('warmth +0.2');
    expect(result.prompt).toContain('I am a security-focused assistant.');
    expect(result.prompt).toContain('User prefers concise answers.');
  });
});
