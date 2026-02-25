# Auxiora Architecture

## Monorepo Structure

```
auxiora/
├── packages/
│   ├── core/               # Shared types, paths, utilities
│   ├── logger/             # Structured logging
│   ├── errors/             # Centralized error handling
│   ├── metrics/            # Performance monitoring
│   │
│   ├── vault/              # Encrypted credential storage
│   ├── audit/              # Tamper-evident logging
│   ├── config/             # Zod-validated configuration
│   ├── autonomy/           # Trust levels and action audit
│   │
│   ├── providers/          # Multi-provider LLM adapter (10+)
│   ├── router/             # Model routing, task classification, cost tracking
│   ├── personality/        # SOUL.md + The Architect (29 traits, 17 domains)
│   ├── memory/             # Semantic/temporal/entity memory partitions
│   │
│   ├── gateway/            # HTTP/WS server, rate limiting, pairing
│   ├── runtime/            # Master runtime connecting all components
│   ├── sessions/           # Session management and persistence
│   ├── daemon/             # Cross-platform background service
│   │
│   ├── channels/           # 12 messaging platform adapters
│   ├── behaviors/          # Scheduled tasks, monitors, reminders
│   ├── ambient/            # Proactive briefings and pattern detection
│   ├── browser/            # Headless Chromium automation
│   ├── voice/              # Wake-word detection, continuous listening
│   ├── stt/                # Speech-to-text (Whisper)
│   ├── tts/                # Text-to-speech (OpenAI, ElevenLabs)
│   ├── conversation/       # Real-time voice conversation
│   │
│   ├── connectors/         # Connector SDK and registry
│   ├── connector-github/   # GitHub integration
│   ├── connector-notion/   # Notion integration
│   ├── connector-linear/   # Linear integration
│   ├── connector-google-workspace/  # Google Calendar, Gmail, Drive
│   ├── connector-homeassistant/     # Home automation
│   ├── ...                 # More connectors
│   │
│   ├── cli/                # Command-line interface (20 commands)
│   ├── dashboard/          # Web UI (setup wizard, chat, settings)
│   ├── desktop/            # Tauri desktop app
│   ├── onboarding/         # First-run setup flow
│   │
│   ├── plugins/            # Plugin loader and sandboxing
│   ├── marketplace/        # Personality and plugin marketplace
│   ├── workflows/          # Autonomous workflows with approval gates
│   └── ...                 # 60+ packages total
│
├── deploy/
│   ├── docker/             # Docker build and compose files
│   └── k8s/                # Kubernetes manifests
│
├── src/
│   └── personalities/      # The Architect personality engine source
│       ├── schema.ts       # Core types (TraitMix, TaskContext, PromptOutput)
│       └── the-architect/  # 17 source modules + 12 test files
│
├── scripts/
│   └── test-architect.ts   # Full Phase 1–4 pipeline verification
│
├── docs/                   # Documentation
├── templates/              # Personality templates
├── package.json            # Root workspace config
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Package Dependency Layers

```
┌─────────────────────────────────────────────────┐
│                      CLI                         │  ← User-facing commands
├─────────────────────────────────────────────────┤
│           Dashboard │ Desktop │ Onboarding       │  ← UI layers
├─────────────────────────────────────────────────┤
│                    Runtime                        │  ← Orchestration
├──────────┬──────────┬──────────┬────────────────┤
│ Channels │Behaviors │ Ambient  │  Connectors     │  ← Integrations
├──────────┴──────────┴──────────┴────────────────┤
│  Providers │ Router │ Personality │ Memory        │  ← AI layer
├─────────────────────────────────────────────────┤
│   Gateway │ Sessions │ Daemon │ Browser │ Voice  │  ← Infrastructure
├──────────┬──────────┬───────────────────────────┤
│  Vault   │  Audit   │  Config  │  Autonomy      │  ← Security primitives
├──────────┴──────────┴───────────────────────────┤
│            Core │ Logger │ Errors │ Metrics       │  ← Shared utilities
└─────────────────────────────────────────────────┘
```

---

## Core Packages

### `@auxiora/core`

Shared utilities used by all packages:

- **Path resolution**: Cross-platform paths (XDG on Linux, Library on macOS, AppData on Windows)
- **Buffer utilities**: `zeroBuffer()` for secure memory clearing
- **Platform detection**: `isWindows()`, `isMacOS()`, `isLinux()`

### `@auxiora/vault`

Encrypted credential storage:

- **Encryption**: AES-256-GCM with unique IV per operation
- **Key derivation**: Argon2id (64MB memory, 3 iterations)
- **Storage**: JSON file with base64-encoded encrypted data
- **File permissions**: 0600 on Unix systems

```typescript
const vault = new Vault();
await vault.unlock('master-password');
await vault.add('ANTHROPIC_API_KEY', 'sk-...');
const key = vault.get('ANTHROPIC_API_KEY');
vault.lock(); // Zeros key from memory
```

### `@auxiora/audit`

Tamper-evident logging:

- **Chained hashes**: Each entry links to the previous via SHA-256
- **Sensitive redaction**: Passwords, tokens, keys automatically masked
- **Verification**: Detect modifications by checking hash chain

### `@auxiora/config`

Zod-validated configuration with environment overrides:

- **Schema validation**: Runtime type checking with defaults
- **Env overrides**: `AUXIORA_GATEWAY_PORT=8080` overrides config file
- **Secure defaults**: Loopback binding, auth enabled, rate limiting on

### `@auxiora/autonomy`

Trust and autonomy management:

- **5 trust levels**: None → Inform → Suggest → Act & Report → Full Autonomy
- **9 trust domains**: messaging, files, web, shell, finance, calendar, email, integrations, system
- **Auto-promotion/demotion**: Evidence-based trust changes with audit trail
- **Action audit**: Every autonomous action logged with reasoning

---

## AI Layer

### `@auxiora/providers`

Multi-provider LLM adapter supporting 10+ providers:

| Provider | Models |
|----------|--------|
| Anthropic | Claude Opus, Sonnet, Haiku |
| OpenAI | GPT-4o, GPT-4, etc. |
| Google | Gemini Pro, Flash |
| Groq | LLaMA, Mixtral (fast inference) |
| Ollama | Any local model |
| DeepSeek | DeepSeek Chat, Coder |
| Cohere | Command R+ |
| X AI | Grok |
| Replicate | Open-source models |
| OpenAI-compatible | vLLM, LocalAI, etc. |

Features: streaming, tool use, thinking levels (low/medium/high/xhigh).

### `@auxiora/router`

Intelligent model routing:

- **Task classification**: Route requests to the best model for the task
- **Cost tracking**: Monitor spend per model and session
- **Fallback chains**: Automatic provider failover

### `@auxiora/personality`

Two personality engines available:

#### SOUL.md (legacy)

- **Tone controls**: warmth, directness, humor, formality (0–1 scales)
- **8 interaction modes**: operator, analyst, advisor, writer, socratic, legal, roast, companion
- **Mode auto-detection**: Classify conversation context to select mode
- **Voice profiles**: 7 templates (professional, friendly, creative, minimal, empathetic, chill, mentor)
- **Security floor**: Injection prevention, tool pattern detection
- **Escalation**: 5-level severity state machine

#### The Architect (v1.4.0+)

Context-aware personality engine grounded in 29 traits from documented historical methodologies. Each trait traces to a specific mind's work (Munger, Musk, Grove, Bezos, Voss, etc.) with full provenance.

```
User message
     ↓
