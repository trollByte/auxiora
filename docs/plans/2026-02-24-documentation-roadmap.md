# Documentation Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create comprehensive user-facing documentation: a Getting Started guide and feature-rich reference docs with use cases for every major Auxiora capability.

**Architecture:** Two documentation tiers: (1) A single `docs/guide/getting-started.md` that takes a new user from zero to a working assistant in 15 minutes, and (2) a `docs/features/` directory with one markdown file per feature area, each containing architecture overview, configuration, use cases, and examples. All docs link back to each other via relative paths.

**Tech Stack:** Markdown (GitHub-flavored), no build tools required.

---

## Document Inventory

### Tier 1: Getting Started Guide
1. `docs/guide/getting-started.md` — Install, configure, first conversation, first behavior

### Tier 2: Feature Reference (17 documents)
2. `docs/features/vault-and-security.md` — Vault, audit logs, trust system
3. `docs/features/providers.md` — AI provider setup, model routing, cost tracking
4. `docs/features/channels.md` — 12 messaging platform adapters
5. `docs/features/connectors.md` — 11 service integrations
6. `docs/features/personality.md` — SOUL.md, The Architect, presets, customization
7. `docs/features/memory.md` — Memory system, partitions, provenance, export
8. `docs/features/behaviors.md` — Scheduled tasks, monitors, reminders
9. `docs/features/ambient.md` — Proactive intelligence, briefings, anticipation
10. `docs/features/voice.md` — STT, TTS, wake-word, real-time conversation
11. `docs/features/browser.md` — Headless automation, SSRF protection
12. `docs/features/research.md` — Deep research agent, citations
13. `docs/features/orchestration.md` — Multi-agent patterns, ReAct loops, job queue
14. `docs/features/dashboard.md` — Web UI, setup wizard, chat, settings
15. `docs/features/desktop.md` — Tauri app, menu bar, hotkeys
16. `docs/features/cli.md` — All CLI commands with examples
17. `docs/features/plugins-and-marketplace.md` — Plugin system, skills, marketplace
18. `docs/features/mcp.md` — MCP server and client integration

### Navigation
19. `docs/features/README.md` — Feature index with links and one-line descriptions

---

## Task 1: Getting Started Guide

**Files:**
- Create: `docs/guide/getting-started.md`

**Step 1: Write the document**

The Getting Started guide must follow this exact structure:

```markdown
# Getting Started with Auxiora

> From zero to a working AI assistant in 15 minutes.

## What is Auxiora?

[2-3 sentences: security-first self-hosted AI assistant, runs on your devices, connects to your messaging platforms, keeps credentials encrypted]

## Prerequisites

- Node.js 22 or later
- An API key from at least one AI provider (Anthropic, OpenAI, Google, etc.)
- (Optional) A messaging platform bot token (Discord, Telegram, Slack, etc.)

## Installation

[Show all 5 install methods from README: npm, Homebrew, apt, shell script, Docker — each with exact commands]

## First Run

### 1. Start Auxiora

\`\`\`bash
auxiora start
\`\`\`

This opens the setup wizard at `http://localhost:18800/dashboard`.

### 2. Create Your Vault

[Explain vault concept in 1 sentence. Show the setup wizard step OR CLI equivalent:]

\`\`\`bash
auxiora vault add ANTHROPIC_API_KEY
# Paste your key when prompted — it's encrypted immediately
\`\`\`

### 3. Set Your Identity

[Explain: name and preferences so the assistant knows who you are. Dashboard wizard handles this, or edit USER.md directly]

### 4. Choose a Personality

[Brief: SOUL.md for fine-grained control, The Architect for context-aware intelligence]

\`\`\`bash
auxiora personality list
auxiora personality set architect
\`\`\`

### 5. Add a Provider

[Show adding Anthropic as primary provider via dashboard or config.json]

### 6. Connect a Channel (Optional)

[Quick example: Discord bot token → vault → config. Link to full channels doc]

## Your First Conversation

[Show using the web chat at localhost:18800/dashboard, sending a message, seeing a response]

## Your First Behavior

[Show creating a simple daily reminder:]

\`\`\`bash
auxiora behaviors create --type reminder --message "Stand up and stretch" --at "17:00"
\`\`\`

[Show creating a scheduled behavior via dashboard]

## Your First Connector

[Quick: connect GitHub, ask assistant about your repos]

## Health Check

\`\`\`bash
auxiora doctor
\`\`\`

[Explain what doctor checks and what good output looks like]

## Running as a Service

\`\`\`bash
auxiora daemon install
auxiora daemon start
\`\`\`

[One sentence per platform: macOS=launchd, Linux=systemd, Windows=Task Scheduler]

## What's Next?

[Bulleted links to feature docs:]
- [Security & Vault](../features/vault-and-security.md) — Trust levels, audit logs, encryption
- [AI Providers](../features/providers.md) — Model routing, cost tracking, 10+ providers
- [Messaging Channels](../features/channels.md) — Connect Discord, Telegram, Slack, and 9 more
- [Personality System](../features/personality.md) — The Architect, SOUL.md, custom presets
- [Memory](../features/memory.md) — How Auxiora remembers and learns about you
- [Behaviors](../features/behaviors.md) — Scheduled tasks, monitors, reminders
- [All Features](../features/README.md) — Complete feature index
```

