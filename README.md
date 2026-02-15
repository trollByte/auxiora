# Auxiora

**Secure AI Assistant Platform — Your Intelligence, Your Rules**

> *auxilium (Latin) — help, support, reinforcement*

Auxiora is a security-first personal AI assistant that runs on your own devices, connects to messaging platforms you already use, and keeps your credentials encrypted. Built by someone who knows what's actually at stake when an AI has access to your life.

---

## Install

Pick whichever method you prefer — they all give you the same `auxiora` command.

### npm (all platforms)

```bash
npm install -g auxiora
```

### Homebrew (macOS)

```bash
brew install auxiora/tap/auxiora
```

### apt (Debian / Ubuntu)

```bash
curl -fsSL https://apt.auxiora.dev/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/auxiora.gpg
echo "deb [signed-by=/usr/share/keyrings/auxiora.gpg] https://apt.auxiora.dev stable main" | sudo tee /etc/apt/sources.list.d/auxiora.list
sudo apt update && sudo apt install auxiora
```

### Shell script (Linux / macOS)

```bash
curl -fsSL https://auxiora.dev/install.sh | bash
```

### Docker

```bash
docker run -d --name auxiora -p 18800:18800 -v auxiora-data:/data ghcr.io/trollbyte/auxiora
```

Open `http://localhost:18800/dashboard` to complete setup. See [`deploy/docker/docker-compose.yml`](deploy/docker/docker-compose.yml) for a full production setup with environment variables.

After installation, Auxiora starts automatically and opens the setup wizard in your browser.

---

## Quick Start

```bash
# Start the assistant (opens dashboard in browser)
auxiora start

# Or set up interactively
auxiora init

# Add an API key to the encrypted vault
auxiora vault add ANTHROPIC_API_KEY

# Check system health
auxiora doctor
```

---

## Features

### Core

- **Encrypted Vault** — AES-256-GCM with Argon2id key derivation. No plaintext secrets, ever.
- **Zero-Trust by Default** — Unknown senders get a pairing code, not AI access.
- **Tamper-Evident Logs** — Chained SHA-256 hashes detect modifications.
- **Trust Levels** — 5-level autonomy system (0=None to 4=Full Autonomy) across 9 domains.

### AI Providers

Model-agnostic with 10+ providers:

Anthropic (Claude) | OpenAI (GPT) | Google (Gemini) | Groq | Ollama | DeepSeek | Cohere | X AI (Grok) | Replicate | Any OpenAI-compatible API (vLLM, etc.)

Includes streaming, tool use, thinking levels, and intelligent model routing with cost tracking.

### Messaging Channels

12 platforms supported:

Discord | Telegram | Slack | Microsoft Teams | WhatsApp | Signal | Email (SMTP) | Matrix | Google Chat | Zalo | BlueBubbles (iMessage) | Twilio (SMS)

### Service Connectors

8 integrations for proactive assistance:

GitHub | Notion | Linear | Google Workspace (Calendar, Gmail, Drive) | Microsoft 365 (Outlook, OneDrive) | Home Assistant | Social Media (X, LinkedIn, Reddit) | Custom via connector SDK

### Intelligence

- **Personality System** — SOUL.md with 8 interaction modes, tone controls, voice profiles, and a marketplace.
- **Memory** — Semantic, temporal, and entity-based partitions with pattern detection.
- **Behaviors** — Scheduled tasks (cron), monitors (conditional polling), and one-shot reminders.
- **Ambient Mode** — Proactive briefings, pattern anticipation, and quiet notifications.
- **Browser Control** — Headless Chromium automation with SSRF protection.
- **Voice Mode** — STT (Whisper), TTS (OpenAI, ElevenLabs), wake-word detection, real-time conversation.
- **Research Agent** — Brave Search integration, citation tracking, multi-source synthesis.

### Apps

- **Web Dashboard** — Setup wizard, chat, behavior management, settings, personality editor.
- **Desktop App** — Tauri-based with menu bar, global hotkeys, push-to-talk overlay.
- **Daemon** — Cross-platform background service (launchd, systemd, Task Scheduler).

---

## Vault

All credentials are stored in an encrypted vault:

- **AES-256-GCM** — Authenticated encryption
- **Argon2id** — Memory-hard key derivation (64MB, resistant to GPU attacks)
- **Secure memory zeroing** — Keys cleared from RAM after use

```bash
auxiora vault add ANTHROPIC_API_KEY    # Add a credential
auxiora vault list                     # List stored names (never values)
auxiora vault status                   # Check configured vs missing
auxiora vault remove DISCORD_BOT_TOKEN # Remove a credential
auxiora vault get ANTHROPIC_API_KEY    # Print value (for scripting)
```

### Required Secrets

| Secret | Purpose |
|--------|---------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key (or any provider key) |
| `DISCORD_BOT_TOKEN` | Discord bot token (if using Discord) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (if using Telegram) |
| `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` | Slack tokens (if using Slack) |

Vault location:
- **macOS**: `~/Library/Application Support/auxiora/vault.enc`
- **Linux**: `~/.config/auxiora/vault.enc`
- **Windows**: `%APPDATA%\auxiora\vault.enc`

---

## Personality

Auxiora's personality is defined by SOUL.md with fine-grained controls:

```bash
auxiora personality list       # Show available templates
auxiora personality set <name> # Apply a personality template
```

### Tone Controls

| Parameter | Range | Description |
|-----------|-------|-------------|
| Warmth | 0–1 | Cold/clinical to warm/friendly |
| Directness | 0–1 | Diplomatic to blunt |
| Humor | 0–1 | Serious to playful |
| Formality | 0–1 | Casual to formal |

### Interaction Modes

8 modes auto-detected from context or manually selected:

`operator` | `analyst` | `advisor` | `writer` | `socratic` | `legal` | `roast` | `companion`

### Personality Files

- **`SOUL.md`** — Core personality, principles, interaction style
- **`USER.md`** — Your preferences, workflows, context
- **`AGENTS.md`** — Tool capabilities and permissions (optional)
- **`IDENTITY.md`** — System identity and operational context (optional)

Edit via the dashboard personality editor or directly in `~/.auxiora/workspace/`.

---

## Behaviors

Proactive automation without external cron jobs:

```bash
auxiora behaviors list                        # Show all behaviors
auxiora behaviors create --type scheduled     # Create scheduled task
auxiora behaviors create --type monitor       # Create conditional monitor
auxiora behaviors create --type reminder      # Create one-shot reminder
auxiora behaviors pause <id>                  # Pause a behavior
```

| Type | Description | Example |
|------|-------------|---------|
| **Scheduled** | Cron-based recurring tasks | Daily standup summary at 9am |
| **Monitor** | Conditional polling (60s–24h) | Alert when GitHub PR is approved |
| **Reminder** | One-shot at a specific time | "Remind me to call dentist at 3pm" |

Auto-pauses after 3 consecutive failures. Max 50 active monitors.

---

## Daemon

Run as a background service:

```bash
auxiora daemon install    # Install system service
auxiora daemon start      # Start
auxiora daemon status     # Check status
auxiora daemon stop       # Stop
auxiora daemon restart    # Restart
auxiora daemon uninstall  # Remove service
```

| Platform | Backend |
|----------|---------|
| macOS | launchd (`~/Library/LaunchAgents`) |
| Linux | systemd user service (`~/.config/systemd/user`) |
| Windows | Task Scheduler |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Auxiora Architecture                          │
│                                                                      │
│  Channels                                                            │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌───────┐  │
│  │Discord │ │Telegram│ │ Slack  │ │ Teams  │ │WebChat │ │ +7    │  │
│  └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └──┬────┘  │
│      └──────────┴──────────┴──────────┴──────────┴─────────┘        │
│                              │                                       │
│  ┌───────────────────────────▼──────────────────────────────────┐   │
│  │               Gateway (HTTP + WebSocket)                      │   │
│  │  Router │ Sessions │ Rate Limiter │ Pairing │ Auth            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│  ┌───────────────────────────▼──────────────────────────────────┐   │
│  │                    Agent Runtime                               │   │
│  │  Providers │ Personality │ Tools │ Memory │ Behaviors          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│  ┌───────────────────────────▼──────────────────────────────────┐   │
│  │                  Intelligence Layer                            │   │
│  │  Browser │ Voice │ Ambient │ Research │ Connectors             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│  ┌───────────────────────────▼──────────────────────────────────┐   │
│  │                   Security Layer                               │   │
│  │  Vault (AES-256) │ Audit Logger │ Trust System │ Sandboxing   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Security Philosophy

1. **Vault over .env files.** Environment variables leak into process listings, crash dumps, and child processes.
2. **DM pairing by default.** Unknown senders never get processed. They get a pairing code. You approve explicitly.
3. **Tamper-evident audit logs.** Every security event is logged with a chained hash. Modifications break the chain.
4. **Loopback binding by default.** The gateway binds to 127.0.0.1. Exposing to 0.0.0.0 requires explicit config + TLS.
5. **Secrets never touch the model.** Credentials are injected at tool execution time, never in prompts.
6. **Trust before autonomy.** Every autonomous action requires an appropriate trust level. Actions are audited with reasoning.

---

## Development

```bash
# Clone
git clone https://github.com/trollByte/auxiora.git
cd auxiora

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type-check
pnpm typecheck
```

The monorepo uses pnpm workspaces with 60+ packages under `packages/`.

---

## Roadmap

- [x] Encrypted credential vault
- [x] Tamper-evident audit logging
- [x] Gateway with WebSocket + HTTP
- [x] Session manager with persistence
- [x] AI provider abstraction (10+ providers)
- [x] Messaging channels (12 platforms)
- [x] Personality system with modes and tone controls
- [x] WebChat UI and dashboard
- [x] Cross-platform daemon
- [x] Proactive behaviors (scheduled, monitors, reminders)
- [x] Browser automation
- [x] Voice mode (STT/TTS with wake-word)
- [x] Memory system with pattern detection
- [x] Service connectors (GitHub, Notion, Linear, etc.)
- [x] Ambient intelligence
- [x] Trust/autonomy system
- [x] Desktop app (Tauri)
- [x] Multi-chat system
- [x] Easy cross-platform installation (npm, Homebrew, apt)
- [ ] Plugin marketplace
- [ ] Mobile app
- [ ] Cloud sync and multi-tenancy

---

## License

Apache-2.0

---

*The best intelligence doesn't replace you — it supports you.*
