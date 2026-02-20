# Architect Runtime Integration — Enrichment Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the ad-hoc multi-stage prompt assembly in the runtime with a structured EnrichmentPipeline, wiring The Architect's conversation history, tool tracking, and channel awareness.

**Architecture:** An ordered chain of EnrichmentStage implementations (Memory, Mode, Architect, SelfAwareness, ModelIdentity) replaces ~80 lines of inline enrichment in `handleMessage()` and `handleChannelMessage()`. Each stage is a pure `(context, prompt) -> (prompt, metadata)` function. A per-session `Map<string, ToolUsage[]>` stores previous-turn tool usage (same pattern as `sessionModes`).

**Tech Stack:** TypeScript strict ESM, vitest, `@auxiora/personality`, `@auxiora/self-awareness`, `@auxiora/memory`

**Design doc:** `docs/plans/2026-02-20-architect-runtime-integration-design.md`

---

### Task 1: Core Types

**Files:**
- Create: `packages/runtime/src/enrichment/types.ts`
- Test: `packages/runtime/src/enrichment/__tests__/types.test.ts`

**Step 1: Write the type file**

```typescript
// packages/runtime/src/enrichment/types.ts
import type { Config } from '@auxiora/config';

export interface EnrichmentContext {
  readonly basePrompt: string;
  readonly userMessage: string;
  readonly history: ReadonlyArray<{ role: string; content: string }>;
  readonly channelType: string;
  readonly chatId: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly toolsUsed: ReadonlyArray<{ name: string; success: boolean }>;
  readonly config: Config;
}

export interface StageResult {
  readonly prompt: string;
  readonly metadata?: Record<string, unknown>;
}

export interface EnrichmentStage {
  readonly name: string;
  readonly order: number;
  enabled(ctx: EnrichmentContext): boolean;
  enrich(ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult>;
}

export interface ArchitectMeta {
  readonly detectedContext: Record<string, unknown>;
  readonly activeTraits: ReadonlyArray<Record<string, unknown>>;
  readonly traitWeights: Record<string, number>;
  readonly recommendation?: Record<string, unknown>;
  readonly escalationAlert?: boolean;
  readonly channelType: string;
}

export interface EnrichmentResult {
  readonly prompt: string;
  readonly metadata: {
    readonly architect?: ArchitectMeta;
    readonly stages: string[];
    readonly [key: string]: unknown;
  };
}
```

**Step 2: Write a compile-check test**

```typescript
// packages/runtime/src/enrichment/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import type { EnrichmentContext, EnrichmentStage, StageResult, EnrichmentResult, ArchitectMeta } from '../types.js';

describe('EnrichmentPipeline types', () => {
  it('EnrichmentContext is structurally valid', () => {
    const ctx: EnrichmentContext = {
      basePrompt: 'base',
      userMessage: 'hello',
      history: [{ role: 'user', content: 'hi' }],
      channelType: 'webchat',
      chatId: 'chat-1',
      sessionId: 'sess-1',
      userId: 'user-1',
      toolsUsed: [{ name: 'web_search', success: true }],
      config: {} as any,
    };
    expect(ctx.channelType).toBe('webchat');
  });

  it('StageResult accepts prompt-only or prompt+metadata', () => {
    const minimal: StageResult = { prompt: 'p' };
    const full: StageResult = { prompt: 'p', metadata: { foo: 1 } };
    expect(minimal.prompt).toBe('p');
    expect(full.metadata).toEqual({ foo: 1 });
  });

  it('EnrichmentResult has stages array', () => {
    const result: EnrichmentResult = {
      prompt: 'enriched',
      metadata: { stages: ['memory', 'mode'] },
    };
    expect(result.metadata.stages).toHaveLength(2);
  });
});
```

**Step 3: Run test**

Run: `pnpm vitest run packages/runtime/src/enrichment/__tests__/types.test.ts`
Expected: PASS (3 tests)

**Step 4: Commit**

```bash
git add packages/runtime/src/enrichment/types.ts packages/runtime/src/enrichment/__tests__/types.test.ts
git commit -m "feat(runtime): add enrichment pipeline core types"
```

---

### Task 2: Pipeline Class

**Files:**
- Create: `packages/runtime/src/enrichment/pipeline.ts`
- Test: `packages/runtime/src/enrichment/__tests__/pipeline.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/runtime/src/enrichment/__tests__/pipeline.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EnrichmentPipeline } from '../pipeline.js';
import type { EnrichmentContext, EnrichmentStage } from '../types.js';

function makeCtx(overrides: Partial<EnrichmentContext> = {}): EnrichmentContext {
  return {
    basePrompt: 'base prompt',
    userMessage: 'hello',
    history: [],
    channelType: 'webchat',
    chatId: 'chat-1',
    sessionId: 'sess-1',
    userId: 'user-1',
    toolsUsed: [],
    config: {} as any,
    ...overrides,
  };
}

function makeStage(name: string, order: number, result: { prompt: string; metadata?: Record<string, unknown> }, enabled = true): EnrichmentStage {
  return {
    name,
    order,
    enabled: () => enabled,
    enrich: vi.fn(async (_ctx, _prompt) => result),
  };
}

describe('EnrichmentPipeline', () => {
  it('runs stages in order and returns final prompt', async () => {
    const pipeline = new EnrichmentPipeline();
    pipeline.addStage(makeStage('b', 200, { prompt: 'after-b' }));
    pipeline.addStage(makeStage('a', 100, { prompt: 'after-a' }));

    const result = await pipeline.run(makeCtx());
    expect(result.metadata.stages).toEqual(['a', 'b']);
    expect(result.prompt).toBe('after-b');
  });

  it('skips disabled stages', async () => {
    const pipeline = new EnrichmentPipeline();
    pipeline.addStage(makeStage('enabled', 100, { prompt: 'yes' }));
    pipeline.addStage(makeStage('disabled', 200, { prompt: 'no' }, false));

    const result = await pipeline.run(makeCtx());
    expect(result.metadata.stages).toEqual(['enabled']);
    expect(result.prompt).toBe('yes');
  });

  it('merges metadata from multiple stages', async () => {
    const pipeline = new EnrichmentPipeline();
    pipeline.addStage(makeStage('a', 100, { prompt: 'p', metadata: { foo: 1 } }));
    pipeline.addStage(makeStage('b', 200, { prompt: 'p2', metadata: { bar: 2 } }));

    const result = await pipeline.run(makeCtx());
    expect(result.metadata.foo).toBe(1);
    expect(result.metadata.bar).toBe(2);
    expect(result.metadata.stages).toEqual(['a', 'b']);
  });

  it('passes current prompt to next stage', async () => {
    const pipeline = new EnrichmentPipeline();
    const stageA: EnrichmentStage = {
      name: 'a',
      order: 100,
      enabled: () => true,
      enrich: vi.fn(async (_ctx, prompt) => ({ prompt: prompt + '+a' })),
    };
    const stageB: EnrichmentStage = {
      name: 'b',
      order: 200,
      enabled: () => true,
      enrich: vi.fn(async (_ctx, prompt) => ({ prompt: prompt + '+b' })),
    };
    pipeline.addStage(stageB);
    pipeline.addStage(stageA);

    const result = await pipeline.run(makeCtx());
    expect(result.prompt).toBe('base prompt+a+b');
  });

  it('returns base prompt when no stages are enabled', async () => {
    const pipeline = new EnrichmentPipeline();
    pipeline.addStage(makeStage('off', 100, { prompt: 'never' }, false));

    const result = await pipeline.run(makeCtx());
    expect(result.prompt).toBe('base prompt');
    expect(result.metadata.stages).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/runtime/src/enrichment/__tests__/pipeline.test.ts`