**Step 2: Verify links and formatting**

Run: `grep -c '](../' docs/guide/getting-started.md` to verify cross-links exist.

**Step 3: Commit**

```bash
git add docs/guide/getting-started.md
git commit -m "docs: add Getting Started guide"
```

---

## Task 2: Vault & Security Reference

**Files:**
- Create: `docs/features/vault-and-security.md`

**Content structure:**

```markdown
# Vault & Security

> Auxiora's security model: encrypted vault, tamper-evident audit logs, and a 5-level trust system.

## Overview

[3-4 sentences: security philosophy — vault over .env, zero-trust by default, secrets never touch the model]

## Encrypted Vault

### How It Works

[AES-256-GCM + Argon2id. Explain: master password → key derivation → encrypt/decrypt cycle. Secure memory zeroing.]

### CLI Commands

| Command | Description |
|---------|-------------|
| `auxiora vault add <NAME>` | Add or update a credential |
| `auxiora vault list` | List stored credential names (never values) |
| `auxiora vault status` | Show configured vs missing credentials |
| `auxiora vault remove <NAME>` | Remove a credential |
| `auxiora vault get <NAME>` | Print value (for scripting) |

### Required Secrets

[Table: secret name, purpose, when needed]

### Vault File Locations

[Table: macOS, Linux, Windows paths]

## Audit Logging

### How It Works

[Chained SHA-256 hashes. Each log entry includes hash of previous entry. Tampering breaks the chain.]

### What Gets Logged

[List: authentication events, credential access, trust changes, autonomous actions, security violations]

### Viewing Audit Logs

\`\`\`bash
auxiora audit
\`\`\`

## Trust System

### 5 Autonomy Levels

| Level | Name | Description | Example |
|-------|------|-------------|---------|
| 0 | None | No autonomous action | — |
| 1 | Inform | Notify about opportunities | "You have a meeting in 15 min" |
| 2 | Suggest | Propose actions for approval | "Should I reply to this email?" |
| 3 | Act & Report | Execute and notify | Sends reply, tells you after |
| 4 | Full Autonomy | Execute silently | Handles routine tasks without interruption |

### 9 Trust Domains

[Table: domain name, what it controls, default level]

### Configuring Trust

\`\`\`bash
auxiora trust set messaging 2
auxiora trust status
\`\`\`

### Use Cases

1. **Conservative setup** — All domains at level 1 (inform only). Best for first-time users.
2. **Power user** — Messaging at 3, calendar at 3, files at 2, shell at 1. The assistant manages routine communications and scheduling but asks before touching files.
3. **Full autonomy for a domain** — Set a specific domain (e.g., email) to level 4 when you trust the assistant's judgment for that area. All actions are still audit-logged.

## SSRF Protection

[Brief: all outbound HTTP requests validated against private IP ranges, DNS rebinding protection, configurable allowlists]

## Content Safety

[Brief: PII detection, prompt injection defense via guardrails package]
```

**Step 2: Commit**

```bash
git add docs/features/vault-and-security.md
git commit -m "docs: add Vault & Security feature reference"
```

---

## Task 3: AI Providers Reference

**Files:**
- Create: `docs/features/providers.md`

**Content structure:**

```markdown
# AI Providers

> Connect 10+ AI providers. Route tasks to the right model automatically. Track costs.

## Supported Providers

| Provider | Models | Streaming | Tool Use | Thinking |
|----------|--------|-----------|----------|----------|
| Anthropic | Claude 4.x, 3.5 | Yes | Yes | Yes |
| OpenAI | GPT-4o, o1, o3 | Yes | Yes | Yes |
| Google | Gemini 2.x | Yes | Yes | Yes |
| Groq | Llama, Mixtral | Yes | Yes | No |
| Ollama | Any local model | Yes | Yes | No |
| DeepSeek | DeepSeek V3/R1 | Yes | Yes | Yes |
| Cohere | Command R+ | Yes | Yes | No |
| xAI | Grok | Yes | Yes | No |
| Replicate | Any hosted model | Yes | Varies | No |
| OpenAI-compatible | vLLM, LiteLLM, etc. | Yes | Varies | No |

## Setup

### Via Dashboard

[Navigate to Settings → Provider. Select provider, enter API key, choose model.]

### Via Vault + Config

\`\`\`bash
auxiora vault add ANTHROPIC_API_KEY
\`\`\`

In `~/.auxiora/config.json`:
\`\`\`json
{
  "providers": {
    "primary": "anthropic",
    "fallback": "openai",
    "anthropic": { "model": "claude-sonnet-4-6", "maxTokens": 4096 },
    "openai": { "model": "gpt-4o", "maxTokens": 4096 }
  }
}
\`\`\`

### Local Models (Ollama)

\`\`\`bash
ollama pull llama3.1
\`\`\`

Config:
\`\`\`json
{
  "providers": {
    "primary": "ollama",
    "ollama": { "model": "llama3.1", "maxTokens": 4096 }
  }
}
\`\`\`

## Model Routing

### How It Works

[Task classification → routing rules → provider selection. Cost-aware routing.]

### Routing Rules

\`\`\`json
{
  "routing": {
    "enabled": true,
    "rules": [
      { "task": "code", "provider": "anthropic", "model": "claude-sonnet-4-6", "priority": 1 },
      { "task": "creative", "provider": "openai", "model": "gpt-4o", "priority": 1 },
      { "task": "simple", "provider": "groq", "model": "llama-3.1-70b", "priority": 1 }
    ]
  }
}
\`\`\`

### Cost Tracking

\`\`\`json
{
  "routing": {
    "costLimits": {
      "dailyBudget": 10.00,
      "monthlyBudget": 100.00,
      "perMessageMax": 0.50,
      "warnAt": 0.8
    }
  }
}
\`\`\`

## Use Cases

1. **Budget-conscious** — Route simple queries to Groq (free tier), complex ones to Anthropic.
2. **Privacy-first** — Use Ollama as primary (local), cloud providers as fallback only.
3. **Best-of-breed** — Anthropic for code, OpenAI for creative writing, Google for research.
4. **Enterprise** — OpenAI-compatible endpoint pointing at your own vLLM deployment.
```

