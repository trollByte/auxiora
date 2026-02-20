# Guardrails Runtime Integration Design

**Date:** 2026-02-19
**Status:** Approved

## Goal

Wire the existing `@auxiora/guardrails` package (`GuardrailPipeline`) into the runtime message processing pipeline so that every user message is scanned before reaching the LLM, and every LLM response is scanned before being persisted or delivered.

## Decisions

- **Approach:** Direct inline integration (no middleware abstraction)
- **Block behavior:** Silent reject + warning — blocked messages are not stored in the session; a polite refusal is returned and the event is audit-logged
- **Scan scope:** Input messages and output responses only — tool I/O is not scanned (tools have their own permission gates)

## Config Schema

Add a `guardrails` key to `ConfigSchema` in `packages/config/src/index.ts`:

```ts
const GuardrailsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  piiDetection: z.boolean().default(true),
  promptInjection: z.boolean().default(true),
  toxicityFilter: z.boolean().default(true),
  blockThreshold: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
  redactPii: z.boolean().default(true),
  scanOutput: z.boolean().default(true),
});
```

This maps directly to the existing `GuardrailConfig` interface in `@auxiora/guardrails`.

## Integration Points

### Input Scanning

Location: `handleMessage()` (after content validation, before `sessions.addMessage()`) and `handleChannelMessage()` (after media processing, before `sessions.addMessage()`).

Flow:
1. `guardrailPipeline.scanInput(content)`
2. If `action === 'block'`: send polite refusal to client, emit audit event, return early (message NOT stored)
3. If `action === 'redact'`: replace `content` with `result.redactedContent` before storing/processing
4. If `action === 'warn'`: emit audit event, continue with original content
5. If `action === 'allow'`: continue normally

### Output Scanning

Location: After `executeWithTools()` returns, before saving to session or delivering final response.

Flow:
1. `guardrailPipeline.scanOutput(fullResponse)`
2. If `action === 'block'`: replace response with safe fallback message
3. If `action === 'redact'`: use `result.redactedContent` instead
4. Otherwise: use response as-is

**Streaming caveat:** For the WebSocket path, text chunks are streamed to the client in real-time during `executeWithTools()`. The output scan runs on the complete response afterward. If the scan blocks/redacts, a correction message is sent after the `done` signal. For the channel path with draft streaming, the final draft edit uses the scanned/redacted text.

## Audit Events

Every guardrail action (block, warn, redact) emits:

```ts
audit('guardrail.triggered', {
  action: result.action,         // 'block' | 'warn' | 'redact'
  threatCount: result.threats.length,
  highestLevel: maxThreatLevel,
  direction: 'input' | 'output',
  sessionId,
  channelType,
});
```

Threat details (type, level, description) are logged at debug level to avoid storing sensitive matched content in the audit trail.

## Helper Methods

To avoid duplicating logic between the two handlers, add private methods to the `Auxiora` class:

- `checkInputGuardrails(content: string)`: Returns `ScanResult | null` (null when guardrails disabled)
- `checkOutputGuardrails(response: string)`: Returns `{ response: string; wasModified: boolean }`

## Files Changed

| File | Change |
|---|---|
| `packages/config/src/index.ts` | Add `GuardrailsConfigSchema`, wire into `ConfigSchema` |
| `packages/runtime/package.json` | Add `@auxiora/guardrails` dependency |
| `packages/runtime/src/index.ts` | Import guardrails, initialize pipeline from config, add input/output scan hooks in both message handlers |
| `packages/runtime/tests/guardrails-integration.test.ts` | New test file for integration wiring |

## What This Does NOT Change

- The `GuardrailPipeline` class itself (already complete and tested)
- Tool execution flow (no tool I/O scanning)
- The streaming chunk delivery mechanism
- Any existing guardrails unit tests
