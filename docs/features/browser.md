# Browser Control

> Headless Chromium automation with SSRF protection for safe web interaction.

## Overview

Browser Control gives Auxiora the ability to interact with web pages on your behalf. It launches a headless Chromium instance via Playwright, allowing the assistant to navigate sites, read content, fill out forms, click buttons, take screenshots, and extract structured data. Every outbound request passes through Auxiora's SSRF guard to prevent the assistant from accessing internal network resources or being tricked into connecting to private infrastructure.

## How It Works

When you ask Auxiora to interact with a web page, the following happens:

1. **URL validation** -- The target URL is checked against the SSRF guard (private IP ranges, DNS rebinding protection, allowlists).
2. **Browser launch** -- A headless Chromium instance starts in a sandboxed context with no persistent cookies or storage.
3. **Navigation** -- The assistant navigates to the validated URL.
4. **Interaction** -- The AI reads the page structure, decides what actions to take (click, type, scroll, extract), and executes them step by step.
5. **Result** -- Extracted content, screenshots, or confirmation of completed actions are returned to the conversation.

Each browser session runs in an isolated context. Cookies, local storage, and session data are discarded when the session ends.

## Capabilities

| Capability | Description |
|-----------|-------------|
| **Navigate URLs** | Open any public web page by URL |
| **Extract content** | Read text, tables, lists, and structured data from pages |
| **Fill forms** | Enter text into input fields, select dropdowns, check boxes |
| **Click buttons** | Click links, buttons, and interactive elements |
| **Take screenshots** | Capture full-page or element-level screenshots as PNG |
| **Execute JavaScript** | Run sandboxed JS snippets for custom extraction or interaction |
| **Download files** | Download files linked on pages (PDFs, CSVs, images) |

## Security

Browser Control includes multiple layers of protection to prevent misuse and ensure safe operation.

### SSRF Protection

All URLs are validated before the browser navigates to them. The SSRF guard prevents access to internal network resources:

| Protection | What It Does |
|-----------|-------------|
| **Private IP validation** | Blocks requests to RFC 1918 ranges (10.x, 172.16-31.x, 192.168.x), loopback (127.x), link-local (169.254.x), and other non-routable addresses |
| **DNS rebinding protection** | Resolves DNS before connecting and validates the resolved IP, preventing domains that initially resolve to public IPs but later rebind to private addresses |
| **Numeric IP normalization** | Normalizes hex (`0x7f000001`), octal (`0177.0.0.1`), and decimal (`2130706433`) IP representations to dotted-decimal before validation, closing bypass vectors |
| **Configurable allowlists** | Explicitly permit specific internal URLs when needed (e.g., an internal wiki) |

Configure allowlists in `~/.auxiora/config.json`:

```json
{
  "browser": {
    "ssrf": {
      "allowlist": [
        "https://wiki.internal.example.com",
        "https://dashboard.local:3000"
      ]
    }
  }
}
```

### Trust Levels

Browser actions are gated by the `web` trust domain. Higher-risk actions require higher trust levels:

| Trust Level | Allowed Actions |
|-------------|----------------|
| **0 -- 1** | No browser access |
| **2 (Suggest)** | Navigate and read pages, take screenshots, extract content |
| **3 (Act & Report)** | All of level 2 plus fill forms, click buttons, submit data |
| **4 (Full Autonomy)** | Unrestricted browsing including JavaScript execution and file downloads |

Set the web trust level:

```bash
auxiora trust set web 2        # Read-only browsing
auxiora trust set web 3        # Browsing + form interaction
auxiora trust set web 4        # Unrestricted (use with caution)
```

At trust levels 2 and 3, the assistant will ask for confirmation before performing sensitive actions that exceed its allowed level. At level 4, it operates autonomously -- all actions are still recorded in the [audit log](vault-and-security.md).

### Additional Safeguards

- **Sandboxed JavaScript** -- JS execution runs within the browser's page context only. It cannot access the filesystem, spawn processes, or make network requests outside the page.
- **Session isolation** -- Each browser session starts clean with no cookies, storage, or cached credentials. Sessions do not persist between interactions.
- **Timeout enforcement** -- Browser operations time out after a configurable period (default: 30 seconds per action, 5 minutes per session) to prevent runaway automation.
- **Content size limits** -- Extracted content is truncated to prevent memory exhaustion from unusually large pages.

## Configuration

```json
{
  "browser": {
    "enabled": true,
    "headless": true,
    "timeout": {
      "actionMs": 30000,
      "sessionMs": 300000
    },
    "viewport": {
      "width": 1280,
      "height": 720
    },
    "ssrf": {
      "allowlist": []
    }
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable or disable browser control entirely |
| `headless` | `true` | Run browser without a visible window |
| `timeout.actionMs` | `30000` | Max time for a single browser action (ms) |
| `timeout.sessionMs` | `300000` | Max time for an entire browser session (ms) |
| `viewport.width` | `1280` | Browser viewport width in pixels |
| `viewport.height` | `720` | Browser viewport height in pixels |
| `ssrf.allowlist` | `[]` | URLs permitted to bypass SSRF checks |

## Use Cases

### 1. Web Research

Ask Auxiora to gather information from the web: "Go to the Hacker News front page and summarize the top 5 stories." The assistant navigates to the page, extracts the headlines and links, follows each link to read the articles, and produces a structured summary with sources. Combined with the [Research Agent](research.md), browser control enables deep multi-source investigations with full citations.

### 2. Price Monitoring

Set up a [behavior](behaviors.md) that checks a product page daily: "Monitor the price of [product URL] and alert me when it drops below $200." The assistant navigates to the page on each check, extracts the current price, compares it against the threshold, and sends a notification via your configured [channel](channels.md) when the condition is met.

### 3. Form Automation

At trust level 3+, Auxiora can fill out routine forms with pre-configured data: "Fill out the weekly status report form with this week's completed tasks from Linear." The assistant navigates to the form, maps your task data to the appropriate fields, fills them in, and submits. It confirms the submission and provides a screenshot of the completed form.

### 4. Screenshot Documentation

Capture visual records of web pages: "Take a screenshot of our production dashboard and save it." The assistant navigates to the URL, waits for the page to fully render, captures a full-page screenshot, and includes it in the conversation. Useful for change tracking, bug documentation, and visual audits.

## Related Documentation

- [Vault & Security](vault-and-security.md) -- Trust levels and SSRF protection details
- [Behaviors](behaviors.md) -- Schedule browser tasks as recurring behaviors
- [Research Agent](research.md) -- Browser control powers the research agent's web access
- [CLI Reference](cli.md) -- Full command reference for `auxiora trust`