Context Detection (17 domains) → Correction Learning → Conversation Theme
     ↓
Trait Mixing: domain profile → emotional override → trajectory modifier → custom weights
     ↓
Prompt Assembly: base prompt + weight-scaled behavioral instructions
     ↓
Output: fullPrompt + activeTraits with provenance + recommendations
```

**Core engine** (`src/personalities/the-architect/`):

| Module | Purpose |
|--------|---------|
| `context-detector.ts` | Keyword scoring across 17 domains |
| `context-profiles.ts` | 29-trait weight profiles per domain |
| `emotional-overrides.ts` | Emotion → trait modulation |
| `emotional-tracker.ts` | Multi-message trajectory detection (stable, escalating, volatile, etc.) |
| `conversation-context.ts` | Theme persistence across turns (tangent resistance, crisis override) |
| `correction-store.ts` | Learns from user corrections to improve future detection |
| `custom-weights.ts` | User-defined trait offsets [-0.3, +0.3] with 5 presets |
| `recommender.ts` | Suggests context switches based on patterns |
| `prompt-assembler.ts` | Assembles weight-scaled behavioral instructions |
| `source-map.ts` | Provenance: trait → mind → source work → evidence |
| `conversation-export.ts` | Export conversation with full metadata (JSON, Markdown, CSV) |
| `persistence.ts` | Encrypted preferences, usage history, corrections |

**5 presets**: The CISO (security paranoia), The Builder (ship fast), The Coach (empathy), The Strategist (long-term), The Closer (sales energy).

**UI components** (`packages/dashboard/ui/src/components/`):

| Component | Purpose |
|-----------|---------|
| `ContextIndicator.tsx` | Domain pill with emoji beside responses |
| `ContextOverrideMenu.tsx` | Manual domain picker with scope (message/conversation) |
| `ContextRecommendation.tsx` | Suggestion banner when detection is uncertain |
| `SourcesButton.tsx` + `SourcesPanel.tsx` | View active traits with provenance |
| `TraitCustomizer.tsx` | Slider panel for per-trait weight adjustments |
| `ConversationExportButton.tsx` | Export dropdown (JSON / Markdown / CSV) |
| `ArchitectSettings.tsx` | Preferences panel |

**Test coverage**: 12 engine test files (277 tests) + 7 component test files (101 tests) = 378 tests.

### `@auxiora/memory`

Persistent memory with intelligent retrieval:

- **Partitions**: Temporal, semantic, entity-based storage
- **Sentiment analysis**: Track emotional context
- **Pattern detection**: Identify recurring topics and preferences
- **Context-aware retrieval**: Relevant memory surfacing based on current conversation

---

## Integration Layer

### `@auxiora/channels`

12 messaging platform adapters:

Discord | Telegram | Slack | Microsoft Teams | WhatsApp | Signal | Email (SMTP) | Matrix | Google Chat | Zalo | BlueBubbles (iMessage) | Twilio (SMS)

Each adapter handles platform-specific auth, message formatting, and event handling.

### `@auxiora/behaviors`

Three behavior types:

| Type | Trigger | Limits |
|------|---------|--------|
| **Scheduled** | Cron expression + timezone | No limit |
| **Monitor** | Polling interval (60s–24h) with condition | Max 50 active |
| **Reminder** | One-shot at ISO timestamp | Auto-removed after fire |

Auto-pauses after 3 consecutive failures. Full audit trail with runCount, failCount, lastRun.

### `@auxiora/browser`

Headless Chromium automation via Playwright:

- **Actions**: navigate, click, type, screenshot, extract, wait, runScript
- **Security**: SSRF protection (numeric IP validation), blocked protocols (file:, javascript:, data:, blob:), URL whitelist/blacklist
- **Limits**: 10 concurrent pages, 30s navigation timeout, 5MB screenshot limit, 100KB result cap

### `@auxiora/voice`, `@auxiora/stt`, `@auxiora/tts`, `@auxiora/conversation`

Voice interaction pipeline:

```
Microphone → Wake-word detection → STT (Whisper) → Agent → TTS (OpenAI/ElevenLabs) → Speaker
```

Features: continuous listening, push-to-talk, turn-taking state machine, 7 voice profile presets.

### Connectors (`@auxiora/connector-*`)

| Connector | Capabilities |
|-----------|-------------|
| GitHub | Issues, PRs, Actions, Repos |
| Google Workspace | Calendar, Gmail, Drive |
| Microsoft 365 | Outlook, OneDrive, Contacts |
| Notion | Pages, Databases, Blocks |
| Linear | Issues, Projects, Cycles |
| Home Assistant | Devices, Scenes, Automations |
| Social Media | X, LinkedIn, Reddit, Instagram |

All connectors use the `@auxiora/connectors` SDK with permission validators, OAuth/API key storage via vault, and a shared action execution engine.

---

## UI Layer

### `@auxiora/dashboard`

Web dashboard with:

- **Setup wizard**: 8-step onboarding (vault, identity, personality, provider, channels, connections)
- **Chat**: Real-time conversation with multi-chat support and auto-generated titles
- **Behaviors**: Create and manage scheduled tasks, monitors, reminders
- **Settings**: Personality editor, provider config, channel management, appearance, security
- **Audit log**: Security event viewer

### `@auxiora/desktop`

Tauri-based desktop app:

- Menu bar / system tray integration
- Global hotkeys
- Push-to-talk voice overlay
- Desktop notifications
- Auto-update mechanism
- Ollama local model integration

---

## Data Flow

### Message Processing

```
Channel (Discord/Telegram/Slack/WebChat/...)
         │
         ▼
    ┌─────────┐
    │ Gateway │ ← Auth check, rate limit
    └────┬────┘
         │
         ▼
    ┌─────────┐
    │ Pairing │ ← Unknown sender? Generate code
    └────┬────┘
         │ (if allowed)
         ▼
    ┌─────────┐
    │ Session │ ← Load/create session, memory context
    └────┬────┘
         │
         ▼
    ┌─────────────┐
    │ Personality  │ ← The Architect: detect context → mix traits → assemble prompt
    │              │   OR SOUL.md: apply mode + tone controls
    └──────┬──────┘
         │
         ▼
    ┌─────────┐
    │ Router  │ ← Select provider + model for task
    └────┬────┘
         │
         ▼
    ┌─────────┐
    │Provider │ ← Call LLM API (with personality-enriched prompt)
    └────┬────┘
         │
         ▼
    ┌─────────┐
    │Response │ ← Stream back to channel + context indicator + source attribution
    └─────────┘
