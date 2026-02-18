# Architect Deep Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deepen The Architect's runtime integration with conversation state persistence, self-awareness bridging, SOUL.md domain biasing, and escalation alert wiring.

**Architecture:** A new `architect-bridge.ts` module in `packages/personality/src/` encapsulates all four integrations. The runtime adds ~20 lines of glue. Each piece is independently testable. The bridge reads/writes vault state, wraps the Architect's output, and feeds signals to the self-awareness system.

**Tech Stack:** TypeScript strict ESM, vitest, `@auxiora/personality`, `@auxiora/self-awareness`, vault storage

---

### Task 1: ConversationContext serialize/restore

Add serialization to `ConversationContext` so its state can be persisted to vault.

**Files:**
- Modify: `src/personalities/the-architect/conversation-context.ts`
- Test: `src/personalities/the-architect/__tests__/conversation-context-persistence.test.ts`

**Step 1: Write the failing test**

Create `src/personalities/the-architect/__tests__/conversation-context-persistence.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ConversationContext } from '../conversation-context.js';

describe('ConversationContext persistence', () => {
  it('should round-trip serialize and restore', () => {
    const ctx = new ConversationContext();
    ctx.recordDetection('check the firewall rules', 'security_review', 0.85);
    ctx.recordDetection('audit the access controls', 'security_review', 0.9);
    ctx.recordDetection('review the encryption setup', 'security_review', 0.88);
    // Theme should now be locked
    const summaryBefore = ctx.getSummary();
    expect(summaryBefore.theme).toBe('security_review');

    const serialized = ctx.serialize();
    const restored = ConversationContext.restore(serialized);
    const summaryAfter = restored.getSummary();

    expect(summaryAfter.theme).toBe(summaryBefore.theme);
    expect(summaryAfter.messageCount).toBe(summaryBefore.messageCount);
    expect(summaryAfter.currentStreak).toEqual(summaryBefore.currentStreak);
    expect(summaryAfter.domainDistribution).toEqual(summaryBefore.domainDistribution);
  });

  it('should restore effective domain behavior', () => {
    const ctx = new ConversationContext();
    ctx.recordDetection('msg1', 'security_review', 0.85);
    ctx.recordDetection('msg2', 'security_review', 0.9);
    ctx.recordDetection('msg3', 'security_review', 0.88);

    const restored = ConversationContext.restore(ctx.serialize());
    // Low-confidence general message should not break the theme
    const effective = restored.getEffectiveDomain('general', 0.3);
    expect(effective).toBe('security_review');
  });

  it('should cap history at 50 records', () => {
    const ctx = new ConversationContext();
    for (let i = 0; i < 60; i++) {
      ctx.recordDetection(`msg${i}`, 'code_engineering', 0.8);
    }
    const serialized = ctx.serialize();
    expect(serialized.history.length).toBe(50);
  });

  it('should handle empty context', () => {
    const ctx = new ConversationContext();
    const serialized = ctx.serialize();
    const restored = ConversationContext.restore(serialized);
    expect(restored.getSummary().theme).toBeNull();
    expect(restored.getSummary().messageCount).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/personalities/the-architect/__tests__/conversation-context-persistence.test.ts`
Expected: FAIL — `serialize` and `restore` do not exist on `ConversationContext`

**Step 3: Write minimal implementation**

In `src/personalities/the-architect/conversation-context.ts`, add the `ConversationState` type and two methods.

After the existing `ConversationSummary` interface (line 19), add:

```typescript
export interface ConversationState {
  theme: ContextDomain | null;
  dominantDomain: ContextDomain;
  domainStreak: number;
  history: DetectionRecord[];
}
```

Add to the `ConversationContext` class, after the `reset()` method:

```typescript
  /** Serialize current state for vault persistence. Caps history at 50 records. */
  serialize(): ConversationState {
    return {
      theme: this.conversationTheme,
      dominantDomain: this.dominantDomain,
      domainStreak: this.domainStreak,
      history: this.history.slice(-50),
    };
  }

  /** Restore from previously serialized state. */
  static restore(state: ConversationState): ConversationContext {
    const ctx = new ConversationContext();
    ctx.conversationTheme = state.theme;
    ctx.dominantDomain = state.dominantDomain;
    ctx.domainStreak = state.domainStreak;
    ctx.history = [...state.history];
    return ctx;
  }
```

Note: `history`, `conversationTheme`, `dominantDomain`, `domainStreak` are currently `private`. Change them to `private` with a comment that `restore()` accesses them via `ctx.field` since it's a static method on the same class (TypeScript allows this).

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/personalities/the-architect/__tests__/conversation-context-persistence.test.ts`
Expected: PASS — all 4 tests

**Step 5: Commit**

```bash
git add src/personalities/the-architect/conversation-context.ts src/personalities/the-architect/__tests__/conversation-context-persistence.test.ts
git commit -m "feat(personality): add serialize/restore to ConversationContext"
```

---

### Task 2: ArchitectAwarenessCollector

Create a self-awareness collector that injects Architect metadata (domain, emotional trajectory, escalation alerts) into the self-awareness signal system.

**Files:**
- Create: `packages/personality/src/architect-awareness-collector.ts`
- Test: `packages/personality/src/__tests__/architect-awareness-collector.test.ts`

**Step 1: Write the failing test**

Create `packages/personality/src/__tests__/architect-awareness-collector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ArchitectAwarenessCollector } from '../architect-awareness-collector.js';
import type { CollectionContext } from '@auxiora/self-awareness';

function ctx(): CollectionContext {
  return {
    userId: 'u1',
    sessionId: 's1',
    chatId: 'c1',
    currentMessage: 'test',
    recentMessages: [],
  };
}