Expected: FAIL — cannot resolve `../pipeline.js`

**Step 3: Write minimal implementation**

```typescript
// packages/runtime/src/enrichment/pipeline.ts
import type { EnrichmentContext, EnrichmentResult, EnrichmentStage } from './types.js';

export class EnrichmentPipeline {
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
      if (result.metadata) {
        for (const [k, v] of Object.entries(result.metadata)) {
          allMetadata[k] = v;
        }
      }
      stagesRun.push(stage.name);
    }

    return {
      prompt,
      metadata: { ...allMetadata, stages: stagesRun },
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/runtime/src/enrichment/__tests__/pipeline.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add packages/runtime/src/enrichment/pipeline.ts packages/runtime/src/enrichment/__tests__/pipeline.test.ts
git commit -m "feat(runtime): add EnrichmentPipeline class with stage ordering"
```

---

### Task 3: MemoryStage

**Files:**
- Create: `packages/runtime/src/enrichment/stages/memory-stage.ts`
- Test: `packages/runtime/src/enrichment/__tests__/memory-stage.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/runtime/src/enrichment/__tests__/memory-stage.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MemoryStage } from '../stages/memory-stage.js';
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
    config: {} as any,
    ...overrides,
  };
}

describe('MemoryStage', () => {
  it('appends memory section to prompt when memories exist', async () => {
    const mockStore = { getAll: vi.fn().mockResolvedValue([{ text: 'mem1' }]) };
    const mockRetriever = { retrieve: vi.fn().mockReturnValue('\n\n[Memories]\n- mem1') };

    const stage = new MemoryStage(mockStore as any, mockRetriever as any);
    const result = await stage.enrich(makeCtx(), 'current prompt');

    expect(result.prompt).toContain('[Memories]');
    expect(result.prompt).toContain('current prompt');
    expect(mockRetriever.retrieve).toHaveBeenCalledWith([{ text: 'mem1' }], 'hello');
  });

  it('returns unchanged prompt when no memories found', async () => {
    const mockStore = { getAll: vi.fn().mockResolvedValue([]) };
    const mockRetriever = { retrieve: vi.fn().mockReturnValue(null) };

    const stage = new MemoryStage(mockStore as any, mockRetriever as any);
    const result = await stage.enrich(makeCtx(), 'current prompt');

    expect(result.prompt).toBe('current prompt');
  });

  it('is always enabled', () => {
    const stage = new MemoryStage({} as any, {} as any);
    expect(stage.enabled(makeCtx())).toBe(true);
  });

  it('has order 100', () => {
    const stage = new MemoryStage({} as any, {} as any);
    expect(stage.order).toBe(100);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/runtime/src/enrichment/__tests__/memory-stage.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/runtime/src/enrichment/stages/memory-stage.ts
import type { MemoryStore } from '@auxiora/memory';
import type { MemoryRetriever } from '@auxiora/memory';
import type { EnrichmentContext, EnrichmentStage, StageResult } from '../types.js';

export class MemoryStage implements EnrichmentStage {
  readonly name = 'memory';
  readonly order = 100;

  constructor(
    private readonly store: MemoryStore,
    private readonly retriever: MemoryRetriever,
  ) {}

  enabled(_ctx: EnrichmentContext): boolean {
    return true;
  }

  async enrich(ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    const memories = await this.store.getAll();
    const section = this.retriever.retrieve(memories, ctx.userMessage);
    return { prompt: section ? currentPrompt + section : currentPrompt };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/runtime/src/enrichment/__tests__/memory-stage.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add packages/runtime/src/enrichment/stages/memory-stage.ts packages/runtime/src/enrichment/__tests__/memory-stage.test.ts
git commit -m "feat(runtime): add MemoryStage for enrichment pipeline"
```

---

### Task 4: ModeStage

**Files:**
- Create: `packages/runtime/src/enrichment/stages/mode-stage.ts`
- Test: `packages/runtime/src/enrichment/__tests__/mode-stage.test.ts`

**Context:** The ModeStage encapsulates mode detection, security floor override, and suspended mode restoration. It needs access to `ModeDetector`, `PromptAssembler`, `SecurityFloor`, `UserPreferences`, and a `getSessionModeState` callback. These are injected via constructor.

**Step 1: Write the failing test**

