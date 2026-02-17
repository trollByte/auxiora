# Tool Loop Detection Design

**Date**: 2026-02-17
**Status**: Approved
**Inspired by**: OpenClaw `src/agents/tool-loop-detection.ts` (624 lines, 4 detectors)

---

## Problem

Auxiora's `executeWithTools()` loop has only a hard `maxToolRounds: 10` counter. A stuck tool loop (e.g., the LLM repeatedly calling a failing tool with identical arguments) burns through all 10 rounds before stopping. At $75/M output tokens for Claude Opus, a stuck loop can cost $5-10 before the round limit hits. There is no pattern detection, no progress awareness, and no ping-pong detection.

## Solution

Add a 4-detector sliding-window tool loop detection system inside `packages/runtime/src/tool-loop-detection.ts`. The system fingerprints tool calls and their outcomes, detects stuck patterns, and intervenes with warnings (injected messages) then blocks (forced synthesis).

## Architecture

### Module Location

`packages/runtime/src/tool-loop-detection.ts` — single file, no new package.

### Public API

```typescript
createLoopDetectionState(config?: Partial<LoopDetectionConfig>): LoopDetectionState
recordToolCall(state: LoopDetectionState, toolName: string, args: unknown): void
recordToolOutcome(state: LoopDetectionState, toolCallId: string, result: string): void
detectLoop(state: LoopDetectionState): LoopDetectionResult
```

### State

Ephemeral per-execution — created at the start of each `executeWithTools()` invocation and discarded when it returns. No persistence to sessions or database.

```typescript
interface LoopDetectionState {
  window: ToolCallEntry[];        // Sliding window of recent calls
  warnedPatterns: Set<string>;    // Patterns already warned about (no re-warn)
  config: LoopDetectionConfig;
}

interface ToolCallEntry {
  toolName: string;
  argsHash: string;               // SHA-256 of toolName + sorted args
  toolCallId: string;
  timestamp: number;
  outcomeHash?: string;           // SHA-256 of result (set by recordToolOutcome)
}
```

## Detectors

### 1. Generic Repeat

Detects the same tool called with identical arguments N times in the window.

- **Fingerprint**: SHA-256 of `toolName + JSON.stringify(stableSortedArgs)`
- **Warning** at 5 repeats
- **Critical** at 10 repeats

### 2. No-Progress Polling

Detects tool calls returning identical results repeatedly, indicating no progress.

- **Outcome hash**: SHA-256 of the result string (truncated to first 4KB for performance)
- Matches outcome back to its call by `toolCallId`
- **Warning** at 8 identical outcomes for the same fingerprint
- **Critical** at 15 identical outcomes

### 3. Ping-Pong

Detects alternating A->B->A->B deadlocks between two tools.

- Tracks recent call fingerprints
- Detects alternating pairs: `hash[i] === hash[i-2]` for consecutive entries
- **Warning** at 3 cycles (6 calls)
- **Critical** at 5 cycles (10 calls)

### 4. Global Circuit Breaker

Hard safety net regardless of specific pattern.

- Counts total tool calls with no-progress outcomes (outcome hash matches a previous call with the same args hash)
- **Critical** at 20 no-progress calls
- Always active, cannot be disabled

## Configuration

```typescript
interface LoopDetectionConfig {
  windowSize: number;              // default 30
  genericRepeatWarn: number;       // default 5
  genericRepeatCritical: number;   // default 10
  noProgressWarn: number;          // default 8
  noProgressCritical: number;      // default 15
  pingPongWarnCycles: number;      // default 3
  pingPongCriticalCycles: number;  // default 5
  circuitBreakerLimit: number;     // default 20
}
```

All thresholds configurable per-execution via the config parameter.

## Warning & Block Behavior

### Warning (`severity: 'warning'`)

- Inject a message into conversation context telling the LLM to change approach
- Message includes: which pattern was detected, how many repeats, suggestion to try different parameters or a different tool
- One-shot per pattern — tracked via `warnedPatterns` Set

### Critical (`severity: 'critical'`)

- Break out of the tool loop immediately
- Force a synthesis response — call the LLM one final time without tools
- Synthesis prompt asks the LLM to summarize progress and explain what went wrong
- Log structured warning via audit system
- Increment `tool_loop_detected` metric counter (labels: `detector`, `severity`)

### Detection Result

```typescript
interface LoopDetectionResult {
  severity: 'none' | 'warning' | 'critical';
  detector?: 'generic_repeat' | 'no_progress' | 'ping_pong' | 'circuit_breaker';
  message?: string;               // Human-readable description for injection
  details?: {
    toolName?: string;
    repeatCount?: number;
    cycleCount?: number;
  };
}
```

## Integration

Changes to `executeWithTools()` in `packages/runtime/src/index.ts`:

```
const loopState = createLoopDetectionState();

for (let round = 0; round < maxRounds; round++) {
  // ... existing LLM call that returns tool uses ...

  for (const toolUse of toolUses) {
    recordToolCall(loopState, toolUse.name, toolUse.input);
    const result = await toolExecutor.execute(...);
    recordToolOutcome(loopState, toolUse.id, resultString);
  }

  const detection = detectLoop(loopState);
  if (detection.severity === 'critical') {
    // Force synthesis and break
    break;
  }
  if (detection.severity === 'warning') {
    messages.push({ role: 'user', content: detection.message });
  }
}
```

## Hashing

- Use Node.js `crypto.createHash('sha256')` for fingerprinting
- Stable JSON serialization: recursively sort object keys before `JSON.stringify()`
- Non-serializable values fall back to `String(value)`
- Outcome hash truncates result to first 4KB before hashing (performance guard)

## Testing Strategy

1. **Unit tests** for each detector in isolation (pure functions, deterministic)
2. **Unit tests** for hashing (stable sort, edge cases)
3. **Integration test** for warning injection path
4. **Integration test** for critical/block path with forced synthesis
5. **Threshold configurability** tests
6. **Edge cases**: empty args, very large args, non-serializable values, single tool call (no loop)

## Metrics

New counter: `tool_loop_detected_total` with labels:
- `detector`: generic_repeat | no_progress | ping_pong | circuit_breaker
- `severity`: warning | critical

## Non-Goals

- No persistence across executions (ephemeral state only)
- No per-tool-type custom thresholds (can be added later)
- No UI for viewing loop detection events (just metrics and audit logs)
- No modification to the existing `maxToolRounds` behavior (loop detection is additive)
