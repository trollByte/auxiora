# Architect Runtime Integration via Enrichment Pipeline

**Date:** 2026-02-20
**Status:** Approved
**Scope:** Wire The Architect personality engine into per-message enrichment with a structured pipeline

## Problem

The Architect is partially integrated into the runtime message flow, but has four gaps:

1. **No conversation history passed** — `generatePrompt(userMessage)` is called without `history`, so emotional trajectory, theme detection, and correction learning operate without conversational context.
2. **Tool usage tracking disconnected** — `ArchitectAwarenessCollector.updateToolContext()` is never called despite tool results being available after `executeWithTools()`.
3. **No channel-aware enrichment** — all channels (webchat, Discord, email, Slack, etc.) receive identical enrichment with no channel-type awareness.
4. **Metadata delivery incomplete** — `architectMeta` is attached for webchat but not propagated consistently across channel handlers.

Additionally, the ~80 lines of ad-hoc enrichment logic in `handleMessage()` (memory retrieval, mode detection, security floor, Architect enrichment, self-awareness injection, model identity) are interleaved without clear structure, making the flow hard to follow and extend.

## Solution: Enrichment Pipeline

Replace the ad-hoc multi-stage prompt assembly with a structured `EnrichmentPipeline` of ordered stages.

### Architecture

```
User message arrives
        |
  EnrichmentContext created with:
    basePrompt, userMessage, history[],
    channelType, chatId, sessionId,
    userId, toolsUsed[], config
        |
  +----------------------+
  | 1. MemoryStage  (100)| Semantic search -> inject relevant memories
  +----------------------+
  | 2. ModeStage    (200)| Mode detection + security floor override
  +----------------------+
  | 3. ArchitectStage(300)| generatePrompt(msg, history) + consciousness
  +----------------------+
  | 4. SelfAwareness(400)| Signal collectors -> awareness fragment
  +----------------------+
  | 5. ModelIdentity(500)| Model metadata -> identity fragment
  +----------------------+
        |
  EnrichmentResult { prompt, metadata }
```

Each stage is a pure function of `(context, currentPrompt) -> (prompt, metadata)`. Stages don't call each other. The pipeline orchestrates ordering and enabled-checks.

### Core Types

```typescript
// packages/runtime/src/enrichment/types.ts

interface EnrichmentContext {
  basePrompt: string;
  userMessage: string;
  history: Array<{ role: string; content: string }>;
  channelType: string;           // 'webchat' | 'discord' | 'email' | etc.
  chatId: string;
  sessionId: string;
  userId: string;
  toolsUsed?: Array<{ name: string; success: boolean }>;
  config: RuntimeConfig;
}

interface StageResult {
  prompt: string;
  metadata?: Record<string, unknown>;
}

interface EnrichmentStage {
  readonly name: string;
  readonly order: number;
  enabled(ctx: EnrichmentContext): boolean;
  enrich(ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult>;
}

interface EnrichmentResult {
  prompt: string;
  metadata: {
    architect?: ArchitectMeta;
    mode?: ModeInfo;
    awareness?: string;
    stages: string[];
  };
}
```

### Pipeline Class

```typescript
// packages/runtime/src/enrichment/pipeline.ts

class EnrichmentPipeline {
  private stages: EnrichmentStage[] = [];

  addStage(stage: EnrichmentStage): void {
    this.stages.push(stage);
    this.stages.sort((a, b) => a.order - b.order);
  }

  async run(ctx: EnrichmentContext): Promise<EnrichmentResult> {
    let prompt = ctx.basePrompt;
    const allMetadata: Record<string, unknown> = {};
    const stagesRun: string[] = [];

    for (const stage of this.stages) {
      if (!stage.enabled(ctx)) continue;
      const result = await stage.enrich(ctx, prompt);
      prompt = result.prompt;
      if (result.metadata) Object.assign(allMetadata, result.metadata);
      stagesRun.push(stage.name);
    }

    return { prompt, metadata: { ...allMetadata, stages: stagesRun } as any };
  }
}
```

### Architect Stage (gap fixes)

