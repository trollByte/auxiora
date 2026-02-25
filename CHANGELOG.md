# Changelog

All notable changes to Auxiora will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-01

### Added

#### Technical Debt Resolution
- **@auxiora/errors** — Centralized error handling package
  - 50+ standardized error codes organized by domain
  - User-friendly error messages with technical details for logging
  - Retryable error classification
  - Exponential backoff retry helper
  - Error wrapping and type guards
  - JSON serialization for API responses

- **@auxiora/logger** — Structured logging with pino
  - JSON structured logs (production) and pretty-printed (development)
  - Log levels: trace, debug, info, warn, error, fatal
  - Request ID tracking for correlation
  - Automatic sensitive data redaction (passwords, tokens, API keys)
  - Performance timing helpers
  - Low overhead (~2% vs console.log)

- **@auxiora/metrics** — Performance monitoring and metrics
  - Counters for monotonically increasing values
  - Gauges for current state values
  - Histograms for distribution tracking (latency p50, p95, p99)
  - Prometheus export format
  - Pre-defined application metrics (HTTP, providers, sessions, channels, errors)
  - Label support for metric dimensions
  - Low overhead (<1% memory/CPU)

- **Enhanced Configuration** — Improved validation in @auxiora/config
  - Startup configuration validation
  - Detailed error messages with suggestions
  - Warning system for suboptimal but valid configs
  - Zod error formatting for better UX
  - Security-focused validation rules

### Improved

- **Error Handling**
  - Consistent error codes across all packages
  - Clear distinction between retryable and non-retryable errors
  - Better error context for debugging

- **Observability**
  - Production-ready logging infrastructure
  - Metrics for performance monitoring
  - Prometheus integration for monitoring stack

- **Development Experience**
  - Better error messages for configuration issues
  - Clear validation warnings at startup
  - Actionable suggestions for fixes

### Documentation

- **TECHNICAL_DEBT.md** — Comprehensive guide to new packages
  - API examples and usage patterns
  - Integration guide for existing code
  - Migration checklist
  - Performance impact analysis

---

## [1.0.0] - 2026-01-31

### Added

#### Core Features
- **Encrypted Credential Vault** — AES-256-GCM with Argon2id key derivation
  - CLI commands: `vault add`, `vault list`, `vault remove`, `vault get`, `vault status`, `vault secrets`
  - Secure memory zeroing after use
  - Cross-platform path support (macOS, Linux, Windows)

- **Tamper-Evident Audit Logging**
  - Chained SHA-256 hashes for tamper detection
  - Automatic sensitive field redaction
  - JSONL format for SIEM integration
  - 40+ audit event types

- **WebSocket + HTTP Gateway**
  - JWT authentication with refresh token rotation
  - Rate limiting (sliding window algorithm)
  - DM pairing system for unknown senders
  - CORS and security headers
  - WebChat UI served at `/`

- **Session Management**
  - Per-channel/sender context isolation
  - Configurable TTL and auto-save
  - Context windowing for token limits
  - Disk persistence

- **AI Provider Abstraction**
  - Anthropic Claude support (API key + OAuth tokens)
  - OpenAI GPT support
  - Claude CLI credentials fallback
  - Streaming and non-streaming modes
  - Token usage tracking
  - Provider failover

#### Messaging Channels
- **Discord** — Full adapter with mention-only mode
- **Telegram** — grammY-based integration
- **Slack** — Socket Mode support
- **Twilio** — SMS and WhatsApp
- **WebChat** — Built-in web interface

#### Personality System
- **Template Files** — SOUL.md, AGENTS.md, IDENTITY.md, USER.md
  - Customizable AI personality
  - User preference tracking
  - Tool capability documentation
  - System identity definition
- **Automatic Injection** — Personality loaded into system prompt
- **Privacy-First** — Files never leave local machine

#### Daemon Support
- **Cross-Platform Daemon Management**
  - macOS: launchd integration
  - Linux: systemd user services
  - Windows: Task Scheduler
- **CLI Commands**: `daemon install`, `start`, `stop`, `restart`, `status`, `uninstall`
- **Auto-Restart** — Configured restart on failure

#### Development Experience
- **Monorepo Structure** — 11 packages with pnpm workspaces
- **TypeScript Strict Mode** — Full type safety
- **Comprehensive Tests** — 58 passing tests
- **`.env.example`** — Documented configuration template

### Security

- **Zero-Trust Architecture** — Unknown senders require pairing
- **Loopback Binding** — Gateway on 127.0.0.1 by default
- **Input Sanitization** — Null byte stripping, length limits
- **Prompt Injection Detection** — Flagging suspicious patterns
- **Credential Isolation** — Never exposed in logs or prompts

### Documentation

- **README.md** — Quick start, architecture, security philosophy
- **templates/README.md** — Personality customization guide
- **.env.example** — Full configuration reference with security warnings

### Infrastructure

- **XDG Base Directory Compliance** — Linux-friendly paths
- **Cross-Platform Paths** — macOS Library, Linux .config, Windows AppData
- **Node.js 22+** — Modern runtime features
- **pnpm 9.15.0** — Fast, strict dependency management

---

## [Unreleased]

### Planned Features

- **Proactive Behaviors**
  - Cron-like scheduled tasks
  - Webhook listeners for external events
  - Automated notifications

- **Tool System**
  - Bash execution with sandboxing
  - Web browsing capabilities
  - File operations within workspace
  - Permission system for sensitive actions

- **Enhanced Security**
  - Integration tests for security features
  - Penetration testing of pairing system
  - Security audit of cryptographic implementation

- **Observability**
  - Prometheus metrics export
  - Health check endpoints
  - Structured logging configuration

---

## Version History

### [1.0.0] - 2026-01-31
- Initial release with core functionality
- Full multi-platform support
- Production-ready security features

---

## Migration Guides

### From Pre-1.0 (Development Versions)

If you were running development versions before 1.0:

1. **Vault Migration**: The vault format is stable. No migration needed.

2. **Personality Files**: Copy templates to `~/.auxiora/workspace/`:
   ```bash
   mkdir -p ~/.auxiora/workspace
   cp templates/*.md ~/.auxiora/workspace/
   ```

3. **Configuration**: Review `.env.example` for new options.

4. **Daemon**: If using systemd/launchd manually, migrate to `auxiora daemon`:
   ```bash
   # Old: manual systemd service
   systemctl --user stop auxiora
   systemctl --user disable auxiora

   # New: CLI-managed daemon
   auxiora daemon install
   auxiora daemon start
   ```

---

## Breaking Changes

### 1.0.0

- **Personality System**: Now requires `SOUL.md` in `~/.auxiora/workspace/` for custom personalities. Default fallback provided if missing.

- **Daemon Management**: Manual daemon configurations (systemd, launchd) should be migrated to `auxiora daemon` commands.

---

## Security Advisories

No security advisories at this time.

For security issues, please report to: [security contact TBD]

---

## Attribution

- **Encryption**: Argon2id via [argon2](https://github.com/ranisalt/node-argon2)
- **JWT**: [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)
- **Discord**: [discord.js](https://discord.js.org/)
- **Telegram**: [grammY](https://grammy.dev/)
- **Slack**: [@slack/bolt](https://slack.dev/bolt-js/)
- **SMS/WhatsApp**: [Twilio](https://www.twilio.com/)
- **AI Providers**: [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript), [OpenAI SDK](https://github.com/openai/openai-node)

---

*Auxiora — Your intelligence, your rules.*