**Step 2: Commit**

```bash
git add docs/features/providers.md
git commit -m "docs: add AI Providers feature reference"
```

---

## Task 4: Messaging Channels Reference

**Files:**
- Create: `docs/features/channels.md`

**Content structure:**

```markdown
# Messaging Channels

> Connect Auxiora to 12 messaging platforms. Talk to your assistant where you already are.

## Supported Channels

| Channel | Auth Method | Features |
|---------|-------------|----------|
| Discord | Bot token | Text, embeds, threads, reactions |
| Telegram | Bot token | Text, inline keyboards, file sharing |
| Slack | Bot + App tokens | Text, blocks, threads, slash commands |
| Microsoft Teams | App registration | Text, adaptive cards |
| WhatsApp | Business API | Text, media, templates |
| Signal | signal-cli | Text, attachments |
| Email (SMTP/IMAP) | Credentials | Send/receive, HTML formatting |
| Matrix | Access token | Text, E2EE rooms |
| Google Chat | Service account | Text, cards |
| Zalo | App credentials | Text, media |
| BlueBubbles (iMessage) | Server URL | Text, attachments |
| Twilio (SMS) | Account SID + Auth | SMS, MMS |

## Quick Setup: Discord

[Step-by-step: create bot → get token → vault add → config → invite to server → verify]

## Quick Setup: Telegram

[Step-by-step: BotFather → get token → vault add → config → test message]

## Quick Setup: Slack

[Step-by-step: create app → socket mode → get tokens → vault add → config → invite to channel]

## Configuration Reference

\`\`\`json
{
  "channels": {
    "discord": { "enabled": true },
    "telegram": { "enabled": true },
    "slack": { "enabled": true }
  }
}
\`\`\`

## Pairing System

[Explain: unknown senders get a pairing code, approved users get direct access]

\`\`\`json
{
  "pairing": {
    "enabled": true,
    "codeLength": 6,
    "expiryMinutes": 15,
    "autoApproveChannels": ["webchat"]
  }
}
\`\`\`

## Use Cases

1. **Personal assistant** — Telegram on phone, web dashboard on desktop. Same session, same memory.
2. **Team assistant** — Slack workspace with the bot in specific channels. Pairing codes for new team members.
3. **Multi-platform** — Discord for gaming group, email for professional context, iMessage for family. The assistant adapts personality per channel.
```

**Step 2: Commit**

```bash
git add docs/features/channels.md
git commit -m "docs: add Messaging Channels feature reference"
```

---

## Task 5: Service Connectors Reference

**Files:**
- Create: `docs/features/connectors.md`

**Content structure:**

```markdown
# Service Connectors

> Connect Auxiora to your tools. 11 integrations for proactive assistance.

## Available Connectors

| Connector | Capabilities | Auth |
|-----------|-------------|------|
| GitHub | Issues, PRs, Actions, Repos, search | Personal access token |
| Notion | Pages, databases, search, block editing | Integration token |
| Linear | Issues, projects, cycles, labels | API key |
| Google Workspace | Calendar events, Gmail, Drive files | OAuth2 service account |
| Microsoft 365 | Outlook mail, Calendar, OneDrive | App registration |
| Home Assistant | Devices, scenes, automations, states | Long-lived access token |
| Philips Hue | Lights, scenes, rooms, groups | Bridge pairing |
| Obsidian | Notes, search, daily notes | Local REST plugin |
| Spotify | Playback control, search, playlists | OAuth2 |
| Social Media | Twitter/X, LinkedIn, Reddit, Instagram | Platform-specific OAuth |
| Custom | Build your own via Connector SDK | Varies |

## Setup: GitHub

[vault add GITHUB_TOKEN → config → "list my open PRs" → verify]

## Setup: Notion

[vault add NOTION_TOKEN → config → share pages with integration → "search my notes about X"]

## Setup: Home Assistant

[vault add HOMEASSISTANT_TOKEN → config with URL → "turn off living room lights"]

## Connector SDK

[Brief: how to build a custom connector — implement the Connector interface, register actions, handle auth]

## Use Cases

1. **Developer workflow** — GitHub + Linear connected. "Create a Linear issue for this bug and link to the GitHub PR."
2. **Smart home** — Home Assistant + Hue. "Set the office to focus mode" (dims lights, enables DND).
3. **Knowledge worker** — Notion + Google Calendar. "Prep me for my 2pm meeting — pull the project notes from Notion and summarize the attendees' recent emails."
4. **Content creator** — Obsidian + Social. "Draft a Twitter thread from my Obsidian notes on distributed systems."
```

