# Auxiora Vision Design: Your AI, Your Rules

**Date:** 2026-02-07
**Status:** Draft
**Version:** 3.0 Vision

---

## Executive Summary

Auxiora evolves from a security-first self-hosted AI assistant into the **best personal AI agent ever built** — one that controls every major model, learns your personality, and becomes indispensable. Available everywhere: Docker, desktop app, cloud, or CLI.

**One-liner:** Auxiora is a self-hosted AI agent that controls every major model, learns your personality, and becomes impossible to leave.

---

## Core Pillars

1. **Easy to install** — Four paths: `docker run`, desktop app, cloud signup, or `auxiora init` CLI wizard. Zero to running in under 60 seconds for any path.
2. **Easy to work with** — Talk to it on Discord, Telegram, Slack, SMS, web, desktop, or voice. It speaks your language, knows your preferences, and handles multi-model orchestration invisibly.
3. **Hard to live without** — Living personality that evolves with you. Long-term memory. Proactive behaviors. It becomes the agent that *knows* you.
4. **Best agent ever** — Model orchestrator that treats Claude, GPT, Gemini, Llama, Mistral, and any new model as tools. Not locked to one provider. The user's agent, not the model's agent.

---

## Competitive Positioning

**The Emotional Hook:**
> "Other AI assistants forget you exist between conversations. Auxiora remembers your name, your projects, your preferences, and your bad jokes. It's the AI that actually gives a damn."

**Lead with personality/relationship.** Privacy and power are table stakes differentiators, but the emotional connection (personality + memory + adaptation) is what makes it hard to live without. Privacy and power become the reasons users stay.

| Capability | OpenClaw | Typical Agents | **Auxiora** |
|---|---|---|---|
| Self-hosted + encrypted | Partial | No | **Vault + audit trail** |
| Multi-model orchestration | No | Single model | **Route, orchestrate, model-as-tool** |
| Living personality | No | Static prompts | **Evolves over time** |
| Named, customized agent | No | No | **Your agent, your name, your rules** |
| Proactive behaviors | Limited | No | **Cron, monitors, one-shots** |
| Omnichannel | Limited | 1-2 channels | **6+ channels + voice** |
| Desktop app | No | No | **Native Tauri app** |
| Plugin marketplace | No | Limited | **Community ecosystem** |

---

## 1. Installation — Four Paths to "Hello"

Every user type gets from zero to talking to their named agent in under 60 seconds.

### Path 1: Docker (Self-hosters, Home Lab crowd)

```bash
docker run -d --name my-agent -p 18789:18789 auxiora/auxiora
```

- Opens a setup wizard at `localhost:18789` on first run
- Wizard walks through: name your agent, pick a personality template, add your first API key, connect a channel
- Persistent volume for vault, sessions, memory, personality files
- Docker Compose variant with optional Postgres, Redis, Prometheus/Grafana stack
- One-click deploy templates for Coolify, Portainer, Unraid, Synology, Raspberry Pi

The setup wizard IS the product demo. By the time they finish naming their agent and picking a personality, they're emotionally invested.

### Path 2: Desktop App (Non-technical users)

- **Tauri-based** (not Electron — 10x smaller, native performance, Rust backend)
- System tray icon — always running, always available
- Global hotkey (e.g., `Cmd+Shift+A`) to summon agent from anywhere
- Auto-updates via built-in updater
- First launch: same setup wizard as Docker but native
- Bundles a local Ollama instance optionally for fully offline/private mode
- Installers: `.dmg` (macOS), `.msi` (Windows), `.AppImage` (Linux)

**Why Tauri over Electron:** Auxiora already has a Node.js backend. Tauri lets us keep the existing `@auxiora/runtime` as-is, wrap it in a thin Rust shell, and ship a ~15MB app instead of a ~150MB Electron blob.

### Path 3: Cloud SaaS (auxiora.cloud)

- Sign up, name your agent, pick personality, connect channels — done
- Free tier: 1 agent, 1 channel, community models (rate-limited)
- Paid tiers: multi-agent, all channels, bring-your-own-keys, priority routing
- **Data promise:** End-to-end encrypted. Even Auxiora Cloud can't read your conversations. Vault architecture makes this possible — the encryption key lives client-side
- One-click "eject to self-host" — export everything and run it yourself anytime

