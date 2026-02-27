# Getting Started with Auxiora

> From zero to a working AI assistant in 15 minutes.

## What is Auxiora?

Auxiora is a security-first, self-hosted AI assistant that runs on your own devices. It connects to your messaging platforms, integrates with your tools, and keeps every credential encrypted in a local vault. Your data stays yours -- nothing leaves your machine unless you explicitly connect an external service.

## Prerequisites

- Node.js 22 or later
- An API key from at least one AI provider (Anthropic, OpenAI, Google, etc.)
- (Optional) A messaging platform bot token (Discord, Telegram, Slack, etc.)

## Installation

Pick the method that fits your environment.

### npm (recommended)

```bash
npm install -g auxiora
```

Requires Node.js 22 or later.

### One-liner (Linux / macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/trollByte/auxiora/main/scripts/install.sh | bash
```

The installer checks for Node.js 22+ and pnpm 9+, clones the repo, builds, and creates a launcher in `~/.local/bin/auxiora`. Run `install.sh --non-interactive` to skip the setup prompts.

### Docker

```bash
docker run -d \
  --name auxiora \
  -p 18800:18800 \
  -v auxiora-data:/data \
  ghcr.io/trollbyte/auxiora
```

### From source (manual)

```bash
git clone https://github.com/trollByte/auxiora.git
cd auxiora
pnpm install && pnpm build
node packages/cli/dist/index.js start
```

## First Run

### 1. Start Auxiora

```bash
auxiora start
```

This opens the setup wizard at `http://localhost:18800/dashboard`. If you are running headless or via Docker, open that URL in your browser manually.

### 2. Create Your Vault

The vault encrypts every secret with AES-256-GCM using an Argon2id-derived key. No credential ever touches the AI model in plaintext.

The setup wizard walks you through vault creation. To do it from the CLI instead:

```bash
auxiora vault add ANTHROPIC_API_KEY
# Paste your key when prompted -- it's encrypted immediately
```

### 3. Set Your Identity

Tell Auxiora who you are so it can personalize responses. The setup wizard collects your name and preferences, or you can edit `~/.auxiora/USER.md` directly:

```markdown
# About Me

- Name: Your Name
- Role: Software Engineer
- Preferences: concise answers, code examples in TypeScript
```

### 4. Choose a Personality

Auxiora ships with two personality engines:

- **SOUL.md** -- Fine-grained tone sliders (warmth, directness, humor, formality) and 8 interaction modes.
- **The Architect** -- Context-aware intelligence that detects conversation domains and mixes traits from 29 thinking styles.

```bash
auxiora personality list
auxiora personality set architect
```

### 5. Add a Provider

Anthropic works well as a primary provider. If you added `ANTHROPIC_API_KEY` in step 2, configure the provider in `~/.auxiora/config.json`:

```json
{
  "providers": {
    "primary": "anthropic",
    "anthropic": {
      "model": "claude-sonnet-4-6",
      "maxTokens": 4096
    }
  }
}
```

You can also configure this through **Settings > Provider** in the dashboard.

### 6. Connect a Channel (Optional)

Channels let you talk to Auxiora from Discord, Telegram, Slack, and 9 other platforms. Here is a quick Discord example:

1. Create a bot at the [Discord Developer Portal](https://discord.com/developers/applications).
2. Copy the bot token and store it:
   ```bash
   auxiora vault add DISCORD_BOT_TOKEN
   ```
3. Enable Discord in `~/.auxiora/config.json`:
   ```json
   {
     "channels": {
       "discord": { "enabled": true }
     }
   }
   ```
4. Invite the bot to your server and send it a message.

For full setup instructions for all 12 channels, see [Messaging Channels](../features/channels.md).

## Your First Conversation

Open the web chat at `http://localhost:18800/dashboard` and type a message. The assistant responds in real time with streaming text. A transparency footer below each response shows which personality traits were active and why.

Try something like:

```
What's the best way to handle errors in a Node.js REST API?
```

## Your First Behavior

Behaviors are proactive automations: scheduled tasks, monitors, and reminders.

Create a daily reminder from the CLI:

```bash
auxiora behaviors create --type reminder --message "Stand up and stretch" --at "17:00"
```

Or a recurring scheduled behavior:

```bash
auxiora behaviors create \
  --type scheduled \
  --cron "0 9 * * 1-5" \
  --prompt "Summarize my unread messages and today's calendar"
```

You can also create and manage behaviors from the **Behaviors** page in the dashboard.

## Your First Connector

Connectors integrate Auxiora with external services. Here is a quick GitHub setup:

1. Create a personal access token at [github.com/settings/tokens](https://github.com/settings/tokens).
2. Store it in the vault:
   ```bash
   auxiora vault add GITHUB_TOKEN
   ```
3. Enable the connector in `~/.auxiora/config.json`:
   ```json
   {
     "connectors": {
       "github": { "enabled": true }
     }
   }
   ```
4. Ask the assistant: *"List my open pull requests."*

For all 11 connectors, see [Service Connectors](../features/connectors.md).

## Health Check

Run the built-in diagnostics to verify everything is working:

```bash
auxiora doctor
```

This checks:

- Node.js version compatibility
- Vault status and required credentials
- Provider connectivity
- Channel connections
- Active behaviors and monitors
- Database integrity

A healthy system shows all green checks. Any issues include a suggested fix.

## Running as a Service

To keep Auxiora running in the background after you close the terminal:

```bash
auxiora daemon install
auxiora daemon start
```

This registers Auxiora as a system service:

- **macOS** -- launchd agent (`~/Library/LaunchAgents/`)
- **Linux** -- systemd user service (`~/.config/systemd/user/`)
- **Windows** -- Task Scheduler

Check status anytime with `auxiora daemon status`.

### Auto-Unseal for Unattended Restarts

By default the vault stays locked after a restart, meaning channels and providers are offline until you re-enter the password. **Sealed mode** solves this by encrypting the vault password with a machine-derived key so it auto-unlocks on restart -- no plaintext password on disk.

```bash
# Enable sealed auto-unseal (one-time, interactive)
auxiora vault seal
# Enter vault password, optionally add a PIN for extra security

# Now restarts auto-unseal the vault
auxiora daemon restart   # vault unlocks automatically
```

See [Vault & Security](../features/vault-and-security.md) for full details on sealed mode.

## What's Next?

- [Security & Vault](../features/vault-and-security.md) -- Trust levels, audit logs, encryption, sealed auto-unseal
- [AI Providers](../features/providers.md) -- Model routing, cost tracking, 10+ providers
- [Messaging Channels](../features/channels.md) -- Connect Discord, Telegram, Slack, and 9 more
- [Service Connectors](../features/connectors.md) -- GitHub, Notion, Home Assistant, and 8 more
- [Personality System](../features/personality.md) -- The Architect, SOUL.md, custom presets
- [Memory](../features/memory.md) -- How Auxiora remembers and learns about you
- [Behaviors](../features/behaviors.md) -- Scheduled tasks, monitors, reminders
- [All Features](../features/README.md) -- Complete feature index