**Step 2: Commit**

```bash
git add docs/features/connectors.md
git commit -m "docs: add Service Connectors feature reference"
```

---

## Task 6: Personality System Reference

**Files:**
- Create: `docs/features/personality.md`

**Content structure:**

```markdown
# Personality System

> Two engines: SOUL.md for fine-grained tone control, The Architect for context-aware intelligence.

## SOUL.md (Classic)

### Tone Controls

| Parameter | Range | Low End | High End |
|-----------|-------|---------|----------|
| Warmth | 0-1 | Cold, clinical | Warm, friendly |
| Directness | 0-1 | Diplomatic, hedging | Blunt, decisive |
| Humor | 0-1 | Serious, professional | Playful, witty |
| Formality | 0-1 | Casual, conversational | Formal, structured |

### Interaction Modes

[Table: 8 modes with description and when to use]

### Personality Files

[SOUL.md, USER.md, AGENTS.md, IDENTITY.md — purpose, location, editing]

## The Architect

### How It Works

[Pipeline: context detection → correction learning → emotional tracking → trait mixing → prompt assembly]

### 29 Traits with Provenance

[Table: trait name, source mind, domain where strongest]
[Example entries: "Adversarial Thinking — Andy Grove / Sun Tzu — Security Review", "First-Principles Analysis — Elon Musk — Architecture Design"]

### 17 Domains

[List with brief descriptions]

### 5 Presets

| Preset | Focus | Best For |
|--------|-------|----------|
| The CISO | Security paranoia, threat modeling | Security reviews, audit prep |
| The Builder | Ship fast, iterate, pragmatic | Feature development, MVPs |
| The Coach | Empathy, growth mindset | 1:1s, mentoring, personal development |
| The Strategist | Deep analysis, long-term thinking | Strategic planning, architecture |
| The Closer | Sales energy, persuasion | Pitches, negotiations, proposals |

### Custom Weights

[Show how to create custom weight profiles via dashboard]

### Transparency

[Every response shows active traits and why. Show example transparency footer.]

### Self-Awareness (User Model)

[UserModelSynthesizer, "About Me" page, what it tracks, how to view]

## Use Cases

1. **Code review** — The Architect detects "code engineering" domain, activates systematic thinking + adversarial analysis. Catches edge cases others miss.
2. **Crisis communication** — Emotional tracking detects escalation, activates empathetic + decisive traits. Helps draft clear incident comms.
3. **Sales prep** — "The Closer" preset for pitch rehearsal. High directness, persuasive framing, objection handling.
4. **Learning** — Socratic mode in SOUL.md or Coach preset in Architect. Asks probing questions instead of giving answers.
```

**Step 2: Commit**

```bash
git add docs/features/personality.md
git commit -m "docs: add Personality System feature reference"
```

---

## Task 7: Memory System Reference

**Files:**
- Create: `docs/features/memory.md`

**Content structure:**

```markdown
# Memory System

> Auxiora remembers your preferences, learns your patterns, and builds a model of who you are.

## How Memory Works

[Brief: MemoryStore persists to JSON. Categories: preference, fact, context, relationship, pattern, personality. Sources: extracted, explicit, observed.]

## Memory Categories

| Category | What It Stores | Example |
|----------|---------------|---------|
| preference | User preferences | "Prefers TypeScript over JavaScript" |
| fact | Factual knowledge | "Works at Acme Corp as a senior engineer" |
| context | Situational information | "Currently working on a migration project" |
| relationship | Shared history | "Inside joke about rubber duck debugging" |
| pattern | Communication patterns | "Asks short questions, wants detailed answers" |
| personality | Adaptation signals | "Responds well to direct feedback" |

## Memory Provenance

[New feature: origin tracking. Each memory can have provenance: origin (user_stated, extracted, inferred, merged), sessionId, createdBy, sourceExcerpt, extractionConfidence]

## Partitions

[Per-user and shared memory partitions. Explain private vs shared vs global.]

## Managing Memories

### Dashboard

[Memory Manager page: browse, search, edit, delete, forget topics, export]

### API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/memories` | GET | List all memories (filter by ?category=) |
| `/memories/search?q=` | GET | Search memories |
| `/memories/:id` | PATCH | Update a memory |
| `/memories/:id` | DELETE | Remove a memory |
| `/forget` | POST | Selectively forget a topic |
| `/export/personalization` | GET | Export all personalization data |
| `/memories/export` | GET | Bulk export memories |

### Selective Forgetting

["Forget everything about my old job" → searches + removes matching memories, marks related decisions as abandoned]

## Vector Store

[In-memory cosine similarity search. New: SqliteVecStore for persistent vector storage using SQLite.]

## Use Cases

1. **Personal context** — Over time, Auxiora learns your tech stack, communication style, and work patterns. Responses become increasingly relevant.
2. **Selective forgetting** — Changed jobs? "Forget everything about Acme Corp" removes all related memories while keeping everything else.
3. **Data export** — Full GDPR-style export of everything Auxiora knows about you, in JSON format.
4. **Memory editing** — Incorrect memory? Edit it directly in the Memory Manager dashboard.
```

**Step 2: Commit**

```bash
git add docs/features/memory.md
git commit -m "docs: add Memory System feature reference"
```

---

## Task 8: Behaviors Reference

**Files:**
- Create: `docs/features/behaviors.md`

**Content structure:**

```markdown
# Behaviors