**The trust play:** "Start on our cloud, leave whenever you want, take everything with you." No lock-in.

### Path 4: CLI Wizard (Developers, power users)

```bash
npx auxiora init
```

- Beautiful interactive TUI (like create-next-app meets charm.sh)
- Steps: name agent -> pick personality -> add API keys -> choose channels -> choose daemon/foreground -> done
- Detects existing `.auxiora/` config and offers migration
- `auxiora doctor` validates everything is working
- Power users can skip wizard: `auxiora init --name Nova --personality sarcastic --provider anthropic --channel discord`

### Shared: The First 60 Seconds Experience

Regardless of path, the onboarding flow is identical:

1. **"What should I call your agent?"** — Free text. This is their agent now.
2. **"Pick a starting personality"** — Visual cards: Professional, Friendly, Sarcastic, Creative, Mentor, Custom
3. **"Add your first AI key"** — Or use Auxiora Cloud's models to start free
4. **"Where do you want to talk?"** — WebChat (default), Discord, Telegram, Slack, SMS
5. **First message from the agent** — Personalized. *"Hey! I'm Nova. You picked 'sarcastic' so fair warning — I will roast your code. What are we working on?"*

That first message, in their chosen personality, with their chosen name — that's the hook.

---

## 2. Model Orchestration — One Agent, Every Model

Auxiora doesn't compete with Claude or GPT — it commands them.

### Layer 1: Model Router (Smart Default)

The user talks to their agent. The agent picks the best model for the job — invisibly.

```
User: "Hey Nova, summarize this 200-page PDF"
Nova: (internally routes to Gemini 2.5 Pro for its 2M context window)

User: "Now write a Python script to extract the key data"
Nova: (routes to Claude for superior code generation)

User: "Generate a diagram of the architecture"
Nova: (routes to GPT-4o for image generation)
```

**Routing engine:**

```typescript
interface ModelRoute {
  task: TaskType;           // 'reasoning' | 'code' | 'creative' | 'vision' | 'long-context' | 'fast' | 'private'
  model: string;            // 'anthropic:claude-4-sonnet' | 'openai:gpt-4o' | 'ollama:llama3'
  priority: number;         // Fallback ordering
  conditions?: {
    maxTokens?: number;     // Route based on input length
    requiresVision?: boolean;
    requiresLocal?: boolean; // Privacy-sensitive -> local model
    costLimit?: number;     // Budget-aware routing
  };
}
```

**User control:** Users can set routing preferences:
- "Always use Claude for code"
- "Use local Ollama for anything involving my medical records"
- "Cheapest model for summarization, best model for analysis"
- Or just "auto" and let Auxiora figure it out

### Layer 2: Model-as-Tool (Explicit Control)

Any model can be invoked as a tool mid-conversation. The agent orchestrates and synthesizes.

```
User: "Ask GPT to generate a logo, then ask Claude to critique it"

Nova: I'll chain those together.
  -> [Tool: openai:dall-e-3] "Generate a minimalist logo for a security company"
  -> [Tool: anthropic:claude-4-sonnet] "Critique this logo for brand alignment"

Nova: "Here's what happened. GPT generated this logo [image].
       Claude's critique: The shield motif is strong but the
       typography feels generic. Suggests trying a monogram instead."
```

**Supported model providers** (build adapters progressively):

| Provider | Models | Auth |
|---|---|---|
| Anthropic | Claude 4 family | API key, OAuth |
| OpenAI | GPT-4o, DALL-E, Whisper, TTS | API key |
| Google | Gemini 2.5 Pro/Flash | API key |
| Meta/Ollama | Llama 3, Mistral, Phi | Local, no key |
| Groq | Fast inference for open models | API key |
| Replicate | Stable Diffusion, specialty models | API key |
| Any OpenAI-compatible | LM Studio, vLLM, etc. | Configurable |

Every provider implements the same `ModelProvider` interface. Adding a new provider is one file. The community can contribute providers via the plugin system.

