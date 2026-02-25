# Plugins & Marketplace

> Extend Auxiora with plugins, self-authoring skills, and a community marketplace.

## Plugin System

### Loading Plugins

Plugins are loaded from `~/.auxiora/plugins/`. Each plugin is a single TypeScript/JavaScript ESM file that exports a `plugin` object with a name, version, description, permissions array, and a `tools` array defining the tools the plugin provides.

Plugins run in a sandboxed execution environment with strict security constraints:

- No `require()` -- ESM imports only
- No `child_process`, `fs`, or `process.env` access
- No `globalThis` or dynamic code execution constructors
- Tool names must follow `lowercase_snake_case` naming conventions

### Plugin Structure

```typescript
export const plugin = {
  name: 'my_plugin',
  version: '1.0.0',
  description: 'What this plugin does',
  permissions: [],
  tools: [
    {
      name: 'my_tool',
      description: 'What this tool does',
      parameters: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Input value' },
        },
        required: ['input'],
      },
      async execute(params) {
        return { success: true, output: `Processed: ${params.input}` };
      },
    },
  ],
};
```

### Managing Plugins

```bash
auxiora plugin list       # List installed plugins
auxiora plugin install    # Install a plugin
auxiora plugin remove     # Remove a plugin
```

## Self-Authoring Skills

Auxiora can create its own plugins during a conversation using the `create_skill` tool. The process follows a generate-validate-install-load pipeline:

### Pipeline

1. **Author** -- The `SkillAuthor` takes a natural language description and uses an LLM to generate valid plugin source code. If the first attempt fails validation, it retries with error feedback (configurable retries, default 1).

2. **Validator** -- The `SkillValidator` performs static analysis on the generated code, checking for the required `export const plugin` structure, blocked patterns (child_process, fs, process.env, globalThis, dynamic execution), and valid tool name formats.

3. **Installer** -- The `SkillInstaller` writes the validated source to `~/.auxiora/plugins/<name>.js` with path traversal protection and safe name enforcement (`/^[a-z][a-z0-9_]{1,62}$/`).

4. **Hot-load** -- The plugin loader immediately loads the new plugin, making its tools available in the current session without a restart.

### Using `create_skill` in Conversations

The `create_skill` tool is available during conversations and requires explicit user approval before executing:

```
You: "Create a skill that converts between temperature units"

Auxiora: I'll create a temperature conversion skill for you.
[Requests approval to use create_skill]

You: [Approve]

Auxiora: Created and loaded plugin "temperature_converter" with tools:
celsius_to_fahrenheit, fahrenheit_to_celsius, celsius_to_kelvin
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `description` | string | Yes | Natural language description of what the skill should do |
| `name` | string | No | Plugin name in `lowercase_snake_case`. Auto-derived from description if omitted |

## Marketplace

The marketplace is a registry server backed by SQLite and Fastify, with file-based package storage. It supports both personalities and plugins.

### Searching

Browse published personalities and plugins via the dashboard marketplace page or directly through the API. Search supports filtering by query string, author, keywords, and sort order (name, downloads, rating, updated).

### Publishing

Package your personality or plugin and publish it to the registry. Publishing requires a Bearer API key for authentication. The package content is sent as a base64-encoded payload.

**Personality publishing fields:** name, version, description, author, preview, tone (warmth/humor/formality), keywords, content.

**Plugin publishing fields:** name, version, description, author, license, permissions, keywords, homepage, repository, content.

### Installing

Install personalities or plugins from the registry. The registry tracks download counts and returns the package content for local installation.

### API Reference

#### Personalities

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/personalities/search?q=&author=&sort=&limit=&offset=` | GET | Search personalities by query, author, or sort order |
| `/api/v1/personalities/:name` | GET | Get personality details by name |
| `/api/v1/personalities/install` | POST | Install a personality (body: `{ name, version? }`) |
| `/api/v1/personalities/publish` | POST | Publish a personality (requires Bearer API key) |

#### Plugins

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/plugins/search?q=&author=&keywords=&sort=&limit=&offset=` | GET | Search plugins by query, author, keywords, or sort order |
| `/api/v1/plugins/:name` | GET | Get plugin details by name |
| `/api/v1/plugins/install` | POST | Install a plugin (body: `{ name, version? }`) |
| `/api/v1/plugins/publish` | POST | Publish a plugin (requires Bearer API key) |

### Authentication

Publishing endpoints require a Bearer token in the `Authorization` header:

```bash
curl -X POST http://localhost:18801/api/v1/plugins/publish \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "my_plugin", "version": "1.0.0", ...}'
```

## Use Cases

1. **Custom skill** -- "Create a skill that summarizes my Notion daily notes every evening." The assistant uses `create_skill` to generate, validate, and install a plugin with the appropriate tools. The skill is immediately available in subsequent conversations.

2. **Community personality** -- Browse the marketplace for pre-built Architect presets optimized for specific domains like security auditing, creative writing, or technical mentoring. Install with a single API call or through the dashboard.

3. **Team sharing** -- Publish internal tools as plugins to a self-hosted marketplace registry. Team members install shared plugins across their Auxiora instances, ensuring consistent tooling without manual file distribution.
