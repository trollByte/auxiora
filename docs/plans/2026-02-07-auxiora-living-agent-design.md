# Auxiora Living Agent Design: From Chatbot to Living Agent

**Date:** 2026-02-07
**Status:** Draft
**Version:** 4.0 Vision
**Builds on:** v3.0 Vision (Phases 1-11 complete)

---

## Executive Summary

Auxiora's next evolution is a fundamental shift from chatbot to **living agent**. Today's Auxiora responds when spoken to. Tomorrow's Auxiora inhabits your digital life — anticipating needs, taking actions, coordinating people, and earning deeper trust over time.

**One-liner:** Auxiora becomes the colleague who's been with you for years — one who knows your systems, anticipates your patterns, acts on your behalf, and gets better every week.

---

## The Problem

Every AI assistant today suffers from four fatal flaws:

1. **They forget everything** — Context resets, no real learning, feels like starting over every time.
2. **They can't DO things** — Can talk about tasks but can't actually execute. No real-world agency.
3. **They're not proactive** — Always reactive, waiting for input. Never anticipates needs or acts autonomously.
4. **They're isolated** — Can't work with other people, teams, or systems. No collaboration, no shared context.

Auxiora v3.0 solved #1 (living memory) and partially #2 (browser, tools). This design solves all four completely.

---

## Three Pillars

### 1. Progressive Autonomy Engine

The agent earns trust through a permission escalation system. Starts as a "smart butler," graduates to "chief of staff," then "autonomous teammate." Users control the dial. Every autonomous action is auditable, reversible, and explainable.

### 2. Universal Action Layer

Auxiora stops being a chatbot that *talks about* doing things and becomes an agent that *does* things. Calendar, email, code, infrastructure, smart home, finances — any system with an API becomes an action the agent can take.

### 3. Social Intelligence

