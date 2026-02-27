# Vault & Security

> Auxiora's security model: encrypted vault, tamper-evident audit logs, and a 5-level trust system.

## Overview

Auxiora takes a vault-first approach to credentials: every secret is encrypted at rest with AES-256-GCM, derived from a master password through memory-hard key derivation. There are no `.env` files, no plaintext tokens on disk. By default every trust domain starts at level 0 (no autonomous action), so nothing happens without your explicit approval. Secrets are never included in AI model context -- the runtime retrieves them at the moment they are needed and zeros the memory immediately after.

## Encrypted Vault

### How It Works

When you create the vault, Auxiora generates a random 32-byte salt and derives an encryption key from your master password using **Argon2id** (64 MB memory cost, 3 iterations, 1 parallelism lane). This makes brute-force attacks prohibitively expensive even on GPU clusters.

Each credential is encrypted with **AES-256-GCM** using a fresh 12-byte initialization vector and a 16-byte authentication tag. On decryption, the authentication tag is verified before any plaintext is returned -- tampered ciphertext is rejected outright. After every cryptographic operation, key material is wiped from memory using secure buffer zeroing (`zeroBuffer`).

```
Master password
      |
      v
  Argon2id (64 MB, 3 iterations) + salt  -->  256-bit key
      |
      v
  AES-256-GCM encrypt/decrypt  -->  ciphertext + auth tag + IV
      |
      v
  zeroBuffer(key)  -->  key material wiped from memory
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `auxiora vault add <NAME>` | Add or update a credential (prompts for value securely) |
| `auxiora vault list` | List stored credential names (never prints values) |
| `auxiora vault status` | Show which credentials are configured vs missing |
| `auxiora vault remove <NAME>` | Remove a credential from the vault |
| `auxiora vault get <NAME>` | Print a credential value to stdout (for scripting) |

### Required Secrets

| Secret | Purpose | When Needed |
|--------|---------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API access | When using Anthropic as a provider |
| `OPENAI_API_KEY` | OpenAI API access | When using OpenAI as a provider |
| `GOOGLE_AI_API_KEY` | Google Gemini API access | When using Google as a provider |
| `DISCORD_BOT_TOKEN` | Discord bot authentication | When Discord channel is enabled |
| `TELEGRAM_BOT_TOKEN` | Telegram bot authentication | When Telegram channel is enabled |
| `SLACK_BOT_TOKEN` | Slack bot OAuth token | When Slack channel is enabled |
| `SLACK_APP_TOKEN` | Slack app-level token (Socket Mode) | When Slack channel is enabled |
| `GITHUB_TOKEN` | GitHub personal access token | When GitHub connector is enabled |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS API | When using ElevenLabs voice synthesis |

### Vault File Locations

The vault is stored as a single encrypted JSON file. Its location follows platform conventions:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/auxiora/vault.enc` |
| Linux | `~/.config/auxiora/vault.enc` |
| Windows | `%APPDATA%\auxiora\vault.enc` |

The vault file is created with `0600` permissions on Unix systems (owner read/write only).

## Sealed Auto-Unseal

### The Problem

When Auxiora restarts (crash, update, reboot), the vault stays locked and all channels go dead until someone manually enters the vault password. For unattended deployments (systemd service, Docker, headless server), this means downtime until you are back at the keyboard.

The `AUXIORA_VAULT_PASSWORD` env var works but stores the password in plaintext on disk. Sealed mode solves this.

### How It Works

Sealed mode encrypts your vault password with a machine-derived key so the vault can auto-unlock on restart **without a plaintext password on disk**.

```
One-time seal:
  Machine fingerprint: SHA-256(hostname + platform + machine-id)
  Seal key:            Argon2id(PIN || "", fingerprint_as_salt, 8 MB, 1 iter)
  seal.enc:            AES-256-GCM(vault_password, seal_key)

Every restart:
  Reconstruct fingerprint → derive seal key → decrypt vault password → unlock vault
```

