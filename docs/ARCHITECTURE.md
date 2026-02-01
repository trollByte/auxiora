# Auxiora Architecture

## Monorepo Structure

```
auxiora/
├── packages/
│   ├── core/          # Shared utilities, paths, types
│   ├── vault/         # Encrypted credential storage
│   ├── audit/         # Tamper-evident logging
│   ├── config/        # Zod-validated configuration
│   ├── gateway/       # HTTP/WS server, rate limiting, pairing
│   └── cli/           # Command-line interface
│
├── docs/              # Documentation
├── package.json       # Root package (workspace config)
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Package Dependencies

```
┌─────────────┐
│    cli      │  ← User-facing commands
├─────────────┤
│   gateway   │  ← HTTP/WS server, channels
├─────────────┤
│   config    │  ← Configuration management
├──────┬──────┤
│ vault│audit │  ← Security primitives
├──────┴──────┤
│    core     │  ← Shared utilities
└─────────────┘
```

## Core Package (`@auxiora/core`)

Shared utilities used by all packages:

- **Path resolution**: Cross-platform paths (XDG on Linux, Library on macOS, AppData on Windows)
- **Buffer utilities**: `zeroBuffer()` for secure memory clearing
- **Platform detection**: `isWindows()`, `isMacOS()`, `isLinux()`

## Vault Package (`@auxiora/vault`)

Encrypted credential storage:

- **Encryption**: AES-256-GCM with unique IV per operation
- **Key derivation**: Argon2id (64MB memory, 3 iterations)
- **Storage**: JSON file with base64-encoded encrypted data
- **File permissions**: 0600 on Unix systems

```typescript
const vault = new Vault();
await vault.unlock('master-password');
await vault.add('ANTHROPIC_API_KEY', 'sk-...');
const key = vault.get('ANTHROPIC_API_KEY');
vault.lock(); // Zeros key from memory
```

## Audit Package (`@auxiora/audit`)

Tamper-evident logging:

- **Chained hashes**: Each entry links to the previous via SHA-256
- **Sensitive redaction**: Passwords, tokens, keys automatically masked
- **Verification**: Detect modifications by checking hash chain

```typescript
await audit('vault.unlock', { user: 'owner' });
const result = await logger.verify();
// { valid: true, entries: 42 }
```

## Config Package (`@auxiora/config`)

Zod-validated configuration with environment overrides:

- **Schema validation**: Runtime type checking with defaults
- **Env overrides**: `AUXIORA_GATEWAY_PORT=8080` overrides config file
- **Secure defaults**: Loopback binding, auth enabled, rate limiting on

```typescript
const config = await loadConfig();
// Merges: defaults → config.json → environment variables
```

## Gateway Package (`@auxiora/gateway`)

HTTP and WebSocket server:

### Rate Limiter

Sliding window algorithm:

```typescript
const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 60 });
const { allowed, remaining } = limiter.check(clientIp);
```

### Pairing Manager

DM pairing for unknown senders:

```typescript
const pairing = new PairingManager({ codeLength: 6, expiryMinutes: 15 });
const code = pairing.generateCode(senderId, 'discord');
// Returns "A3F2B1" - owner approves/rejects
pairing.acceptCode('A3F2B1'); // Adds sender to allowlist
```

## CLI Package (`@auxiora/cli`)

Command-line interface:

```bash
auxiora vault add <name>    # Add credential
auxiora vault list          # List credential names
auxiora vault remove <name> # Remove credential
auxiora vault get <name>    # Get credential value

auxiora audit verify        # Verify log chain
auxiora audit tail -n 20    # Show recent entries

auxiora doctor              # System diagnostics
auxiora paths               # Show all paths
```

---

## Data Flow

### Message Processing

```
Channel (Discord/Telegram/Slack)
         │
         ▼
    ┌─────────┐
    │ Gateway │ ← Auth check, rate limit
    └────┬────┘
         │
         ▼
    ┌─────────┐
    │ Pairing │ ← Unknown sender? Generate code
    └────┬────┘
         │ (if allowed)
         ▼
    ┌─────────┐
    │ Session │ ← Load/create session, context
    └────┬────┘
         │
         ▼
    ┌─────────┐
    │Provider │ ← Call Claude/GPT API
    └────┬────┘
         │
         ▼
    ┌─────────┐
    │Response │ ← Stream back to channel
    └─────────┘
```

### Security Events

```
Any security-relevant action
         │
         ▼
    ┌─────────┐
    │ Audit   │ ← Log with chained hash
    └────┬────┘
         │
         ▼
    ┌─────────┐
    │ Redact  │ ← Remove sensitive fields
    └────┬────┘
         │
         ▼
    audit.jsonl (append-only)
```

---

## Configuration

### File Location

- **macOS**: `~/Library/Application Support/auxiora/config.json`
- **Linux**: `~/.config/auxiora/config.json`
- **Windows**: `%APPDATA%\auxiora\config.json`

### Schema

```typescript
{
  gateway: {
    host: '127.0.0.1',      // Bind address
    port: 18789,            // HTTP/WS port
    corsOrigins: ['...']    // Allowed CORS origins
  },
  auth: {
    mode: 'password',       // 'none' | 'password' | 'jwt'
    jwtSecret: '...',       // For JWT mode
    jwtExpiresIn: '7d'      // Token lifetime
  },
  rateLimit: {
    enabled: true,
    windowMs: 60000,        // 1 minute window
    maxRequests: 60         // 60 req/min default
  },
  pairing: {
    enabled: true,
    codeLength: 6,          // Hex characters
    expiryMinutes: 15       // Code TTL
  },
  provider: {
    primary: 'anthropic',
    fallback: 'openai',     // Optional
    anthropic: { model: 'claude-sonnet-4-20250514', maxTokens: 4096 },
    openai: { model: 'gpt-4o', maxTokens: 4096 }
  },
  session: {
    maxContextTokens: 100000,
    ttlMinutes: 1440,       // 24 hours
    autoSave: true,
    compactionEnabled: true
  },
  logging: {
    level: 'info',
    auditEnabled: true,
    maxFileSizeMb: 10,
    maxFiles: 5
  },
  channels: {
    discord: { enabled: false, mentionOnly: true },
    telegram: { enabled: false, webhookMode: false },
    slack: { enabled: false, socketMode: true },
    webchat: { enabled: true }
  }
}
```

### Environment Overrides

Any config key can be overridden via environment variable:

```bash
AUXIORA_GATEWAY_PORT=8080
AUXIORA_AUTH_MODE=jwt
AUXIORA_PROVIDER_PRIMARY=openai
```

Pattern: `AUXIORA_` + path in SCREAMING_SNAKE_CASE

---

## Future Packages (Roadmap)

| Package | Description | Phase |
|---------|-------------|-------|
| `@auxiora/providers` | LLM adapters (Claude, GPT, Gemini) | 2 |
| `@auxiora/sessions` | Session management, persistence | 2 |
| `@auxiora/channels` | Discord, Telegram, Slack adapters | 3 |
| `@auxiora/personality` | SOUL.md loading, personality engine | 4 |
| `@auxiora/tools` | Tool execution, sandboxing | 4 |
| `@auxiora/web` | Dashboard UI | 5 |
