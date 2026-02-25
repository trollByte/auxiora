# Messaging Channels

> Connect Auxiora to 12 messaging platforms. Talk to your assistant where you already are.

## Supported Channels

| Channel | Auth Method | Features |
|---------|-------------|----------|
| Discord | Bot token | Text, embeds, threads, reactions, mention-only mode |
| Telegram | Bot token (BotFather) | Text, inline keyboards, file sharing, webhook mode |
| Slack | Bot + App tokens (Socket Mode) | Text, blocks, threads, slash commands |
| Microsoft Teams | App registration | Text, adaptive cards |
| WhatsApp | Business API credentials | Text, media, message templates |
| Signal | signal-cli | Text, attachments, E2EE |
| Email (SMTP/IMAP) | IMAP + SMTP credentials | Send/receive, HTML formatting |
| Matrix | Homeserver URL + access token | Text, E2EE rooms |
| Google Chat | Service account key | Text, cards |
| Zalo | App credentials | Text, media |
| BlueBubbles (iMessage) | Server URL + password | Text, attachments |
| Twilio (SMS/MMS) | Account SID + Auth token | SMS, MMS, WhatsApp via Twilio |

All adapters implement a common `ChannelAdapter` interface with `connect()`, `disconnect()`, `send()`, `onMessage()`, and `onError()` methods. Optional capabilities include typing indicators (`startTyping`), message editing (`editMessage`), and default channel selection for proactive delivery.

## Quick Setup: Discord

### 1. Create a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application**, give it a name, and click **Create**.
3. Navigate to **Bot** in the sidebar, then click **Add Bot**.
4. Under **Privileged Gateway Intents**, enable **Message Content Intent**.
5. Click **Reset Token** and copy the bot token.

### 2. Store the Token in Vault

```bash
auxiora vault add DISCORD_BOT_TOKEN
# Paste the token when prompted
```

### 3. Configure the Channel

In `~/.auxiora/config.json`:

```json
{
  "channels": {
    "discord": {
      "enabled": true,
      "mentionOnly": false,
      "allowedGuilds": []
    }
  }
}
```

- `mentionOnly` -- when `true`, the bot only responds to messages that @mention it.
- `allowedGuilds` -- restrict the bot to specific server IDs. Leave empty to allow all.

### 4. Invite the Bot to Your Server

1. In the Developer Portal, go to **OAuth2 > URL Generator**.
2. Select scopes: `bot`, `applications.commands`.
3. Select permissions: **Send Messages**, **Read Message History**, **Embed Links**.
4. Copy the generated URL and open it in your browser to invite the bot.

### 5. Verify

Send a message in your Discord server. Auxiora should respond within a few seconds. Check `auxiora doctor` if it does not connect.

## Quick Setup: Telegram

### 1. Create a Bot via BotFather

1. Open Telegram and search for **@BotFather**.
2. Send `/newbot` and follow the prompts to choose a name and username.
3. BotFather replies with an API token. Copy it.

### 2. Store the Token in Vault

```bash
auxiora vault add TELEGRAM_BOT_TOKEN
# Paste the token when prompted
```

### 3. Configure the Channel

In `~/.auxiora/config.json`:

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "allowedChats": []
    }
  }
}
```

- `allowedChats` -- restrict the bot to specific chat IDs. Leave empty to allow all.
- `webhookUrl` -- optional. Set this if you want to use webhook mode instead of long polling.

### 4. Test It

Open a conversation with your bot in Telegram and send a message. Auxiora should respond. If you added the bot to a group, make sure to disable privacy mode via BotFather (`/setprivacy` > Disable) so the bot can read all messages.

## Quick Setup: Slack

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** > **From scratch**.
2. Name your app and select your workspace.

### 2. Enable Socket Mode

1. Navigate to **Socket Mode** in the sidebar and enable it.
2. Generate an **App-Level Token** with the `connections:write` scope. Copy this token.

### 3. Configure Bot Permissions

1. Go to **OAuth & Permissions**.
2. Under **Bot Token Scopes**, add: `chat:write`, `channels:history`, `groups:history`, `im:history`, `mpim:history`, `channels:read`.
3. Click **Install to Workspace** and authorize.
4. Copy the **Bot User OAuth Token**.

### 4. Subscribe to Events

1. Go to **Event Subscriptions** and enable events.
2. Under **Subscribe to bot events**, add: `message.channels`, `message.groups`, `message.im`, `message.mpim`.

### 5. Store Tokens in Vault

```bash
auxiora vault add SLACK_BOT_TOKEN
# Paste the Bot User OAuth Token