- **Machine-bound** -- Moving `seal.enc` to another machine fails because the fingerprint is different.
- **Optional PIN** -- Adds defense-in-depth. Even on the same machine, an attacker needs the PIN.
- **PIN-less mode** -- For headless/Docker deployments, PIN can be omitted (machine binding alone).
- **Graceful fallback** -- If decryption fails, falls back to password prompt or `AUXIORA_VAULT_PASSWORD`.

### CLI Commands

| Command | Description |
|---------|-------------|
| `auxiora vault seal` | Enable sealed auto-unseal (prompts for vault password + optional PIN) |
| `auxiora vault unseal` | Disable sealed auto-unseal (deletes seal file) |

```bash
# Enable auto-unseal with a PIN
auxiora vault seal
# Enter vault password: ********
# Enter PIN (optional): 1234

# Enable auto-unseal without a PIN (machine-binding only)
auxiora vault seal --no-pin

# Disable auto-unseal
auxiora vault unseal
```

### Start with Auto-Unseal

When `seal.enc` exists, `auxiora start` automatically attempts to unseal the vault before falling back to a password prompt:

```bash
# Auto-unseal without PIN
auxiora start

# Auto-unseal with PIN
auxiora start --seal-pin 1234

# Or via environment variable
AUXIORA_SEAL_PIN=1234 auxiora start
```

### Dashboard

The auto-unseal toggle is available under **Settings > Security**. You can enable or disable sealed mode and see whether a PIN is required.

### Security Properties

| Property | Details |
|----------|---------|
| Encryption | AES-256-GCM (same as vault) |
| Key derivation | Argon2id with lighter params (8 MB, 1 iteration) -- fingerprint adds sufficient entropy |
| Machine binding | SHA-256 of hostname + platform + `/etc/machine-id` (Linux), `IOPlatformUUID` (macOS), or hostname+homedir (fallback) |
| Seal file permissions | `0600` on Unix (owner read/write only) |
| Memory safety | Seal key and recovered password are zeroed immediately after use |

### Seal File Format

The seal file (`seal.enc`) is stored alongside `vault.enc`:

```json
{
  "version": 1,
  "fingerprintHash": "hex(SHA-256(fingerprint))",
  "pinRequired": true,
  "iv": "base64",
  "data": "base64",
  "tag": "base64",
  "salt": "base64"
}
```

The `fingerprintHash` field is used for quick mismatch detection (not used in key derivation -- the raw fingerprint is).

## Audit Logging

### How It Works

Every security-relevant action is recorded in a tamper-evident audit log. Each entry includes a SHA-256 hash computed over the entry data concatenated with the previous entry's hash, forming a hash chain. If any entry is modified, deleted, or inserted, the chain breaks and verification fails.

```
Entry 1:  hash = SHA-256(prevHash + data)    prevHash = 000...000 (genesis)
Entry 2:  hash = SHA-256(prevHash + data)    prevHash = Entry 1's hash
Entry 3:  hash = SHA-256(prevHash + data)    prevHash = Entry 2's hash
...
```

Sensitive fields (passwords, tokens, API keys) are automatically redacted before being written to the log. The audit log file is set to `0600` permissions on Unix.

### What Gets Logged

The audit system tracks over 100 distinct event types, organized into categories:

- **Vault operations** -- unlock, lock, add, remove, access, password changes, seal, unseal
- **Authentication** -- login, logout, failed attempts, token refresh, JWT configuration
- **Pairing** -- code generated, accepted, rejected, expired
- **Channel activity** -- connected, disconnected, errors, messages sent/received
- **Trust changes** -- level changed, promotions, demotions, permission denied, action gated
- **Behavior lifecycle** -- created, updated, deleted, executed, paused, failed
- **Browser actions** -- navigate, click, type, screenshot, script execution
- **Security events** -- suspicious input, rate limiting, guardrail triggers
- **System events** -- startup, shutdown, errors
- **Connector operations** -- connected, disconnected, OAuth flows, action execution
- **Personality changes** -- resets, feedback, preset applied, corrections, data exports