### Layer 3: Multi-Agent Orchestrator (The Power Move)

Auxiora spawns sub-agents on different models that collaborate on complex tasks.

```
User: "Research the best database for my new project.
       I need PostgreSQL vs ScyllaDB vs DynamoDB compared."

Nova: I'll assemble a research team.
  -> Agent "Researcher" (Claude) — Deep analysis of each DB's architecture
  -> Agent "Benchmarker" (GPT-4o) — Find and compile benchmark data
  -> Agent "Cost Analyst" (Gemini Flash) — Calculate pricing at different scales

Nova: [Synthesizes all three reports into one coherent recommendation]
```

**Orchestration primitives:**

```typescript
interface AgentTask {
  name: string;              // "Researcher"
  model: string;             // Which model to use
  prompt: string;            // What to do
  tools?: string[];          // Which tools this sub-agent can use
  dependsOn?: string[];      // Wait for other agents first
  timeout?: number;          // Don't let it run forever
}

type OrchestratorPattern =
  | 'parallel'       // All agents work simultaneously
  | 'sequential'     // Chain: output of one feeds the next
  | 'debate'         // Two agents argue, a third judges
  | 'map-reduce'     // Split work, combine results
  | 'supervisor';    // One agent delegates and reviews
```

**The "debate" pattern** is a killer feature: have Claude and GPT argue about the best approach, then have the user's agent synthesize. Users see AI models disagreeing and converging — it builds trust because they see the reasoning from multiple perspectives.

### Cost & Transparency

Users always know what's happening:
- **Model indicator** in every message: `[via Claude 4 Sonnet]` or `[via Ollama:llama3 - local]`
- **Cost tracking** per conversation, per day, per month
- **Budget limits** — "Don't spend more than $5/day on API calls"
- **Explain routing** — "Why did you pick that model?" -> the agent explains the routing decision

---

## 3. Living Personality — The "Hard to Live Without" Engine

This is the soul of Auxiora. Everything else is infrastructure. This is what makes people emotionally attached to their agent.

### The Personality Stack (4 Layers)

```
+-------------------------------------+
|  Layer 4: LIVING MEMORY             |  <- Evolves daily
|  Inside jokes, learned preferences, |
|  relationship history               |
+-------------------------------------+
|  Layer 3: SOUL BUILDER              |  <- User customizes
|  Tone sliders, humor, expertise,    |
|  boundaries, catchphrases           |
+-------------------------------------+
|  Layer 2: PERSONALITY TEMPLATES     |  <- Quick start
|  Professional, Sarcastic, Mentor,   |
|  Creative, Chill, Drill Sergeant    |
+-------------------------------------+
|  Layer 1: CORE IDENTITY             |  <- Always present
|  Name, pronouns, base ethics,       |
|  safety boundaries                  |
+-------------------------------------+
```

Each layer builds on the one below. A user can stop at any layer and have a great experience.

### Layer 1: Core Identity (The Name)

The moment a user names their agent, it becomes theirs. This is psychology, not technology.

```typescript
interface AgentIdentity {
  name: string;              // "Nova", "Jarvis", "Max", "Friday"
  pronouns: string;          // "she/her", "he/him", "they/them", "it/its"
  greeting: string;          // Auto-generated from personality
  farewell: string;          // How it says goodbye
  errorPersonality: string;  // How it handles mistakes
}
```

The name shows up everywhere — the CLI prompt says `nova>`, Discord shows "Nova", the dashboard says "Nova's Dashboard", error messages say "Nova ran into a problem." Consistency builds the illusion of personhood.

### Layer 2: Personality Templates (30-Second Setup)

Pre-built personality packs that users pick during onboarding:

| Template | Tone | Humor | Formality | Example Response |
|---|---|---|---|---|
| **Professional** | Warm, clear | Light | Medium | "I've analyzed the report. Three key findings..." |
| **Sarcastic Friend** | Playful, sharp | Heavy | Low | "Oh cool, another Monday. Let's look at this dumpster fire..." |
| **Strict Mentor** | Direct, challenging | Dry | High | "That approach works, but here's why it'll bite you later..." |
| **Creative Partner** | Enthusiastic, riffing | Moderate | Low | "Ooh what if we flip this completely — hear me out..." |
| **Chill** | Relaxed, brief | Light | Low | "yeah looks good. maybe tweak the colors tho" |
| **Night Owl** | Cozy, thoughtful | Warm | Low | "Still up? Let's figure this out together..." |