> Proactive automation: scheduled tasks, conditional monitors, and one-shot reminders.

## Behavior Types

| Type | Trigger | Use Case |
|------|---------|----------|
| Scheduled | Cron expression | "Every morning at 9am, summarize my unread emails" |
| Monitor | Polling interval (60s-24h) | "Alert me when Bitcoin drops below $50k" |
| Reminder | One-shot at specific time | "Remind me to call the dentist at 3pm" |

## Creating Behaviors

### Via Dashboard

[Behaviors page → Create → select type → configure → save]

### Via CLI

\`\`\`bash
# Scheduled: daily standup summary
auxiora behaviors create --type scheduled --cron "0 9 * * 1-5" --prompt "Summarize my calendar and unread messages for today"

# Monitor: PR approval watch
auxiora behaviors create --type monitor --interval 300 --prompt "Check if my open GitHub PRs have been approved"

# Reminder
auxiora behaviors create --type reminder --at "2026-02-25T15:00:00" --message "Call dentist"
\`\`\`

### Via API

[POST /behaviors with JSON body]

## Managing Behaviors

[List, pause, resume, delete — CLI and dashboard]

## Error Handling

[Auto-pause after 3 consecutive failures. Max 50 active monitors.]

## Durable Job Queue

[Behaviors backed by SQLite job queue. Crash recovery: running jobs reset to pending on restart. Exponential backoff retry.]

## Use Cases

1. **Morning briefing** — Scheduled at 8am: pulls calendar, email summaries, weather, and top news. Delivered via Telegram.
2. **Competitor monitoring** — Monitor every 6 hours: checks competitor websites for changes, summarizes differences.
3. **Meeting prep** — Reminder 30 minutes before each meeting: pulls attendee info, related Notion docs, recent email threads.
4. **Health check** — Monitor every 5 minutes: checks your production API health endpoint, alerts on failure.
```

**Step 2: Commit**

```bash
git add docs/features/behaviors.md
git commit -m "docs: add Behaviors feature reference"
```

---

## Task 9: Ambient Intelligence Reference

**Files:**
- Create: `docs/features/ambient.md`

**Content structure:**

```markdown
# Ambient Intelligence

> Proactive awareness: pattern detection, briefings, anticipation, and quiet notifications.

## How It Works

[Ambient system observes patterns across channels, connectors, and behaviors. Detects anomalies and opportunities. Delivers notifications at appropriate priority levels.]

## Features

### Pattern Detection
[Learns your routines. Notices when something breaks pattern — "You usually respond to emails from X within an hour. There's one from 3 hours ago."]

### Briefings
[Configurable daily/weekly summaries. Pulls from all connected sources.]

### Anticipation
[Predicts needs based on calendar, habits, and context. "Your flight to NYC is tomorrow — here's the weather forecast and your hotel confirmation."]

### Quiet Notifications
[Priority scoring and batching. Urgent items interrupt; low-priority items batch into digest.]

## Configuration

\`\`\`bash
auxiora ambient status    # Check ambient mode status
auxiora ambient enable    # Enable ambient features
auxiora ambient disable   # Disable ambient features
\`\`\`

## Use Cases

1. **Executive assistant** — Morning briefing with calendar overview, flagged emails, and task reminders.
2. **Developer awareness** — Detects that CI pipeline failed 3 times today, proactively summarizes the failures.
3. **Meeting intelligence** — 15 minutes before a meeting, prepares context: previous meeting notes, attendee backgrounds, relevant documents.
```

**Step 2: Commit**

```bash
git add docs/features/ambient.md
git commit -m "docs: add Ambient Intelligence feature reference"
```

---

## Task 10: Voice Mode Reference

**Files:**
- Create: `docs/features/voice.md`

**Content structure:**

```markdown
# Voice Mode

> Talk to Auxiora with your voice. Wake-word detection, real-time conversation, multiple TTS voices.

## Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| STT (Speech-to-Text) | OpenAI Whisper | Converts speech to text |
| TTS (Text-to-Speech) | OpenAI, ElevenLabs | Converts text to speech |
| Wake Word | Configurable keyword | Hands-free activation |
| Conversation Engine | State machine | Manages real-time voice dialogue |

## Setup

### API Keys

\`\`\`bash
auxiora vault add OPENAI_API_KEY          # For Whisper STT + OpenAI TTS
auxiora vault add ELEVENLABS_API_KEY      # For ElevenLabs TTS (optional)
\`\`\`

### Configuration

[Voice config options: TTS provider, voice selection, wake word, push-to-talk vs continuous]

## Desktop App Integration

[Push-to-talk overlay, global hotkey, menu bar microphone toggle]

## Use Cases

1. **Hands-free assistant** — Wake word "Hey Auxiora" while cooking. Ask for recipe conversions, set timers, add to grocery list.
2. **Meeting notes** — Push-to-talk during a meeting: "Summarize what we just discussed and create action items."
3. **Accessibility** — Full voice interaction for users who prefer or need voice-first interfaces.
```

**Step 2: Commit**

```bash
git add docs/features/voice.md
git commit -m "docs: add Voice Mode feature reference"
```

---

## Task 11: Browser Control Reference

