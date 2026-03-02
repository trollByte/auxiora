# Orchestration & ReAct Loops

> Multi-agent patterns, reasoning-action loops, and crash-recoverable job execution.

## Overview

Auxiora's orchestration layer coordinates complex workflows that go beyond a single prompt-response cycle. It provides three complementary systems: a ReAct loop for goal-driven reasoning with tool execution, an orchestration engine with five multi-agent patterns, and a durable job queue for crash-recoverable background processing. Together they handle everything from a quick tool-calling chain to a multi-day research pipeline that survives process restarts.

## ReAct Loop

### How It Works

The ReAct (Reasoning + Acting) loop is Auxiora's core execution model for multi-step tasks. Each iteration follows a three-phase cycle:

1. **Think** -- The model reasons about the current state, what has been accomplished, and what the next action should be. This reasoning is visible in the transparency footer.
2. **Act** -- The model selects and invokes a tool (search, connector, browser, code execution, etc.) based on its reasoning.
3. **Observe** -- The tool's output is fed back into context. The model evaluates whether the goal is achieved or another cycle is needed.

The loop continues until the goal is satisfied, a step limit is reached, or the token budget is exhausted.

### Features

| Feature | Description |
|---------|-------------|
| **Step limits** | Maximum number of Think-Act-Observe cycles per task (default: 25) |
| **Token budgets** | Cap total token consumption to control cost |
| **Tool allowlists** | Restrict which tools the loop can invoke |
| **Tool denylists** | Block specific tools from being used |
| **Approval-required mode** | Pause before executing sensitive actions, wait for user confirmation |
| **Loop detection** | Detects repeated identical tool calls and breaks out of infinite loops |
| **Checkpoint/resume** | Serializes loop state after each step for crash recovery |
| **Per-step validation** | Custom callbacks invoked after each step to enforce invariants |

### Configuration

```json
{
  "react": {
    "maxSteps": 25,
    "tokenBudget": 100000,
    "toolAllowlist": ["search", "browser", "github", "notion"],
    "toolDenylist": ["shell"],
    "approvalRequired": ["shell", "email_send"],
    "loopDetection": true,
    "checkpointEnabled": true
  }
}
```

### Checkpoint Support

ReAct sessions can be checkpointed after each Think-Act-Observe cycle. The checkpoint captures the full conversation state, tool call history, and accumulated reasoning. If the process crashes mid-loop, the session resumes from the last checkpoint rather than restarting from scratch.

Checkpoints integrate with the job queue (see below) -- when a ReAct loop runs as a background job, each step is automatically checkpointed. On crash recovery, the job handler calls `ctx.getCheckpoint()` to restore the loop state.

### Per-Step Validation

You can register validation callbacks that run after each step:

- **Budget guards** -- Abort if cumulative cost exceeds a threshold
- **Safety checks** -- Verify no sensitive data was leaked in tool output
- **Progress assertions** -- Ensure the loop is making forward progress (not repeating actions)
- **Custom invariants** -- Any application-specific validation logic

If a validation callback returns a rejection, the loop terminates with the callback's error message.

## Orchestration Engine

### 5 Patterns

The orchestration engine provides five composition patterns for coordinating multiple agents or sub-tasks:

| Pattern | Description | Use Case |
|---------|-------------|----------|
| **Parallel** | Run multiple agents simultaneously, collect all results | Gathering diverse perspectives on a single question |
| **Sequential** | Chain agents so each builds on the previous agent's output | Multi-step analysis pipelines (research then outline then draft) |
| **Debate** | Two agents argue opposing positions, a judge synthesizes | Balanced decision analysis where bias must be minimized |
| **Map-Reduce** | Distribute items across agents in parallel, then reduce results into a single output | Processing large datasets or researching many sub-topics |
| **Supervisor** | A supervisor agent delegates sub-tasks to worker agents and coordinates their outputs | Complex multi-part projects requiring dynamic task allocation |

### Pattern Configuration

Each pattern is configured with a workflow definition:

```json
{
  "workflow": {
    "pattern": "debate",
    "agents": {
      "proponent": { "systemPrompt": "Argue in favor of the proposal..." },
      "opponent": { "systemPrompt": "Argue against the proposal..." },
      "judge": { "systemPrompt": "Synthesize both arguments into a balanced recommendation..." }
    },
    "rounds": 2,
    "maxTokensPerAgent": 4096
  }
}
```

### Observability

The orchestration engine emits structured events throughout execution:

| Event | Payload | Purpose |
|-------|---------|---------|
| `task_progress` | `{ taskId, status, completedSteps, totalSteps }` | Track progress of individual tasks |
| `task_timing` | `{ taskId, startedAt, completedAt, durationMs }` | Performance measurement per task |
| `workflow_checkpoint` | `{ workflowId, completedTasks, pendingTasks }` | Checkpoint support for sequential workflows |
| `agent_output` | `{ agentId, output, tokenUsage }` | Per-agent results and resource consumption |

Events are available via the gateway's Server-Sent Events stream at `/api/v1/workflows/events` and in the dashboard's workflow view.

### Cost Tracking

Every orchestration workflow tracks resource consumption at multiple granularities:

- **Per-agent token usage** -- Input tokens, output tokens, and total for each agent in the workflow
- **Cost estimation** -- Real-time cost calculation based on the provider's per-token pricing
- **Workflow totals** -- Aggregated token usage and estimated cost across all agents in the workflow

