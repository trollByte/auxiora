# Service Connectors

> Connect Auxiora to your tools. 11 integrations for proactive assistance.

## Available Connectors

| Connector | Capabilities | Auth |
|-----------|-------------|------|
| GitHub | Issues, PRs, Actions, repos, code search | OAuth2 or personal access token |
| Notion | Pages, databases, search, block editing | Integration token |
| Linear | Issues, projects, cycles, labels | API key |
| Google Workspace | Calendar events, Gmail, Drive files | OAuth2 service account |
| Microsoft 365 | Outlook mail, Calendar, OneDrive | App registration (OAuth2) |
| Home Assistant | Devices, scenes, automations, entity states | Long-lived access token |
| Philips Hue | Lights, scenes, rooms, groups | Bridge pairing |
| Obsidian | Notes, search, daily notes, vault browsing | Local REST plugin |
| Spotify | Playback control, search, playlists, queue | OAuth2 |
| Social Media | Twitter/X, LinkedIn, Reddit, Instagram | Platform-specific OAuth |
| Custom | Build your own via Connector SDK | Varies |

All connectors are built with `defineConnector()` from the `@auxiora/connectors` SDK. Each connector declares its actions, triggers, entities, and auth requirements. Actions are executed through a unified interface, and each action specifies a minimum trust level and trust domain.

## Setup: GitHub

### 1. Create a Personal Access Token

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens) and click **Generate new token (classic)**.
2. Select scopes: `repo`, `workflow`, `read:org`.
3. Copy the generated token.

Alternatively, use OAuth2 by configuring a GitHub App. The connector supports both auth methods.

### 2. Store the Token in Vault

```bash
auxiora vault add GITHUB_TOKEN
# Paste the token when prompted
```

### 3. Configure the Connector

In `~/.auxiora/config.json`:

```json
{
  "connectors": {
    "github": {
      "enabled": true
    }
  }
}
```

### 4. Verify

Ask your assistant: "List my open pull requests." Auxiora calls the GitHub API through the connector and returns the results.

### Available Actions

| Action | Description | Trust Level |
|--------|-------------|-------------|
| `issues-list` | List issues for a repository | 1 |
| `issues-get` | Get a specific issue | 1 |
| `issues-create` | Create a new issue | 2 |
| `issues-update` | Update an existing issue | 2 |
| `prs-list` | List pull requests | 1 |
| `prs-get` | Get a specific pull request | 1 |
| `prs-create` | Create a pull request | 2 |
| `repos-list` | List your repositories | 1 |
| `repos-get` | Get repository details | 1 |
| `actions-list-runs` | List workflow runs | 1 |
| `actions-trigger` | Trigger a workflow dispatch | 3 |
| `search-code` | Search code across repositories | 1 |

## Setup: Notion

### 1. Create a Notion Integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) and click **New integration**.
2. Name it (e.g., "Auxiora"), select your workspace, and click **Submit**.
3. Copy the **Internal Integration Token**.

### 2. Share Pages with the Integration

In Notion, open each page or database you want Auxiora to access. Click the `...` menu in the top right, then **Add connections**, and select your integration. The integration can only see pages explicitly shared with it.

### 3. Store the Token in Vault

```bash
auxiora vault add NOTION_TOKEN
# Paste the token when prompted
```

### 4. Configure the Connector

In `~/.auxiora/config.json`:

```json
{
  "connectors": {
    "notion": {
      "enabled": true
    }
  }
}
```

### 5. Verify

Ask: "Search my Notion notes about project planning." Auxiora queries the Notion API and returns matching pages.

### Available Actions

| Action | Description | Trust Level |
|--------|-------------|-------------|
| `pages-search` | Search pages and databases | 1 |
| `pages-get` | Get a specific page | 1 |
| `pages-create` | Create a new page | 2 |
| `pages-update` | Update a page | 2 |
| `databases-query` | Query a database with filters | 1 |
| `blocks-get-children` | Get block content for a page | 1 |
| `blocks-append` | Append content blocks to a page | 2 |

## Setup: Home Assistant

### 1. Generate a Long-Lived Access Token

1. Open your Home Assistant dashboard (e.g., `http://homeassistant.local:8123`).
2. Click your profile icon in the bottom-left corner.
3. Scroll to **Long-Lived Access Tokens** and click **Create Token**.
4. Name it "Auxiora" and copy the token.

### 2. Store the Token in Vault

The token value includes the Home Assistant URL, separated by a pipe character:

```bash
auxiora vault add HOMEASSISTANT_TOKEN
# Paste: http://homeassistant.local:8123|YOUR_TOKEN_HERE
```

If your Home Assistant instance runs on the default `http://localhost:8123`, you can omit the URL prefix and paste just the token.

