# OpenClaw Patterns Useful for Auxiora

**Source:** `/home/ai-work/git/openclaw`
**Date:** 2026-02-20

OpenClaw is a mature personal AI assistant (TypeScript ESM monorepo, pnpm, Node 22+, vitest) with 15+ messaging channels, 54+ skills, and mobile apps. Same space as Auxiora but further along on channels and battle-tested at scale.

---

## High-Value Picks

### 1. sqlite-vec for Vector Search

**What:** OpenClaw uses `sqlite-vec` 0.1.7-alpha for memory search with hybrid BM25 + vector search, atomic reindexing, and async embedding batching (OpenAI, Gemini, local llama).

**Where in OpenClaw:** `src/memory/`

**Why useful:** Auxiora has `packages/vector-store/` but sqlite-vec gives persistence and proper ANN search without a separate database. Fits Auxiora's SQLite-first approach (sessions already use SQLite).

**Key files to study:**
- `src/memory/` — Vector store with embeddings
- Embedding strategies: OpenAI batch API, Gemini batch, sqlite-vec, node-llama

---

### 2. Voice Integration Patterns

**What:** ElevenLabs TTS with multiple voices, Edge TTS fallback, always-on Voice Wake and Talk Mode for macOS/iOS/Android, telephony TTS with resampling.

**Where in OpenClaw:** `src/tts/`, voice-related agent tools

**Why useful:** Auxiora has `packages/voice/`, `packages/tts/`, `packages/stt/` stubbed. OpenClaw's implementation is a ready reference for the voice mode feature.

**Key patterns:**
- ElevenLabs as primary, Edge TTS as free fallback
- Always-on speech detection (Voice Wake)
- Talk Mode for continuous conversation
- Resampling for telephony compatibility

---

### 3. Sender Identity & DM Pairing

**What:** Normalized sender identity across 15+ channels. Unknown senders get short pairing codes to whitelist themselves. Per-channel allowlist/blocklist policies.

**Where in OpenClaw:** `src/channels/sender-identity.ts`, `sender-label.ts`, `mention-gating.ts`, `command-gating.ts`

**Why useful:** Auxiora's channels accept messages without sender verification. DM pairing adds a security layer for untrusted messaging input (Discord DMs, Telegram, etc.).

**Key patterns:**
- Unified sender model normalizing identity across platforms
- Short-code pairing for unknown senders
- Channel-specific security policies (Slack/Discord/Telegram custom rules)
- Mention gating — bot only responds when mentioned in groups

---

### 4. Plugin Discovery

**What:** Runtime scanning of workspace, global, and bundled extensions. Plugins declare capabilities via `openclaw.plugin.json` manifests. Registration provides gateway RPC methods, HTTP handlers, agent tools, CLI commands, skills, and auto-reply hooks.

**Where in OpenClaw:** `extensions/` (31 plugins), plugin loading in gateway

**Why useful:** Auxiora's `packages/plugins/` could adopt manifest-based discovery for a richer extension ecosystem. No code execution needed for discovery — just config validation.

**Key patterns:**
- Config paths: workspace extensions, global extensions, bundled plugins
- Declarative manifest (`openclaw.plugin.json`)
- Trust model: in-process plugins with config validation before execution
- Auto-registration of tools, skills, HTTP handlers from manifest

---

### 5. Browser Node Proxying

**What:** Multi-target browser control — sandbox containers, host Chromium, or remote node-based proxying. CDP-based automation with snapshot protocol (accessibility tree), action schema, persistent profiles per user.

**Where in OpenClaw:** `src/browser/`

**Why useful:** Auxiora's `packages/browser/` handles local Chromium. Node-based proxying would enable distributed browser control (e.g., browser running on a different machine than the runtime).

**Key patterns:**
- Sandbox/host/node target selection
- Accessibility tree snapshots (role + text extraction)
- Profile management for persistent browser state
- PDF export from browser sessions

---

### 6. Message Deduplication

**What:** Cross-channel dedup logic preventing the same message from being processed twice. HTML normalization for channel-specific quirks. Image dimension validation and size capping.

**Where in OpenClaw:** `src/agents/tools/browser-tool.schema.ts`, `pi-embedded-helpers/messaging-dedupe.ts`

**Why useful:** Auxiora currently has no dedupe — if a user sends the same message on Discord and webchat simultaneously, both get processed independently.

---

### 7. Doctor Command

**What:** CLI command that runs config health checks, migrations, and security validation at startup. Catches misconfigurations before they cause runtime errors.

**Where in OpenClaw:** `src/cli/commands/doctor.ts`

**Why useful:** Auxiora has no equivalent. A doctor command would catch issues like:
- Missing API keys before attempting provider connections
- Invalid channel configs before connecting to Discord/Telegram
- Database schema mismatches (like the metadata column issue we just fixed)
- Vault health checks

---

## Secondary Patterns (Lower Priority)

### Session Isolation & Multi-Agent Workspaces
- Per-agent workspaces with isolated config, sessions, tools, memory
- Session activation modes: always, mention, voice trigger, user triggered
- Queue modes: sequential, parallel, batch
- Auxiora already has `packages/orchestrator/` covering similar ground

### Channel Chunking & Routing
- Per-channel message chunking (Discord 2000 char, Telegram 4096, etc.)
- Reply-tag routing for tracking threads across channels
- Auxiora's channel system handles this but less thoroughly

### Testing Strategies
- Live tests with real API keys in Docker containers
- E2E tests for onboarding flows, Docker install, QR import
- Multi-config test suites: unit, integration, e2e, live, smoke
- 70% coverage thresholds enforced

### Configuration System
- Zod + TypeBox schemas with runtime validation
- Versioned config migrations with rollback
- YAML + JSON5 support
- Auxiora already uses zod; migration chain is similar

---

## Tech Stack Comparison

| Aspect | Auxiora | OpenClaw |
|--------|---------|----------|
| Runtime | Node 22+, ESM | Node 22+, ESM |
| Package manager | pnpm workspaces | pnpm workspaces |
| Testing | vitest | vitest (70% thresholds) |
| HTTP | express 5 | express 5 / hono 4 |
| WebSocket | ws | ws |
| Browser | playwright-core | playwright-core (CDP) |
| Validation | zod | zod + typebox |
| Vector search | custom in-memory | sqlite-vec |
| Channels | 5+ | 15+ |
| Mobile | none | Swift iOS, Kotlin Android |
| Personality | The Architect (trait mixing) | none (generic) |
| Self-awareness | consciousness, self-model | none |