### Viewing Audit Logs

```bash
# View recent audit entries
auxiora audit

# Verify the integrity of the hash chain
auxiora audit --verify
```

The `verify` command recomputes every hash in the chain and reports whether the log is intact or where tampering was detected.

## Trust System

### 5 Autonomy Levels

| Level | Name | Description | Example |
|-------|------|-------------|---------|
| 0 | None | No autonomous action (default) | -- |
| 1 | Inform | Notify about opportunities | "You have a meeting in 15 min" |
| 2 | Suggest | Propose actions for approval | "Should I reply to this email?" |
| 3 | Act & Report | Execute and notify afterward | Sends the reply, tells you after |
| 4 | Full Autonomy | Execute silently | Handles routine tasks without interruption |

All domains default to level 0. Automatic promotion is supported (up to a ceiling of level 3) based on a track record of successful actions, with automatic demotion after repeated failures.

### 9 Trust Domains

| Domain | What It Controls | Default Level |
|--------|-----------------|---------------|
| `messaging` | Sending messages on your behalf via channels | 0 |
| `files` | Reading, writing, and deleting local files | 0 |
| `web` | Outbound HTTP requests and browser automation | 0 |
| `shell` | Executing shell commands | 0 |
| `finance` | Financial transactions and payment actions | 0 |
| `calendar` | Creating, modifying, or deleting calendar events | 0 |
| `email` | Sending emails on your behalf | 0 |
| `integrations` | Actions through connected services (GitHub, Notion, etc.) | 0 |
| `system` | System-level operations (daemon, updates, configuration) | 0 |

### Configuring Trust

```bash
# Set messaging to "Suggest" (level 2)
auxiora trust set messaging 2

# Set calendar to "Act & Report" (level 3)
auxiora trust set calendar 3

# View all current trust levels
auxiora trust status
```

Trust levels can also be configured through the dashboard under **Settings > Security**.

### Use Cases

1. **Conservative setup** -- All domains stay at level 0 or 1 (inform only). The assistant observes and notifies but never acts. Best for first-time users or sensitive environments.

2. **Power user** -- Messaging at level 3, calendar at level 3, files at level 2, shell at level 1. The assistant manages routine communications and scheduling autonomously but asks before touching files and only informs about shell opportunities.

3. **Full autonomy for a domain** -- Set a specific domain (e.g., email) to level 4 when you trust the assistant's judgment for that area. The assistant handles email entirely on its own. All actions are still audit-logged, and automatic demotion kicks in if failures occur.

## SSRF Protection

All outbound HTTP requests made by the browser control and research modules are validated against private IP ranges before the connection is established. This includes:

- **Private range blocking** -- Requests to `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `127.x.x.x`, and IPv6 equivalents are rejected by default.
- **DNS rebinding protection** -- DNS resolution is performed and the resolved IP is checked against private ranges, preventing DNS names that resolve to internal addresses.
- **Numeric IP normalization** -- Hex, octal, and decimal IP encodings are normalized to dotted-decimal before validation, closing encoding-based bypasses.
- **Configurable allowlists** -- Specific internal addresses can be explicitly allowed when needed (e.g., a local Home Assistant instance).

## Content Safety

Auxiora includes a guardrails layer that provides:

- **PII detection** -- Scans outbound messages for accidental inclusion of sensitive personal information (SSNs, credit card numbers, etc.) and blocks or warns before sending.
- **Prompt injection defense** -- Incoming messages from channels are screened for prompt injection patterns before being passed to the AI model, reducing the risk of manipulation through untrusted input.

Both systems are configurable and can be tuned or disabled based on your threat model.

---

**See also:** [AI Providers](providers.md) | [CLI Reference](cli.md) | [Getting Started](../guide/getting-started.md)
