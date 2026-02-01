# Auxiora

**Secure AI Assistant Platform — Your Intelligence, Your Rules**

> *auxilium (Latin) — help, support, reinforcement*

Auxiora is a security-first personal AI assistant that runs on your own devices, connects to messaging platforms you already use, and keeps your credentials encrypted. Built by someone who knows what's actually at stake when an AI has access to your life.

---

## Features

- 🔐 **Encrypted Vault** — AES-256-GCM with Argon2id key derivation. No plaintext secrets.
- 🔒 **Zero-Trust by Default** — Unknown senders get a pairing code, not AI access.
- 📋 **Tamper-Evident Logs** — Chained hashes detect modifications.
- 🤖 **Model Agnostic** — Claude, GPT, Gemini, local LLMs. Your choice.
- 💬 **Multi-Platform** — Discord, Telegram, Slack, WebChat, more coming.
- 🖥️ **Cross-Platform** — macOS, Linux, Windows 11 (native, no WSL).
- 🧠 **Personality System** — SOUL.md defines who your assistant is.

---

## Quick Start

```bash
# Install globally
npm install -g auxiora

# Initialize the vault (creates encrypted credential store)
auxiora vault add ANTHROPIC_API_KEY

# Start the gateway
auxiora gateway start

# Open WebChat
open http://localhost:18789
```

---

## Vault

All credentials are stored in an encrypted vault using:
- **AES-256-GCM** — Authenticated encryption
- **Argon2id** — Memory-hard key derivation (64MB, resistant to GPU attacks)
- **Secure memory zeroing** — Keys cleared from RAM after use

```bash
# See what secrets are needed and what's configured
auxiora vault secrets  # Show all known secret names
auxiora vault status   # Check what's configured vs missing

# Add a credential
auxiora vault add DISCORD_BOT_TOKEN

# List stored credentials (names only, never values)
auxiora vault list

# Remove a credential
auxiora vault remove DISCORD_BOT_TOKEN

# Get a credential (prints to stdout for scripting)
auxiora vault get ANTHROPIC_API_KEY
```

### Required Secrets

| Secret | Purpose |
|--------|---------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key (or OPENAI_API_KEY) |
| `DISCORD_BOT_TOKEN` | Discord bot token (if using Discord) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (if using Telegram) |
| `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` | Slack tokens (if using Slack) |
| `TWILIO_*` | Twilio credentials (if using SMS/WhatsApp) |

Vault location:
- **macOS**: `~/Library/Application Support/auxiora/vault.enc`
- **Linux**: `~/.config/auxiora/vault.enc`
- **Windows**: `%APPDATA%\auxiora\vault.enc`

---

## Personality Customization

Auxiora's personality is defined by markdown files in `~/.auxiora/workspace/`:

```bash
# Copy templates
mkdir -p ~/.auxiora/workspace
cp templates/*.md ~/.auxiora/workspace/

# Edit your personality
$EDITOR ~/.auxiora/workspace/SOUL.md
$EDITOR ~/.auxiora/workspace/USER.md
```

### Personality Files

- **`SOUL.md`** — Core personality, principles, interaction style
- **`AGENTS.md`** — Tool capabilities and permissions (optional)
- **`IDENTITY.md`** — System identity and operational context (optional)
- **`USER.md`** — Your preferences, workflows, context (recommended)

See [`templates/README.md`](templates/README.md) for detailed customization guide.

---

## Daemon Management

Run Auxiora as a background service:

```bash
# Install as system daemon
auxiora daemon install

# Start the daemon
auxiora daemon start

# Check status
auxiora daemon status

# Stop the daemon
auxiora daemon stop

# Restart
auxiora daemon restart

# Uninstall
auxiora daemon uninstall
```

Platform support:
- **macOS**: launchd (`~/Library/LaunchAgents`)
- **Linux**: systemd user service (`~/.config/systemd/user`)
- **Windows**: Task Scheduler

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Auxiora Architecture                    │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Discord  │  │ Telegram │  │  Slack   │  │  WebChat │    │
│  │ Adapter  │  │ Adapter  │  │ Adapter  │  │    UI    │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       └──────────────┴──────────────┴──────────────┘         │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────┐    │
│  │              Gateway (HTTP + WebSocket)              │    │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐   │    │
│  │  │  Router  │ │ Sessions │ │   Rate Limiter    │   │    │
│  │  │& Pairing │ │ Manager  │ │ & Input Sanitizer │   │    │
│  │  └──────────┘ └──────────┘ └───────────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────┐    │
│  │                Agent Runtime                         │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │    │
│  │  │ Provider │ │Personality│ │  Tools   │            │    │
│  │  │ Factory  │ │ (SOUL.md) │ │  System  │            │    │
│  │  └──────────┘ └──────────┘ └──────────┘            │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────┐    │
│  │              Security Layer                          │    │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐   │    │
│  │  │  Vault   │ │  Audit   │ │   Prompt Injection │   │    │
│  │  │ (AES256) │ │  Logger  │ │     Detection      │   │    │
│  │  └──────────┘ └──────────┘ └───────────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Philosophy

1. **Vault over .env files.** Environment variables leak into process listings, crash dumps, and child processes.

2. **DM pairing by default.** Unknown senders never get processed. They get a pairing code. You approve explicitly.

3. **Tamper-evident audit logs.** Every security event is logged with a chained hash. Modifications break the chain.

4. **Loopback binding by default.** The gateway binds to 127.0.0.1. Exposing to 0.0.0.0 requires explicit config.

5. **Secrets never touch the model.** Credentials are injected at tool execution time, never in prompts.

---

## Development

```bash
# Clone
git clone https://github.com/trollByte/auxiora.git
cd auxiora

# Install dependencies
npm install

# Build
npm run build

# Run CLI
node dist/cli/index.js vault list
```

---

## Roadmap

- [x] Encrypted credential vault
- [x] Tamper-evident audit logging
- [x] Gateway with WebSocket + HTTP
- [x] Session manager with persistence
- [x] AI provider abstraction (Claude, GPT)
- [x] Discord adapter
- [x] Telegram adapter
- [x] Slack adapter
- [x] Twilio adapter (SMS)
- [x] Personality system (SOUL.md with templates)
- [x] WebChat UI
- [x] Cross-platform daemon (launchd, systemd, Task Scheduler)
- [ ] Proactive behaviors (cron, webhooks)
- [ ] Tool system with sandboxing

---

## License

ISC

---

*The best intelligence doesn't replace you — it supports you.*