### 3. Configure the Connector

In `~/.auxiora/config.json`:

```json
{
  "connectors": {
    "homeassistant": {
      "enabled": true
    }
  }
}
```

### 4. Verify

Ask: "What devices are in my living room?" or "Turn off the office lights." Auxiora communicates with the Home Assistant API to list devices and control them.

### Available Actions

| Action | Description | Trust Level |
|--------|-------------|-------------|
| `devices-list` | List all devices | 1 |
| `entities-get-state` | Get an entity's current state | 1 |
| `entities-set-state` | Control a device (turn on/off, set value) | 3 |
| `scenes-list` | List available scenes | 1 |
| `scenes-activate` | Activate a scene | 3 |
| `automations-list` | List automations | 1 |
| `automations-trigger` | Trigger an automation | 3 |

## Connector SDK

Build custom connectors using the `@auxiora/connectors` SDK. A connector defines its identity, auth requirements, actions, and optionally triggers and entities.

### Minimal Example

```typescript
import { defineConnector } from '@auxiora/connectors';

export const myConnector = defineConnector({
  id: 'my-service',
  name: 'My Service',
  description: 'Integration with My Service API',
  version: '1.0.0',
  category: 'productivity',
  icon: 'wrench',

  auth: {
    type: 'token',
    instructions: 'Generate an API key at https://myservice.com/settings/api',
  },

  actions: [
    {
      id: 'items-list',
      name: 'List Items',
      description: 'List all items in the workspace',
      trustMinimum: 1,
      trustDomain: 'system',
      reversible: false,
      parameters: [],
    },
    {
      id: 'items-create',
      name: 'Create Item',
      description: 'Create a new item',
      trustMinimum: 2,
      trustDomain: 'system',
      reversible: true,
      parameters: [
        { name: 'title', type: 'string', required: true, description: 'Item title' },
        { name: 'body', type: 'string', required: false, description: 'Item body' },
      ],
    },
  ],

  async executeAction(actionId, params, token) {
    switch (actionId) {
      case 'items-list':
        return fetchItems(token);
      case 'items-create':
        return createItem(token, params.title as string, params.body as string);
      default:
        throw new Error(`Unknown action: ${actionId}`);
    }
  },
});
```

### Key Concepts

- **Actions** are discrete operations the assistant can perform (list, get, create, update, delete). Each action declares a minimum trust level and a trust domain.
- **Triggers** are polling-based events the assistant can subscribe to (e.g., "new issue created"). Define a `pollTrigger` function that returns new events since the last poll.
- **Entities** describe the data objects the connector works with, enabling the assistant to understand the domain model.
- **Auth** supports `token`, `oauth2`, and `credentials` types. The SDK validates that auth is configured before executing any action.
- **`trustMinimum`** controls the autonomy level required. Read-only actions typically use level 1; write actions use level 2 or 3; destructive actions use level 3 or 4.
- **`reversible`** tells the assistant whether an action can be undone. This affects how cautiously the assistant approaches execution.

### Scaffolding a New Connector

```bash
auxiora connect scaffold my-service
```

This generates a connector package under `packages/connector-my-service/` with the standard structure: `src/connector.ts`, `src/index.ts`, `tests/connector.test.ts`, and `package.json`.

## Use Cases

### 1. Developer Workflow

Connect GitHub and Linear. Ask: "Create a Linear issue for this bug and link the GitHub PR." The assistant creates the issue in Linear with the right labels and project, then posts a comment on the GitHub PR with a link back. Trust level 2 is required for write operations; the assistant asks for confirmation if trust is set to level 1.

### 2. Smart Home

Connect Home Assistant and Philips Hue. Tell the assistant: "Set the office to focus mode." It dims the Hue lights to 40%, sets a warm color temperature, and activates the "Do Not Disturb" scene in Home Assistant. At night, say "Bedtime" and it turns off all lights and locks the doors.

### 3. Knowledge Worker

Connect Notion and Google Workspace. Before a meeting, ask: "Prep me for my 2pm meeting -- pull the project notes from Notion and summarize the attendees' recent emails." The assistant queries your Google Calendar for the meeting, looks up attendees, fetches their recent emails from Gmail, finds related pages in Notion, and synthesizes a briefing document.

### 4. Content Creator

Connect Obsidian and Social Media. Ask: "Draft a Twitter thread from my Obsidian notes on distributed systems." The assistant searches your Obsidian vault for relevant notes, extracts key points, structures them into a thread with appropriate length constraints, and presents the draft for your approval before posting.

---

See also: [Messaging Channels](channels.md) | [Behaviors](behaviors.md) | [Getting Started](../guide/getting-started.md)
