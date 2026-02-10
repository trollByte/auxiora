# Autonomous Workflows Vertical Slice Design

> **Date:** 2026-02-10
> **Status:** Draft
> **Goal:** Enable Auxiora to execute multi-step workflows autonomously in the background, with trust-gated tool execution, audit trails, and automatic rollback on failure.

## The Problem

Auxiora has all the building blocks for autonomous execution — TrustEngine, WorkflowEngine, tool system, AuditTrail, RollbackManager — but they operate in silos. Workflow steps are human-completed only. Tool execution has no trust checking or audit recording. There's no background loop to advance active workflows.

## Design

### Phase A: Extend workflow types for autonomous execution

**File:** `packages/workflows/src/types.ts`

Add `AutonomousAction` to `WorkflowStep` — either explicit tool call or AI prompt:

```typescript
interface AutonomousAction {
  tool: string;
  params: Record<string, unknown>;
  trustDomain: TrustDomain;
  trustRequired: TrustLevel;
  rollbackTool?: string;
  rollbackParams?: Record<string, unknown>;
}
```

Extend `WorkflowStep` with optional `action?: AutonomousAction`.
Extend `HumanWorkflow` with optional `autonomous?: boolean`.

### Phase B: AutonomousExecutor

**File:** `packages/workflows/src/autonomous-executor.ts`

Core class that auto-executes workflow steps with trust-gated tool calls.

```typescript
class AutonomousExecutor {
  constructor(deps: {
    workflowEngine: WorkflowEngine;
    trustGate: TrustGate-like interface;
    trustEngine: TrustEngine-like interface;
    auditTrail: ActionAuditTrail-like interface;
    executeTool: (name, params) => Promise<ToolResult>;
  })

  // Advance all active autonomous workflows one tick
  async tick(): Promise<TickResult>

  // Start/stop background timer
  start(intervalMs?: number): void
  stop(): void
}
```

**Tick logic per step:**
1. Check trust via `trustGate.gate(action.trustDomain, action.tool, action.trustRequired)`
2. If denied → skip (trust may increase later, don't fail)
3. Record audit entry (outcome: pending)
4. Execute tool
5. Update audit entry (success/failure)
6. Record trust outcome (success → promote, failure → demote)
7. Mark step complete or failed via WorkflowEngine
8. On failure with rollback available → execute rollback tool

### Phase C: Runtime wiring

**File:** `packages/runtime/src/index.ts`

- Create AutonomousExecutor with TrustGate, TrustEngine, AuditTrail, toolExecutor
- Start background timer (every 30 seconds)
- Stop timer on shutdown
- Expose to dashboard for monitoring

### Phase D: Tests

**File:** `packages/workflows/tests/autonomous-executor.test.ts`

- Trust-gated execution (allowed/denied)
- Step dependency advancement
- Failure handling and audit recording
- Rollback on failure
- Timer start/stop
- Multi-step workflow completion

## Files Modified/Created

1. `packages/workflows/src/types.ts` — extend with AutonomousAction, autonomous flag
2. `packages/workflows/src/autonomous-executor.ts` — NEW: AutonomousExecutor
3. `packages/workflows/src/index.ts` — re-export
4. `packages/workflows/tests/autonomous-executor.test.ts` — NEW: tests
5. `packages/runtime/src/index.ts` — wire executor, start timer

## Verification

1. `pnpm build` — compiles
2. `pnpm test` — all tests pass