```typescript
// packages/runtime/src/enrichment/__tests__/mode-stage.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ModeStage } from '../stages/mode-stage.js';
import type { EnrichmentContext } from '../types.js';

function makeCtx(overrides: Partial<EnrichmentContext> = {}): EnrichmentContext {
  return {
    basePrompt: 'base',
    userMessage: 'analyze this data',
    history: [],
    channelType: 'webchat',
    chatId: 'c1',
    sessionId: 's1',
    userId: 'u1',
    toolsUsed: [],
    config: { modes: { enabled: true, autoDetection: true } } as any,
    ...overrides,
  };
}

describe('ModeStage', () => {
  it('is disabled when modes.enabled is false', () => {
    const stage = new ModeStage({} as any, {} as any, undefined, undefined, () => ({ activeMode: 'auto', autoDetected: false }));
    const ctx = makeCtx({ config: { modes: { enabled: false } } as any });
    expect(stage.enabled(ctx)).toBe(false);
  });

  it('is enabled when modes.enabled is true', () => {
    const stage = new ModeStage({} as any, {} as any, undefined, undefined, () => ({ activeMode: 'auto', autoDetected: false }));
    expect(stage.enabled(makeCtx())).toBe(true);
  });

  it('calls promptAssembler with security context when security floor detects threat', async () => {
    const securityFloor = {
      detectSecurityContext: vi.fn().mockReturnValue({ active: true, severity: 'high' }),
    };
    const assembler = {
      enrichForSecurityContext: vi.fn().mockReturnValue('security-hardened prompt'),
      enrichForMessage: vi.fn(),
    };
    const modeState = { activeMode: 'auto' as const, autoDetected: false };
    const stage = new ModeStage(
      {} as any,
      assembler as any,
      securityFloor as any,
      undefined,
      () => modeState,
    );

    const result = await stage.enrich(makeCtx(), 'current');
    expect(assembler.enrichForSecurityContext).toHaveBeenCalled();
    expect(result.prompt).toBe('security-hardened prompt');
  });

  it('calls buildModeEnrichedPrompt for normal messages', async () => {
    const detector = {
      detect: vi.fn().mockReturnValue({ mode: 'analyst' }),
    };
    const assembler = {
      enrichForMessage: vi.fn().mockReturnValue('mode-enriched prompt'),
    };
    const modeState = { activeMode: 'auto' as const, autoDetected: false };
    const stage = new ModeStage(
      detector as any,
      assembler as any,
      undefined,
      undefined,
      () => modeState,
    );

    const ctx = makeCtx({ config: { modes: { enabled: true, autoDetection: true } } as any });
    const result = await stage.enrich(ctx, 'current');
    expect(result.prompt).toBe('mode-enriched prompt');
    expect(detector.detect).toHaveBeenCalledWith('analyze this data', { currentState: modeState });
  });

  it('restores suspended mode when security context is inactive', async () => {
    const securityFloor = {
      detectSecurityContext: vi.fn().mockReturnValue({ active: false }),
    };
    const assembler = {
      enrichForMessage: vi.fn().mockReturnValue('restored mode prompt'),
    };
    const modeState = { activeMode: 'auto' as const, autoDetected: false, suspendedMode: 'analyst' as const };
    const stage = new ModeStage(
      {} as any,
      assembler as any,
      securityFloor as any,
      undefined,
      () => modeState,
    );

    const result = await stage.enrich(makeCtx(), 'current');
    expect(modeState.activeMode).toBe('analyst');
    expect(modeState.suspendedMode).toBeUndefined();
    expect(result.prompt).toBe('restored mode prompt');
  });

  it('has order 200', () => {
    const stage = new ModeStage({} as any, {} as any, undefined, undefined, () => ({} as any));
    expect(stage.order).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/runtime/src/enrichment/__tests__/mode-stage.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/runtime/src/enrichment/stages/mode-stage.ts
import type { ModeDetector, PromptAssembler, SecurityFloor, UserPreferences } from '@auxiora/personality';
import type { SessionModeState } from '@auxiora/personality';
import type { EnrichmentContext, EnrichmentStage, StageResult } from '../types.js';

export class ModeStage implements EnrichmentStage {
  readonly name = 'mode';
  readonly order = 200;

  constructor(
    private readonly detector: ModeDetector,
    private readonly assembler: PromptAssembler,
    private readonly securityFloor: SecurityFloor | undefined,
    private readonly userPreferences: UserPreferences | undefined,
    private readonly getModeState: (sessionId: string) => SessionModeState,
  ) {}

  enabled(ctx: EnrichmentContext): boolean {
    return ctx.config.modes?.enabled !== false;
  }

  async enrich(ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    const modeState = this.getModeState(ctx.sessionId);

    // Security floor takes priority
    if (this.securityFloor) {
      const secCtx = this.securityFloor.detectSecurityContext({ userMessage: ctx.userMessage });
      if (secCtx.active) {
        modeState.suspendedMode = modeState.activeMode;
        return {
          prompt: this.assembler.enrichForSecurityContext(secCtx, this.securityFloor, null),
        };
      } else if (modeState.suspendedMode) {
        // Restore suspended mode
        modeState.activeMode = modeState.suspendedMode;
        delete modeState.suspendedMode;
        return {
          prompt: this.assembler.enrichForMessage(modeState, null, this.userPreferences, undefined, ctx.channelType),
        };
      }
    }

    // Normal mode detection
    return {
      prompt: this.buildModeEnrichedPrompt(ctx, modeState),
    };
  }

  private buildModeEnrichedPrompt(ctx: EnrichmentContext, modeState: SessionModeState): string {
    if (modeState.activeMode === 'auto' && this.detector && ctx.config.modes?.autoDetection !== false) {
      const detection = this.detector.detect(ctx.userMessage, { currentState: modeState });
      if (detection) {
        modeState.lastAutoMode = detection.mode;
        modeState.autoDetected = true;
        modeState.lastSwitchAt = Date.now();
        const tempState: SessionModeState = { ...modeState, activeMode: detection.mode };
        return this.assembler.enrichForMessage(tempState, null, this.userPreferences, undefined, ctx.channelType);
      }
    }
    return this.assembler.enrichForMessage(modeState, null, this.userPreferences, undefined, ctx.channelType);
  }
}
```