**Files:**
- Create: `docs/features/browser.md`

**Content structure:**

```markdown
# Browser Control

> Headless Chromium automation with SSRF protection for safe web interaction.

## How It Works

[Headless Chromium via Playwright. AI can navigate pages, extract content, fill forms, take screenshots. All requests pass through SSRF guard.]

## Capabilities

- Navigate to URLs
- Extract page content and structure
- Fill forms and click buttons
- Take screenshots
- Execute JavaScript (sandboxed)
- Download files

## Security

### SSRF Protection

[All URLs validated against private IP ranges. DNS rebinding protection. Numeric IP normalization. Configurable allowlists.]

### Trust Requirement

[Requires trust level 2+ in the "web" domain. Level 3+ for form submission. Level 4 for unrestricted browsing.]

## Use Cases

1. **Web research** — "Go to the Hacker News front page and summarize the top 5 stories."
2. **Price monitoring** — Monitor a product page daily, alert when price drops below threshold.
3. **Form automation** — Fill out routine forms with pre-configured data.
4. **Screenshot documentation** — Take screenshots of web pages for documentation or evidence.
```

**Step 2: Commit**

```bash
git add docs/features/browser.md
git commit -m "docs: add Browser Control feature reference"
```

---

## Task 12: Research Agent Reference

**Files:**
- Create: `docs/features/research.md`

**Content structure:**

```markdown
# Research Agent

> Deep multi-source research with citation tracking and synthesis.

## How It Works

[Research engine: takes a question → decomposes into sub-queries → searches multiple sources → synthesizes with citations → produces structured report]

## Features

- Multi-source search (web, connected services, local knowledge)
- Automatic query decomposition
- Citation tracking with source attribution
- Iterative refinement
- Structured report generation

## Use Cases

1. **Competitive analysis** — "Research the top 5 competitors in the observability space. Compare pricing, features, and market positioning."
2. **Technical deep dive** — "What are the trade-offs between SQLite WAL mode and journal mode for concurrent writes? Include benchmarks."
3. **Decision support** — "Should we migrate from REST to gRPC? Research performance characteristics, ecosystem maturity, and migration effort for a Node.js monorepo."
```

**Step 2: Commit**

```bash
git add docs/features/research.md
git commit -m "docs: add Research Agent feature reference"
```

---

## Task 13: Orchestration & ReAct Reference

**Files:**
- Create: `docs/features/orchestration.md`

**Content structure:**

```markdown
# Orchestration & ReAct Loops

> Multi-agent patterns, reasoning-action loops, and crash-recoverable job execution.

## ReAct Loop

### How It Works

[Think → Act → Observe cycle. Goal-driven reasoning with tool execution.]

### Features

- Configurable step limits and token budgets
- Tool allowlists/denylists
- Approval-required mode for sensitive actions
- Loop detection (detects repeated identical tool calls)
- **Checkpoint/resume** for crash recovery
- **Per-step validation** callbacks

### Checkpoint Support

[Sessions can be checkpointed after each step. On crash, resume from last checkpoint. Integrates with job queue.]

## Orchestration Engine

### 5 Patterns

| Pattern | Description | Use Case |
|---------|-------------|----------|
| Parallel | Run multiple agents simultaneously | Gathering diverse perspectives |
| Sequential | Chain agents, each builds on previous output | Multi-step analysis pipeline |
| Debate | Pro + con agents, judge synthesizes | Balanced decision analysis |
| Map-Reduce | Distribute items across agents, reduce results | Processing large datasets |
| Supervisor | Supervisor delegates to workers | Complex multi-part projects |

### Observability

[Task progress events, timing per task, checkpoint support for sequential workflows]

### Cost Tracking

[Per-agent token usage, cost estimation, workflow-level totals]

## Job Queue

### How It Works

[SQLite-backed polling queue. Crash recovery: running jobs reset to pending on restart.]

### Features

- Exponential backoff retry (max 3 attempts)
- Non-retryable errors → dead letter immediately
- Checkpoint/resume within job handlers
- Configurable concurrency and polling interval

## Use Cases

1. **Deep analysis** — Debate pattern: one agent argues for a technology choice, another argues against, a judge synthesizes the best path.
2. **Content pipeline** — Sequential: research → outline → draft → edit → publish.
3. **Crash-safe automation** — Long-running behavior jobs survive process restarts via checkpoint/resume.
4. **Parallel research** — Map-reduce: split a research question into 5 sub-topics, research each in parallel, synthesize into one report.
```

**Step 2: Commit**

```bash
git add docs/features/orchestration.md
git commit -m "docs: add Orchestration & ReAct feature reference"
```

---

## Task 14: Dashboard Reference

**Files:**
- Create: `docs/features/dashboard.md`

**Content structure:**