```typescript
// packages/runtime/src/enrichment/stages/architect-stage.ts

class ArchitectStage implements EnrichmentStage {
  readonly name = 'architect';
  readonly order = 300;

  constructor(
    private architect: TheArchitect,
    private bridge?: ArchitectBridge,
    private awarenessCollector?: ArchitectAwarenessCollector,
    private selfModelGetter?: () => Promise<SelfModelSnapshot | null>,
    private userModelGetter?: () => UserModel | null,
  ) {}

  enabled(ctx: EnrichmentContext): boolean {
    return ctx.config.agent.personality === 'the-architect'
        || ctx.config.perChatPersonality?.[ctx.chatId] === 'the-architect';
  }

  async enrich(ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    // GAP 1: Pass conversation history
    const output = this.architect.generatePrompt(ctx.userMessage, ctx.history);

    // GAP 2: Wire tool usage tracking
    if (this.awarenessCollector && ctx.toolsUsed?.length) {
      this.awarenessCollector.updateToolContext(ctx.toolsUsed);
    }

    // Bridge side effects (persistence, awareness feeding, escalation)
    if (this.bridge && ctx.chatId) {
      this.bridge.afterPrompt(
        { ...output.detectedContext },
        output.emotionalTrajectory,
        output.escalationAlert,
        ctx.chatId,
      );
    }

    // GAP 3: Channel-aware context hint
    const channelHint = ctx.channelType !== 'webchat'
      ? `\n[Channel: ${ctx.channelType}] Adapt tone and formatting for this platform.`
      : '';

    // Consciousness section (active decisions, feedback insights, self/user model)
    const consciousnessSection = await this.buildConsciousnessSection(output);

    const prompt = currentPrompt + '\n\n'
      + output.contextModifier
      + channelHint
      + consciousnessSection;

    // GAP 4: Full metadata for client streaming
    const mix = this.architect.getTraitMix(output.detectedContext);
    const traitWeights: Record<string, number> = {};
    for (const [key, val] of Object.entries(mix)) {
      traitWeights[key] = val as number;
    }

    return {
      prompt,
      metadata: {
        architect: {
          detectedContext: output.detectedContext,
          activeTraits: output.activeTraits,
          traitWeights,
          recommendation: output.recommendation,
          escalationAlert: output.escalationAlert,
          channelType: ctx.channelType,
        },
      },
    };
  }

  private async buildConsciousnessSection(output: PromptOutput): Promise<string> {
    const parts: string[] = [];

    if (output.relevantDecisions?.length) {
      const items = output.relevantDecisions.slice(0, 5)
        .map(d => `- ${d.summary} [${d.status}]`).join('\n');
      parts.push(`**Active Decisions:**\n${items}`);
    }

    if (output.feedbackInsight) {
      const fi = output.feedbackInsight;
      const notes: string[] = [];
      if (fi.weakDomains.length > 0) notes.push(`Weak domains: ${fi.weakDomains.join(', ')}`);
      if (fi.trend !== 'stable') notes.push(`Satisfaction trend: ${fi.trend}`);
      const adjustments = Object.entries(fi.suggestedAdjustments);
      if (adjustments.length > 0) {
        notes.push(`Suggested adjustments: ${adjustments.map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ')}`);
      }
      if (notes.length > 0) {
        parts.push(`**Self-Improvement Notes:**\n${notes.map(n => `- ${n}`).join('\n')}`);
      }
    }

    if (this.selfModelGetter) {
      const selfModel = await this.selfModelGetter();
      if (selfModel?.selfNarrative) {
        parts.push(`**Self-Model:**\n${selfModel.selfNarrative}`);
      }
    }

    if (this.userModelGetter) {
      const userModel = this.userModelGetter();
      if (userModel?.narrative) {
        parts.push(`**User Model:**\n${userModel.narrative}`);
      }
    }

    return parts.length > 0 ? '\n\n[Consciousness]\n' + parts.join('\n\n') : '';
  }
}
```

### Other Stages

**MemoryStage** (order 100): Lifts `memoryRetriever.retrieve(memories, userMessage)` into the pipeline. Returns prompt with memory section appended.

**ModeStage** (order 200): Lifts mode detection, security floor override, and suspended mode restoration. Uses `PromptAssembler.enrichForMessage()` and `enrichForSecurityContext()`. Returns enriched prompt with mode context.

**SelfAwarenessStage** (order 400): Lifts `selfAwarenessAssembler.assemble(awarenessContext)`. Appends `[Dynamic Self-Awareness]` section.

**ModelIdentityStage** (order 500): Lifts `buildModelIdentityFragment()`. Appends model metadata section.

Each is a direct extraction of existing code with no behavior changes.

### Tool Usage Tracking Wire-Up

After `executeWithTools()` returns, the `toolsUsed` array is persisted to the session:

```typescript
this.sessions.setMeta(session.id, 'lastToolsUsed', toolsUsed);
```

When building `EnrichmentContext` for the next message:

```typescript
toolsUsed: this.sessions.getMeta(session.id, 'lastToolsUsed') ?? [],
```

This feeds the previous turn's tool usage into the Architect's awareness collector for the current turn.

### Integration into handleMessage()

The ~80 lines of enrichment code (lines 2806-2890) collapse to:

```typescript
const enrichmentCtx: EnrichmentContext = {
  basePrompt,
  userMessage: processedContent,
  history: contextMessages,
  channelType: 'webchat',
  chatId: chatId ?? session.id,
  sessionId: session.id,
  userId: client.senderId ?? 'anonymous',
  toolsUsed: this.sessions.getMeta(session.id, 'lastToolsUsed') ?? [],
  config: this.config,
};

const enrichmentResult = await this.enrichmentPipeline.run(enrichmentCtx);
enrichedPrompt = enrichmentResult.prompt;
```

The same pattern applies to the channel handler.

### File Structure

```
packages/runtime/src/enrichment/
  types.ts                    # EnrichmentContext, EnrichmentStage, EnrichmentResult
  pipeline.ts                 # EnrichmentPipeline class
  stages/
    memory-stage.ts           # MemoryStage (order 100)
    mode-stage.ts             # ModeStage (order 200)
    architect-stage.ts        # ArchitectStage (order 300) — 4 gap fixes
    self-awareness-stage.ts   # SelfAwarenessStage (order 400)
    model-identity-stage.ts   # ModelIdentityStage (order 500)
```

### Testing Strategy

- Unit test each stage in isolation with mock `EnrichmentContext`
- Unit test `EnrichmentPipeline` with mock stages (ordering, enabled-check, metadata merging)
- Integration test: full pipeline with real Architect instance, verify history is passed and metadata is returned
- Regression test: ensure enriched prompts match current output for identical inputs

### Non-Goals

- No new UI components (existing ContextIndicator, TraitCustomizer, SourcesPanel continue to work)
- No changes to The Architect's core engine (only how the runtime calls it)
- No changes to persistence or vault integration (ArchitectBridge continues to handle that)