Cost data is included in `task_timing` events and in the final workflow result:

```json
{
  "workflowId": "wf_abc123",
  "pattern": "debate",
  "totalTokens": { "input": 24500, "output": 8200 },
  "estimatedCost": 0.42,
  "perAgent": {
    "proponent": { "input": 8000, "output": 3100, "cost": 0.14 },
    "opponent": { "input": 8500, "output": 2800, "cost": 0.13 },
    "judge": { "input": 8000, "output": 2300, "cost": 0.15 }
  }
}
```

Cost tracking integrates with the provider-level cost limits configured in [AI Providers](providers.md) -- if a workflow would exceed the daily or monthly budget, it is paused with a notification.

## Job Queue

### How It Works

The durable job queue provides crash-recoverable background execution backed by SQLite in WAL mode. Jobs are persisted to disk, so they survive process restarts, crashes, and even system reboots.

The queue uses a polling model: a dispatcher runs on a configurable interval (default: 2 seconds), checks for pending jobs, and dispatches up to `concurrency` jobs (default: 5) simultaneously.

### Schema

Jobs are stored in a `jobs` table with 13 columns tracking state, attempts, scheduling, and error history. A companion `job_checkpoints` table stores intermediate state with a foreign key cascade delete (removing a job automatically removes its checkpoints).

### Lifecycle

```
enqueue → pending → running → completed
                  ↘ failed → pending (retry)
                  ↘ failed → dead (max attempts or NonRetryableError)
```

### Features

| Feature | Description |
|---------|-------------|
| **Crash recovery** | On startup, any jobs left in `running` state are reset to `pending` with an incremented attempt counter |
| **Exponential backoff** | Failed jobs are retried after `2^attempt * 1000` ms (1s, 2s, 4s) |
| **Max 3 attempts** | Jobs that fail 3 times are moved to `dead` status |
| **NonRetryableError** | Throwing a `NonRetryableError` in a handler sends the job directly to `dead` without retry |
| **Checkpoint/resume** | Handlers call `ctx.checkpoint(data)` to persist intermediate state and `ctx.getCheckpoint<T>()` to restore it after a crash |
| **Configurable concurrency** | Control how many jobs run simultaneously (default: 5) |
| **Configurable polling** | Adjust the polling interval in milliseconds (default: 2000) |

### Usage in Behaviors

Behaviors (scheduled tasks, monitors, reminders) are backed by the job queue when it is available. Each behavior execution is enqueued as a job, gaining crash recovery and retry semantics automatically. If the job queue is not configured, behaviors fall back to in-memory execution.

### Configuration

```json
{
  "jobQueue": {
    "enabled": true,
    "concurrency": 5,
    "pollIntervalMs": 2000,
    "maxAttempts": 3
  }
}
```

### Monitoring

```bash
auxiora jobs status       # Show queue statistics (pending, running, completed, dead)
```

Job queue status is also available via the gateway API:

```
GET /api/v1/jobs/status
```

## Use Cases

### 1. Deep Analysis (Debate Pattern)

You need to decide whether to adopt a new database technology. The orchestration engine spins up a debate workflow: one agent builds the strongest case for adoption (performance benchmarks, ecosystem maturity, migration path), another builds the strongest case against (operational complexity, vendor lock-in, team learning curve), and a judge agent synthesizes both arguments into a balanced recommendation with clear trade-offs. Each agent runs its own ReAct loop to research its position, and cost tracking ensures the entire debate stays within budget.

### 2. Content Pipeline (Sequential Pattern)

You want to produce a technical blog post from a rough idea. A sequential workflow chains five agents: (1) researcher gathers sources and data, (2) outliner creates a structured outline, (3) drafter writes the full post, (4) editor refines prose and checks technical accuracy, (5) publisher formats for your blog platform. Each agent receives the previous agent's output as input. The workflow checkpoints after each stage, so if the process crashes during editing, it resumes from the editor stage rather than restarting research.

### 3. Crash-Safe Automation

A behavior runs every night at 2 AM to sync data between three services. The job queue ensures that if the process crashes mid-sync (or the machine reboots), the job is recovered on next startup. The handler uses `ctx.checkpoint()` after each service is synced, so a crash after syncing two of three services only requires re-syncing the third. Exponential backoff handles transient API failures, and `NonRetryableError` is thrown for permanent failures (e.g., revoked credentials) to avoid wasting retry attempts.

### 4. Parallel Research (Map-Reduce Pattern)

You ask: "Survey the state of WebAssembly adoption across 10 programming languages." The orchestration engine uses map-reduce: it distributes one language per agent (10 parallel research tasks), each agent runs a ReAct loop to find adoption data, tooling maturity, and notable projects. Once all agents complete, a reduce agent consolidates the 10 individual reports into a single comparative survey with a summary table and recommendations. The parallel phase completes in roughly the time of a single research task.

## Related Documentation

- [Message Queue](message-queue.md) -- Per-session queuing prevents race conditions when new messages arrive during long-running tasks
- [Research Agent](research.md) -- Research workflows often use orchestration patterns for parallel sub-topic investigation
- [Behaviors](behaviors.md) -- Scheduled behaviors execute through the job queue for crash recovery
- [AI Providers](providers.md) -- Cost tracking and budget limits integrate with provider configuration
- [CLI Reference](cli.md) -- Full command reference for `auxiora workflow` and `auxiora jobs`
