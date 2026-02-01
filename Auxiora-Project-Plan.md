# Auxiora: Project Plan & Development Roadmap

## Personal AI Assistant — Security-First, Cross-Platform, Autonomous
### *Latin: auxilium — help, support, reinforcement*

---

## Executive Summary

**What we're building:** A fully autonomous personal AI assistant that runs on your own devices, connects to the messaging platforms you already use, encrypts all credentials, works natively across macOS/Linux/Windows 11, and has a distinct personality. Think OpenClaw, rebuilt from scratch with security as the foundation and a threat manager's paranoia baked into every layer.

**What OpenClaw is (and isn't):** OpenClaw has ~8,400 commits, 100+ contributors, and a massive feature surface that grew organically over months. A lot of that is platform-specific polish (macOS menu bar app, iOS/Android nodes, Swift UI, etc.) and edge-case handling. The core architecture — gateway, agent loop, channels, sessions — is what matters. We're building that core right, with stronger security defaults, then expanding.

**Realistic timeline with Claude Code:** 4–6 weeks for a production-capable v1.0, working 4–6 hours/day. Claude Code accelerates the mechanical coding (probably 3–5x faster than hand-typing), but the design decisions, testing on real platforms, debugging OS-specific issues, and integration testing with real APIs still take human time.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Auxiora Architecture                   │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ Discord  │  │ Telegram │  │  Slack   │  │ WebChat│  │
│  │ Adapter  │  │ Adapter  │  │ Adapter  │  │   UI   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘  │
│       │              │              │             │       │
│  ┌────▼──────────────▼──────────────▼─────────────▼──┐   │
│  │              Gateway (WebSocket + HTTP)            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐ │   │
│  │  │  Router  │ │ Sessions │ │   Rate Limiter    │ │   │
│  │  │& Pairing │ │ Manager  │ │ & Input Sanitizer │ │   │
│  │  └──────────┘ └──────────┘ └───────────────────┘ │   │
│  └───────────────────────┬───────────────────────────┘   │
│                          │                                │
│  ┌───────────────────────▼───────────────────────────┐   │
│  │              Agent Runtime                         │   │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐ │   │
│  │  │ Provider │ │Personality│ │    Tool System    │ │   │
│  │  │ Factory  │ │  Engine   │ │ (bash, browse,    │ │   │
│  │  │(failover)│ │ (SOUL.md) │ │  cron, webhooks)  │ │   │
│  │  └──────────┘ └──────────┘ └───────────────────┘ │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  ┌───────────────────────────────────────────────────┐   │
│  │              Security Layer                        │   │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐ │   │
│  │  │ AES-256  │ │ Argon2id │ │  Tamper-Evident   │ │   │
│  │  │   Vault  │ │   KDF    │ │   Audit Logging   │ │   │
│  │  └──────────┘ └──────────┘ └───────────────────┘ │   │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐ │   │
│  │  │ JWT Auth │ │ OS Key-  │ │  Prompt Injection │ │   │
│  │  │& Pairing │ │  chain   │ │    Detection      │ │   │
│  │  └──────────┘ └──────────┘ └───────────────────┘ │   │
│  └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation & Security Core

**Duration:** 5–7 days
**Claude Code estimate:** ~60% of code is generated, ~40% is design/testing

### What gets built:

1. **Project scaffolding**
   - TypeScript monorepo (pnpm workspaces)
   - Zod-validated config system with env var override (AUXIORA_ prefix)
   - Cross-platform path resolution (XDG on Linux, ~/Library on macOS, %APPDATA% on Windows)
   - Daemon generation (launchd plist, systemd unit, Windows Task Scheduler XML)

2. **Encrypted credential vault**
   - AES-256-GCM encryption with unique IV per operation
   - Argon2id key derivation (64MB memory-hard, resistant to GPU attacks)
   - PBKDF2 fallback if native argon2 module won't compile
   - OS keychain integration via keytar (macOS Keychain, Windows Credential Manager, libsecret on Linux)
   - Hybrid store: tries OS keychain first, falls back to file vault
   - Vault file permissions enforced (0600 on Unix)
   - Secure memory zeroing of key buffers after use
   - Master password with enforced complexity (12+ chars, mixed case, symbols)
   - Vault backup/export with separate encryption password

3. **Tamper-evident audit logging**
   - Chained SHA-256 hashes (each entry links to previous)
   - Log rotation with configurable size limits
   - Sensitive field auto-redaction (passwords, tokens, keys)
   - Chain verification command for integrity checking
   - Structured JSON format for SIEM ingestion (you could feed these to Splunk)

4. **Gateway authentication**
   - JWT token auth with configurable expiry
   - Refresh token rotation
   - Token revocation list
   - Rate limiter (per-IP and per-sender, sliding window)
   - DM pairing system (6-char hex codes, 15-min expiry)
   - Pairing allowlist with persistence

### Claude Code workflow for Phase 1:
```
# Day 1-2: Scaffold + vault
claude "Create TypeScript project with pnpm workspaces. Build an AES-256-GCM 
credential vault with Argon2id key derivation. Include OS keychain fallback."

# Day 3-4: Audit + auth
claude "Build tamper-evident audit logger with chained hashes. Then build JWT 
gateway auth with rate limiting and DM pairing system."

# Day 5: Config + platform
claude "Build Zod-validated config manager with env var overlay. Add 
cross-platform path resolution and daemon config generation for all 3 OSes."

# Day 6-7: Testing + hardening
claude "Write comprehensive tests for the vault, including wrong password, 
corruption recovery, concurrent access, and memory zeroing verification."
```

### Deliverables:
- `auxiora vault list|add|remove` working
- `auxiora doctor` runs security diagnostics
- Config file auto-created at platform-appropriate path
- All credentials encrypted at rest, never logged in plaintext

---

## Phase 2: Gateway & Agent Runtime

**Duration:** 7–10 days
**Claude Code estimate:** ~70% generated code, ~30% integration/debugging

### What gets built:

1. **WebSocket gateway**
   - HTTP server for REST API + dashboard + health checks
   - WebSocket server for real-time bidirectional communication
   - Client connection management with auth handshake
   - Security headers (HSTS, X-Frame-Options, CSP)
   - CORS with configurable origins
   - Graceful shutdown with connection draining

2. **Session manager**
   - Per-channel/sender session isolation
   - Context windowing (rolling message history with token budget)
   - Session compaction (AI-generated summaries of old context)
   - Session persistence to disk (auto-save, crash recovery)
   - TTL-based expiration with cleanup
   - Chat commands: /status, /new, /reset, /compact, /model, /help

3. **AI provider abstraction**
   - Provider factory with runtime registration
   - Anthropic provider (Claude API, streaming, proper message alternation)
   - OpenAI provider (GPT/o-series, streaming)
   - Model failover: primary -> fallback with configurable retry
   - Streaming support with chunk-by-chunk delivery to channels
   - Token usage tracking per session
   - API key validation on setup

4. **Input sanitization & prompt injection defense**
   - Pattern detection for common injection techniques
   - Message length limits
   - Null byte stripping
   - Flagging (not blocking) suspicious patterns for audit
   - API key format validation per provider

### Claude Code workflow for Phase 2:
```
# Day 1-3: Gateway server
claude "Build WebSocket + HTTP gateway with client management, auth handshake, 
security headers, and health API endpoints."

# Day 4-5: Sessions
claude "Build session manager with per-sender isolation, context windowing, 
disk persistence, and chat command handling."

# Day 6-8: Providers
claude "Build AI provider abstraction. Implement Anthropic Claude provider with 
streaming and message alternation fixing. Then OpenAI provider. Add failover."

# Day 9-10: Integration testing
claude "Wire gateway -> sessions -> providers together. Test end-to-end message 
flow. Add input sanitization pipeline."
```

### Deliverables:
- `auxiora gateway --port 18789` starts and serves WebSocket + HTTP
- WebChat accessible at http://localhost:18789
- Messages flow: WebChat -> Gateway -> Claude API -> Response -> WebChat
- Session history persists across gateway restarts
- /status and /new commands work

---

## Phase 3: Channel Adapters

**Duration:** 7–10 days
**Claude Code estimate:** ~65% generated, ~35% debugging real API integrations

### What gets built:

1. **Channel adapter interface**
   - Common interface: connect, disconnect, sendMessage, onMessage
   - Message normalization (each platform's format -> unified InboundMessage)
   - Attachment handling (images, audio, video, files)
   - Message chunking for platforms with length limits (Discord: 2000 chars)
   - Typing indicators
   - Error recovery with exponential backoff

2. **Discord adapter** (discord.js)
   - Bot token auth from vault
   - DM and guild message handling
   - Mention-gated activation in servers
   - Slash command registration
   - Rich embeds for formatted responses
   - Message chunking (2000 char limit)

3. **Telegram adapter** (grammY)
   - Bot token from vault
   - Private and group chat support
   - Markdown formatting in responses
   - Inline keyboard for commands
   - Webhook or polling mode (configurable)

4. **Slack adapter** (@slack/bolt)
   - Bot + app token from vault
   - Socket mode (no public URL needed)
   - Thread-aware responses
   - Block Kit formatting

5. **WebChat (built-in)**
   - Served from gateway HTTP server
   - WebSocket-based real-time messaging
   - Dark theme, responsive UI
   - Message history display
   - Connection status indicator
   - Mobile-friendly layout

### Platform-specific considerations:

| Platform | Auth | Message Limit | Groups | Rich Content |
|----------|------|---------------|--------|-------------|
| Discord | Bot token | 2000 chars | Guild + DM | Embeds |
| Telegram | Bot token | 4096 chars | Group + Private | Markdown |
| Slack | Bot + App token | 40000 chars | Channel + DM | Block Kit |
| WebChat | JWT/password | Unlimited | N/A | HTML |

### Claude Code workflow for Phase 3:
```
# Day 1-2: Base adapter + WebChat
claude "Build channel adapter interface and WebChat implementation served from 
the gateway."

# Day 3-4: Discord
claude "Build Discord adapter with discord.js. Handle DMs, guild messages, 
mention gating, message chunking, and slash commands."

# Day 5-6: Telegram
claude "Build Telegram adapter with grammY. Handle private/group messages, 
markdown formatting, and inline keyboards."

# Day 7-8: Slack  
claude "Build Slack adapter with @slack/bolt in socket mode. Handle threads, 
Block Kit formatting."

# Day 9-10: Integration + pairing
claude "Wire all adapters through the pairing system. Test DM pairing flow 
end-to-end on each platform."
```

### Deliverables:
- `auxiora onboard` walks through channel setup for each platform
- Messages received on Discord/Telegram/Slack get AI responses
- DM pairing works: unknown sender gets code, owner approves, sender is allowlisted
- WebChat dashboard shows all channel activity

---

## Phase 4: Personality, Proactivity & Autonomy

**Duration:** 5–7 days
**Claude Code estimate:** ~50% generated, ~50% prompt engineering & tuning

This is where your assistant stops being a chatbot and becomes a character. This phase is the differentiator.

### What gets built:

1. **Personality engine (SOUL.md)**
   - Workspace directory: ~/.auxiora/workspace/
   - SOUL.md: Defines the assistant's personality, tone, values, humor style
   - AGENTS.md: System prompt with behavioral rules
   - IDENTITY.md: Name, backstory, communication style
   - USER.md: Learned preferences about you (auto-updated)
   - All injected into the system prompt dynamically

   Example SOUL.md structure:
   ```markdown
   # Auxiora Identity

   ## Name
   [Your chosen name — e.g., "Sentinel", "Athena", "Ghost"]

   ## Personality
   - Witty but not try-hard. Think dry humor with technical depth.
   - Proactive: doesn't wait to be asked. Surfaces relevant info.
   - Security-minded: flags risks without being preachy.
   - Direct: leads with answers, not caveats.

   ## Communication Style
   - No em dashes (owner preference)
   - Technical precision when discussing security topics
   - Casual but competent in general conversation
   - Uses analogies from cybersecurity to explain other domains
   
   ## Values
   - Privacy is non-negotiable
   - Efficiency over ceremony
   - Honesty over comfort
   ```

2. **Proactive behavior system**
   - Cron-based scheduled tasks (node-cron)
   - Morning briefing: summarize overnight alerts, calendar, weather
   - Webhook ingestion: receive events from external systems
   - Gmail Pub/Sub integration for email triggers
   - "Hey, I noticed..." pattern: agent can initiate conversations
   - Configurable proactivity level (off / subtle / active / aggressive)

3. **Memory & learning**
   - USER.md auto-update: tracks preferences, communication patterns
   - Conversation summaries stored per-session
   - Cross-session memory via workspace files
   - Preference extraction: "you usually prefer X" patterns
   - Forgetting: explicit /forget command to remove learned info

4. **Tool system**
   - Bash/shell execution (sandboxed for non-owner sessions)
   - File read/write within workspace
   - Web browsing (via headless Chrome/Playwright)
   - Cron job management
   - Session-to-session messaging (multi-agent coordination)
   - Tool allowlist/denylist per session type

### Claude Code workflow for Phase 4:
```
# Day 1-2: Personality engine
claude "Build the workspace system with SOUL.md, AGENTS.md, IDENTITY.md, 
USER.md loading. Inject into system prompts dynamically."

# Day 3-4: Proactivity
claude "Build cron-based scheduled tasks, webhook ingestion endpoint, and 
proactive message initiation system."

# Day 5-6: Memory & tools
claude "Build cross-session memory via workspace files. Add bash execution 
tool with sandboxing. Add file read/write tools."

# Day 7: Personality tuning
# This is manual prompt engineering work — iterate on SOUL.md until the 
# personality feels right. Test across channels.
```

### Deliverables:
- Assistant has a consistent personality across all channels
- Morning briefing arrives on your preferred channel at configured time
- Webhooks can trigger the assistant (e.g., from TORQ, Splunk, etc.)
- Assistant remembers your preferences across conversations
- /forget command works for privacy control

---

## Phase 5: Cross-Platform Polish & Packaging

**Duration:** 5–7 days
**Claude Code estimate:** ~60% generated, ~40% OS-specific debugging

### What gets built:

1. **macOS**
   - launchd daemon with auto-restart
   - Keychain integration (native, no file vault needed)
   - Notification support via osascript
   - Optional: menu bar app (Electron or Swift — stretch goal)

2. **Linux**
   - systemd user service
   - libsecret/GNOME Keyring integration
   - Desktop notifications via notify-send
   - Snap or AppImage packaging (stretch goal)

3. **Windows 11 (native, no WSL)**
   - Windows Task Scheduler service
   - Windows Credential Manager integration
   - PowerShell-friendly CLI
   - Windows Terminal color support
   - Named pipes instead of Unix sockets
   - Optional: system tray app (Electron — stretch goal)

4. **Binary packaging (Node.js SEA)**
   - Single executable application using Node 22+ built-in SEA support
   - Platform binaries: macOS arm64, Linux x64, Windows x64
   - `pnpm run build:binary` produces all three
   - ~50-80MB per binary (includes Node runtime)
   - No Node.js installation required for end users
   - CI pipeline integration for automated builds on release
   - Codesigning for macOS and Windows (stretch goal)

5. **CLI experience**
   - Interactive onboarding wizard (inquirer)
   - Colorized output (chalk)
   - Progress spinners (ora)
   - Box-formatted status displays (boxen)
   - Update notifications
   - `auxiora doctor` comprehensive diagnostics

6. **Dashboard UI**
   - Embedded in gateway (no separate build step for basic version)
   - Real-time status via WebSocket
   - Session list with message counts
   - Credential store status
   - System health metrics
   - WebChat interface

### Claude Code workflow for Phase 5:
```
# Day 1-2: macOS polish
claude "Add launchd daemon auto-install, macOS Keychain integration, and 
native notifications. Test full flow on macOS."

# Day 3-4: Linux + Windows
claude "Add systemd service, libsecret integration for Linux. Add Windows 
Task Scheduler, Credential Manager, named pipe support."

# Day 5-6: CLI polish
claude "Polish the CLI with colors, spinners, boxed output, update notifier. 
Make auxiora doctor comprehensive."

# Day 7: Dashboard
claude "Build embedded dashboard with real-time status, session list, and 
WebChat interface."
```

### Deliverables:
- `npm install -g auxiora && auxiora onboard --install-daemon` works on all 3 OSes
- Daemon auto-starts on login
- Credentials stored in OS keychain where available
- `auxiora doctor` identifies platform-specific issues
- Dashboard accessible at configured port

---

## Phase 6: Hardening & Production Readiness

**Duration:** 5–7 days
**Claude Code estimate:** ~40% generated, ~60% manual review and testing

### What gets built:

1. **Security hardening**
   - Penetration testing the gateway (auth bypass, injection, SSRF)
   - Prompt injection resistance testing (adversarial inputs)
   - Dependency audit (npm audit, Snyk)
   - CSP headers for dashboard
   - TLS support for non-loopback deployments
   - Secret scanning (detect-secrets baseline)
   - Rate limit tuning under load

2. **Reliability**
   - Crash recovery (session persistence, vault integrity after unclean shutdown)
   - Connection retry with exponential backoff per channel
   - Graceful degradation (channels fail independently)
   - Health check endpoint for external monitoring
   - Log rotation and disk space management

3. **Testing**
   - Unit tests for vault encryption/decryption
   - Unit tests for session management
   - Integration tests for gateway WebSocket protocol
   - E2E tests for message flow through each channel
   - Security-specific tests (wrong password, brute force, token revocation)

4. **Documentation**
   - README with quick start
   - Security model documentation
   - Configuration reference (every key, type, default)
   - Channel setup guides (with screenshots)
   - Troubleshooting guide
   - Architecture decision records (ADRs)

### Deliverables:
- Zero known security vulnerabilities
- 80%+ test coverage on security-critical paths
- Complete documentation
- `auxiora doctor` catches all common misconfigurations
- Audit log chain stays intact through crash scenarios

---

## Time Estimates Summary

| Phase | Description | Calendar Days | Claude Code Hours | Manual Hours |
|-------|-------------|:------------:|:-----------------:|:------------:|
| 1 | Foundation & Security | 5–7 | 8–12 | 8–12 |
| 2 | Gateway & Agent | 7–10 | 12–18 | 10–15 |
| 3 | Channel Adapters | 7–10 | 10–16 | 12–18 |
| 4 | Personality & Autonomy | 5–7 | 6–10 | 12–16 |
| 5 | Cross-Platform Polish | 5–7 | 8–12 | 10–15 |
| 6 | Hardening & Production | 5–7 | 6–10 | 15–20 |
| **Total** | | **34–48 days** | **50–78 hrs** | **67–96 hrs** |

**Realistic timeline: 5–7 weeks** working 3–5 hours/day.

**With intense focus (6–8 hrs/day): 4–5 weeks.**

### Where Claude Code saves the most time:
- Boilerplate: TypeScript interfaces, Zod schemas, Express middleware (~90% automated)
- Crypto implementations: vault encryption, JWT auth, hashing (~80% automated)
- Channel adapters: repetitive connect/send/receive patterns (~75% automated)
- CLI commands: inquirer prompts, chalk formatting (~85% automated)
- Tests: generating test cases from implementations (~70% automated)

### Where Claude Code can't help much:
- Real API integration debugging (Discord rate limits, Telegram webhook quirks)
- OS-specific issues (macOS Keychain entitlements, Windows named pipes)
- Personality tuning (iterating on SOUL.md until it feels right)
- Security review (thinking adversarially about your own code)
- Cross-platform testing (actually running on all 3 OSes)

---

## Tech Stack Decision

| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript (strict mode) | Type safety, ecosystem, cross-platform |
| Language (v2.0) | Rust via napi-rs | Native addons for vault, audit hashing |
| Runtime | Node.js 22+ | LTS, native fetch, WebSocket, crypto |
| Binary | Node.js SEA | Single executable, no install step |
| Package Manager | pnpm | Fast, strict, workspaces |
| AI (primary) | Anthropic Claude API | Best prompt injection resistance, long context |
| AI (fallback) | OpenAI API | Broad model selection, fallback |
| Encryption | AES-256-GCM + Argon2id | Industry standard authenticated encryption |
| Config | Zod | Runtime validation, type inference |
| CLI | Commander + Inquirer | Battle-tested, great UX |
| WebSocket | ws | Fastest Node.js WebSocket library |
| HTTP | Express | Mature, middleware ecosystem |
| Discord | discord.js | Official-quality, well-maintained |
| Telegram | grammY | Modern, TypeScript-first |
| Slack | @slack/bolt | Official SDK |
| Testing | Vitest | Fast, TypeScript-native |
| Logging | Custom (chained hashes) | Tamper-evident, SIEM-ready |

---

## Security Architecture Decisions

These are opinionated choices based on a threat manager's perspective:

1. **Vault over .env files.** Environment variables leak into process listings, crash dumps, and child processes. An encrypted vault with Argon2id key derivation is categorically more secure.

2. **OS keychain when available.** macOS Keychain, Windows Credential Manager, and Linux libsecret are hardware-backed on modern devices. Use them first, vault as fallback.

3. **DM pairing by default.** Unknown senders NEVER get processed. They get a pairing code. Owner approves explicitly. This prevents the #1 attack vector against personal AI bots.

4. **Tamper-evident audit logs.** Every security event is logged with a chained hash. If someone modifies a log entry, the chain breaks and `auxiora doctor` catches it.

5. **Loopback binding by default.** The gateway binds to 127.0.0.1. Exposing to 0.0.0.0 requires explicit config AND auth mode != "none".

6. **Input sanitization without blocking.** Suspicious patterns get flagged in audit logs but not silently dropped. You want visibility into what people are trying, not a black hole.

7. **No secrets in URLs.** Webhook tokens go in headers, not query parameters. Query params leak into server logs, browser history, and referrer headers.

---

## Stretch Goals (Post v1.0)

These are features OpenClaw has that are nice-to-have but not essential for a powerful v1.0:

| Feature | Complexity | Value | Phase |
|---------|:----------:|:-----:|:-----:|
| Browser control (Playwright) | High | High | v1.1 |
| Voice wake + talk mode | High | Medium | v1.2 |
| iMessage adapter (macOS only) | Medium | Medium | v1.1 |
| Signal adapter (signal-cli) | Medium | Medium | v1.1 |
| Microsoft Teams adapter | Medium | High (for work) | v1.1 |
| Matrix adapter | Low | Low | v1.2 |
| iOS/Android companion app | Very High | High | v2.0 |
| macOS menu bar app | Medium | Medium | v1.2 |
| Docker containerization | Medium | Medium | v1.1 |
| Tailscale Serve/Funnel | Low | High | v1.1 |
| Multi-agent routing | High | Medium | v1.2 |
| Skills/plugin marketplace | Very High | Medium | v2.0 |
| Canvas/visual workspace | Very High | Low | v2.0 |

---

## v2.0: Rust Native Performance Layer

The v1.0 ships as pure TypeScript. For v2.0, the performance-critical and security-critical modules get rewritten as native Rust addons via napi-rs, then compiled into the Node.js binary.

### Why napi-rs:
- Compiles Rust to native Node.js addons (.node files)
- Zero-copy data transfer between Rust and JS
- Cross-compile from one machine to all platforms
- No runtime overhead vs calling a subprocess

### Modules targeted for Rust rewrite:

| Module | Current (v1.0) | Rust (v2.0) | Benefit |
|--------|---------------|-------------|---------|
| Vault encryption | Node.js crypto (OpenSSL) | ring / RustCrypto | Constant-time ops, no OpenSSL dependency |
| Argon2id KDF | argon2 npm package | argon2 crate (native) | Eliminate native build issues on Windows |
| Audit log hashing | Node.js crypto SHA-256 | sha2 crate | ~3x throughput on chain verification |
| Input sanitization | JS regex patterns | regex crate + aho-corasick | ~10x faster pattern matching |
| Token validation | jsonwebtoken npm | jsonwebtoken crate | Constant-time signature verification |

### v2.0 architecture:

```
┌──────────────────────────────────────┐
│         TypeScript (Node.js)         │
│  Gateway, Channels, CLI, Sessions,   │
│  Provider integrations, Personality  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │    napi-rs bridge layer        │  │
│  ├────────────────────────────────┤  │
│  │     Rust Native Addons         │  │
│  │  ┌────────┐ ┌──────────────┐  │  │
│  │  │ Vault  │ │ Audit Hasher │  │  │
│  │  │ Crypto │ │              │  │  │
│  │  └────────┘ └──────────────┘  │  │
│  │  ┌────────┐ ┌──────────────┐  │  │
│  │  │  KDF   │ │   Sanitizer  │  │  │
│  │  │Argon2id│ │              │  │  │
│  │  └────────┘ └──────────────┘  │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### Timeline estimate: 2-3 weeks after v1.0 ships
- Week 1: Set up napi-rs build pipeline, rewrite vault crypto
- Week 2: Rewrite audit hasher and KDF, integration testing
- Week 3: Rewrite sanitizer, cross-platform binary builds, benchmarking

### The rule: Rust replaces implementations, not interfaces
The TypeScript API surface stays identical. Swapping in Rust addons is invisible to every other module. If a Rust addon fails to load (wrong platform, missing build), it falls back to the TypeScript implementation automatically.

---

## Getting Started (Day 1 Checklist)

Before touching Claude Code:

- [ ] Choose a project name and identity for your assistant
- [ ] Set up a GitHub repo (private initially)
- [ ] Have API keys ready: Anthropic (Claude Pro/Max), and optionally OpenAI
- [ ] Have bot tokens ready for whichever channels you want first
- [ ] Decide on your assistant's personality (draft SOUL.md)
- [ ] Install Node.js 22+, pnpm, and Claude Code
- [ ] Read this plan through once more

Then start Phase 1 with:
```bash
claude "Initialize a TypeScript project called auxiora with pnpm. 
Create the encrypted credential vault module first."
```

---

*Plan version 1.1 — January 31, 2026*
*Project: Auxiora (Latin: auxilium — help, support, reinforcement)*
*v1.0: TypeScript + Node.js SEA binaries | v2.0: Rust native performance layer*
*Designed for a security professional who knows what's actually at stake when an AI assistant has access to your messaging platforms.*