**Note:** The ModeStage receives memory section as `null` because the MemoryStage already appended it to the prompt. The ModeStage works on the base prompt structure, and memory is already embedded. This differs from the original code where memory was passed through enrichForMessage — verify that `PromptAssembler.enrichForMessage()` handles `null` memory correctly (it already does based on existing code at line 2827).

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/runtime/src/enrichment/__tests__/mode-stage.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add packages/runtime/src/enrichment/stages/mode-stage.ts packages/runtime/src/enrichment/__tests__/mode-stage.test.ts
git commit -m "feat(runtime): add ModeStage with security floor and auto-detection"
```

---

### Task 5: ArchitectStage (4 Gap Fixes)

**Files:**
- Create: `packages/runtime/src/enrichment/stages/architect-stage.ts`
- Test: `packages/runtime/src/enrichment/__tests__/architect-stage.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/runtime/src/enrichment/__tests__/architect-stage.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ArchitectStage } from '../stages/architect-stage.js';
import type { EnrichmentContext } from '../types.js';

function makeCtx(overrides: Partial<EnrichmentContext> = {}): EnrichmentContext {
  return {
    basePrompt: 'base',
    userMessage: 'review this code for security issues',
    history: [
      { role: 'user', content: 'I have a Node.js app' },
      { role: 'assistant', content: 'Tell me more about the stack.' },
    ],
    channelType: 'webchat',
    chatId: 'c1',
    sessionId: 's1',
    userId: 'u1',
    toolsUsed: [{ name: 'web_search', success: true }],
    config: { agent: { personality: 'the-architect' } } as any,
    ...overrides,
  };
}

function makeMockArchitect() {
  return {
    generatePrompt: vi.fn().mockReturnValue({
      contextModifier: '[Security Review Mode]',
      detectedContext: { domain: 'security_review', emotionalRegister: 'neutral', complexity: 'high', mode: 'analytical', stakes: 'high' },
      activeTraits: [{ trait: 'mungerThinking', source: 'base', instruction: 'invert' }],
      emotionalTrajectory: 'stable',
      escalationAlert: false,
      recommendation: undefined,
      relevantDecisions: [],
      feedbackInsight: { weakDomains: [], trend: 'stable', suggestedAdjustments: {} },
    }),
    getTraitMix: vi.fn().mockReturnValue({ mungerThinking: 0.8, muskExecution: 0.6 }),
  };
}