```

### Proactive Behavior Flow

```
Behavior Scheduler
         │
    ┌────┴────┐
    │Schedule │ ← Cron fires / Monitor condition met / Reminder time
    └────┬────┘
         │
         ▼
    ┌─────────┐
    │Executor │ ← Generate AI prompt with behavior action
    └────┬────┘
         │
         ▼
    ┌─────────┐
    │Provider │ ← Call LLM
    └────┬────┘
         │
         ▼
    ┌─────────┐
    │ Deliver │ ← Send to configured channel(s)
    └─────────┘
```

---

## Configuration

### File Location

- **macOS**: `~/Library/Application Support/auxiora/config.json`
- **Linux**: `~/.config/auxiora/config.json`
- **Windows**: `%APPDATA%\auxiora\config.json`

### Environment Overrides

Any config key can be overridden via environment variable:

```bash
AUXIORA_GATEWAY_PORT=8080
AUXIORA_AUTH_MODE=jwt
AUXIORA_PROVIDER_PRIMARY=openai
```

Pattern: `AUXIORA_` + path in SCREAMING_SNAKE_CASE

---

## Installation & Distribution

| Method | Platform | Mechanism |
|--------|----------|-----------|
| npm | All | `npm install -g auxiora` |
| Homebrew | macOS | `brew install auxiora/tap/auxiora` |
| apt | Debian/Ubuntu | Signed apt repository |
| Shell script | Linux/macOS | `curl \| bash` installer with Node.js auto-install |

All methods auto-start the gateway and open the dashboard in the browser after installation.