Multi-user awareness (families, teams), agent-to-agent communication (your Auxiora talks to your coworker's), and workflow orchestration across people and systems. The agent becomes a coordination hub, not just a personal tool.

**Design principle:** Every impressive capability ships with visible safety. "Watch your agent deploy your code" is also "watch your agent ask for approval, explain its reasoning, and show you the rollback button."

---

## 1. Progressive Autonomy Engine — "Trust Levels"

This is the foundation everything else rests on. Without safe autonomy, the agent is just a fancy chatbot.

### Five Trust Levels

| Level | Name | What the agent can do | Example |
|-------|------|----------------------|---------|
| 0 | **Observer** | Watch, learn, suggest. Never acts. | "I noticed your CI failed 3 times today. Want me to look?" |
| 1 | **Assistant** | Acts when explicitly asked. Confirms every action. | "I'll draft that email. Here's the draft — send it?" |
| 2 | **Delegate** | Acts within pre-approved boundaries. Reports after. | Automatically triages low-priority emails, files expenses under $50 |
| 3 | **Operator** | Runs multi-step workflows autonomously. Asks on exceptions. | Deploys staging, runs tests, promotes to prod. Pauses if tests fail. |
| 4 | **Autonomous** | Pursues goals independently. Reports daily summaries. | "Keep the blog updated weekly" — it researches, drafts, publishes, tracks analytics |

### Trust Mechanics

**Trust is earned, not granted.** The system tracks every action's outcome. If the agent successfully handles 50 email triages at Level 2, it suggests promoting email to Level 3. If an autonomous deploy causes an incident, it auto-demotes that workflow to Level 2.

**Trust is granular.** Level 3 for code deploys, Level 1 for financial transactions, Level 0 for anything medical. Users set trust per-domain, per-integration, per-action type.

**Every action gets an audit trail:**
- Who authorized it (user or trust level)
- What trust level it executed at
- What the agent's reasoning was
- What actually happened (success/failure/partial)
- One-click rollback where possible

### Trust Data Model

```typescript
interface TrustLevel {
  level: 0 | 1 | 2 | 3 | 4;
  domain: string;              // 'email', 'code', 'finance', 'smart-home', '*'
  connector?: string;          // specific connector, or all
  action?: string;             // specific action, or all
  conditions?: TrustCondition[]; // 'only during business hours', 'max $50', etc.
  earnedAt: Date;
  evidence: TrustEvidence[];   // successful actions that earned this level
}

interface ActionAudit {
  id: string;
  timestamp: Date;
  trustLevel: number;
  domain: string;
  intent: string;              // what the user/agent wanted
  plan: ActionStep[];          // what steps were planned
  executed: ActionStep[];      // what actually happened
  outcome: 'success' | 'failure' | 'partial' | 'rolled_back';
  reasoning: string;           // agent's explanation
  rollbackAvailable: boolean;
  rollbackAction?: () => Promise<void>;
}
```

---

## 2. Universal Action Layer — "The Connector Framework"

This is what turns Auxiora from "can talk about things" into "can do things." The key insight: don't build 100 integrations — build a framework that makes any integration trivial.

### Action Flow

```
User: "Schedule lunch with Sarah on Thursday"
        |
        v
  Intent Parser (understands what action is needed)
        |
        v
  Action Planner (breaks into steps: check calendar, find slot, create event, notify Sarah)
        |
        v
  Connector Registry (routes each step to the right integration)
        |
        v
  Trust Gate (checks: does the agent have permission for this action at this trust level?)
        |
        v
  Execute + Audit (do it, log it, make it reversible)
```

### Connector Interface

```typescript
interface Connector {
  id: string;                        // 'google-workspace', 'github', 'homeassistant'
  name: string;
  description: string;
  auth: AuthConfig;                  // OAuth2, API key, token, etc.
  actions: ActionDefinition[];       // what it can do
  triggers: TriggerDefinition[];     // events it can watch
  entities: EntityDefinition[];      // what it knows about (calendars, repos, devices)
}

interface ActionDefinition {
  id: string;                        // 'create-event', 'send-email', 'toggle-light'
  description: string;
  inputSchema: ZodSchema;            // structured input
  outputSchema: ZodSchema;           // structured output
  trustMinimum: number;              // minimum trust level required (0-4)
  reversible: boolean;               // can this action be undone?
  reverseAction?: string;            // action ID to undo this
  sideEffects: string[];             // 'sends-email', 'modifies-data', 'costs-money'
}

interface TriggerDefinition {
  id: string;                        // 'new-email', 'pr-opened', 'motion-detected'
  description: string;
  eventSchema: ZodSchema;
  pollInterval?: number;             // for polling-based triggers
  webhook?: boolean;                 // for webhook-based triggers
}
```

### Built-in Connector Categories

**Productivity:**
- Google Workspace — Calendar, Gmail, Drive, Docs, Sheets
- Microsoft 365 — Outlook, OneDrive, Teams calendar
- Notion — Pages, databases, search
- Todoist / Linear / Jira — Task management
- Obsidian — Local notes via file system

**Developer:**
- GitHub / GitLab — Issues, PRs, Actions, deploys, code search
- AWS / GCP / Vercel / Netlify — Infrastructure management
- Datadog / PagerDuty — Monitoring and alerting
- Database connectors — Query, backup, migrate

**Life:**
- HomeAssistant — Smart home devices, scenes, automations
- Plaid — Banking, transactions, budgeting
- Spotify / Apple Music — Playback control, playlists
- Travel APIs — Flight search, booking, itineraries

**Files:**
- Google Drive, Dropbox, local filesystem (already built)

### Connector SDK

A connector is one file. Community contributes connectors via the existing plugin marketplace.

```typescript
// Example: Todoist connector
export default defineConnector({
  id: 'todoist',
  name: 'Todoist',
  auth: { type: 'oauth2', scopes: ['task:add', 'data:read'] },
  actions: [
    {
      id: 'create-task',
      description: 'Create a new task',
      trustMinimum: 1,
      reversible: true,
      reverseAction: 'delete-task',
      sideEffects: ['modifies-data'],
      inputSchema: z.object({ content: z.string(), dueDate: z.string().optional() }),
      execute: async (input, auth) => { /* API call */ },
    },
  ],
  triggers: [
    {
      id: 'task-completed',
      description: 'Fires when a task is marked complete',
      webhook: true,
      eventSchema: z.object({ taskId: z.string(), content: z.string() }),
    },
  ],
});
```

### Action Chaining

The real power is multi-connector workflows:

"When a GitHub issue is labeled 'urgent', create a Linear ticket, DM me on Slack, and block my calendar for focus time."

That's three connectors chained by the action planner. The intent parser decomposes the natural language, the action planner sequences the steps, and the trust gate validates each one.

---

## 3. Social Intelligence — "The Coordination Hub"

### Layer 1: Multi-User Awareness

One Auxiora instance, multiple people. Each person gets their own identity, memory, trust levels, and personality relationship — but the agent understands the group.

**Family mode:**
- "Remind everyone dinner is at 7" — the agent knows who "everyone" is and which channel each person prefers
- "What's on the kids' schedule tomorrow?" — aggregates from shared calendar
- Per-person personality adaptation — formal with dad, casual with the teenager

**Team mode:**
- Role-based permissions — developers can trigger deploys, PMs access project status, interns can only ask questions
- The agent enforces boundaries without being asked
- Shared project context, individual work preferences

**Memory boundaries:**
- Shared memory: team project context, group preferences, shared history
- Private memory: personal conversations, individual preferences, sensitive topics
- Users control what's shared vs. private
- The agent never leaks private memory into shared context

```typescript
interface UserIdentity {
  id: string;
  name: string;
  role: string;                    // 'admin', 'member', 'viewer', custom roles
  channels: ChannelBinding[];      // which channels this user talks on
  trustOverrides: TrustLevel[];    // per-user trust adjustments
  memoryPartition: 'private' | 'shared' | string; // custom partitions
  personalityRelationship: PersonalityState; // per-user adaptation
}
```

### Layer 2: Agent-to-Agent Protocol

Your Auxiora can talk to other Auxioras. An open protocol — like email but for AI agents.

**Use cases:**
- "Ask Sarah's agent when she's free for lunch" — your agent negotiates with hers, both check calendars, both propose times, humans just approve
- Cross-org workflows: "Send the signed contract to Acme Corp's agent for processing"
- Shared context: "Share my project brief with the team's agents so they have context"

**Protocol design:**

```typescript
interface AgentMessage {
  from: AgentIdentifier;           // auxiora://user@host
  to: AgentIdentifier;
  type: 'request' | 'response' | 'notification' | 'negotiation';
  intent: string;                  // 'schedule-meeting', 'share-document', 'request-approval'
  payload: unknown;
  signature: string;               // cryptographic signature for verification
  replyTo?: string;                // for conversation threading
  expires?: Date;                  // TTL for requests
}
```

Built on JSON-over-HTTPS. Any agent platform can implement it. Auxiora leads the standard, publishes the spec as an open RFC.

### Layer 3: Workflow Orchestration Across People

The agent coordinates humans, not just APIs.

- "Get design review from Alice, code review from Bob, then deploy when both approve"
- Tracks who's done what, sends reminders, escalates blockers
- Standup automation: collects status from each team member's agent, synthesizes a summary
- Deadline tracking: "The launch is Friday. Alice's designs are done, Bob's API is 80%, Carol hasn't started the docs. Want me to nudge Carol?"

```typescript
interface HumanWorkflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
  participants: UserIdentity[];
  status: 'active' | 'blocked' | 'completed';
  deadlines: Map<string, Date>;
  escalationPolicy: EscalationPolicy; // who to bug, when, how aggressively
}

interface WorkflowStep {
  id: string;
  assignee: string;                // user ID
  action: string;                  // 'review-design', 'approve-deploy', 'write-docs'
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  dependsOn: string[];             // other step IDs
  reminder: ReminderConfig;        // when and how to remind
}
```

---

## 4. The Wow Moments — "Built on Safety"

Every impressive demo simultaneously demonstrates control.

### Screen Awareness & Computer Use

Auxiora can see your screen (with permission) and operate your computer. Not just browser automation — full desktop control.

- "Fill out this expense report" — sees the form, types values, clicks submit
- "What am I looking at?" — screenshot analysis, context-aware help based on what's on screen
- "Walk me through setting up this AWS console" — sees your screen, gives step-by-step guidance with highlights

Built on the existing browser package, extended to native desktop via the Tauri shell. Uses vision models for screen understanding and the autonomy engine for safe execution.

### Real-Time Voice Conversations

Not voice-to-text-to-AI-to-text-to-voice. Actual fluid conversation with interruption, emotion awareness, natural pacing.

- **Conversation engine** handles turn-taking, interruption, filler words ("hmm, let me think about that...")
- Personality comes through in voice — the sarcastic template sounds different than the professional one
- "Hey Nova, while I'm driving, read me the important emails and draft replies I can approve later"
- Built on existing STT/TTS packages with a new conversation state machine

### Ambient Intelligence

The agent is always gently aware, never intrusively watching.

- **Pattern recognition:** "You always check Hacker News at 9am. Here's today's highlights."
- **Anticipation:** "You have a flight tomorrow. Here's your boarding pass, the weather at destination, and I've set an alarm for 5am."
- **Quiet confidence:** Most days it does nothing. When it acts, it's exactly right.
- **Morning briefings:** Personalized daily digest based on what the agent knows matters to you — pulled from calendar, email, project status, weather, news.

The ambient engine runs on a schedule (using the existing behaviors system) plus real-time triggers from connectors. It's the trust engine + connectors + memory working together.

---

## 5. Technical Architecture

Strategic expansion of the existing 32-package monorepo. No rewrites — new packages and targeted expansions.

### New Packages

```
packages/
  autonomy/       NEW — Trust engine, permission escalation, action audit, rollback
  connectors/     NEW — Connector SDK, registry, auth manager, action planner
  connector-*     NEW — Individual connectors (google-workspace, github, homeassistant, etc.)
  social/         NEW — Multi-user identity, shared/private memory boundaries, roles
  agent-protocol/ NEW — Agent-to-agent JSON-over-HTTPS protocol, discovery, negotiation
  workflows/      NEW — Cross-person workflow orchestration, approval chains, reminders
  screen/         NEW — Screen capture, OCR, desktop automation, visual reasoning
  conversation/   NEW — Real-time voice conversation engine, turn-taking, interruption
  ambient/        NEW — Pattern detection, anticipation engine, quiet notification system
  intent/         NEW — Natural language intent parsing, action decomposition, planning
```

### Expansions to Existing Packages

- `runtime/` — Becomes the autonomy-aware orchestration hub, trust gate on every action
- `memory/` — Shared vs. private memory partitioning, per-user memory contexts
- `audit/` — Full action audit trail with rollback metadata, trust level tracking
- `dashboard/` — Real-time activity feed, trust level controls, connector management, team views
- `cli/` — `auxiora connect`, `auxiora trust`, `auxiora team`, `auxiora workflow` commands
- `config/` — Trust level schemas, connector configs, multi-user config, agent protocol config
- `tools/` — Connector-backed tools auto-registered from connected services

**10 new packages, 7 expanded.** The existing architecture (providers, channels, plugins, personality, orchestrator) stays untouched and works as foundation.

### Data Flow (Updated)

```
User speaks on any channel
        |
        v
  Channel Adapter (Discord/Telegram/Slack/Web/Desktop/Voice)
        |
        v
  Gateway (auth + rate limit + user identification)
        |
        v
  Session Manager (load history + living memory + user identity)
        |
        v
  Intent Parser (classify: chat, action, workflow, ambient)
        |
   +----+----+----+
   |    |    |    |
 Chat Action Workflow Ambient
   |    |    |    |
   v    v    v    v
Model  Action  Workflow  Ambient
Router Planner Engine   Engine
   |    |    |    |
   +----+----+----+
        |
        v
  Trust Gate (check permission for every action)
        |
        v
  Execute (model call, connector action, human notification, or combination)
        |
        v
  Audit + Memory (log everything, extract memories, track trust outcomes)
        |
        v
  Response + Personality (format in agent's voice, through user's preferred channel)
```

---

## 6. Phased Roadmap

Each phase ships independently and delivers real value. Each builds on the last.

### Phase 12: "The Trust" (Foundation)

**Goal:** Safe autonomy engine that makes everything else possible.

| Package | Status | Deliverable |
|---|---|---|
| `@auxiora/autonomy` | NEW | Trust engine — 5 levels, per-domain granularity, earned escalation, auto-demotion |
| `@auxiora/autonomy` | NEW | Action audit trail with reasoning, outcome tracking, one-click rollback |
| `@auxiora/intent` | NEW | Intent parser — natural language to structured action plans |
| `@auxiora/audit` | Expand | Trust metadata, rollback support, action outcome tracking |
| `@auxiora/dashboard` | Expand | Trust level controls UI, action activity feed, audit viewer |
| `@auxiora/cli` | Expand | `auxiora trust` commands (view, set, history, promote, demote) |
| `@auxiora/config` | Expand | Trust level schemas, intent parser config |

**Success metric:** User sets trust level 2 for email, agent triages 50 emails correctly, system suggests promoting to level 3.

### Phase 13: "The Hands" (Connectors)

**Goal:** The agent can actually do things in the real world.

| Package | Status | Deliverable |
|---|---|---|
| `@auxiora/connectors` | NEW | Connector SDK, registry, auth manager (OAuth2 flows, token refresh) |
| `@auxiora/connectors` | NEW | Action planner — decompose intent into multi-step connector chains |
| `connector-google-workspace` | NEW | Calendar, Gmail, Drive, Docs |
| `connector-github` | NEW | Issues, PRs, Actions, deploys, code search |
| `connector-homeassistant` | NEW | Devices, scenes, automations |
| `connector-notion` | NEW | Pages, databases, search |
| `connector-linear` | NEW | Issues, projects, cycles |
| `@auxiora/cli` | Expand | `auxiora connect` commands (add, list, test, remove) |
| `@auxiora/dashboard` | Expand | Connector management UI, OAuth flow handler |
| `@auxiora/marketplace` | Expand | Connector category in marketplace |

**Success metric:** "Schedule lunch with Sarah on Thursday" actually checks calendar, finds a slot, creates the event, and sends an invite — all through the trust gate.

### Phase 14: "The Team" (Social)

**Goal:** Auxiora works with groups of people, not just individuals.

| Package | Status | Deliverable |
|---|---|---|
| `@auxiora/social` | NEW | Multi-user identity, roles, permissions, user switching |
| `@auxiora/memory` | Expand | Shared vs. private memory partitioning, per-user contexts |
| `@auxiora/workflows` | NEW | Cross-person workflow engine, approval chains, reminders, escalation |
| `@auxiora/agent-protocol` | NEW | Agent-to-agent protocol spec, discovery, message signing, negotiation |
| `@auxiora/dashboard` | Expand | Team views, user management, workflow builder, agent directory |
| `@auxiora/cli` | Expand | `auxiora team` and `auxiora workflow` commands |
| `@auxiora/config` | Expand | Multi-user config, agent protocol config, workflow schemas |

**Success metric:** "Get design review from Alice, code review from Bob, then deploy when both approve" — the agent tracks the workflow, sends reminders, and only deploys after both humans approve.

### Phase 15: "The Senses" (Wow)

**Goal:** The agent perceives and interacts with the world naturally.

| Package | Status | Deliverable |
|---|---|---|
| `@auxiora/screen` | NEW | Screen capture, OCR, desktop automation, visual reasoning via vision models |
| `@auxiora/conversation` | NEW | Real-time voice conversation engine, turn-taking, interruption handling, natural pacing |
| `@auxiora/ambient` | NEW | Pattern detection from usage data, anticipation engine, quiet notification system, morning briefings |
| `@auxiora/desktop` | Expand | Screen sharing permission, ambient tray indicators, voice activation |
| `@auxiora/personality` | Expand | Voice personality profiles (tone, pace, filler words per template) |
| `@auxiora/voice` | Expand | Streaming bidirectional audio, voice activity detection |

**Success metric:** User says "Hey Nova, what am I looking at?" — the agent captures the screen, understands the context, and gives relevant help in a natural voice conversation.

### Timeline Summary

```
Phase 12: "The Trust"    Autonomy engine, trust levels, intent parsing
Phase 13: "The Hands"    Connector framework, 5 built-in connectors
Phase 14: "The Team"     Multi-user, agent protocol, workflow orchestration
Phase 15: "The Senses"   Screen awareness, voice conversations, ambient intelligence
```

Each phase builds on the last. Trust enables connectors (safe actions). Connectors enable social workflows (coordinated actions). Social + connectors enable the wow moments (ambient actions that are safe by default).

---

**The north star:** Auxiora goes from "the best AI chatbot" to "the AI agent that actually lives in your world." Not a tool you open — a presence that's always there, always helpful, always earning your trust.
