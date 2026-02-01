# Auxiora Setup Guide

Complete guide to setting up Auxiora from scratch.

## Prerequisites

- **Node.js** >= 22.0.0 ([Download](https://nodejs.org/))
- **pnpm** >= 9.15.0 (`npm install -g pnpm`)
- **Operating System**: macOS, Linux, or Windows 11

## Installation

### Option 1: Install from npm (Recommended)

```bash
npm install -g auxiora
```

### Option 2: Install from Source

```bash
# Clone the repository
git clone https://github.com/trollByte/auxiora.git
cd auxiora

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Link CLI globally (optional)
cd packages/cli
pnpm link --global
```

---

## Quick Start (5 Minutes)

### 1. Initialize Vault

```bash
# Add your AI provider key
auxiora vault add ANTHROPIC_API_KEY

# Or for Claude Pro/Max users with OAuth
auxiora vault add ANTHROPIC_OAUTH_TOKEN

# Or use OpenAI
auxiora vault add OPENAI_API_KEY
```

**Enter a strong vault password when prompted.** This password encrypts all your credentials.

### 2. Set Up Personality (Optional but Recommended)

```bash
# Copy personality templates
mkdir -p ~/.auxiora/workspace
cp templates/*.md ~/.auxiora/workspace/

# Customize your assistant
$EDITOR ~/.auxiora/workspace/SOUL.md
$EDITOR ~/.auxiora/workspace/USER.md
```

### 3. Start Auxiora

```bash
# Start interactively
auxiora start

# Or run as daemon
auxiora daemon install
auxiora daemon start
```

### 4. Open WebChat

Open your browser to: `http://localhost:18789`

**Done!** You now have a fully functional AI assistant.

---

## Advanced Setup

### Adding Messaging Channels

#### Discord Bot

1. Create a bot at [Discord Developer Portal](https://discord.com/developers/applications)
2. Enable "Message Content Intent"
3. Copy bot token and add to vault:

```bash
auxiora vault add DISCORD_BOT_TOKEN
```

4. Restart Auxiora

#### Telegram Bot

1. Talk to [@BotFather](https://t.me/botfather) on Telegram
2. Create new bot with `/newbot`
3. Copy token and add to vault:

```bash
auxiora vault add TELEGRAM_BOT_TOKEN
```

#### Slack App

1. Create app at [Slack API](https://api.slack.com/apps)
2. Enable Socket Mode
3. Add bot scopes: `chat:write`, `app_mentions:read`, `channels:history`
4. Install to workspace
5. Add tokens to vault:

```bash
auxiora vault add SLACK_BOT_TOKEN     # xoxb-...
auxiora vault add SLACK_APP_TOKEN     # xapp-...
```

#### Twilio (SMS/WhatsApp)

1. Sign up at [Twilio](https://www.twilio.com/)
2. Get phone number
3. Add credentials:

```bash
auxiora vault add TWILIO_ACCOUNT_SID
auxiora vault add TWILIO_AUTH_TOKEN
auxiora vault add TWILIO_PHONE_NUMBER
```

---

## Configuration

### Environment Variables

Copy `.env.example` to `.env` (or use vault for sensitive values):

```bash
cp .env.example .env
$EDITOR .env
```

**Security Warning**: `.env` files are NOT secure. Use the vault for secrets.

### Configuration File

Advanced users can create `~/.auxiora/config.json`:

```json
{
  "gateway": {
    "host": "127.0.0.1",
    "port": 18789
  },
  "provider": {
    "primary": "anthropic",
    "fallback": "openai"
  },
  "rateLimit": {
    "enabled": true,
    "maxRequests": 100,
    "windowMs": 900000
  }
}
```

---

## Daemon Setup

### macOS (launchd)

```bash
# Install daemon
auxiora daemon install

# Daemon will start on login
# Logs: ~/Library/Logs/auxiora.log
```

### Linux (systemd)

```bash
# Install daemon
auxiora daemon install

# Enable on boot
auxiora daemon enable

# Check status
auxiora daemon status

# View logs
journalctl --user -u auxiora -f
```

### Windows (Task Scheduler)

```powershell
# Install daemon
auxiora daemon install

# Daemon will start on login
# View in Task Scheduler: "Auxiora_auxiora"
```

---

## Security Hardening

### 1. Use Strong Vault Password

```bash
# Change vault password
auxiora vault change-password
```

Use a password manager to generate a strong passphrase.

### 2. Enable JWT Authentication (Production)

Edit `~/.auxiora/config.json`:

```json
{
  "auth": {
    "mode": "jwt",
    "jwtSecret": "<generate-random-secret>"
  }
}
```

Generate secret:
```bash
openssl rand -hex 32
```

### 3. Review Audit Logs

```bash
# View recent audit events
auxiora audit tail

# Check for suspicious activity
auxiora audit search "failed"
```

### 4. DM Pairing Configuration

Ensure pairing is enabled (default):

```json
{
  "pairing": {
    "enabled": true,
    "requireConfirmation": true
  }
}
```

---

## Troubleshooting

### Vault Won't Unlock

```bash
# Check vault exists
auxiora paths

# Verify vault file permissions
ls -la ~/.config/auxiora/vault.enc  # Linux
ls -la ~/Library/Application\ Support/auxiora/vault.enc  # macOS

# Initialize new vault (WARNING: destroys old vault)
auxiora vault init
```

### Gateway Won't Start

```bash
# Check if port is in use
lsof -i :18789

# Try different port
AUXIORA_GATEWAY_PORT=18790 auxiora start

# Check logs
auxiora daemon status
journalctl --user -u auxiora -n 50  # Linux
cat ~/Library/Logs/auxiora.log  # macOS
```

### Channel Won't Connect

```bash
# Verify credentials
auxiora vault list

# Check vault has required secrets
auxiora vault status

# Test token validity
auxiora vault get DISCORD_BOT_TOKEN  # Should print token
```

### Build Errors (Source Install)

```bash
# Clear build cache
pnpm clean
rm -rf node_modules
rm pnpm-lock.yaml

# Reinstall
pnpm install
pnpm build

# Run tests
pnpm test
```

---

## Health Checks

### Check System Status

```bash
# Comprehensive diagnostics
auxiora doctor

# Manual checks
auxiora vault status      # Credential status
auxiora daemon status     # Daemon running?
auxiora paths             # File locations
```

### API Health Check

```bash
curl http://localhost:18789/health
```

Expected output:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 1234
}
```

---

## Upgrading

### From npm

```bash
npm update -g auxiora
```

### From Source

```bash
cd auxiora
git pull
pnpm install
pnpm build
```

### Migration

See [CHANGELOG.md](CHANGELOG.md) for migration guides between versions.

---

## Uninstalling

### Remove Daemon

```bash
auxiora daemon uninstall
```

### Remove CLI (npm)

```bash
npm uninstall -g auxiora
```

### Remove Data Files

**WARNING**: This deletes all credentials, sessions, and logs.

```bash
# Linux
rm -rf ~/.config/auxiora ~/.local/share/auxiora ~/.local/state/auxiora

# macOS
rm -rf ~/Library/Application\ Support/auxiora ~/Library/Logs/auxiora

# Windows
rmdir /s %APPDATA%\auxiora
```

---

## Getting Help

- **Documentation**: [README.md](README.md)
- **Configuration**: [.env.example](.env.example)
- **Changelog**: [CHANGELOG.md](CHANGELOG.md)
- **Issues**: [GitHub Issues](https://github.com/trollByte/auxiora/issues)

---

## Example Workflows

### Personal Assistant

```bash
# 1. Add API key
auxiora vault add ANTHROPIC_API_KEY

# 2. Customize personality
cp templates/SOUL.md ~/.auxiora/workspace/
$EDITOR ~/.auxiora/workspace/SOUL.md

# 3. Add your context
$EDITOR ~/.auxiora/workspace/USER.md

# 4. Install as daemon
auxiora daemon install && auxiora daemon start

# 5. Chat via WebChat
open http://localhost:18789
```

### Team Discord Bot

```bash
# 1. Add AI key and Discord token
auxiora vault add ANTHROPIC_API_KEY
auxiora vault add DISCORD_BOT_TOKEN

# 2. Enable mention-only mode
export AUXIORA_CHANNELS_DISCORD_MENTION_ONLY=true

# 3. Start daemon
auxiora daemon install && auxiora daemon start

# 4. Invite bot to Discord server
# Use OAuth2 URL from Discord Developer Portal
```

### Home Automation Hub

```bash
# 1. Add credentials
auxiora vault add ANTHROPIC_API_KEY

# 2. Configure webhooks (future feature)
# Edit ~/.auxiora/workspace/AGENTS.md

# 3. Set up scheduled tasks (future feature)

# 4. Run as daemon
auxiora daemon install && auxiora daemon start
```

---

**Next**: Customize your [personality templates](templates/README.md) 🚀