```markdown
# Web Dashboard

> Setup wizard, chat interface, behavior management, settings, and more.

## Accessing the Dashboard

\`\`\`
http://localhost:18800/dashboard
\`\`\`

## Setup Wizard

[12-step guided setup: Welcome → Vault → Password → Identity → Preferences → Personality → Appearance → Provider → Channels → Connections → Complete]

## Pages

### Chat

[Real-time conversation with streaming responses. Transparency footer shows confidence, sources, personality traits. "Why?" button for full provenance breakdown.]

### Behaviors

[Create, edit, pause, resume, delete behaviors. Visual cron builder.]

### Memory Manager

[Browse, search, edit, delete memories. Filter by category. Forget topics. Export data.]

### User Profile ("About Me")

[Shows what Auxiora knows about you: domain expertise, communication style, satisfaction trends, active decisions, correction patterns.]

### Settings

[7 settings pages: Personality, Provider, Channels, Connections, Architect, Ambient, Appearance, Notifications, Security, Audit]

## Authentication

[Password protection via Argon2id hash. JWT sessions with configurable expiry.]

## Use Cases

1. **First-time setup** — Walk through the wizard to configure vault, provider, personality, and channels in 10 minutes.
2. **Daily driver** — Chat interface as primary interaction point, with transparency showing how responses are generated.
3. **Memory audit** — Review what the assistant remembers, correct mistakes, forget sensitive topics.
```

**Step 2: Commit**

```bash
git add docs/features/dashboard.md
git commit -m "docs: add Dashboard feature reference"
```

---

## Task 15: Desktop App Reference

**Files:**
- Create: `docs/features/desktop.md`

**Content structure:**

```markdown
# Desktop Companion App

> Tauri-based native app with menu bar integration, global hotkeys, and push-to-talk overlay.

## Features

- Menu bar / system tray integration
- Global hotkeys for quick access
- Push-to-talk voice overlay
- Native notifications
- Health monitoring bridge
- Auto-start on login

## Installation

[Download from releases or build from source with Tauri 2.x]

## Configuration

[Hotkey customization, notification preferences, auto-start toggle]

## Use Cases

1. **Quick capture** — Global hotkey opens a text field anywhere. Type a thought, it goes to memory.
2. **Voice assistant** — Push-to-talk from any application. Ask a question without switching windows.
3. **Status monitor** — Menu bar icon shows system health. Red dot = something needs attention.
```

**Step 2: Commit**

```bash
git add docs/features/desktop.md
git commit -m "docs: add Desktop App feature reference"
```

---

## Task 16: CLI Reference

**Files:**
- Create: `docs/features/cli.md`

**Content structure:**

```markdown
# CLI Reference

> Complete command reference for the `auxiora` command-line interface.

## Commands

### Core

| Command | Description |
|---------|-------------|
| `auxiora init` | Interactive setup wizard |
| `auxiora start` | Start the assistant (opens dashboard) |
| `auxiora doctor` | System health check |
| `auxiora paths` | Show file and directory locations |

### Vault

| Command | Description |
|---------|-------------|
| `auxiora vault add <NAME>` | Add/update a credential |
| `auxiora vault list` | List stored credential names |
| `auxiora vault status` | Show configured vs missing |
| `auxiora vault remove <NAME>` | Remove a credential |
| `auxiora vault get <NAME>` | Print value (scripting) |

### Personality

| Command | Description |
|---------|-------------|
| `auxiora personality list` | Show available templates |
| `auxiora personality set <name>` | Apply a personality template |

### Behaviors

| Command | Description |
|---------|-------------|
| `auxiora behaviors list` | Show all behaviors |
| `auxiora behaviors create` | Create a new behavior |
| `auxiora behaviors pause <id>` | Pause a behavior |
| `auxiora behaviors resume <id>` | Resume a behavior |
| `auxiora behaviors delete <id>` | Delete a behavior |

### Trust & Security

| Command | Description |
|---------|-------------|
| `auxiora trust set <domain> <level>` | Set trust level |
| `auxiora trust status` | Show all trust levels |
| `auxiora audit` | View audit log |
| `auxiora auth` | Manage authentication |

### Daemon

| Command | Description |
|---------|-------------|
| `auxiora daemon install` | Install system service |
| `auxiora daemon start` | Start daemon |
| `auxiora daemon stop` | Stop daemon |
| `auxiora daemon status` | Check daemon status |
| `auxiora daemon restart` | Restart daemon |
| `auxiora daemon uninstall` | Remove system service |

### Advanced

| Command | Description |
|---------|-------------|
| `auxiora models` | List available models |
| `auxiora memory` | Memory management |
| `auxiora plugin` | Plugin management |
| `auxiora connect` | Connector management |
| `auxiora ambient` | Ambient mode control |
| `auxiora update` | Check for / apply updates |
| `auxiora desktop` | Desktop app management |
| `auxiora cloud` | Cloud features |
| `auxiora team` | Team management |
| `auxiora workflow` | Workflow management |

## Global Flags

| Flag | Description |
|------|-------------|
| `--help` | Show help for any command |
| `--version` | Show version |
| `--verbose` | Verbose output |
```

**Step 2: Commit**

```bash
git add docs/features/cli.md
git commit -m "docs: add CLI Reference"
```

---

## Task 17: Plugins & Marketplace Reference

**Files:**
- Create: `docs/features/plugins-and-marketplace.md`

**Content structure:**

```markdown
# Plugins & Marketplace

> Extend Auxiora with plugins, self-authoring skills, and a community marketplace.

## Plugin System

### Loading Plugins

[Plugins loaded from ~/.auxiora/plugins/. Sandboxed execution.]

### Self-Authoring Skills

[The assistant can create its own skills: validator checks quality, author generates code, installer saves to disk. `create_skill` tool available in conversations.]

## Marketplace

### Searching

[Browse published personalities and plugins via dashboard or API]

### Publishing

[Package your personality or plugin, publish to the registry]

### API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/personalities` | GET | Search personalities |
| `/api/v1/personalities/:id` | GET | Get personality details |
| `/api/v1/personalities/install` | POST | Install a personality |
| `/api/v1/personalities/publish` | POST | Publish a personality |