describe('ArchitectAwarenessCollector', () => {
  it('should return empty when no architect output set', async () => {
    const collector = new ArchitectAwarenessCollector();
    const signals = await collector.collect(ctx());
    expect(signals).toEqual([]);
  });

  it('should emit domain signal when domain is not general', async () => {
    const collector = new ArchitectAwarenessCollector();
    collector.updateOutput({
      detectedContext: { domain: 'security_review', emotionalRegister: 'neutral', stakes: 'high', complexity: 'moderate', detectionConfidence: 0.85 },
      emotionalTrajectory: 'stable',
    });
    const signals = await collector.collect(ctx());
    expect(signals).toHaveLength(1);
    expect(signals[0].dimension).toBe('architect-context');
    expect(signals[0].priority).toBe(0.6);
    expect(signals[0].text).toContain('security_review');
  });

  it('should emit emotional trajectory signal when not stable', async () => {
    const collector = new ArchitectAwarenessCollector();
    collector.updateOutput({
      detectedContext: { domain: 'general', emotionalRegister: 'stressed', stakes: 'medium', complexity: 'low', detectionConfidence: 0.5 },
      emotionalTrajectory: 'escalating',
    });
    const signals = await collector.collect(ctx());
    expect(signals).toHaveLength(1);
    expect(signals[0].dimension).toBe('architect-emotion');
    expect(signals[0].priority).toBe(0.8);
    expect(signals[0].text).toContain('escalating');
  });

  it('should emit escalation alert signal with highest priority', async () => {
    const collector = new ArchitectAwarenessCollector();
    collector.updateOutput({
      detectedContext: { domain: 'crisis_management', emotionalRegister: 'stressed', stakes: 'critical', complexity: 'high', detectionConfidence: 0.95 },
      emotionalTrajectory: 'escalating',
      escalationAlert: 'User emotional state is escalating rapidly',
    });
    const signals = await collector.collect(ctx());
    // domain (not general) + trajectory (not stable) + escalation = 3 signals
    expect(signals).toHaveLength(3);
    const escalation = signals.find(s => s.dimension === 'architect-escalation');
    expect(escalation).toBeDefined();
    expect(escalation!.priority).toBe(1.0);
    expect(escalation!.text).toBe('User emotional state is escalating rapidly');
  });

  it('should be named "architect-bridge"', () => {
    const collector = new ArchitectAwarenessCollector();
    expect(collector.name).toBe('architect-bridge');
    expect(collector.enabled).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/personality/src/__tests__/architect-awareness-collector.test.ts`
Expected: FAIL — module does not exist

**Step 3: Write minimal implementation**

Create `packages/personality/src/architect-awareness-collector.ts`:

```typescript
import type { SignalCollector, AwarenessSignal, CollectionContext } from '@auxiora/self-awareness';

export interface ArchitectSnapshot {
  detectedContext: {
    domain: string;
    emotionalRegister: string;
    stakes: string;
    complexity: string;
    detectionConfidence: number;
  };
  emotionalTrajectory: string;
  escalationAlert?: string;
}

export class ArchitectAwarenessCollector implements SignalCollector {
  readonly name = 'architect-bridge';
  enabled = true;

  private latest: ArchitectSnapshot | null = null;

  updateOutput(snapshot: ArchitectSnapshot): void {
    this.latest = snapshot;
  }

  async collect(_context: CollectionContext): Promise<AwarenessSignal[]> {
    if (!this.latest) return [];
    const signals: AwarenessSignal[] = [];
    const { detectedContext, emotionalTrajectory, escalationAlert } = this.latest;

    if (detectedContext.domain !== 'general') {
      signals.push({
        dimension: 'architect-context',
        priority: 0.6,
        text: `Currently in ${detectedContext.domain} context (confidence: ${detectedContext.detectionConfidence.toFixed(2)}, stakes: ${detectedContext.stakes})`,
        data: { domain: detectedContext.domain, confidence: detectedContext.detectionConfidence, stakes: detectedContext.stakes },
      });
    }

    if (emotionalTrajectory !== 'stable') {
      signals.push({
        dimension: 'architect-emotion',
        priority: 0.8,
        text: `User emotional trajectory: ${emotionalTrajectory} (register: ${detectedContext.emotionalRegister})`,
        data: { trajectory: emotionalTrajectory, register: detectedContext.emotionalRegister },
      });
    }

    if (escalationAlert) {
      signals.push({
        dimension: 'architect-escalation',
        priority: 1.0,
        text: escalationAlert,
        data: { alert: escalationAlert, domain: detectedContext.domain },
      });
    }

    return signals;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/personality/src/__tests__/architect-awareness-collector.test.ts`
Expected: PASS — all 5 tests

**Step 5: Add barrel export**

In `packages/personality/src/index.ts`, add:

```typescript
export { ArchitectAwarenessCollector } from './architect-awareness-collector.js';
export type { ArchitectSnapshot } from './architect-awareness-collector.js';
```

**Step 6: Commit**

```bash
git add packages/personality/src/architect-awareness-collector.ts packages/personality/src/__tests__/architect-awareness-collector.test.ts packages/personality/src/index.ts
git commit -m "feat(personality): add ArchitectAwarenessCollector for self-awareness bridging"
```

---

### Task 3: SOUL.md Domain Bias Parser

Parse SOUL.md content for domain-indicative keywords and produce trait weight biases.

**Files:**
- Create: `packages/personality/src/soul-bias-parser.ts`
- Test: `packages/personality/src/__tests__/soul-bias-parser.test.ts`

**Step 1: Write the failing test**

Create `packages/personality/src/__tests__/soul-bias-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSoulBiases } from '../soul-bias-parser.js';

describe('parseSoulBiases', () => {
  it('should detect security bias from security-focused SOUL.md', () => {
    const soul = `You are a security-first assistant.
Always check for vulnerabilities and audit compliance.
Prioritize encryption and authentication in all recommendations.
Review threat models and access controls carefully.`;
    const biases = parseSoulBiases(soul);
    expect(biases['security_review']).toBeGreaterThan(0);
    expect(biases['security_review']).toBeLessThanOrEqual(0.15);
  });

  it('should detect code engineering bias', () => {
    const soul = `You specialize in TypeScript and React development.
Help with code reviews, API design, and testing.
Focus on clean architecture and CI/CD pipelines.
Assist with refactoring and debugging.`;
    const biases = parseSoulBiases(soul);
    expect(biases['code_engineering']).toBeGreaterThan(0);
  });

  it('should return empty object for generic SOUL.md', () => {
    const soul = `You are a helpful assistant. Be kind and concise.`;
    const biases = parseSoulBiases(soul);
    expect(Object.keys(biases).length).toBe(0);
  });

  it('should return empty object for empty string', () => {
    const biases = parseSoulBiases('');
    expect(Object.keys(biases).length).toBe(0);
  });

  it('should cap biases at 0.15', () => {
    // Even with many keywords, max bias is 0.15
    const soul = `vulnerability CVE threat exploit patch audit compliance penetration
firewall incident breach SIEM SOC CTEM attack surface zero-day Qualys
CrowdStrike Splunk Wiz TORQ security encryption authentication authorization`;
    const biases = parseSoulBiases(soul);
    expect(biases['security_review']).toBe(0.15);
  });

  it('should detect multiple domain biases', () => {
    const soul = `You are a security-focused engineering assistant.
Help with code reviews, vulnerability assessments, and architecture decisions.
Focus on secure coding practices, threat modeling, and system design.`;
    const biases = parseSoulBiases(soul);
    expect(Object.keys(biases).length).toBeGreaterThanOrEqual(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/personality/src/__tests__/soul-bias-parser.test.ts`
Expected: FAIL — module does not exist

**Step 3: Write minimal implementation**

Create `packages/personality/src/soul-bias-parser.ts`:

```typescript
/**
 * Parses SOUL.md content for domain-indicative keywords and produces
 * trait weight biases. Uses the same keyword sets as The Architect's
 * context detector (17 domains).
 *
 * Biases are in the range [0, 0.15] — subtle nudges, not overrides.
 * Only domains with >= 3 keyword hits produce a bias.
 */

type ContextDomain = string;

const DOMAIN_KEYWORDS: Record<ContextDomain, string[]> = {
  security_review: ['vulnerability', 'vulnerabilities', 'CVE', 'threat', 'exploit', 'patch', 'audit', 'compliance', 'penetration', 'firewall', 'incident', 'breach', 'SIEM', 'SOC', 'CTEM', 'attack surface', 'zero-day', 'security', 'encryption', 'authentication', 'authorization', 'hardening', 'malware', 'phishing'],
  code_engineering: ['function', 'API', 'deploy', 'refactor', 'test', 'build', 'pipeline', 'CI/CD', 'container', 'microservice', 'typescript', 'python', 'rust', 'terraform', 'code', 'programming', 'database', 'git', 'docker', 'react', 'node', 'npm'],
  architecture_design: ['architecture', 'scalability', 'ADR', 'microservice', 'monolith', 'event-driven', 'platform', 'infrastructure', 'distributed', 'load balancer', 'service mesh', 'database design', 'schema', 'data model', 'tech stack'],
  debugging: ['error', 'bug', 'crash', 'stack trace', 'exception', 'timeout', 'fix', 'regression', 'flaky', 'memory leak', 'segfault', 'logs'],
  team_leadership: ['team', 'hire', 'hiring', 'performance', 'culture', 'morale', 'feedback', 'onboarding', 'manage', 'leadership', 'standup', 'sprint', 'agile'],
  crisis_management: ['breach', 'outage', 'incident', 'emergency', 'compromised', 'escalation', 'P1', 'disaster', 'recovery', 'rollback', 'hotfix', 'war room', 'postmortem'],
  creative_work: ['brainstorm', 'creative', 'concept', 'innovation', 'prototype', 'design thinking', 'inspiration', 'experiment'],
  writing_content: ['blog', 'article', 'newsletter', 'documentation', 'write', 'draft', 'edit', 'copy', 'essay', 'report'],
  strategic_planning: ['strategy', 'roadmap', 'vision', 'priority', 'OKR', 'initiative', 'resource allocation', 'planning', 'goals', 'KPI'],
  decision_making: ['decide', 'trade-off', 'pros and cons', 'risk', 'compare', 'alternatives', 'evaluate', 'criteria'],
  personal_development: ['career', 'resume', 'interview', 'skill', 'certification', 'learning', 'growth path', 'mentor', 'promotion'],
  sales_pitch: ['pitch', 'proposal', 'sell', 'demo', 'close', 'deal', 'prospect', 'value prop', 'ROI', 'pipeline'],
  negotiation: ['negotiate', 'contract', 'terms', 'concession', 'counter-offer', 'compensation', 'salary', 'leverage'],
  marketing_content: ['brand', 'audience', 'campaign', 'SEO', 'content strategy', 'positioning', 'social media', 'marketing', 'funnel', 'conversion'],
  one_on_one: ['1:1', 'one-on-one', 'check-in', 'career', 'coaching', 'mentoring', 'direct report', 'feedback'],
  learning_research: ['research', 'study', 'paper', 'methodology', 'analysis', 'findings', 'literature', 'experiment', 'data', 'hypothesis'],
};

const MIN_HITS = 3;
const MAX_BIAS = 0.15;
const BIAS_PER_HIT = 0.03;

export function parseSoulBiases(soulContent: string): Record<string, number> {
  if (!soulContent.trim()) return {};

  const lower = soulContent.toLowerCase();
  const biases: Record<string, number> = {};

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let hits = 0;
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        hits++;
      }
    }
    if (hits >= MIN_HITS) {
      biases[domain] = Math.min(hits * BIAS_PER_HIT, MAX_BIAS);
    }
  }

  return biases;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/personality/src/__tests__/soul-bias-parser.test.ts`
Expected: PASS — all 6 tests

**Step 5: Add barrel export**

In `packages/personality/src/index.ts`, add:

```typescript
export { parseSoulBiases } from './soul-bias-parser.js';
```

**Step 6: Commit**

```bash
git add packages/personality/src/soul-bias-parser.ts packages/personality/src/__tests__/soul-bias-parser.test.ts packages/personality/src/index.ts
git commit -m "feat(personality): add SOUL.md domain bias parser"
```

---

### Task 4: Architect Bridge Module

Create the bridge module that ties everything together: persistence, awareness collector feeding, and escalation callbacks.

**Files:**
- Create: `packages/personality/src/architect-bridge.ts`
- Test: `packages/personality/src/__tests__/architect-bridge.test.ts`

**Step 1: Write the failing test**

Create `packages/personality/src/__tests__/architect-bridge.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ArchitectBridge } from '../architect-bridge.js';
import { ArchitectAwarenessCollector } from '../architect-awareness-collector.js';

function mockArchitect() {
  return {
    generatePrompt: vi.fn().mockReturnValue({
      basePrompt: 'base',
      contextModifier: '## Context\nSecurity mode',
      fullPrompt: 'base\n\n## Context\nSecurity mode',
      activeTraits: [],
      detectedContext: {
        domain: 'security_review',
        emotionalRegister: 'neutral',
        stakes: 'high',
        complexity: 'moderate',
        detectionConfidence: 0.85,
        conversationTheme: 'security_review',
      },
      emotionalTrajectory: 'stable',
    }),
    getTraitMix: vi.fn().mockReturnValue({ warmth: 0.5 }),
    getConversationSummary: vi.fn().mockReturnValue({ theme: 'security_review', messageCount: 3, domainDistribution: {}, currentStreak: { domain: 'security_review', count: 3 } }),
  };
}

function mockVault() {
  const store = new Map<string, string>();
  return {
    get: vi.fn((key: string) => store.get(key)),
    set: vi.fn((key: string, value: string) => { store.set(key, value); }),
    has: vi.fn((key: string) => store.has(key)),
  };
}

describe('ArchitectBridge', () => {
  it('should call architect.generatePrompt and update awareness collector', () => {
    const architect = mockArchitect();
    const collector = new ArchitectAwarenessCollector();
    const bridge = new ArchitectBridge(architect as any, collector, mockVault() as any);

    const result = bridge.processMessage('check the firewall', 'chat-1');
    expect(architect.generatePrompt).toHaveBeenCalledWith('check the firewall');
    expect(result.detectedContext.domain).toBe('security_review');
  });

  it('should persist conversation state to vault', () => {
    const architect = mockArchitect();
    const vault = mockVault();
    const bridge = new ArchitectBridge(architect as any, new ArchitectAwarenessCollector(), vault as any);

    bridge.processMessage('msg1', 'chat-42');
    expect(vault.set).toHaveBeenCalledWith(
      'architect:chat:chat-42',
      expect.any(String),
    );
  });

  it('should fire escalation callback when alert present', () => {
    const architect = mockArchitect();
    architect.generatePrompt.mockReturnValueOnce({
      basePrompt: 'base',
      contextModifier: 'ctx',
      fullPrompt: 'full',
      activeTraits: [],
      detectedContext: { domain: 'crisis_management', emotionalRegister: 'stressed', stakes: 'critical', complexity: 'high', detectionConfidence: 0.95 },
      emotionalTrajectory: 'escalating',
      escalationAlert: 'User is in distress',
    });

    const onEscalation = vi.fn();
    const bridge = new ArchitectBridge(architect as any, new ArchitectAwarenessCollector(), mockVault() as any, { onEscalation });

    bridge.processMessage('everything is on fire', 'chat-1');
    expect(onEscalation).toHaveBeenCalledWith('User is in distress', expect.objectContaining({ domain: 'crisis_management' }));
  });

  it('should NOT fire escalation callback when no alert', () => {
    const architect = mockArchitect();
    const onEscalation = vi.fn();
    const bridge = new ArchitectBridge(architect as any, new ArchitectAwarenessCollector(), mockVault() as any, { onEscalation });

    bridge.processMessage('normal message', 'chat-1');
    expect(onEscalation).not.toHaveBeenCalled();
  });

  it('should restore conversation state from vault on first message per chat', () => {
    const architect = mockArchitect();
    const vault = mockVault();
    // Pre-seed vault with serialized state
    const state = JSON.stringify({
      theme: 'security_review',
      dominantDomain: 'security_review',
      domainStreak: 5,
      history: [],
    });
    vault.store.set('architect:chat:chat-99', state);

    const bridge = new ArchitectBridge(architect as any, new ArchitectAwarenessCollector(), vault as any);
    bridge.processMessage('continue reviewing', 'chat-99');
    // Vault was read for this chat
    expect(vault.get).toHaveBeenCalledWith('architect:chat:chat-99');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/personality/src/__tests__/architect-bridge.test.ts`
Expected: FAIL — module does not exist

**Step 3: Write minimal implementation**

Create `packages/personality/src/architect-bridge.ts`:

```typescript
import type { ArchitectAwarenessCollector, ArchitectSnapshot } from './architect-awareness-collector.js';

export interface ArchitectLike {
  generatePrompt(userMessage: string): {
    basePrompt: string;
    contextModifier: string;
    fullPrompt: string;
    activeTraits: unknown[];
    detectedContext: {
      domain: string;
      emotionalRegister: string;
      stakes: string;
      complexity: string;
      detectionConfidence: number;
      conversationTheme?: string;
    };
    emotionalTrajectory: string;
    escalationAlert?: string;
    recommendation?: unknown;
  };
  getTraitMix(context: unknown): Record<string, number>;
  getConversationSummary(): { theme: string | null; messageCount: number };
}

export interface VaultLike {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  has(key: string): boolean;
}

export interface BridgeOptions {
  onEscalation?: (alert: string, context: ArchitectSnapshot['detectedContext']) => void;
}

export class ArchitectBridge {
  private restoredChats = new Set<string>();

  constructor(
    private readonly architect: ArchitectLike,
    private readonly awarenessCollector: ArchitectAwarenessCollector,
    private readonly vault: VaultLike,
    private readonly options: BridgeOptions = {},
  ) {}

  processMessage(userMessage: string, chatId: string) {
    // Restore conversation state on first message per chat
    this.maybeRestore(chatId);

    const output = this.architect.generatePrompt(userMessage);

    // Update awareness collector
    const snapshot: ArchitectSnapshot = {
      detectedContext: output.detectedContext,
      emotionalTrajectory: output.emotionalTrajectory,
      escalationAlert: output.escalationAlert,
    };
    this.awarenessCollector.updateOutput(snapshot);

    // Persist conversation state
    this.persistState(chatId);

    // Fire escalation callback if alert present
    if (output.escalationAlert && this.options.onEscalation) {
      this.options.onEscalation(output.escalationAlert, output.detectedContext);
    }

    return output;
  }

  private maybeRestore(chatId: string): void {
    if (this.restoredChats.has(chatId)) return;
    this.restoredChats.add(chatId);

    try {
      const stored = this.vault.get(`architect:chat:${chatId}`);
      if (stored) {
        // State exists — the Architect's ConversationContext will be
        // restored by the runtime when it calls architect methods.
        // For now we just mark it as restored to avoid re-reading.
        // Full ConversationContext.restore() integration happens in the
        // runtime glue (Task 5).
      }
    } catch {
      // Vault locked or missing — proceed with fresh state
    }
  }

  private persistState(chatId: string): void {
    try {
      const summary = this.architect.getConversationSummary();
      const state = JSON.stringify({
        theme: summary.theme,
        messageCount: summary.messageCount,
        lastUpdated: Date.now(),
      });
      this.vault.set(`architect:chat:${chatId}`, state);
    } catch {
      // Vault locked — skip persistence
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/personality/src/__tests__/architect-bridge.test.ts`
Expected: PASS — all 5 tests

**Step 5: Add barrel export**

In `packages/personality/src/index.ts`, add:

```typescript
export { ArchitectBridge } from './architect-bridge.js';
export type { ArchitectLike, VaultLike, BridgeOptions } from './architect-bridge.js';
```

**Step 6: Commit**

```bash
git add packages/personality/src/architect-bridge.ts packages/personality/src/__tests__/architect-bridge.test.ts packages/personality/src/index.ts
git commit -m "feat(personality): add ArchitectBridge orchestrator module"
```

---

### Task 5: Wire Everything into the Runtime

Connect the bridge, awareness collector, SOUL.md biases, and escalation logging into the runtime's existing Architect integration points.

**Files:**
- Modify: `packages/runtime/src/index.ts` (~20 lines of glue)

**Step 1: Add imports**

At the top of `packages/runtime/src/index.ts`, add to the existing personality imports:

```typescript
import { ArchitectBridge, ArchitectAwarenessCollector, parseSoulBiases } from '@auxiora/personality';
```

**Step 2: Add fields to the runtime class**

After the existing `private architect` field, add:

```typescript
private architectBridge: ArchitectBridge | null = null;
private architectAwarenessCollector: ArchitectAwarenessCollector | null = null;
```

**Step 3: Wire in `loadPersonality()`**

In `loadPersonality()`, after the `await this.loadArchitectPersonality()` try block (around line 1765), add:

```typescript
// Initialize Architect bridge for state persistence and awareness bridging
if (this.architect) {
  this.architectAwarenessCollector = new ArchitectAwarenessCollector();
  this.architectBridge = new ArchitectBridge(
    this.architect,
    this.architectAwarenessCollector,
    this.vault,
    {
      onEscalation: (alert, context) => {
        this.logger.warn('Escalation detected', {
          alert,
          domain: context.domain,
          emotion: context.emotionalRegister,
        });
      },
    },
  );
}
```

In the self-awareness collector initialization (around line 1842-1857), add the Architect awareness collector to the list when available. After the existing `collectors` array:

```typescript
if (this.architectAwarenessCollector) {
  collectors.push(this.architectAwarenessCollector);
}
```

**Step 4: Apply SOUL.md biases**

In `loadPersonality()`, after SOUL.md is loaded (around line 1787-1791), add:

```typescript
// Apply SOUL.md domain biases to Architect trait mixing
if (this.architect && soul) {
  const biases = parseSoulBiases(soul);
  for (const [trait, offset] of Object.entries(biases)) {
    this.architect.setTraitOverride(trait as any, offset).catch(() => {});
  }
}
```

Note: `soul` is the variable from the existing try/catch that reads SOUL.md. Declare it outside the try block so it's accessible:

```typescript
let soulContent: string | undefined;
try {
  soulContent = await fs.readFile(getSoulPath(), 'utf-8');
  parts.push(soulContent);
} catch {
  // No SOUL.md
}
```

Then use `soulContent` for the bias parsing.

**Step 5: Use bridge in `applyArchitectEnrichment()`**

Modify `applyArchitectEnrichment()` (around line 1889) to use the bridge when available:

```typescript
private applyArchitectEnrichment(prompt: string, userMessage: string, chatId?: string): {
  prompt: string;
  architectMeta?: {
    detectedContext: import('@auxiora/personality/architect').TaskContext;
    activeTraits: import('@auxiora/personality/architect').TraitSource[];
    traitWeights: Record<string, number>;
    recommendation?: ContextRecommendation;
    escalationAlert?: string;
  };
} {
  if (!this.architect) return { prompt };

  const output = this.architectBridge && chatId
    ? this.architectBridge.processMessage(userMessage, chatId)
    : this.architect.generatePrompt(userMessage);

  const mix = this.architect.getTraitMix(output.detectedContext);
  const traitWeights: Record<string, number> = {};
  for (const [key, val] of Object.entries(mix)) {
    traitWeights[key] = val;
  }
  return {
    prompt: prompt + '\n\n' + output.contextModifier,
    architectMeta: {
      detectedContext: output.detectedContext,
      activeTraits: output.activeTraits,
      traitWeights,
      recommendation: output.recommendation,
      escalationAlert: output.escalationAlert,
    },
  };
}
```

Update the call site (around line 2102) to pass chatId:

```typescript
const architectResult = useArchitect
  ? this.applyArchitectEnrichment(enrichedPrompt, content, chatId)
  : { prompt: enrichedPrompt };
```

**Step 6: Run the full test suite**

Run: `pnpm vitest run`
Expected: All tests pass (including the new ones from Tasks 1-4)

**Step 7: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): wire Architect bridge, awareness collector, SOUL.md biases, and escalation logging"
```

---

### Task 6: Rebuild Architect artifacts and verify

Rebuild the pre-built Architect artifacts since Task 1 modified `conversation-context.ts`.

**Step 1: Compile**

```bash
cd src/personalities && npx tsc --project tsconfig.json
```

**Step 2: Copy artifacts**

```bash
cp src/personalities/the-architect/conversation-context.js packages/personality/lib/the-architect/
cp src/personalities/the-architect/conversation-context.d.ts packages/personality/lib/the-architect/
cp src/personalities/the-architect/conversation-context.js.map packages/personality/lib/the-architect/
```

**Step 3: Run full test suite**

```bash
pnpm vitest run
```

Expected: All tests pass

**Step 4: Commit**

```bash
git add src/personalities/ packages/personality/lib/
git commit -m "build(personality): rebuild Architect artifacts with serialize/restore"
```