auxiora vault add SLACK_APP_TOKEN
# Paste the App-Level Token
```

### 6. Configure the Channel

In `~/.auxiora/config.json`:

```json
{
  "channels": {
    "slack": {
      "enabled": true
    }
  }
}
```

Optional fields: `signingSecret` (for request verification), `allowedChannels` (restrict to specific channel IDs), `allowedUsers` (restrict to specific user IDs).

### 7. Invite to a Channel

In Slack, go to the channel where you want the bot and type `/invite @YourBotName`. Send a message and verify the bot responds.

## Configuration Reference

The full channel configuration lives in `~/.auxiora/config.json` under the `channels` key. Each channel is enabled independently:

```json
{
  "channels": {
    "discord": {
      "enabled": true,
      "mentionOnly": false,
      "allowedGuilds": ["123456789"]
    },
    "telegram": {
      "enabled": true,
      "allowedChats": []
    },
    "slack": {
      "enabled": true,
      "allowedChannels": [],
      "allowedUsers": []
    },
    "email": {
      "enabled": true,
      "imapHost": "imap.gmail.com",
      "smtpHost": "smtp.gmail.com"
    },
    "matrix": {
      "enabled": true,
      "homeserverUrl": "https://matrix.example.com"
    },
    "twilio": {
      "enabled": true,
      "phoneNumber": "+1234567890"
    }
  }
}
```

Sensitive credentials (tokens, passwords, API keys) are always stored in the vault, not in the config file. Auxiora resolves them at startup by matching vault key names to the expected credential for each channel.

## Pairing System

When an unknown sender messages your assistant through any channel, Auxiora does not respond directly. Instead, it generates a **pairing code** -- a short alphanumeric string -- and asks the sender to provide it through a trusted channel (e.g., the web dashboard) to verify their identity.

### How It Works

1. An unknown user sends a message via Telegram.
2. Auxiora replies: "I don't recognize you yet. Your pairing code is `A3F2B1`. Enter this code in the dashboard to connect."
3. The user (or an admin) enters the code in the dashboard within the expiry window.
4. The sender is added to the allowlist and can interact freely from that point on.

Pairing codes are cryptographically random hex strings. The allowlist is persisted to disk so approved senders survive restarts.

### Configuration

```json
{
  "pairing": {
    "enabled": true,
    "codeLength": 6,
    "expiryMinutes": 15,
    "autoApproveChannels": ["webchat"]
  }
}
```

- `codeLength` -- number of hex characters in the pairing code (default: 6).
- `expiryMinutes` -- how long a code remains valid (default: 15).
- `autoApproveChannels` -- channels where senders are automatically trusted without a pairing code. `webchat` is a sensible default since the dashboard is already password-protected.

### Managing Paired Users

The dashboard shows all paired senders and pending codes. You can revoke access for any sender at any time, and they will need to re-pair.

## Inbound Deduplication

Auxiora includes an inbound message deduplication layer that prevents the same message from being processed twice. This handles cases where a platform delivers a message more than once (e.g., due to webhook retries or reconnection). Messages are deduplicated by ID within a sliding time window.

## Message Chunking

Long responses are automatically split into platform-appropriate chunks. Discord enforces a 2,000-character limit, Telegram allows 4,096, and Slack supports up to 40,000. The chunking system respects Markdown structure so code blocks and lists are not broken mid-way.

## Use Cases

### 1. Personal Assistant

Use Telegram on your phone and the web dashboard on your desktop. Both channels share the same session and memory -- the assistant remembers context from your Telegram conversation when you switch to the dashboard, and vice versa.

### 2. Team Assistant

Deploy Auxiora in a Slack workspace with the bot invited to specific channels. New team members receive a pairing code when they DM the bot for the first time. Once paired, they get full access. Restrict the bot to approved channels with `allowedChannels` to prevent it from appearing where it should not.

### 3. Multi-Platform

Connect Discord for your gaming group, email for professional context, and BlueBubbles (iMessage) for family. The Architect personality engine adapts its tone and formality per channel -- casual in Discord, professional in email, warm in iMessage. All conversations feed into the same memory, giving the assistant a complete picture of your life.

---

See also: [Service Connectors](connectors.md) | [Personality System](personality.md) | [Getting Started](../guide/getting-started.md)