## Use Cases

1. **Custom skill** — "Create a skill that summarizes my Notion daily notes every evening."
2. **Community personality** — Browse marketplace for pre-built Architect presets optimized for specific domains.
3. **Team sharing** — Publish internal tools as plugins for your team's Auxiora instances.
```

**Step 2: Commit**

```bash
git add docs/features/plugins-and-marketplace.md
git commit -m "docs: add Plugins & Marketplace feature reference"
```

---

## Task 18: MCP Integration Reference

**Files:**
- Create: `docs/features/mcp.md`

**Content structure:**

```markdown
# MCP Integration

> Model Context Protocol: expose Auxiora as tools for other AI agents, and connect to external MCP servers.

## MCP Server (Exposing Auxiora)

### Available Tools

| Tool | Description |
|------|-------------|
| `memory_search` | Search Auxiora's memory |
| `memory_list` | List memories by category |
| `memory_add` | Add a new memory |
| `memory_delete` | Delete a memory |
| `user_model_get` | Get the user model |
| `personality_get` | Get current personality config |
| `send_message` | Send a message through Auxiora |

### Setup

[Configure MCP server in your AI client (Claude Desktop, etc.) pointing at Auxiora]

## MCP Client (Connecting External Servers)

[Auxiora can connect to external MCP servers, making their tools available to the assistant]

## Use Cases

1. **Claude Desktop integration** — Add Auxiora as an MCP server in Claude Desktop. Claude can search your memories, check your calendar, send messages through your channels.
2. **Multi-agent workflow** — External AI agents access Auxiora's memory and personality context through MCP tools.
3. **Tool aggregation** — Connect weather, stock, and news MCP servers to give Auxiora access to real-time data.
```

**Step 2: Commit**

```bash
git add docs/features/mcp.md
git commit -m "docs: add MCP Integration feature reference"
```

---

## Task 19: Feature Index

**Files:**
- Create: `docs/features/README.md`

**Content structure:**

```markdown
# Auxiora Feature Reference

> Complete documentation for every Auxiora capability.

## Getting Started

New to Auxiora? Start here: **[Getting Started Guide](../guide/getting-started.md)**

## Feature Documentation

### Security & Infrastructure
- **[Vault & Security](vault-and-security.md)** — Encrypted vault, audit logs, trust system, SSRF protection
- **[AI Providers](providers.md)** — 10+ providers, model routing, cost tracking

### Communication
- **[Messaging Channels](channels.md)** — 12 platform adapters (Discord, Telegram, Slack, and more)
- **[Service Connectors](connectors.md)** — 11 integrations (GitHub, Notion, Home Assistant, and more)

### Intelligence
- **[Personality System](personality.md)** — SOUL.md, The Architect engine, presets, transparency
- **[Memory](memory.md)** — Semantic memory, provenance tracking, selective forgetting, export
- **[Behaviors](behaviors.md)** — Scheduled tasks, conditional monitors, reminders
- **[Ambient Intelligence](ambient.md)** — Proactive briefings, pattern detection, anticipation
- **[Voice Mode](voice.md)** — Speech-to-text, text-to-speech, wake-word, real-time conversation
- **[Browser Control](browser.md)** — Headless automation with SSRF protection
- **[Research Agent](research.md)** — Multi-source research with citations

### Orchestration
- **[Orchestration & ReAct](orchestration.md)** — Multi-agent patterns, reasoning loops, job queue

### Applications
- **[Web Dashboard](dashboard.md)** — Setup wizard, chat, settings, memory manager
- **[Desktop App](desktop.md)** — Menu bar, hotkeys, push-to-talk overlay
- **[CLI Reference](cli.md)** — Complete command reference

### Extensibility
- **[Plugins & Marketplace](plugins-and-marketplace.md)** — Plugin system, self-authoring skills, marketplace
- **[MCP Integration](mcp.md)** — MCP server and client for AI agent interop
```

**Step 2: Commit**

```bash
git add docs/features/README.md
git commit -m "docs: add feature documentation index"
```

---

## Execution Summary

| Task | Document | Type |
|------|----------|------|
| 1 | Getting Started Guide | User guide |
| 2 | Vault & Security | Feature ref |
| 3 | AI Providers | Feature ref |
| 4 | Messaging Channels | Feature ref |
| 5 | Service Connectors | Feature ref |
| 6 | Personality System | Feature ref |
| 7 | Memory System | Feature ref |
| 8 | Behaviors | Feature ref |
| 9 | Ambient Intelligence | Feature ref |
| 10 | Voice Mode | Feature ref |
| 11 | Browser Control | Feature ref |
| 12 | Research Agent | Feature ref |
| 13 | Orchestration & ReAct | Feature ref |
| 14 | Dashboard | Feature ref |
| 15 | Desktop App | Feature ref |
| 16 | CLI Reference | Feature ref |
| 17 | Plugins & Marketplace | Feature ref |
| 18 | MCP Integration | Feature ref |
| 19 | Feature Index | Navigation |

**Total: 19 documents (1 guide + 17 feature refs + 1 index)**
