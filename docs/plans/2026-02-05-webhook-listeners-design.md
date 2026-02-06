# Webhook Listeners Design

## Goal

Add webhook listener support to Auxiora: wire HTTP routes for existing Telegram and Twilio channel adapters, and provide a generic webhook system that triggers AI-powered behaviors from arbitrary HTTP callbacks (GitHub, Stripe, custom integrations).

## Architecture

Two layers:

**Channel webhooks** wire HTTP routes to existing Telegram and Twilio adapters. `POST /api/v1/webhooks/telegram` delivers updates to `TelegramAdapter`, which already has `handleWebhook()`. `POST /api/v1/webhooks/twilio` does the same for `TwilioAdapter.handleWebhook()`. These routes verify signatures using each platform's native method. Messages flow into the existing `ChannelManager.onMessage` pipeline — same as polling mode.

**Generic webhooks** are user-defined HTTP endpoints that trigger behaviors. Each webhook is a named registration: a unique path, an HMAC secret, and a linked behavior ID. When `POST /api/v1/webhooks/custom/:name` arrives, the system verifies the HMAC signature, extracts the payload, and triggers the linked behavior with the payload as context. The behavior executes through the existing `BehaviorExecutor`.

**New package:** `packages/webhooks/` — WebhookManager, WebhookStore, signature verification, route creation.

**Extended packages:** `packages/gateway/` (exposes `mountRouter` for route mounting), `packages/config/` (webhook config schema), `packages/runtime/` (initialization wiring).

---

## Webhook Registration & Storage

```typescript
interface WebhookDefinition {
  id: string;                    // unique identifier
  name: string;                  // URL-safe slug, used in path
  type: 'channel' | 'generic';  // channel = telegram/twilio, generic = custom
  channelType?: string;          // for channel webhooks: 'telegram' | 'twilio'
  secret: string;                // HMAC secret for verification
  behaviorId?: string;           // for generic webhooks: linked behavior
  transform?: string;            // reserved for future JSONPath extraction
  enabled: boolean;
  createdAt: string;
}
```

**Channel webhooks** are auto-created when `channels.telegram.webhookMode` or `channels.twilio.enabled` is true. Their secrets come from the vault (Telegram bot token, Twilio auth token). No manual registration needed.

**Generic webhooks** are created via tool commands. The user tells the AI "create a webhook for GitHub push events that summarizes commits to Discord" — the AI creates both the webhook registration and the linked behavior.

**Storage:** `WebhookStore` persists to `~/.auxiora/webhooks.json`, same pattern as `BehaviorStore`. Simple JSON file, loaded at startup, saved on mutation.

**URL structure:**
- Channel: `POST /api/v1/webhooks/telegram`, `POST /api/v1/webhooks/twilio`
- Generic: `POST /api/v1/webhooks/custom/:name`

---

## Signature Verification

```typescript
interface WebhookVerifier {
  verify(req: { headers: Record<string, string>; body: Buffer; url: string }, secret: string): boolean;
}
```

**Telegram:** Grammy's built-in webhook handling validates the secret token embedded in the webhook URL path.

**Twilio:** `X-Twilio-Signature` header. HMAC-SHA1 of the full request URL + sorted POST parameters, signed with the Twilio auth token. Computed with `crypto.createHmac('sha1', secret)`, compared with `timingSafeEqual`.

**Generic webhooks:** HMAC-SHA256 by default. Signature in configurable header (default: `x-webhook-signature`). Computed with `crypto.createHmac('sha256', secret)`, compared with `timingSafeEqual`.

**Timing-safe comparison everywhere** — no short-circuit string comparison.

**Failed verification:** Returns 401, logs `webhook.signature_failed` audit event with webhook name and source IP. Never reveals why verification failed in the response body.

---

## Request Flow

### Channel webhook flow

1. `POST /api/v1/webhooks/telegram` arrives
2. Gateway routes to `WebhookManager.handleChannelWebhook('telegram', req, res)`
3. Signature verified using Telegram's method
4. Body passed to `TelegramAdapter.handleWebhook(body)`
5. Adapter emits `InboundMessage` through `ChannelManager.onMessage`
6. Normal AI pipeline processes it, response sent back via adapter
7. HTTP response: `200 OK`

