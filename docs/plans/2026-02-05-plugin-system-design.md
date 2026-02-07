# Plugin System Design

## Goal

Let users extend Auxiora with custom tools by dropping JavaScript files into a plugins directory. The AI can call plugin tools the same way it calls built-in tools.

## Architecture

Plugins are ESM JavaScript files in `~/.auxiora/plugins/`. Each file exports a `plugin` object with metadata and tool definitions. On startup, the runtime dynamically imports each `.js` file, validates the export, and registers the tools with the existing `toolRegistry`. Same-process execution — no isolation boundary. Trust-based, appropriate for a self-hosted system where the user controls the plugins directory.

New package: `packages/plugins/` — Plugin loader, validator, and tool adapter.

---

## Plugin Format

```javascript
// ~/.auxiora/plugins/weather.js
export const plugin = {
  name: 'weather',
  version: '1.0.0',
  tools: [{
    name: 'get_weather',
    description: 'Get current weather for a city',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' }
      },
      required: ['city']
    },
    execute: async ({ city }) => {
      const res = await fetch(`https://wttr.in/${city}?format=j1`);
      const data = await res.json();
      return { success: true, output: JSON.stringify(data.current_condition[0]) };
    }
  }]
};
```

Optional lifecycle hooks:
- `initialize()` — async, called after load for setup
- `shutdown()` — async, called on system stop for teardown

---

## Plugin Loader

The `PluginLoader` class handles discovery, loading, and validation.

**Discovery:** `loadAll()` reads the plugins directory, filters for `.js` files. Files starting with `_` or `.` are skipped (convention for disabling).

**Validation rules:**
- Export has a `plugin` object with `name` (string) and `tools` (array)
- Each tool has `name`, `description`, `parameters` (JSON Schema object), and `execute` (function)
- Tool names are unique across all plugins and don't collide with built-in tools
- Tool names match `/^[a-z][a-z0-9_]{1,62}$/`

**Error handling:** If a plugin fails to load (syntax error, missing export, validation failure), it's logged as a warning and skipped. Other plugins and the system continue normally.

**Registration:** Valid tools are wrapped in a `PluginTool` adapter that conforms to `toolRegistry`'s interface. The adapter calls the plugin's `execute()` function, wraps it in try/catch with a timeout, and normalizes the return value to `{ success, output, error }`.

---

## Runtime Integration

**Initialization order:** Plugin loading happens after the tool system is initialized but before behaviors start, so behaviors can use plugin tools.

**Dashboard:** New read-only endpoint `GET /api/v1/dashboard/plugins` returns loaded plugins with metadata (name, version, tool count, load status). Dashboard UI gets a Plugins page with a table.

**CLI:** `auxiora plugins list` shows loaded plugins and their tools.

**Audit events:** `plugin.loaded` (name, version, toolCount), `plugin.load_failed` (name, error).

**Tool execution:** Plugin tools receive the same `ExecutionContext` as built-in tools (sessionId, workingDirectory, timeout). From the AI's perspective, plugin tools are indistinguishable from built-in tools.

---

## Configuration

```typescript
plugins: z.object({
  enabled: z.boolean().default(true),
  dir: z.string().default('~/.auxiora/plugins'),
})
```

---

## Security

Trust-based model — the user controls the plugins directory. Guardrails:

| Concern | Mitigation |
|---------|------------|
| Plugin hangs | Execution timeout (30s default from ExecutionContext) |
| Plugin throws | try/catch wrapper, returns `{ success: false, error }` |
| Name collision | Loader rejects plugin tools that shadow built-in tool names |
| Visibility | All plugin tool executions logged via existing tool audit |
| Directory access | Created with `0o700` permissions (owner-only) |

**Explicitly not implemented (YAGNI):** sandboxing, plugin signing, network restrictions, memory/CPU limits.

---

## Testing Strategy

- **PluginLoader tests** (~8): valid load, skip `_` prefixed files, reject missing name, reject missing tools, reject missing execute, reject name collision, reject invalid name chars, handle syntax error
- **PluginTool adapter tests** (~4): successful execution, error handling, output normalization, context passing
- **Integration test** (~1): write temp plugin file, load, execute, verify

~13 new tests, bringing project total to ~311.

---

## Future Scope (not v1.8)

- **Hot reload** — Watch plugins directory for changes, reload modified plugins without restart
- **Plugin dependencies** — Allow plugins to declare npm dependencies, auto-install on load
- **Plugin marketplace** — Browse and install community plugins via CLI
- **Capability restrictions** — Opt-in sandboxing for untrusted plugins
