# Honest UX Design

**Goal:** Surface transparency metadata on every assistant message — confidence scores, source attribution, model/cost info, personality context, and processing traces — so power users have full visibility into how responses are generated.

**Architecture:** A `TransparencyCollector` module in `packages/runtime/src/transparency/` assembles metadata from existing sources (enrichment pipeline, provider response, self-awareness signals) after each LLM call. The metadata is persisted in the existing `Message.metadata` field and rendered as a collapsible footer in the dashboard chat UI.

**Tech Stack:** Pure TypeScript functions (no new packages), Lit web component for dashboard UI, existing `Message.metadata` and `ContentBlock.metadata` fields for storage.

---

## Problem Statement

Auxiora has rich internal metadata about every response:
- Enrichment pipeline produces architect context, trait weights, domain detection, emotional registers
- Providers return token counts, model name, cost data, finish reason
- Self-awareness collectors signal knowledge boundaries, hedge density, capacity
- Audit trail logs corrections, feedback, decisions, trait overrides

None of this reaches the user. The industry treats transparency as "show chain-of-thought" (which is theatre — it doesn't reveal actual reasoning). Real trust comes from calibrated confidence indicators, source attribution, and resource visibility.

---

## Data Model

### TransparencyMeta

Attached to every assistant message via `Message.metadata.transparency`:

```typescript
interface TransparencyMeta {
  confidence: {
    level: 'high' | 'medium' | 'low';
    score: number;                    // 0.0–1.0
    factors: ConfidenceFactor[];
  };

  sources: SourceAttribution[];

  model: {
    provider: string;                 // 'anthropic', 'openai', 'google'
    model: string;                    // 'claude-3.5-sonnet', etc.
    tokens: { input: number; output: number };
    cost: { input: number; output: number; total: number }; // USD
    finishReason: string;             // 'stop', 'max_tokens', etc.
    latencyMs: number;
  };

  personality: {
    domain: string;                   // 'code_engineering', 'security_review', etc.
    emotionalRegister: string;        // 'neutral', 'stressed', 'uncertain', etc.
    activeTraits: Array<{ name: string; weight: number }>;
    knowledgeBoundary?: {
      topic: string;
      corrections: number;
    };
  };

  trace: {
    enrichmentStages: string[];       // ['memory', 'mode', 'architect', 'self-awareness', 'model-identity']
    toolsUsed: string[];              // tool names invoked during response
    processingMs: number;             // total wall time
  };
}

interface ConfidenceFactor {
  signal: string;                     // factor identifier
  impact: 'positive' | 'negative';
  detail: string;                     // human-readable explanation
}

interface SourceAttribution {
  type: 'tool_result' | 'memory_recall' | 'knowledge_graph' | 'user_data' | 'model_generation';
  label: string;                      // "Web search result", "Your preference history", etc.
  confidence: number;                 // 0.0–1.0
}
```

### Design Decisions

- `confidence.factors` explains *why* the score is what it is — not just a number, but reasoning the user can inspect.
- `sources` is per-response, not per-sentence. Per-sentence attribution requires inline annotations which is much more complex (YAGNI).
- `cost` is in USD, calculated from `ModelCapabilities.costPer1kInput/Output` already available in provider types.
- `knowledgeBoundary` only appears when the KnowledgeBoundary collector has flagged the topic — it's an exception indicator, not always present.

---

## Confidence Scoring Heuristic

Heuristic-based scoring from existing signals. No extra LLM calls, no latency cost.

### Base Score: 0.7

Model-generated text with no additional signals starts at 0.7.

### Positive Factors

| Signal | Condition | Adjustment | Factor Name |
|---|---|---|---|
| Tool grounding | Response uses tool results | +0.15 | `tool_grounded` |
| Memory recall | Response informed by vector store / knowledge graph | +0.10 | `memory_backed` |
| User data | Response references user preferences/decisions | +0.05 | `user_data_informed` |
| Clean finish | `finishReason === 'stop'` | +0.05 | `clean_finish` |
| No corrections | No prior user corrections on detected topics | +0.05 | `no_corrections` |

### Negative Factors

| Signal | Condition | Adjustment | Factor Name |
|---|---|---|---|
| Knowledge boundary | Topic previously corrected by user | -0.15 per correction (max -0.30) | `knowledge_boundary` |
| Truncated | `finishReason === 'max_tokens'` | -0.20 | `truncated_response` |
| Hedge density | >3 hedge phrases in response | -0.10 | `hedge_density` |
| No grounding | No tools, no memory, no user data | -0.10 | `ungrounded` |
| Escalation alert | Architect flagged escalation | -0.10 | `escalation_flagged` |

### Score Computation

1. Start at base 0.7
2. Apply all matching positive factors
3. Apply all matching negative factors
4. Clamp to [0.1, 1.0]
5. Assign level: `high` >= 0.75, `medium` >= 0.45, `low` < 0.45
6. Collect all matching factors into the `factors` array

### Example Scenarios

- **Tool-grounded search, clean finish:** 0.7 + 0.15 + 0.05 = **0.90 (high)**
- **Pure generation, no corrections:** 0.7 - 0.10 + 0.05 = **0.65 (medium)**
- **Topic corrected 2x, hedgy response:** 0.7 - 0.30 - 0.10 = **0.30 (low)**
- **Memory-backed, user data, clean finish:** 0.7 + 0.10 + 0.05 + 0.05 + 0.05 = **0.95 (high)**
- **Truncated response, ungrounded:** 0.7 - 0.20 - 0.10 = **0.40 (low)**

---

## TransparencyCollector

### File Layout

```
packages/runtime/src/transparency/
├── types.ts              # TransparencyMeta, ConfidenceFactor, SourceAttribution
├── collector.ts          # collectTransparencyMeta() — assembles from all sources
├── confidence-scorer.ts  # scoreConfidence() — heuristic scorer
├── source-attributor.ts  # attributeSources() — classifies response sources
└── __tests__/
    ├── collector.test.ts
    ├── confidence-scorer.test.ts
    └── source-attributor.test.ts
```

### Input Sources

The collector is a pure function that takes already-available objects:

1. **`EnrichmentResult.metadata`** → personality domain, active traits, emotional register, enrichment stage names
2. **`CompletionResult`** (provider response) → model, tokens, finish reason, latency
3. **`ModelCapabilities`** (provider registry) → cost calculation
4. **`AwarenessSignal[]`** (self-awareness collectors) → knowledge boundary, hedge detection
5. **`ToolUse[]`** (completion result) → tools used, source attribution (tool_result)
6. **Response text** (for hedge phrase scanning) → hedge density factor

### Function Signature

```typescript
function collectTransparencyMeta(input: {
  enrichment: EnrichmentResult;
  completion: CompletionResult;
  capabilities: ModelCapabilities;
  awarenessSignals: AwarenessSignal[];
  responseText: string;
  processingStartTime: number;
}): TransparencyMeta;
```

### Integration Point

In `handleMessage()`, after `const completion = await provider.complete(...)` and before `session.addMessage(...)`:

```typescript
const transparencyMeta = collectTransparencyMeta({
  enrichment: enrichmentResult,
  completion,
  capabilities: provider.getCapabilities(model),
  awarenessSignals,
  responseText: completion.content,
  processingStartTime,
});

session.addMessage({
  role: 'assistant',
  content: completion.content,
  metadata: { transparency: transparencyMeta },
});
```

No new packages. No new dependencies. Just a module that assembles existing data.

---

## Dashboard UI: Message Footer

### Component

A single Lit web component `<transparency-footer>` in `packages/dashboard/ui/src/components/transparency-footer.ts`.

**Property:** `meta: TransparencyMeta`

### Collapsed State (Always Visible)

Compact single line below each assistant message:

```
🟢 High (0.87) · Claude 3.5 Sonnet · 278 tokens · $0.004 · Engineering
```

Components:
- Confidence dot (colored) + level + score
- Model name
- Total tokens (input + output)
- Cost (USD)
- Detected domain

**Color coding:**
- `high` (>= 0.75): green dot `🟢`
- `medium` (>= 0.45): yellow dot `🟡`
- `low` (< 0.45): red dot `🔴`

**Knowledge boundary warning variant:**
```
🔴 Low (0.35) · ⚠ Topic previously corrected (2x) · Claude 3.5 Sonnet · 312 tokens · $0.005
```

### Expanded State (Click to Toggle)

Three subsections:

**Confidence:**
```
Score: 0.87 (High)
  + Tool grounded: Response informed by web search results
  + Clean finish: Model completed response normally
  + No corrections: No prior user corrections on this topic
```

**Sources:**
```
  🔧 Tool result — Web search (0.95)
  🧠 Memory recall — Similar past conversation (0.72)
  🤖 Model generation — Synthesized from above sources (0.70)
```

**Processing:**
```
  Model: anthropic / claude-3.5-sonnet
  Tokens: 156 in / 278 out
  Cost: $0.0012 in / $0.0028 out = $0.004 total
  Latency: 1,247ms
  Finish: stop
  Stages: memory → mode → architect → self-awareness → model-identity
  Tools: web_search, knowledge_graph_query
  Domain: code_engineering
  Register: neutral
  Traits: precise (0.82), thorough (0.74), collaborative (0.61)
```

### Styling

- Muted text color, smaller font size than message content
- Collapsed line uses CSS `opacity: 0.7` to not compete with content
- Expanded sections use monospace for alignment
- Confidence dots are CSS `::before` pseudo-elements with colored backgrounds
- Smooth expand/collapse transition (max-height animation)

---

## What This Does NOT Cover

- **Per-sentence source attribution** — Requires inline annotations. Much more complex. Can be added later.
- **Historical confidence trends** — Tracking confidence over time for analytics. Nice-to-have, not v1.
- **User-configurable thresholds** — Letting users set their own confidence boundaries. YAGNI.
- **Streaming metadata** — Showing metadata during generation (approach C). Can be layered on later.
- **"Why did you say that?" drill-down** — Querying audit trail for full provenance. Future feature.
- **Model self-assessment** — Asking the LLM to rate its confidence. Research shows models are poorly calibrated.
