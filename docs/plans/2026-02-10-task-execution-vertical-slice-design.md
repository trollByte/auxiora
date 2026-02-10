# Task Execution Vertical Slice Design

> **Date:** 2026-02-10
> **Status:** Draft
> **Goal:** Make Auxiora actually DO things when asked — complete the tool follow-up loop, expose connector actions as AI-callable tools, and enable tools across all conversation flows (webchat, voice, channels).

## The Problem

Auxiora has 28+ registered tools and real Google Workspace connector actions, but three gaps prevent natural task execution:

1. **No tool follow-up loop** — After a tool executes, results are stored but never sent back to the AI. The AI can't synthesize "Here are your 3 events..." from tool output.
2. **Connector actions not exposed as tools** — The AI can't call `send_email` or `list_events` directly.
3. **Voice and channel flows skip tools** — Only webchat supports tool execution.

## Design

### Phase A: Tool Follow-up Loop

**File:** `packages/runtime/src/index.ts` — `handleToolExecution` method

After executing all tools and collecting results:
1. Format tool results as a user message: `[Tool Results]\n<tool_name>: <output>`
2. Add to session history
3. Re-invoke `provider.stream()` with updated messages + tools
4. Stream the follow-up response to the client
5. If the AI calls more tools, loop (cap at 5 rounds)
6. Track cumulative usage across rounds

**Error handling:**
- Tool execution failure → include error in results, let AI explain the failure
- Provider error on follow-up → send error to client, don't retry
- Max rounds exceeded → send accumulated response + warning

### Phase B: Connector-to-Tool Bridge

**File:** `packages/runtime/src/index.ts` — new `registerConnectorTools` method

When connectors are initialized, iterate their actions and register each as a tool:

```
connector action "list-events" → tool "google_workspace_list_events"
```

Tool mapping:
- **name**: `{connectorId}_{actionId}` (underscores replace hyphens)
- **description**: From action metadata
- **parameters**: From action parameter schema
- **permission**: Trust level 0-1 → USER_APPROVAL, 2+ → AUTO_APPROVE
- **execute**: Calls `connector.executeAction(actionId, params, token)` via ConnectorActionExecutor

Only registers tools for connectors that have active authentication tokens.

### Phase C: Shared `executeWithTools` Method

**File:** `packages/runtime/src/index.ts`

Extract the streaming + tool execution loop into a shared method:

```typescript
private async executeWithTools(
  sessionId: string,
  messages: ChatMessage[],
  enrichedPrompt: string,
  provider: Provider,
  onChunk: (type: string, data: any) => void,
  options?: { maxToolRounds?: number; tools?: ToolDefinition[] }
): Promise<{ response: string; usage: { inputTokens: number; outputTokens: number } }>
```

**Callers:**
- `handleMessage` (webchat) — `onChunk` streams to websocket
- `handleVoiceMessage` (voice) — `onChunk` buffers silently, only final text goes to TTS
- `handleChannelMessage` (channels) — `onChunk` collects text for channel reply

This eliminates the duplicated provider call logic across all three flows.

### Phase D: Tests

**File:** `packages/runtime/tests/tool-execution.test.ts` (new)

Test cases:
- Tool follow-up loop: AI calls tool → result sent back → AI synthesizes response
- Multi-round: AI calls tool → result → AI calls another tool → result → final response
- Max rounds cap: 5 rounds then stops
- Error in tool: Result includes error, AI explains
- Connector tool bridge: Connector action registered as tool, executable
- Voice with tools: Voice flow triggers tool execution
- Channel with tools: Channel flow triggers tool execution

## Files Modified

1. `packages/runtime/src/index.ts` — shared `executeWithTools`, connector tool bridge, refactor all 3 flows
2. `packages/runtime/tests/tool-execution.test.ts` — new test file
3. `packages/providers/src/types.ts` — no changes needed (text encoding for tool results)
4. `packages/tools/src/registry.ts` — possibly add `registerBatch` helper

## Verification

1. `pnpm build` — compiles
2. `pnpm test` — all tests pass
3. Manual: send "list my calendar events" in chat → AI calls tool → AI responds with formatted events
4. Manual: voice "what's on my calendar" → tool executes → AI speaks the answer