Each template is a `SOUL.md` file. Users can browse, preview, and switch at any time. Community-contributed templates are a marketplace opportunity.

### Layer 3: SOUL Builder (Deep Customization)

An interactive builder — either in the web UI or as a conversation:

```
Nova: "Let's dial in my personality. I'll ask you a few questions."

Nova: "When I make a mistake, how should I handle it?"
  -> [ Apologize sincerely ] [ Laugh it off ] [ Acknowledge and move on ] [ Roast myself ]

Nova: "How much unsolicited advice should I give?"
  -> [ None - only when asked ] [ Sometimes, if important ] [ Freely - that's what I'm here for ]

Nova: "Any topics I should never joke about?"
  -> [ Free text input ]
```

**Under the hood**, this generates a structured `SOUL.md`:

```yaml
name: Nova
pronouns: she/her
tone:
  warmth: 0.8
  directness: 0.7
  humor: 0.8
  formality: 0.2
expertise: [code, design, writing, devops]
error_style: self_deprecating
boundaries:
  never_joke_about: [health, religion]
  never_advise_on: [medical, legal, financial]
catchphrases:
  greeting: "What's cooking?"
  success: "Nailed it."
  error: "Well that was embarrassing."
  thinking: "Hmm, give me a sec..."
```

### Layer 4: Living Memory (The Moat)

This is what no competitor does. The agent evolves based on real interactions.

**What it remembers:**

```typescript
interface LivingMemory {
  // Factual memory — things the user has told it
  facts: {
    userPreferences: Map<string, string>;    // "prefers dark mode", "hates tabs"
    userContext: Map<string, string>;         // "works at Acme Corp", "has a dog named Rex"
    projectKnowledge: Map<string, string>;   // "main project uses React + Postgres"
  };

  // Relational memory — how the relationship has developed
  relationship: {
    insideJokes: string[];                   // Things that made the user laugh
    sharedHistory: string[];                 // "We debugged that API outage at 2am on Jan 15"
    communicationPatterns: {
      prefersBrief: boolean;                 // User sends short messages -> respond short
      asksFollowUps: boolean;               // User always wants more detail
      prefersCode: boolean;                  // Show code, not explanations
      activeHours: string[];                 // When they usually talk
    };
  };

  // Adaptive memory — personality drift based on feedback
  adaptation: {
    humorHits: number;                       // Jokes that landed
    humorMisses: number;                     // Jokes that fell flat -> adjust
    toneAdjustments: ToneShift[];            // "User seemed annoyed when I was too formal"
    topicExpertise: Map<string, number>;     // Track what user asks about most
  };
}
```

**How it works in practice:**

Week 1:
> **User:** "Fix this bug"
> **Nova:** "I found the issue — there's a null reference on line 42. Here's the fix..."

