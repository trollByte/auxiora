# CLI Reference

> Complete command reference for the `auxiora` command-line interface.

## Overview

The `auxiora` CLI is the primary way to configure, control, and interact with your Auxiora instance from the terminal. Every operation available in the web dashboard has a CLI equivalent.

```bash
auxiora [command] [subcommand] [options]
```

## Commands

### Core

| Command | Description |
|---------|-------------|
| `auxiora init` | Interactive setup wizard -- walks through vault creation, provider setup, and personality selection |
| `auxiora start` | Start the gateway and open the dashboard (tries sealed auto-unseal if available) |
| `auxiora doctor` | System health check -- verifies vault, providers, channels, and connectivity |
| `auxiora paths` | Show file and directory locations (config, vault, data, logs) |

### Vault

Manage the encrypted credential vault. Secrets are encrypted with AES-256-GCM and derived via Argon2id.

| Command | Description |
|---------|-------------|
| `auxiora vault add <NAME>` | Add or update a credential (prompts for value securely) |
| `auxiora vault list` | List stored credential names (never displays values) |
| `auxiora vault status` | Show which credentials are configured vs. missing |
| `auxiora vault remove <NAME>` | Remove a credential from the vault |
| `auxiora vault get <NAME>` | Print a credential value to stdout (for scripting) |
| `auxiora vault seal` | Enable sealed auto-unseal (vault auto-unlocks on restart) |
| `auxiora vault unseal` | Disable sealed auto-unseal (deletes seal file) |

See [Vault & Security](vault-and-security.md) for encryption details, auto-unseal, and required secrets.

### Personality

| Command | Description |
|---------|-------------|
| `auxiora personality list` | Show available personality templates and presets |
| `auxiora personality set <name>` | Apply a personality template (e.g., `architect`, `soul`) |

See [Personality System](personality.md) for SOUL.md tone controls and The Architect engine.

### Behaviors

| Command | Description |
|---------|-------------|
| `auxiora behaviors list` | Show all behaviors (filter with `--type` or `--status`) |
| `auxiora behaviors create` | Create a new behavior (see options below) |
| `auxiora behaviors pause <id>` | Pause a behavior (stops execution, retains configuration) |
| `auxiora behaviors resume <id>` | Resume a paused behavior |
| `auxiora behaviors delete <id>` | Permanently remove a behavior |

**Create options:**

| Flag | Description |
|------|-------------|
| `--type <type>` | Behavior type: `scheduled`, `monitor`, `one-shot`, `event` |
| `--cron <expr>` | Cron expression (scheduled type) |
| `--interval <seconds>` | Polling interval in seconds (monitor type, min 60) |
| `--at <datetime>` | ISO 8601 fire time (one-shot type) |
| `--prompt <text>` | Action prompt for the assistant |
| `--message <text>` | Short message (one-shot reminders) |
| `--channel <name>` | Delivery channel (e.g., `telegram`, `slack`, `discord`) |
| `--source <name>` | Event source (event type) |
| `--event <name>` | Event name (event type) |
| `--condition <expr>` | Condition expression (event type) |

See [Behaviors](behaviors.md) for behavior types, error handling, and the durable job queue.

### Trust & Security

| Command | Description |
|---------|-------------|
| `auxiora trust set <domain> <level>` | Set the autonomy level (0--4) for a trust domain |
| `auxiora trust status` | Show current trust levels for all 9 domains |
| `auxiora audit` | View the tamper-evident audit log |
| `auxiora auth` | Manage dashboard authentication (set/reset password) |

See [Vault & Security](vault-and-security.md) for trust levels, audit logging, and SSRF protection.

### Daemon

Install and manage Auxiora as a system service. Uses launchd on macOS, systemd on Linux, and Task Scheduler on Windows.

| Command | Description |
|---------|-------------|
| `auxiora daemon install` | Install Auxiora as a system service |
| `auxiora daemon start` | Start the daemon |
| `auxiora daemon stop` | Stop the daemon |
| `auxiora daemon status` | Check whether the daemon is running |
| `auxiora daemon restart` | Restart the daemon |
| `auxiora daemon uninstall` | Remove the system service |

### Advanced

| Command | Description |
|---------|-------------|
| `auxiora models` | List available models from all configured providers |
| `auxiora memory` | Memory management (search, export, forget) |
| `auxiora plugin` | Plugin management (list, install, remove) |
| `auxiora connect` | Connector management (list, configure, test) |
| `auxiora ambient` | Ambient intelligence control (enable, disable, status) |
| `auxiora update` | Check for and apply updates (see options below) |
| `auxiora desktop` | Desktop companion app management |
| `auxiora cloud` | Cloud sync and remote features |
| `auxiora team` | Team management (multi-user instances) |
| `auxiora workflow` | Workflow management (orchestration patterns) |

**Update options:**

| Flag | Description |
|------|-------------|
| `--check` | Check for updates without installing |
| `--channel <channel>` | Update channel: `stable`, `beta`, or `nightly` |
| `--rollback` | Roll back to the previous version |
| `--force` | Force update even if already up to date |

See [Desktop App](desktop.md) for the `auxiora desktop` command details.

## Global Flags

These flags work with any command:

| Flag | Description |
|------|-------------|
| `--help` | Show help for any command or subcommand |
| `--version` | Show the current Auxiora version |
| `--verbose` | Enable verbose output for debugging |

## Examples

### First-time setup from the terminal

```bash
# Run the interactive setup wizard
auxiora init

# Or configure step by step:
auxiora vault add ANTHROPIC_API_KEY
auxiora personality set architect
auxiora start
```

### Daily operations

```bash
# Check system health
auxiora doctor

# Create a morning briefing behavior
auxiora behaviors create \
  --type scheduled \
  --cron "0 8 * * *" \
  --prompt "Generate my morning briefing: calendar, unread emails, weather" \
  --channel telegram

# Check what the assistant remembers
auxiora memory search "project deadlines"

# View audit trail
auxiora audit
```

### Running as a service

```bash
# Install and start the daemon
auxiora daemon install
auxiora daemon start

# Check status
auxiora daemon status

# View logs (platform-dependent)
# macOS: log show --predicate 'process == "auxiora"' --last 1h
# Linux: journalctl -u auxiora --since "1 hour ago"
```

### Unattended auto-unseal

```bash
# Seal the vault once (interactive — prompts for password + optional PIN)
auxiora vault seal

# Start with auto-unseal (no password prompt needed)
auxiora start

# If you sealed with a PIN, pass it via flag or env var
auxiora start --seal-pin 1234
AUXIORA_SEAL_PIN=1234 auxiora start

# Disable auto-unseal
auxiora vault unseal
```

### Self-update

```bash
# Check for updates
auxiora update --check

# Apply update
auxiora update

# Switch to beta channel
auxiora update --channel beta

# Roll back if something went wrong
auxiora update --rollback
```

## Related Documentation

- [Web Dashboard](dashboard.md) -- Browser-based alternative with the same capabilities
- [Vault & Security](vault-and-security.md) -- Vault encryption, trust system, audit logging
- [Behaviors](behaviors.md) -- Behavior types and configuration details
- [Personality System](personality.md) -- Personality templates and The Architect engine
- [Desktop App](desktop.md) -- Native companion app with global hotkeys and voice overlay