### Generic webhook flow

1. `POST /api/v1/webhooks/custom/github-push` arrives
2. Gateway routes to `WebhookManager.handleGenericWebhook('github-push', req, res)`
3. HMAC-SHA256 verified against webhook's stored secret
4. HTTP response: `202 Accepted` immediately (don't block the sender)
5. Payload stringified and injected into linked behavior's prompt as context
6. Behavior runs through `BehaviorExecutor`, sends results to configured channel(s)
7. Audit: `webhook.received` logged with webhook name, payload size, behavior ID

**Error handling:** If the linked behavior doesn't exist or is disabled, log `webhook.error` and still return 202 (don't leak internal state to the caller).

---

## Configuration

New `webhooks` section in `ConfigSchema`:

```typescript
webhooks: z.object({
  enabled: z.boolean().default(false),
  basePath: z.string().default('/api/v1/webhooks'),
  signatureHeader: z.string().default('x-webhook-signature'),
  maxPayloadSize: z.number().int().positive().default(65536), // 64KB
})
```

Webhooks disabled by default. Opt in via config or `AUXIORA_WEBHOOKS_ENABLED=true`.

### Gateway integration

One new public method on Gateway:

```typescript
public mountRouter(path: string, router: express.Router): void {
  this.app.use(path, router);
}
```

WebhookManager creates an Express Router with all webhook routes and hands it to the gateway. The router uses `express.raw({ limit: '64kb' })` middleware for raw body access (needed for HMAC verification before parsing).

Channel webhook config reuses existing flags: `channels.telegram.webhookMode` and `channels.twilio.enabled`.

---

## Tools

| Tool | Permission | Description |
|------|-----------|-------------|
| `webhook_list` | `AUTO_APPROVE` | List all registered webhooks |
| `webhook_create` | `USER_APPROVAL` | Create a generic webhook with name, secret, linked behavior ID |
| `webhook_delete` | `USER_APPROVAL` | Remove a webhook by name |

No `webhook_update` for v1 — delete and recreate. Channel webhooks are auto-managed.

---

## Audit Events

| Event | Details |
|-------|---------|
| `webhook.received` | name, type, payloadSize, sourceIp |
| `webhook.signature_failed` | name, sourceIp |
| `webhook.triggered` | name, behaviorId |
| `webhook.error` | name, error message |
| `webhook.created` | name, type |
| `webhook.deleted` | name |

---

## Security

| Concern | Mitigation |
|---------|-----------|
| Forged webhooks | HMAC signature verification per webhook |
| Timing attacks | `timingSafeEqual` for all comparisons |
| Memory exhaustion | Max 64KB payload, enforced at router level |
| Internal state leakage | Generic responses (401/202), no error details |
| Unauthorized management | Webhook tools require `USER_APPROVAL` |

---

## Testing Strategy

- **WebhookStore tests** (~5): CRUD, persistence, duplicate rejection, enable/disable
- **Signature verification tests** (~6): HMAC-SHA256 valid/invalid, timing-safe, Twilio signature, empty body, wrong header
- **WebhookManager tests** (~8): route registration, channel dispatch, generic dispatch, payload limit, disabled webhook, missing behavior, auto-creation, shutdown
- **Webhook tools tests** (~4): list, create, delete, missing behavior
- **Integration tests** (~3): full generic flow, channel webhook flow, signature failure

~26 new tests, bringing project total to ~270.

---

## Dependencies

No new npm dependencies. Uses `node:crypto` for HMAC, Express Router from existing gateway, JSON file storage matching behavior store pattern.

---

## Future Scope (not v1.6)

- **JSONPath transform** — extract specific fields from payload before injecting into behavior prompt
- **Retry/delivery tracking** — track webhook delivery attempts for outbound webhooks
- **Outbound webhooks** — Auxiora sends webhooks to external services on events
- **IP allowlisting** — restrict webhook sources to known IP ranges
- **Rate limiting per webhook** — independent of global rate limiter