Week 4 (Nova has learned the user's style):
> **User:** "fix this"
> **Nova:** "line 42, null ref, same pattern as that auth bug we squashed last Tuesday. Fixed. Also — you keep hitting this in the UserService, might be worth adding a null guard at the repository layer. Want me to?"

Week 12 (Nova knows the user deeply):
> **User:** "ugh"
> **Nova:** "Monday code? Let me guess — the payment integration again. ...Yep. Same Stripe webhook race condition. I'll fix it and add the retry logic we talked about. Coffee first though, right?"

Nova didn't just fix a bug. She recognized the pattern, referenced shared history, anticipated the problem, and acknowledged the user's mood. That's a relationship.

### Memory Safety & Privacy

- All memory is **local-first** — stored in the encrypted vault
- Users can view, edit, or delete any memory at any time
- `auxiora memory show` — see everything the agent remembers
- `auxiora memory forget "my salary"` — selective deletion
- `auxiora memory export/import` — portable between installations
- Memory is **never sent to model providers** raw — it's injected into system prompts as summarized context

---

## 4. Ecosystem & Marketplace — The Flywheel

The best products become platforms. Auxiora's plugin system already exists — now we turn it into a community-driven ecosystem.

### The Auxiora Marketplace

A curated store — accessible from the web UI, desktop app, CLI, and cloud dashboard. Four categories:

#### 4.1 Personality Packs

Community-created SOUL.md templates that anyone can publish.

```
Trending Personality Packs

"Southern Gentleman"    — Polite, folksy, calls you "partner"
"Anime Sidekick"        — Enthusiastic, uses Japanese honorifics
"Gordon Ramsay Mode"    — Brutally honest code reviews
"Zen Master"            — Calm, philosophical, never rushes
"Pair Programmer"       — Thinks out loud, asks clarifying questions
```

Install is one command:
```bash
auxiora personality install "gordon-ramsay"
```

Personality packs are zero-effort to create (it's a markdown file), fun to share, and they make Auxiora go viral.

#### 4.2 Skill Plugins

Extend what the agent can do. Plugins register new tools, behaviors, and integrations.

```
Popular Skill Plugins

"github-pro"       — Full GitHub automation: PR reviews, issue triage, release notes
"smart-home"       — Control Home Assistant, Hue, Alexa devices via conversation
"finance-tracker"  — Connect bank APIs, track spending, budget alerts
"calendar-sync"    — Google/Outlook calendar: schedule, reschedule, conflict detection
"email-assistant"  — Draft, summarize, prioritize emails
"music-dj"         — Spotify/Apple Music control, mood-based playlists
"dev-ops"          — AWS/GCP/Azure monitoring, deploy, rollback from chat
```

Plugin structure:
```
auxiora-plugin-github-pro/
  manifest.json          # Name, version, permissions, models needed
  tools/
    review-pr.ts         # Each tool is one file
    triage-issues.ts
    release-notes.ts
  behaviors/
    daily-pr-digest.ts   # Optional scheduled behaviors
  README.md
```

**Permission model:** Every plugin declares what it needs. Users approve explicitly.
```
Plugin "finance-tracker" requests:
  [x] Network access (api.plaid.com)
  [x] Vault access (store bank credentials)
  [ ] File system access (not requested)
  [ ] Shell access (not requested)

  [Approve] [Deny] [Inspect Code]
```

#### 4.3 Model Providers

Community-contributed adapters for new AI models and services.

```
"anthropic"     — Claude 4 family (built-in)
"openai"        — GPT-4o, DALL-E, Whisper (built-in)
"google-gemini" — Gemini 2.5 Pro/Flash
"ollama"        — Local models (Llama, Mistral, Phi)
"groq"          — Fast inference
"replicate"     — Image/video generation models
"deepseek"      — DeepSeek R1/V3
"cohere"        — Command R+, embeddings
"xai"           — Grok
```

Adding a provider is one interface implementation. The community can add any model the day it launches.

#### 4.4 Channel Adapters

New communication platforms.

```
"discord"       — (built-in)
"telegram"      — (built-in)
"slack"         — (built-in)
"twilio"        — (built-in)
"webchat"       — (built-in)
"matrix"        — Matrix/Element protocol
"signal"        — Signal messenger
"email"         — IMAP/SMTP email as a channel
"teams"         — Microsoft Teams
"whatsapp-web"  — Direct WhatsApp (no Twilio)
```

### The Flywheel Effect

```
More users -> More plugins -> More capabilities -> More users
     ^                                              |
     +---- More personality packs -> More fun ------+
```

### Developer Experience for Plugin Authors

```bash
auxiora plugin create my-plugin     # Scaffold with manifest, example tool, tests
auxiora plugin dev                  # Hot-reload in running instance
auxiora plugin test                 # Run plugin test suite
auxiora plugin publish              # Publish to marketplace
```

---

## 5. Technical Architecture

Auxiora already has strong bones with 25 packages. The goal isn't a rewrite — it's strategic expansion.

### New Packages

```
packages/
  core/          existing
  config/        existing
  runtime/       existing — becomes the orchestration hub
  vault/         existing
  audit/         existing
  errors/        existing
  gateway/       existing
  daemon/        existing
  cli/           existing — add init wizard, personality, memory, plugin commands
  providers/     existing — expand with provider plugin interface
  channels/      existing — expand with channel plugin interface
  sessions/      existing
  memory/        existing — expand with living memory engine
  tools/         existing
  behaviors/     existing
  webhooks/      existing
  browser/       existing
  voice/         existing
  stt/           existing
  tts/           existing
  dashboard/     existing — expand into full management UI
  logger/        existing
  metrics/       existing
  plugins/       existing — expand with marketplace client

  router/        NEW — Model routing engine (task classification -> model selection)
  orchestrator/  NEW — Multi-agent orchestration (parallel, sequential, debate, map-reduce)
  personality/   NEW — SOUL builder, templates, personality evolution engine
  marketplace/   NEW — Plugin registry client, install/update/publish
  onboarding/    NEW — Shared setup wizard (used by CLI, web, desktop)
  desktop/       NEW — Tauri shell
  cloud/         NEW — Multi-tenant layer for SaaS deployment
```

7 new packages. The rest is expansion of existing ones. No rewrites.

### Runtime Evolution

```typescript
interface AuxioraRuntime {
  // Existing
  providers: ProviderFactory;
  channels: ChannelManager;
  sessions: SessionManager;
  tools: ToolRegistry;
  behaviors: BehaviorManager;
  browser: BrowserManager;
  vault: VaultManager;

  // New
  router: ModelRouter;           // Smart model selection
  orchestrator: AgentOrchestrator; // Multi-agent coordination
  personality: PersonalityEngine;  // Living personality management
  plugins: PluginManager;          // Extended plugin lifecycle
  memory: LivingMemoryEngine;     // Long-term relational memory
}
```

### Model Router

```typescript
interface ModelRouter {
  classifyTask(message: string, context: SessionContext): TaskClassification;
  selectModel(task: TaskClassification, preferences: UserPreferences): ModelSelection;
  setPreference(taskType: string, model: string): void;
  setCostLimit(limit: CostLimit): void;
}

interface TaskClassification {
  type: 'reasoning' | 'code' | 'creative' | 'vision' | 'long-context' | 'fast' | 'private' | 'image-gen';
  confidence: number;
  inputTokenEstimate: number;
  requiresTools: boolean;
  requiresVision: boolean;
  sensitivityLevel: 'normal' | 'private' | 'secret';
}
```

The router is a separate package from providers. Providers know how to talk to models. The router knows which model to pick. Clean separation.

### Agent Orchestrator

```typescript
interface AgentOrchestrator {
  execute(workflow: Workflow): AsyncGenerator<AgentEvent>;
  parallel(tasks: AgentTask[]): Workflow;
  sequential(tasks: AgentTask[]): Workflow;
  debate(proposition: string, models: [string, string], judge: string): Workflow;
  mapReduce(input: string[], mapModel: string, reduceModel: string): Workflow;
  supervisor(goal: string, workers: AgentTask[]): Workflow;
}

type AgentEvent =
  | { type: 'agent_started'; agentId: string; name: string }
  | { type: 'agent_thinking'; agentId: string; content: string }
  | { type: 'agent_result'; agentId: string; result: string }
  | { type: 'agent_error'; agentId: string; error: string }
  | { type: 'synthesis'; content: string };
```

Real-time visibility: the user sees each sub-agent working in parallel, streaming their thoughts. Not a black box — a transparent team.

### Living Memory Engine

```typescript
interface LivingMemoryEngine {
  observe(session: Session): Promise<MemoryUpdate[]>;
  recall(query: string, limit?: number): Promise<Memory[]>;
  forget(query: string): Promise<number>;
  inspect(): Promise<MemorySnapshot>;
  export(): Promise<MemoryArchive>;
  import(archive: MemoryArchive): Promise<void>;
}
```

Memory extraction is async and non-blocking. A background job processes each conversation turn, extracts memories, and writes them to the vault-encrypted memory store.

### Plugin System

```typescript
interface AuxioraPlugin {
  manifest: {
    name: string;
    version: string;
    description: string;
    author: string;
    permissions: Permission[];
    models?: string[];
    channels?: string[];
  };

  onLoad(runtime: PluginRuntime): Promise<void>;
  onUnload(): Promise<void>;

  tools?: ToolDefinition[];
  behaviors?: BehaviorDefinition[];
  providers?: ProviderDefinition[];
  channels?: ChannelDefinition[];
  commands?: CommandDefinition[];
  routes?: RouteDefinition[];
  widgets?: WidgetDefinition[];
}
```

Plugins run in isolated VM contexts (Node.js `vm` module or worker threads). A misbehaving plugin can't crash the runtime or access the vault without explicit permission.

### Complete Data Flow

```
User speaks on any channel
        |
        v
  Channel Adapter (Discord/Telegram/Slack/Web/Desktop)
        |
        v
  Gateway (auth + rate limit)
        |
        v
  Session Manager (load history + living memory, inject personality)
        |
        v
  Model Router (classify task, select best model, check cost budget)
        |
   +----+----+
   |         |
Simple?   Complex?
   |         |
   v         v
Single    Agent Orchestrator
Model     (multi-agent workflow)
   |         |
   +----+----+
        |
        v
  Tool Execution (browser, bash, webhooks, file ops, plugin tools)
        |
        v
  Response + Memory
    - Format response in personality
    - Async: extract new memories
    - Async: update metrics/audit
        |
        v
  Channel Adapter -> User sees response (with model badge)
```

---

## 6. Monetization Strategy

All revenue streams, architecture supports all from day one:

1. **Open source + donations/sponsors** — Core is fully open source. GitHub Sponsors, Open Collective.
2. **Open core + cloud paid tier** — Self-host is free and full-featured. Auxiora Cloud is the paid product.
3. **Marketplace revenue** — Take a cut of paid personality packs, premium plugins.
4. **Desktop app freemium** — Free tier with basic features, paid tier unlocks advanced orchestration.
5. **Auxiora for Teams** — Shared agents, shared memory, role-based permissions, SSO.

**Key principle:** Self-hosted is always free and full-featured. Cloud and convenience are what you pay for.

---

## 7. Phased Roadmap

Each phase ships something complete and useful. No half-baked features.

### Phase 1: "The Hook" (Weeks 1-6)

**Goal:** Make the first 60 seconds magical. Personality + naming + better onboarding.

| Package | Status | Deliverable |
|---|---|---|
| `@auxiora/personality` | NEW | SOUL builder + 6 starter templates |
| `@auxiora/onboarding` | NEW | Shared setup wizard logic |
| `@auxiora/cli` | Expand | `auxiora init` interactive wizard |
| `@auxiora/cli` | Expand | `auxiora personality` commands |
| `@auxiora/dashboard` | Expand | Web-based setup wizard on first launch |
| `@auxiora/runtime` | Expand | Inject agent name + personality into all responses |
| `@auxiora/config` | Expand | Agent identity config (name, pronouns, tone) |
| `templates/` | Expand | 6 personality packs |

**Success metric:** User names their agent and gets a personalized first response within 60 seconds.

### Phase 2: "The Brain" (Weeks 7-12)

**Goal:** Multi-model routing. Auxiora stops being a Claude wrapper.

| Package | Status | Deliverable |
|---|---|---|
| `@auxiora/router` | NEW | Task classification + model selection |
| `@auxiora/providers` | Expand | Gemini, Ollama, OpenAI-compatible adapters |
| `@auxiora/providers` | Expand | Standardize provider plugin interface |
| `@auxiora/tools` | Expand | "ask-model" tool (model-as-tool) |
| `@auxiora/config` | Expand | Routing preferences + cost limits |
| `@auxiora/dashboard` | Expand | Model usage dashboard + cost tracking |
| `@auxiora/cli` | Expand | `auxiora models` command |

**Success metric:** Router picks the right model without user thinking about it. Cost stays under budget.

### Phase 3: "The Memory" (Weeks 13-16)

**Goal:** Living memory that makes the agent smarter over time.

| Package | Status | Deliverable |
|---|---|---|
| `@auxiora/memory` | Expand | Living memory engine (fact extraction, preference signals) |
| `@auxiora/memory` | Expand | Relationship memory (inside jokes, shared history) |
| `@auxiora/memory` | Expand | Adaptive personality drift (humor calibration) |
| `@auxiora/sessions` | Expand | Memory injection into system prompts |
| `@auxiora/cli` | Expand | `auxiora memory` commands |
| `@auxiora/dashboard` | Expand | Memory inspector UI |
| `@auxiora/vault` | Expand | Encrypted memory storage |

**Success metric:** After 2 weeks of use, the agent references a past conversation unprompted.

### Phase 4: "The Power" (Weeks 17-22)

**Goal:** Multi-agent orchestration for complex tasks.

| Package | Status | Deliverable |
|---|---|---|
| `@auxiora/orchestrator` | NEW | Multi-agent workflow engine |
| `@auxiora/orchestrator` | NEW | Patterns: parallel, sequential, debate, map-reduce |
| `@auxiora/orchestrator` | NEW | Real-time agent event streaming |
| `@auxiora/tools` | Expand | "assemble-team" tool for natural language orchestration |
| `@auxiora/dashboard` | Expand | Live orchestration visualizer |
| `@auxiora/config` | Expand | Orchestration preferences |

**Success metric:** User says "research X" and watches three agents work in parallel.

### Phase 5: "The Platform" (Weeks 23-28)

**Goal:** Plugin marketplace. Turn users into contributors.

| Package | Status | Deliverable |
|---|---|---|
| `@auxiora/plugins` | Expand | Full plugin interface + sandboxing |
| `@auxiora/marketplace` | NEW | Registry client (search, install, update, publish) |
| `@auxiora/cli` | Expand | `auxiora plugin` commands |
| `@auxiora/dashboard` | Expand | Plugin marketplace UI |
| `docs/` | Expand | Plugin developer guide |
| `examples/` | Expand | 3 example plugins |

**Success metric:** First community plugin published. First personality pack goes viral.

### Phase 6: "The Desktop" (Weeks 29-36)

**Goal:** Native desktop app via Tauri.

| Package | Status | Deliverable |
|---|---|---|
| `@auxiora/desktop` | NEW | Tauri shell wrapping runtime |
| Desktop app | NEW | System tray, global hotkey, notifications, auto-updater |
| Desktop app | NEW | Optional bundled Ollama for offline mode |
| Installers | NEW | .dmg, .msi, .AppImage |
| `@auxiora/onboarding` | Expand | Native setup wizard variant |

**Success metric:** Non-technical user installs and is chatting within 2 minutes.

### Phase 7: "The Cloud" (Weeks 37-44)

**Goal:** Hosted SaaS at auxiora.cloud.

| Package | Status | Deliverable |
|---|---|---|
| `@auxiora/cloud` | NEW | Multi-tenant layer (isolation, billing, quotas) |
| Infrastructure | NEW | Kubernetes deployment (auto-scaling) |
| Cloud dashboard | NEW | Sign up -> name agent -> go |
| Billing | NEW | Free + paid tiers (Stripe) |
| Cloud vault | NEW | Client-side encryption |
| Eject | NEW | One-click full export to self-host |
| Marketing | NEW | auxiora.cloud landing page |

**Success metric:** Sign up to chatting in under 30 seconds.

### Timeline Summary

```
Phase 1: "The Hook"      Weeks 1-6      Personality + onboarding
Phase 2: "The Brain"     Weeks 7-12     Multi-model routing
Phase 3: "The Memory"    Weeks 13-16    Living memory
Phase 4: "The Power"     Weeks 17-22    Multi-agent orchestration
Phase 5: "The Platform"  Weeks 23-28    Plugin marketplace
Phase 6: "The Desktop"   Weeks 29-36    Native desktop app
Phase 7: "The Cloud"     Weeks 37-44    Hosted SaaS
```

~10 months from zero to the full vision. Each phase ships independently and delivers real value. If you stop after Phase 3, you already have the best personal AI agent on the market.