describe('ArchitectStage', () => {
  it('passes conversation history to generatePrompt (GAP 1)', async () => {
    const architect = makeMockArchitect();
    const stage = new ArchitectStage(architect as any);

    const ctx = makeCtx();
    await stage.enrich(ctx, 'current prompt');

    expect(architect.generatePrompt).toHaveBeenCalledWith(
      'review this code for security issues',
      ctx.history,
    );
  });

  it('feeds tool usage to awareness collector (GAP 2)', async () => {
    const architect = makeMockArchitect();
    const collector = { updateToolContext: vi.fn() };
    const stage = new ArchitectStage(architect as any, undefined, collector as any);

    await stage.enrich(makeCtx(), 'prompt');
    expect(collector.updateToolContext).toHaveBeenCalledWith([{ name: 'web_search', success: true }]);
  });

  it('does not call collector when toolsUsed is empty', async () => {
    const architect = makeMockArchitect();
    const collector = { updateToolContext: vi.fn() };
    const stage = new ArchitectStage(architect as any, undefined, collector as any);

    await stage.enrich(makeCtx({ toolsUsed: [] }), 'prompt');
    expect(collector.updateToolContext).not.toHaveBeenCalled();
  });

  it('adds channel hint for non-webchat channels (GAP 3)', async () => {
    const architect = makeMockArchitect();
    const stage = new ArchitectStage(architect as any);

    const result = await stage.enrich(makeCtx({ channelType: 'discord' }), 'prompt');
    expect(result.prompt).toContain('[Channel: discord]');
  });

  it('omits channel hint for webchat', async () => {
    const architect = makeMockArchitect();
    const stage = new ArchitectStage(architect as any);

    const result = await stage.enrich(makeCtx({ channelType: 'webchat' }), 'prompt');
    expect(result.prompt).not.toContain('[Channel:');
  });

  it('returns full architectMeta in metadata (GAP 4)', async () => {
    const architect = makeMockArchitect();
    const stage = new ArchitectStage(architect as any);

    const result = await stage.enrich(makeCtx({ channelType: 'discord' }), 'prompt');
    const meta = result.metadata?.architect as any;
    expect(meta).toBeDefined();
    expect(meta.detectedContext.domain).toBe('security_review');
    expect(meta.traitWeights.mungerThinking).toBe(0.8);
    expect(meta.channelType).toBe('discord');
    expect(meta.activeTraits).toHaveLength(1);
  });

  it('calls bridge.afterPrompt with detected context', async () => {
    const architect = makeMockArchitect();
    const bridge = { afterPrompt: vi.fn() };
    const stage = new ArchitectStage(architect as any, bridge as any);

    await stage.enrich(makeCtx(), 'prompt');
    expect(bridge.afterPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'security_review' }),
      'stable',
      false,
      'c1',
    );
  });

  it('appends context modifier to prompt', async () => {
    const architect = makeMockArchitect();
    const stage = new ArchitectStage(architect as any);

    const result = await stage.enrich(makeCtx(), 'base prompt');
    expect(result.prompt).toContain('[Security Review Mode]');
    expect(result.prompt).toStartWith('base prompt');
  });

  it('builds consciousness section with decisions and feedback', async () => {
    const architect = makeMockArchitect();
    architect.generatePrompt.mockReturnValue({
      contextModifier: '[mod]',
      detectedContext: { domain: 'general' },
      activeTraits: [],
      emotionalTrajectory: 'stable',
      escalationAlert: false,
      relevantDecisions: [{ summary: 'Switch to React', status: 'open' }],
      feedbackInsight: {
        weakDomains: ['creative_work'],
        trend: 'declining',
        suggestedAdjustments: { warmth: 0.2 },
      },
    });
    const selfModelGetter = vi.fn().mockResolvedValue({ selfNarrative: 'I am balanced.' });
    const userModelGetter = vi.fn().mockReturnValue({ narrative: 'User prefers brevity.' });

    const stage = new ArchitectStage(architect as any, undefined, undefined, selfModelGetter, userModelGetter);
    const result = await stage.enrich(makeCtx(), 'prompt');

    expect(result.prompt).toContain('[Consciousness]');
    expect(result.prompt).toContain('Switch to React');
    expect(result.prompt).toContain('creative_work');
    expect(result.prompt).toContain('I am balanced.');
    expect(result.prompt).toContain('User prefers brevity.');
  });

  it('is enabled for the-architect personality', () => {
    const stage = new ArchitectStage({} as any);
    expect(stage.enabled(makeCtx())).toBe(true);
  });

  it('is disabled for non-architect personality', () => {
    const stage = new ArchitectStage({} as any);
    expect(stage.enabled(makeCtx({ config: { agent: { personality: 'standard' } } as any }))).toBe(false);
  });

  it('has order 300', () => {
    const stage = new ArchitectStage({} as any);
    expect(stage.order).toBe(300);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/runtime/src/enrichment/__tests__/architect-stage.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/runtime/src/enrichment/stages/architect-stage.ts
import type { TheArchitect, ArchitectBridge, ArchitectAwarenessCollector, PromptOutput, UserModel } from '@auxiora/personality';
import type { SelfModelSnapshot } from '@auxiora/consciousness';
import type { EnrichmentContext, EnrichmentStage, StageResult } from '../types.js';

export class ArchitectStage implements EnrichmentStage {
  readonly name = 'architect';
  readonly order = 300;

  constructor(
    private readonly architect: TheArchitect,
    private readonly bridge?: ArchitectBridge,
    private readonly awarenessCollector?: ArchitectAwarenessCollector,
    private readonly selfModelGetter?: () => Promise<SelfModelSnapshot | null>,
    private readonly userModelGetter?: () => UserModel | null,
  ) {}

  enabled(ctx: EnrichmentContext): boolean {
    return ctx.config.agent?.personality === 'the-architect';
  }

  async enrich(ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    // GAP 1: Pass conversation history
    const output = this.architect.generatePrompt(ctx.userMessage, ctx.history as Array<{ role: string; content: string }>);

    // GAP 2: Wire tool usage tracking from previous turn
    if (this.awarenessCollector && ctx.toolsUsed.length > 0) {
      this.awarenessCollector.updateToolContext(ctx.toolsUsed as Array<{ name: string; success: boolean }>);
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

    // Consciousness section
    const consciousnessSection = await this.buildConsciousnessSection(output);

    const prompt = currentPrompt + '\n\n'
      + output.contextModifier
      + channelHint
      + consciousnessSection;

    // GAP 4: Full metadata for client
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
        .map((d: any) => `- ${d.summary} [${d.status}]`).join('\n');
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

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/runtime/src/enrichment/__tests__/architect-stage.test.ts`
Expected: PASS (12 tests)

**Step 5: Commit**

```bash
git add packages/runtime/src/enrichment/stages/architect-stage.ts packages/runtime/src/enrichment/__tests__/architect-stage.test.ts
git commit -m "feat(runtime): add ArchitectStage with history, tool tracking, channel awareness"
```

---

### Task 6: SelfAwarenessStage

**Files:**
- Create: `packages/runtime/src/enrichment/stages/self-awareness-stage.ts`
- Test: `packages/runtime/src/enrichment/__tests__/self-awareness-stage.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/runtime/src/enrichment/__tests__/self-awareness-stage.test.ts
import { describe, it, expect, vi } from 'vitest';
import { SelfAwarenessStage } from '../stages/self-awareness-stage.js';
import type { EnrichmentContext } from '../types.js';

function makeCtx(overrides: Partial<EnrichmentContext> = {}): EnrichmentContext {
  return {
    basePrompt: 'base',
    userMessage: 'hello',
    history: [{ role: 'user', content: 'hi' }],
    channelType: 'webchat',
    chatId: 'c1',
    sessionId: 's1',
    userId: 'u1',
    toolsUsed: [],
    config: {} as any,
    ...overrides,
  };
}

describe('SelfAwarenessStage', () => {
  it('appends awareness fragment to prompt', async () => {
    const assembler = {
      assemble: vi.fn().mockResolvedValue('I am aware of my capacity limits.'),
    };
    const stage = new SelfAwarenessStage(assembler as any);
    const result = await stage.enrich(makeCtx(), 'current prompt');

    expect(result.prompt).toContain('[Dynamic Self-Awareness]');
    expect(result.prompt).toContain('I am aware of my capacity limits.');
    expect(assembler.assemble).toHaveBeenCalledWith({
      userId: 'u1',
      sessionId: 's1',
      chatId: 'c1',
      currentMessage: 'hello',
      recentMessages: [{ role: 'user', content: 'hi' }],
    });
  });

  it('returns unchanged prompt when assembler returns null', async () => {
    const assembler = { assemble: vi.fn().mockResolvedValue(null) };
    const stage = new SelfAwarenessStage(assembler as any);
    const result = await stage.enrich(makeCtx(), 'current prompt');
    expect(result.prompt).toBe('current prompt');
  });

  it('returns unchanged prompt when assembler returns empty string', async () => {
    const assembler = { assemble: vi.fn().mockResolvedValue('') };
    const stage = new SelfAwarenessStage(assembler as any);
    const result = await stage.enrich(makeCtx(), 'current prompt');
    expect(result.prompt).toBe('current prompt');
  });

  it('is always enabled', () => {
    const stage = new SelfAwarenessStage({} as any);
    expect(stage.enabled(makeCtx())).toBe(true);
  });

  it('has order 400', () => {
    const stage = new SelfAwarenessStage({} as any);
    expect(stage.order).toBe(400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/runtime/src/enrichment/__tests__/self-awareness-stage.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/runtime/src/enrichment/stages/self-awareness-stage.ts
import type { SelfAwarenessAssembler } from '@auxiora/self-awareness';
import type { EnrichmentContext, EnrichmentStage, StageResult } from '../types.js';

export class SelfAwarenessStage implements EnrichmentStage {
  readonly name = 'self-awareness';
  readonly order = 400;

  constructor(private readonly assembler: SelfAwarenessAssembler) {}

  enabled(_ctx: EnrichmentContext): boolean {
    return true;
  }

  async enrich(ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    const fragment = await this.assembler.assemble({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      chatId: ctx.chatId,
      currentMessage: ctx.userMessage,
      recentMessages: ctx.history as Array<{ role: string; content: string }>,
    });

    if (!fragment) return { prompt: currentPrompt };
    return { prompt: currentPrompt + '\n\n[Dynamic Self-Awareness]\n' + fragment };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/runtime/src/enrichment/__tests__/self-awareness-stage.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add packages/runtime/src/enrichment/stages/self-awareness-stage.ts packages/runtime/src/enrichment/__tests__/self-awareness-stage.test.ts
git commit -m "feat(runtime): add SelfAwarenessStage for enrichment pipeline"
```

---

### Task 7: ModelIdentityStage

**Files:**
- Create: `packages/runtime/src/enrichment/stages/model-identity-stage.ts`
- Test: `packages/runtime/src/enrichment/__tests__/model-identity-stage.test.ts`

**Context:** This stage needs the active `Provider` object and optional model override. These are determined by model routing, which happens AFTER enrichment in the current code. To keep stages pure, we pass a `getProvider` callback that resolves the provider lazily.

**Step 1: Write the failing test**

```typescript
// packages/runtime/src/enrichment/__tests__/model-identity-stage.test.ts
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
    config: {} as any,
    ...overrides,
  };
}

function makeProvider(model = 'claude-3-opus', displayName = 'Anthropic', maxContext = 200000, vision = true) {
  return {
    defaultModel: model,
    metadata: {
      displayName,
      models: {
        [model]: {
          maxContextTokens: maxContext,
          supportsVision: vision,
        },
      },
    },
  };
}

describe('ModelIdentityStage', () => {
  it('appends model identity fragment', async () => {
    const provider = makeProvider();
    const stage = new ModelIdentityStage(() => ({ provider: provider as any }));
    const result = await stage.enrich(makeCtx(), 'prompt');

    expect(result.prompt).toContain('[Model Identity]');
    expect(result.prompt).toContain('claude-3-opus');
    expect(result.prompt).toContain('Anthropic');
    expect(result.prompt).toContain('200,000 tokens');
    expect(result.prompt).toContain('vision capabilities');
  });

  it('uses model override when provided', async () => {
    const provider = makeProvider();
    const stage = new ModelIdentityStage(() => ({ provider: provider as any, model: 'gpt-4o' }));
    const result = await stage.enrich(makeCtx(), 'prompt');
    expect(result.prompt).toContain('gpt-4o');
  });

  it('omits vision line when not supported', async () => {
    const provider = makeProvider('claude-haiku', 'Anthropic', 100000, false);
    const stage = new ModelIdentityStage(() => ({ provider: provider as any }));
    const result = await stage.enrich(makeCtx(), 'prompt');
    expect(result.prompt).not.toContain('vision');
  });

  it('is always enabled', () => {
    const stage = new ModelIdentityStage(() => ({} as any));
    expect(stage.enabled(makeCtx())).toBe(true);
  });

  it('has order 500', () => {
    const stage = new ModelIdentityStage(() => ({} as any));
    expect(stage.order).toBe(500);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/runtime/src/enrichment/__tests__/model-identity-stage.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/runtime/src/enrichment/stages/model-identity-stage.ts
import type { EnrichmentContext, EnrichmentStage, StageResult } from '../types.js';

interface ProviderInfo {
  provider: {
    defaultModel: string;
    metadata: {
      displayName: string;
      models: Record<string, { maxContextTokens: number; supportsVision?: boolean }>;
    };
  };
  model?: string;
}

export class ModelIdentityStage implements EnrichmentStage {
  readonly name = 'model-identity';
  readonly order = 500;

  constructor(private readonly getProviderInfo: () => ProviderInfo) {}

  enabled(_ctx: EnrichmentContext): boolean {
    return true;
  }

  async enrich(_ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    const { provider, model } = this.getProviderInfo();
    const activeModel = model ?? provider.defaultModel;
    const caps = provider.metadata.models[activeModel];

    const fragment = '\n\n[Model Identity]\n'
      + `You are running as ${activeModel} via ${provider.metadata.displayName}.`
      + (caps ? ` Context window: ${caps.maxContextTokens.toLocaleString()} tokens.` : '')
      + (caps?.supportsVision ? ' You have vision capabilities.' : '')
      + ` Today's date: ${new Date().toISOString().slice(0, 10)}.`;

    return { prompt: currentPrompt + fragment };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/runtime/src/enrichment/__tests__/model-identity-stage.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add packages/runtime/src/enrichment/stages/model-identity-stage.ts packages/runtime/src/enrichment/__tests__/model-identity-stage.test.ts
git commit -m "feat(runtime): add ModelIdentityStage for enrichment pipeline"
```

---

### Task 8: Barrel Export

**Files:**
- Create: `packages/runtime/src/enrichment/index.ts`

**Step 1: Write barrel export**

```typescript
// packages/runtime/src/enrichment/index.ts
export type { EnrichmentContext, EnrichmentStage, StageResult, EnrichmentResult, ArchitectMeta } from './types.js';
export { EnrichmentPipeline } from './pipeline.js';
export { MemoryStage } from './stages/memory-stage.js';
export { ModeStage } from './stages/mode-stage.js';
export { ArchitectStage } from './stages/architect-stage.js';
export { SelfAwarenessStage } from './stages/self-awareness-stage.js';
export { ModelIdentityStage } from './stages/model-identity-stage.js';
```

**Step 2: Verify all tests still pass**

Run: `pnpm vitest run packages/runtime/src/enrichment/`
Expected: PASS (all tests from Tasks 1-7)

**Step 3: Commit**

```bash
git add packages/runtime/src/enrichment/index.ts
git commit -m "feat(runtime): add enrichment pipeline barrel export"
```

---

### Task 9: Wire Pipeline into Auxiora Class

**Files:**
- Modify: `packages/runtime/src/index.ts`
- Test: `packages/runtime/src/enrichment/__tests__/integration.test.ts`

This is the critical wiring task. Changes to `packages/runtime/src/index.ts`:

**Step 1: Add import and field**

At the top of `index.ts`, add import:
```typescript
import { EnrichmentPipeline, MemoryStage, ModeStage, ArchitectStage, SelfAwarenessStage, ModelIdentityStage } from './enrichment/index.js';
import type { EnrichmentContext } from './enrichment/index.js';
```

Add field to `Auxiora` class (near line ~268):
```typescript
private enrichmentPipeline?: EnrichmentPipeline;
private lastToolsUsed = new Map<string, Array<{ name: string; success: boolean }>>();
```

**Step 2: Build pipeline during `initialize()`**

After all subsystems are initialized (personality, modes, security, self-awareness), create the pipeline. Add a new method:

```typescript
private buildEnrichmentPipeline(): void {
  this.enrichmentPipeline = new EnrichmentPipeline();

  // Stage 1: Memory (order 100)
  if (this.memoryStore && this.memoryRetriever) {
    this.enrichmentPipeline.addStage(new MemoryStage(this.memoryStore, this.memoryRetriever));
  }

  // Stage 2: Mode detection + security (order 200)
  if (this.modeDetector && this.promptAssembler) {
    this.enrichmentPipeline.addStage(new ModeStage(
      this.modeDetector,
      this.promptAssembler,
      this.securityFloor,
      this.userPreferences,
      (sessionId: string) => this.getSessionModeState(sessionId),
    ));
  }

  // Stage 3: Architect (order 300)
  if (this.architect) {
    this.enrichmentPipeline.addStage(new ArchitectStage(
      this.architect,
      this.architectBridge ?? undefined,
      this.architectAwarenessCollector ?? undefined,
      () => this.getCachedSelfModel(),
      () => this.getCachedUserModel(),
    ));
  }

  // Stage 4: Self-awareness (order 400)
  if (this.selfAwarenessAssembler) {
    this.enrichmentPipeline.addStage(new SelfAwarenessStage(this.selfAwarenessAssembler));
  }

  // Stage 5: Model identity (order 500) — provider resolved lazily per-message
  // This stage is added per-message since provider depends on routing.
  // See handleMessage() where we add it dynamically.
}
```

Call `this.buildEnrichmentPipeline()` at the end of `initialize()`.

**Step 3: Replace webchat enrichment in `handleMessage()`**

Replace lines ~2806-2866 (the ad-hoc enrichment block) with:

```typescript
// Reset Architect conversation state for new chats
const useArchitect = chatPersonality
  ? chatPersonality === 'the-architect'
  : this.config.agent.personality === 'the-architect';
if (useArchitect && this.architect && chatId && !this.architectResetChats.has(chatId)) {
  this.architectResetChats.add(chatId);
  this.architect.resetConversation();
  audit('personality.reset', { sessionId: session.id, chatId });
}

let enrichedPrompt = basePrompt;
let architectResult: { prompt: string; architectMeta?: any } = { prompt: basePrompt };

if (this.enrichmentPipeline) {
  const enrichCtx: EnrichmentContext = {
    basePrompt,
    userMessage: processedContent,
    history: contextMessages,
    channelType: 'webchat',
    chatId: chatId ?? session.id,
    sessionId: session.id,
    userId: client.senderId ?? 'anonymous',
    toolsUsed: this.lastToolsUsed.get(session.id) ?? [],
    config: this.config,
  };
  const result = await this.enrichmentPipeline.run(enrichCtx);
  enrichedPrompt = result.prompt;
  architectResult = { prompt: enrichedPrompt, architectMeta: result.metadata.architect };
} else {
  // Fallback: no pipeline (should not happen in production)
  enrichedPrompt = basePrompt;
}
```

Keep the model routing and ModelIdentity injection inline (after routing determines the provider):
```typescript
enrichedPrompt += this.buildModelIdentityFragment(provider, routingResult?.selection.model ?? modelOverride);
```

**Step 4: Store tool usage after executeWithTools**

After line ~2926 (`this.architectAwarenessCollector.updateToolContext(toolsUsed)`), add:
```typescript
this.lastToolsUsed.set(session.id, toolsUsed);
```

**Step 5: Replace channel handler enrichment**

Replace lines ~3776-3818 in `handleChannelMessage()` with the same pipeline pattern:

```typescript
const channelChatId = `${inbound.channelType}:${inbound.channelId}`;
const useChannelArchitect = this.config.agent.personality === 'the-architect';
if (useChannelArchitect && this.architect && !this.architectResetChats.has(channelChatId)) {
  this.architectResetChats.add(channelChatId);
  this.architect.resetConversation();
  audit('personality.reset', { sessionId: session.id, chatId: channelChatId });
}

let enrichedPrompt = this.systemPrompt;
let channelArchitectResult: { prompt: string; architectMeta?: any } = { prompt: this.systemPrompt };

if (this.enrichmentPipeline) {
  const enrichCtx: EnrichmentContext = {
    basePrompt: this.systemPrompt,
    userMessage: messageContent,
    history: contextMessages,
    channelType: inbound.channelType,
    chatId: channelChatId,
    sessionId: session.id,
    userId: inbound.senderId ?? 'anonymous',
    toolsUsed: this.lastToolsUsed.get(session.id) ?? [],
    config: this.config,
  };
  const result = await this.enrichmentPipeline.run(enrichCtx);
  enrichedPrompt = result.prompt;
  channelArchitectResult = { prompt: enrichedPrompt, architectMeta: result.metadata.architect };
} else {
  enrichedPrompt = this.systemPrompt;
}
```

Store tool usage after channel executeWithTools too:
```typescript
this.lastToolsUsed.set(session.id, channelToolsUsed);
```

**Step 6: Write integration test**

```typescript
// packages/runtime/src/enrichment/__tests__/integration.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EnrichmentPipeline } from '../pipeline.js';
import { MemoryStage } from '../stages/memory-stage.js';
import { ArchitectStage } from '../stages/architect-stage.js';
import { SelfAwarenessStage } from '../stages/self-awareness-stage.js';
import type { EnrichmentContext } from '../types.js';

function makeCtx(overrides: Partial<EnrichmentContext> = {}): EnrichmentContext {
  return {
    basePrompt: 'You are Auxiora.',
    userMessage: 'How do I fix this security vulnerability?',
    history: [
      { role: 'user', content: 'I have a Node.js app with SQL injection' },
      { role: 'assistant', content: 'Let me help you fix that.' },
    ],
    channelType: 'discord',
    chatId: 'discord:general',
    sessionId: 'sess-42',
    userId: 'user-7',
    toolsUsed: [{ name: 'web_search', success: true }],
    config: { agent: { personality: 'the-architect' }, modes: { enabled: false } } as any,
    ...overrides,
  };
}

describe('EnrichmentPipeline integration', () => {
  it('runs full pipeline with memory + architect + self-awareness', async () => {
    const pipeline = new EnrichmentPipeline();

    // Memory stage
    const memStore = { getAll: vi.fn().mockResolvedValue([{ text: 'user prefers TypeScript' }]) };
    const memRetriever = { retrieve: vi.fn().mockReturnValue('\n\n[Memories]\n- user prefers TypeScript') };
    pipeline.addStage(new MemoryStage(memStore as any, memRetriever as any));

    // Architect stage
    const architect = {
      generatePrompt: vi.fn().mockReturnValue({
        contextModifier: '[Security Expert Mode]',
        detectedContext: { domain: 'security_review' },
        activeTraits: [{ trait: 'munger', source: 'base' }],
        emotionalTrajectory: 'stable',
        escalationAlert: false,
        relevantDecisions: [],
        feedbackInsight: { weakDomains: [], trend: 'stable', suggestedAdjustments: {} },
      }),
      getTraitMix: vi.fn().mockReturnValue({ mungerThinking: 0.9 }),
    };
    const collector = { updateToolContext: vi.fn() };
    pipeline.addStage(new ArchitectStage(architect as any, undefined, collector as any));

    // Self-awareness stage
    const awarenessAssembler = {
      assemble: vi.fn().mockResolvedValue('Capacity at 60%. No knowledge gaps detected.'),
    };
    pipeline.addStage(new SelfAwarenessStage(awarenessAssembler as any));

    const result = await pipeline.run(makeCtx());

    // Verify pipeline ordering
    expect(result.metadata.stages).toEqual(['memory', 'architect', 'self-awareness']);

    // Verify history was passed (GAP 1)
    expect(architect.generatePrompt).toHaveBeenCalledWith(
      'How do I fix this security vulnerability?',
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'I have a Node.js app with SQL injection' }),
      ]),
    );

    // Verify tool tracking (GAP 2)
    expect(collector.updateToolContext).toHaveBeenCalledWith([{ name: 'web_search', success: true }]);

    // Verify channel hint (GAP 3)
    expect(result.prompt).toContain('[Channel: discord]');

    // Verify metadata (GAP 4)
    expect(result.metadata.architect).toBeDefined();
    expect((result.metadata.architect as any).detectedContext.domain).toBe('security_review');
    expect((result.metadata.architect as any).channelType).toBe('discord');

    // Verify all sections present
    expect(result.prompt).toContain('You are Auxiora.');
    expect(result.prompt).toContain('[Memories]');
    expect(result.prompt).toContain('[Security Expert Mode]');
    expect(result.prompt).toContain('[Dynamic Self-Awareness]');
  });

  it('skips architect stage for non-architect personality', async () => {
    const pipeline = new EnrichmentPipeline();
    const architect = { generatePrompt: vi.fn(), getTraitMix: vi.fn() };
    pipeline.addStage(new ArchitectStage(architect as any));

    const result = await pipeline.run(makeCtx({
      config: { agent: { personality: 'standard' }, modes: { enabled: false } } as any,
    }));

    expect(result.metadata.stages).toEqual([]);
    expect(architect.generatePrompt).not.toHaveBeenCalled();
  });
});
```

**Step 7: Run all enrichment tests**

Run: `pnpm vitest run packages/runtime/src/enrichment/`
Expected: PASS (all tests)

**Step 8: Commit**

```bash
git add packages/runtime/src/enrichment/__tests__/integration.test.ts packages/runtime/src/index.ts
git commit -m "feat(runtime): wire enrichment pipeline into handleMessage and handleChannelMessage"
```

---

### Task 10: Clean Up Old Methods

**Files:**
- Modify: `packages/runtime/src/index.ts`

After the pipeline is wired, the following private methods on the `Auxiora` class are no longer called from `handleMessage` or `handleChannelMessage` and can be removed:

- `applyArchitectEnrichment()` — replaced by ArchitectStage
- `buildModeEnrichedPrompt()` — replaced by ModeStage

**Important:** Keep `buildModelIdentityFragment()` since it's still called inline after routing.

**Step 1: Remove `applyArchitectEnrichment()` (lines ~2448-2522)**

Delete the entire method.

**Step 2: Remove `buildModeEnrichedPrompt()` (lines ~2560-2572)**

Delete the entire method.

**Step 3: Verify no remaining references**

Run: `grep -n 'applyArchitectEnrichment\|buildModeEnrichedPrompt' packages/runtime/src/index.ts`
Expected: No matches

**Step 4: Run all tests**

Run: `pnpm vitest run packages/runtime/`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "refactor(runtime): remove replaced enrichment methods"
```

---

### Task 11: Final Verification

**Step 1: Type check**

Run: `pnpm -r --filter @auxiora/runtime build`
Expected: BUILD SUCCESS

**Step 2: Run full test suite for affected packages**

Run: `pnpm vitest run packages/runtime/ packages/personality/`
Expected: PASS

**Step 3: Final commit (if any remaining changes)**

```bash
git add -A
git commit -m "chore(runtime): enrichment pipeline cleanup"
```

---

## Summary

| Task | Files | Tests | Purpose |
|------|-------|-------|---------|
| 1 | types.ts | 3 | Core interfaces |
| 2 | pipeline.ts | 5 | Pipeline orchestrator |
| 3 | memory-stage.ts | 4 | Memory retrieval stage |
| 4 | mode-stage.ts | 6 | Mode detection + security floor |
| 5 | architect-stage.ts | 12 | **4 gap fixes**: history, tools, channel, metadata |
| 6 | self-awareness-stage.ts | 5 | Self-awareness injection |
| 7 | model-identity-stage.ts | 5 | Model metadata injection |
| 8 | index.ts (barrel) | 0 | Re-exports |
| 9 | index.ts (runtime) + integration.test | 2 | Wire pipeline into runtime |
| 10 | index.ts (cleanup) | 0 | Remove replaced methods |
| 11 | (verification) | 0 | Type check + full test run |

**Total: ~42 new tests across 8 test files**
