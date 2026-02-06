# Browser Control Design

## Goal

Add Playwright-powered web automation to Auxiora, giving the AI the ability to navigate websites, interact with page elements, capture screenshots, extract data, and execute JavaScript — all through the existing tool system.

## Architecture

Browser control operates at two levels:

1. **Primitive tools** — Individual actions (`browser_navigate`, `browser_click`, `browser_type`, `browser_screenshot`, `browser_extract`, `browser_wait`, `browser_evaluate`) that the AI chains together for precise control.

2. **High-level `browse` tool** — A single tool where the AI describes a task in natural language (e.g., "go to hackernews and get the top 5 stories"). Internally executes a sequence of primitive actions and returns the consolidated result.

A new `packages/browser` package contains the `BrowserManager` class, keeping Playwright as an optional dependency. The tools live in `packages/tools/src/browser.ts` and connect via the injection pattern (`setBrowserManager()`).

**Tech stack:** Playwright (Chromium), TypeScript ESM, same patterns as behaviors package.

---

## Tool Definitions

| Tool | Permission | Description |
|------|-----------|-------------|
| `browser_navigate` | AUTO_APPROVE | Go to a URL. Returns page title + rendered text content as markdown. |
| `browser_click` | USER_APPROVAL | Click an element by CSS selector or text content. |
| `browser_type` | USER_APPROVAL | Type text into an input field by selector. Supports Enter key. |
| `browser_screenshot` | AUTO_APPROVE | Capture full-page or element screenshot. Returns base64 + saves to disk. |
| `browser_extract` | AUTO_APPROVE | Extract text/attributes from elements matching a CSS selector. Returns JSON array. |
| `browser_wait` | AUTO_APPROVE | Wait for a selector to appear, or a fixed delay (max 30s). |
| `browser_evaluate` | USER_APPROVAL | Execute JavaScript on the page. Returns the result as JSON. |
| `browse` | AUTO_APPROVE | High-level: describe a task in natural language. Chains primitives, returns result. |

### Permission reasoning

- **Reading** (navigate, screenshot, extract, wait) is safe — AUTO_APPROVE
- **Writing** (click, type) mutates page state — USER_APPROVAL
- **JS execution** (evaluate) is powerful — USER_APPROVAL
- **Browse** is AUTO_APPROVE because it is read-oriented. If the task requires clicks/typing, it tells the AI to use the primitive tools instead (which trigger approval).

Each tool accepts an optional `sessionId` parameter. If omitted, it uses the current session's page.

---

## BrowserManager

The `BrowserManager` class manages a singleton Chromium instance and per-session pages.

```
BrowserManager
├── browser: Browser | null        (lazy-launched Chromium)
├── pages: Map<string, Page>       (sessionId → Page)
├── config: BrowserConfig          (headless, timeout, viewport)
│
├── launch()                       (start Chromium if not running)
├── getPage(sessionId)             (get or create a Page for session)
├── closePage(sessionId)           (close a session's tab)
├── shutdown()                     (close all pages + browser)
│
├── navigate(sessionId, url)
├── click(sessionId, selector)
├── type(sessionId, selector, text)
├── screenshot(sessionId, opts)
├── extract(sessionId, selector)
├── wait(sessionId, selector, timeout)
├── evaluate(sessionId, script)
└── browse(sessionId, task)        (high-level task execution)
```

### Configuration defaults

- Headless: `true`
- Default viewport: `1280x720`
- Navigation timeout: `30s`
- Action timeout: `10s`
- Max concurrent pages: `10`
- Screenshot directory: `{workspace}/screenshots`

### Crash recovery

Each operation checks `browser.isConnected()`. If the browser process has died, the manager re-launches Chromium and retries the operation once.

### Cleanup

On `shutdown()`, all pages close gracefully, then the browser closes. The runtime calls this from `Auxiora.stop()`.

### High-level `browse()` method

Takes a natural language task, builds a prompt with current page state (URL, title, visible text), and uses the AI provider to plan and execute a sequence of primitive actions. Caps at 10 steps to prevent runaway loops. If the task needs clicks/typing, returns a message telling the AI to use the primitive tools instead.

---

## Data Flow

```
User: "check the price of BTC on coinbase"
  → AI calls browser_navigate(url: "https://coinbase.com/explore")
  → ToolExecutor checks permission (AUTO_APPROVE) ✓
  → BrowserManager.launch() if needed
  → BrowserManager.getPage(sessionId) creates tab
  → page.goto(url), page.content() → markdown
  → Returns ToolResult { success, output: "page title + markdown content" }
  → AI calls browser_extract(selector: "[data-asset='BTC'] .price")
  → Returns extracted price
  → AI responds: "BTC is currently at $97,432"
```

### Runtime integration

1. `packages/browser/src/index.ts` exports `BrowserManager`
2. `packages/tools/src/browser.ts` exports tools + `setBrowserManager()`
3. `packages/tools/src/index.ts` registers the 8 browser tools
4. `packages/runtime/src/index.ts` creates `BrowserManager`, calls `setBrowserManager()`, wires `shutdown()` into `Auxiora.stop()`

### Screenshots

Save to `{workspace}/screenshots/{timestamp}-{sessionId}.png`. Tool result includes both the file path and base64-encoded image data for AI vision analysis.

### Audit events

`browser.navigate`, `browser.click`, `browser.type`, `browser.evaluate`, `browser.screenshot` — logged through the existing audit system.

---

## Security & Guardrails

### URL restrictions

- Block `file://` and `javascript:` protocols — only `http://` and `https://`
- Block internal network addresses (`127.0.0.1`, `10.*`, `192.168.*`, `169.254.*`) unless explicitly configured
- Configurable allowlist/blocklist in `BrowserConfig`

### Resource limits

- Max page load time: `30s`
- Max action timeout: `10s`
- Max concurrent pages: `10`
- Max screenshot size: `5MB`
- Max `evaluate()` return value: `100KB`
- Max `browse()` steps: `10`

### Permission escalation

- `browser_click` and `browser_type` require USER_APPROVAL (can submit forms, trigger purchases, send messages)
- `browser_evaluate` requires USER_APPROVAL — JS code shown in approval prompt
- `browse` returns a message to use primitive tools if mutations are needed

### Browser sandbox

- `--disable-extensions` and `--disable-dev-shm-usage` flags
- No persistent browser profile (fresh context each launch)
- No saved passwords, cookies don't persist across restarts

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Browser fails to launch | Return error, log, retry once on next call |
| Navigation timeout | Return error with URL + timeout duration |
| Selector not found | Return error listing visible selectors (first 10) for AI self-correction |
| Page crashed | Close page, re-create on next call |
| Browser process died | Re-launch browser, retry operation once |
| JS evaluate throws | Return error message + stack trace |
| Screenshot too large | Reduce quality to 50%, retry. If still large, crop to viewport only |

---

## Testing Strategy

Unit tests mock Playwright's API. `BrowserManager` accepts an injected browser factory for testability.

- **BrowserManager tests** (~10): launch/shutdown, page lifecycle, crash recovery, page limit, config
- **Tool tests** (~3-4 per tool): success, validation, permissions, timeouts
- **URL validation tests** (~6): protocol blocking, private IP blocking, allowlist/blocklist
- **Integration tests** (~4): navigate → extract → screenshot flow, `browse` task, multi-session isolation
