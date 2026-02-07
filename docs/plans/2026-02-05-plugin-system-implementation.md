# Plugin System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users extend Auxiora with custom tools by dropping JavaScript files into a plugins directory.

**Architecture:** New `packages/plugins/` package with a `PluginLoader` class that scans a directory for `.js` files, dynamically imports them, validates their `plugin` export, and registers tools with the existing `toolRegistry`. The runtime calls `PluginLoader.loadAll()` during initialization. Dashboard gets a read-only `/plugins` endpoint.

**Tech Stack:** Node.js `node:fs`, dynamic `import()`, existing `toolRegistry` from `@auxiora/tools`

---

## Context for implementers

**Monorepo layout:** `packages/*` auto-discovered by pnpm. TypeScript strict ESM with `.js` extensions on all imports. Type imports use `import type { ... }`.

**Key files you'll modify:**
- `packages/core/src/index.ts` — Add `getPluginsDir()` path function
- `packages/config/src/index.ts` — Add `PluginsConfigSchema` to `ConfigSchema`
- `packages/audit/src/index.ts` — Add plugin audit event types
- `packages/dashboard/src/types.ts` — Add `getPlugins` to `DashboardDeps`
- `packages/dashboard/src/router.ts` — Add `GET /plugins` endpoint
- `packages/runtime/src/index.ts` — Add plugin loader initialization
- `packages/runtime/package.json` — Add `@auxiora/plugins` dependency

**Existing patterns to follow:**
- `Tool` interface in `packages/tools/src/index.ts:47-54` — name, description, parameters, execute, getPermission
- `toolRegistry.register()` in `packages/tools/src/index.ts:77-84` — how tools are registered
- `ToolParameter` interface in `packages/tools/src/index.ts:23-29` — parameter shape
- `ToolPermission` enum in `packages/tools/src/index.ts:17-21` — AUTO_APPROVE, USER_APPROVAL, ALWAYS_DENY
- `setBrowserManager()` in `packages/tools/src/browser.ts` — dependency injection pattern

---

### Task 1: Add plugins config, audit events, and path function

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/config/src/index.ts`
- Modify: `packages/config/tests/config.test.ts`
- Modify: `packages/audit/src/index.ts`

**Step 1: Add getPluginsDir to core**

In `packages/core/src/index.ts`, after `getScreenshotsDir()` (line ~128), add:

```typescript
export function getPluginsDir(): string {
  return path.join(getDataDir(), 'plugins');
}
```

Then add to the `paths` object (after `screenshots`):

```typescript
  plugins: getPluginsDir,
```

**Step 2: Add PluginsConfigSchema to config**

In `packages/config/src/index.ts`, after `DashboardConfigSchema`:

```typescript
const PluginsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  dir: z.string().optional(),
});
```

Then add `plugins: PluginsConfigSchema.default({})` to `ConfigSchema` after `dashboard`.

**Step 3: Add plugin config tests**

In `packages/config/tests/config.test.ts`, add after the dashboard config describe block:

```typescript
describe('plugins config', () => {
  it('should default plugins to enabled', () => {
    const config = ConfigSchema.parse({});
    expect(config.plugins.enabled).toBe(true);
    expect(config.plugins.dir).toBeUndefined();
  });

  it('should accept custom plugins config', () => {
    const config = ConfigSchema.parse({
      plugins: { enabled: false, dir: '/custom/plugins' },
    });
    expect(config.plugins.enabled).toBe(false);
    expect(config.plugins.dir).toBe('/custom/plugins');
  });
});
```

**Step 4: Add plugin audit events**

In `packages/audit/src/index.ts`, add before `| 'system.error'`:

```typescript
  | 'plugin.loaded'
  | 'plugin.load_failed'
```

**Step 5: Run tests and commit**

Run: `pnpm test -- --run packages/config/ packages/audit/ packages/core/`

```bash
git add packages/core/src/index.ts packages/config/ packages/audit/src/index.ts
git commit -m "feat(core): add plugins config, audit events, and path function"
```

---

### Task 2: Scaffold plugins package with types and loader

**Files:**
- Create: `packages/plugins/package.json`
- Create: `packages/plugins/tsconfig.json`
- Create: `packages/plugins/src/types.ts`
- Create: `packages/plugins/src/loader.ts`
- Create: `packages/plugins/src/index.ts`
- Create: `packages/plugins/tests/loader.test.ts`

**Step 1: Create package.json**

```json
{
  "name": "@auxiora/plugins",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "dependencies": {
    "@auxiora/logger": "workspace:*",
    "@auxiora/audit": "workspace:*",
    "@auxiora/tools": "workspace:*",
    "@auxiora/core": "workspace:*"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../logger" },
    { "path": "../audit" },
    { "path": "../tools" },
    { "path": "../core" }
  ]
}
```

**Step 3: Create types.ts**

```typescript
import type { ToolResult } from '@auxiora/tools';

export interface PluginToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  execute: (params: any) => Promise<PluginToolResult>;
}

export type PluginToolResult = ToolResult | { success: boolean; output?: string; error?: string };

export interface PluginExport {
  name: string;
  version: string;
  tools: PluginToolDefinition[];
  initialize?: () => Promise<void>;
  shutdown?: () => Promise<void>;
}

export interface LoadedPlugin {
  name: string;
  version: string;
  file: string;
  toolCount: number;
  toolNames: string[];
  status: 'loaded' | 'failed';
  error?: string;
  shutdown?: () => Promise<void>;
}

export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{1,62}$/;
```

**Step 4: Create loader.ts**

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import { toolRegistry, type Tool, type ToolParameter, ToolPermission, type ToolResult, type ExecutionContext } from '@auxiora/tools';
import { getPluginsDir, isWindows } from '@auxiora/core';
import type { PluginExport, PluginToolDefinition, LoadedPlugin } from './types.js';
import { TOOL_NAME_PATTERN } from './types.js';

const logger = getLogger('plugins:loader');

export class PluginLoader {
  private pluginsDir: string;
  private loaded: LoadedPlugin[] = [];
  private builtinToolNames: Set<string>;

  constructor(pluginsDir?: string) {
    this.pluginsDir = pluginsDir ?? getPluginsDir();
    // Snapshot built-in tool names before any plugins load
    this.builtinToolNames = new Set(toolRegistry.listNames());
  }

  async loadAll(): Promise<LoadedPlugin[]> {
    // Ensure directory exists
    await fs.mkdir(this.pluginsDir, { recursive: true });
    if (!isWindows()) {
      try { await fs.chmod(this.pluginsDir, 0o700); } catch { /* best effort */ }
    }

    let files: string[];
    try {
      const entries = await fs.readdir(this.pluginsDir);
      files = entries.filter(f => f.endsWith('.js') && !f.startsWith('_') && !f.startsWith('.'));
    } catch {
      return [];
    }

    for (const file of files) {
      await this.loadPlugin(path.join(this.pluginsDir, file));
    }

    return this.loaded;
  }

  private async loadPlugin(filePath: string): Promise<void> {
    const fileName = path.basename(filePath);

    try {
      const fileUrl = pathToFileURL(filePath).href;
      const module = await import(fileUrl);
      const pluginExport: PluginExport = module.plugin;

      this.validatePlugin(pluginExport, fileName);

      // Register tools
      const toolNames: string[] = [];
      for (const toolDef of pluginExport.tools) {
        const tool = this.adaptTool(toolDef, pluginExport.name);
        toolRegistry.register(tool);
        toolNames.push(toolDef.name);
      }

      // Call initialize if provided
      if (pluginExport.initialize) {
        await pluginExport.initialize();
      }

      const loaded: LoadedPlugin = {
        name: pluginExport.name,
        version: pluginExport.version,
        file: fileName,
        toolCount: toolNames.length,
        toolNames,
        status: 'loaded',
        shutdown: pluginExport.shutdown,
      };
      this.loaded.push(loaded);

      void audit('plugin.loaded', {
        name: pluginExport.name,
        version: pluginExport.version,
        toolCount: toolNames.length,
      });

      logger.info('Plugin loaded', {
        name: pluginExport.name,
        version: pluginExport.version,
        tools: toolNames,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.loaded.push({
        name: fileName.replace('.js', ''),
        version: 'unknown',
        file: fileName,
        toolCount: 0,
        toolNames: [],
        status: 'failed',
        error: errorMessage,
      });

      void audit('plugin.load_failed', { name: fileName, error: errorMessage });
      logger.warn('Failed to load plugin', { file: fileName, error: errorMessage });
    }
  }

  private validatePlugin(plugin: unknown, fileName: string): asserts plugin is PluginExport {
    if (!plugin || typeof plugin !== 'object') {
      throw new Error(`Plugin file ${fileName} must export a 'plugin' object`);
    }

    const p = plugin as Record<string, unknown>;

    if (typeof p.name !== 'string' || !p.name) {
      throw new Error('Plugin must have a non-empty "name" string');
    }

    if (!Array.isArray(p.tools) || p.tools.length === 0) {
      throw new Error('Plugin must have a non-empty "tools" array');
    }

    for (const tool of p.tools as PluginToolDefinition[]) {
      if (typeof tool.name !== 'string' || !TOOL_NAME_PATTERN.test(tool.name)) {
        throw new Error(
          `Tool name "${tool.name}" is invalid. Must match ${TOOL_NAME_PATTERN}`
        );
      }

      if (typeof tool.description !== 'string' || !tool.description) {
        throw new Error(`Tool "${tool.name}" must have a description`);
      }

      if (typeof tool.execute !== 'function') {
        throw new Error(`Tool "${tool.name}" must have an execute function`);
      }

      // Check for collision with built-in tools
      if (this.builtinToolNames.has(tool.name)) {
        throw new Error(
          `Tool "${tool.name}" collides with a built-in tool`
        );
      }

      // Check for collision with already-loaded plugin tools
      const existingPlugin = this.loaded.find(lp =>
        lp.toolNames.includes(tool.name)
      );
      if (existingPlugin) {
        throw new Error(
          `Tool "${tool.name}" collides with tool from plugin "${existingPlugin.name}"`
        );
      }
    }
  }

  private adaptTool(toolDef: PluginToolDefinition, pluginName: string): Tool {
    // Convert plugin parameter format to ToolParameter[]
    const parameters: ToolParameter[] = [];
    if (toolDef.parameters?.properties) {
      for (const [name, schema] of Object.entries(toolDef.parameters.properties)) {
        parameters.push({
          name,
          type: schema.type,
          description: schema.description,
          required: toolDef.parameters.required?.includes(name) ?? false,
        });
      }
    }

    return {
      name: toolDef.name,
      description: `[Plugin: ${pluginName}] ${toolDef.description}`,
      parameters,
      getPermission: () => ToolPermission.USER_APPROVAL,
      execute: async (params: any, context: ExecutionContext): Promise<ToolResult> => {
        try {
          const result = await Promise.race([
            toolDef.execute(params),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Plugin tool timed out')), context.timeout || 30_000)
            ),
          ]);
          return {
            success: result.success,
            output: result.output,
            error: result.error,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, error: message };
        }
      },
    };
  }

  listPlugins(): LoadedPlugin[] {
    return [...this.loaded];
  }

  async shutdownAll(): Promise<void> {
    for (const plugin of this.loaded) {
      if (plugin.shutdown) {
        try {
          await plugin.shutdown();
        } catch (error) {
          logger.warn('Plugin shutdown error', { name: plugin.name, error });
        }
      }
    }
  }
}
```

**Step 5: Create barrel exports**

```typescript
export type { PluginExport, PluginToolDefinition, PluginToolResult, LoadedPlugin } from './types.js';
export { TOOL_NAME_PATTERN } from './types.js';
export { PluginLoader } from './loader.js';
```

**Step 6: Write tests**

Create `packages/plugins/tests/loader.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { PluginLoader } from '../src/loader.js';
import { toolRegistry } from '@auxiora/tools';

let tmpDir: string;

async function writePlugin(fileName: string, content: string): Promise<void> {
  await fs.writeFile(path.join(tmpDir, fileName), content, 'utf-8');
}

const VALID_PLUGIN = `
export const plugin = {
  name: 'test-plugin',
  version: '1.0.0',
  tools: [{
    name: 'test_tool',
    description: 'A test tool',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input value' }
      },
      required: ['input']
    },
    execute: async ({ input }) => ({ success: true, output: 'result: ' + input })
  }]
};
`;

describe('PluginLoader', () => {
  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `auxiora-plugins-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    // Unregister any plugin tools
    for (const name of toolRegistry.listNames()) {
      if (name === 'test_tool' || name === 'another_tool' || name === 'tool_a' || name === 'tool_b') {
        toolRegistry.unregister(name);
      }
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should load a valid plugin and register its tools', async () => {
    await writePlugin('test.js', VALID_PLUGIN);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe('test-plugin');
    expect(plugins[0].status).toBe('loaded');
    expect(plugins[0].toolNames).toEqual(['test_tool']);
    expect(toolRegistry.get('test_tool')).toBeDefined();
  });

  it('should execute a loaded plugin tool', async () => {
    await writePlugin('test.js', VALID_PLUGIN);

    const loader = new PluginLoader(tmpDir);
    await loader.loadAll();

    const tool = toolRegistry.get('test_tool')!;
    const result = await tool.execute(
      { input: 'hello' },
      { sessionId: 'test', workingDirectory: '/tmp', timeout: 5000 }
    );
    expect(result.success).toBe(true);
    expect(result.output).toBe('result: hello');
  });

  it('should skip files starting with underscore', async () => {
    await writePlugin('_disabled.js', VALID_PLUGIN);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(0);
  });

  it('should skip files starting with dot', async () => {
    await writePlugin('.hidden.js', VALID_PLUGIN);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(0);
  });

  it('should reject plugin with missing name', async () => {
    await writePlugin('bad.js', `
      export const plugin = {
        tools: [{ name: 'x', description: 'x', execute: async () => ({ success: true }) }]
      };
    `);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].status).toBe('failed');
    expect(plugins[0].error).toContain('name');
  });

  it('should reject plugin with missing tools array', async () => {
    await writePlugin('bad.js', `
      export const plugin = { name: 'bad', version: '1.0.0' };
    `);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].status).toBe('failed');
    expect(plugins[0].error).toContain('tools');
  });

  it('should reject tool with missing execute function', async () => {
    await writePlugin('bad.js', `
      export const plugin = {
        name: 'bad',
        version: '1.0.0',
        tools: [{ name: 'no_exec', description: 'missing execute' }]
      };
    `);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].status).toBe('failed');
    expect(plugins[0].error).toContain('execute');
  });

  it('should reject tool name that collides with built-in tool', async () => {
    // 'bash' is a built-in tool
    await writePlugin('collision.js', `
      export const plugin = {
        name: 'collision',
        version: '1.0.0',
        tools: [{
          name: 'bash',
          description: 'Override bash',
          execute: async () => ({ success: true })
        }]
      };
    `);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].status).toBe('failed');
    expect(plugins[0].error).toContain('collides');
  });

  it('should reject tool with invalid name characters', async () => {
    await writePlugin('badname.js', `
      export const plugin = {
        name: 'badname',
        version: '1.0.0',
        tools: [{
          name: 'Invalid-Name',
          description: 'Bad name',
          execute: async () => ({ success: true })
        }]
      };
    `);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].status).toBe('failed');
    expect(plugins[0].error).toContain('invalid');
  });

  it('should handle plugin file with syntax error', async () => {
    await writePlugin('syntax.js', 'export const plugin = {{{{{');

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].status).toBe('failed');
  });

  it('should handle plugin tool that throws an error', async () => {
    await writePlugin('throws.js', `
      export const plugin = {
        name: 'throws',
        version: '1.0.0',
        tools: [{
          name: 'throw_tool',
          description: 'Throws on execute',
          parameters: { type: 'object', properties: {} },
          execute: async () => { throw new Error('boom'); }
        }]
      };
    `);

    const loader = new PluginLoader(tmpDir);
    await loader.loadAll();

    const tool = toolRegistry.get('throw_tool')!;
    const result = await tool.execute({}, { sessionId: 'test', workingDirectory: '/tmp', timeout: 5000 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('boom');

    toolRegistry.unregister('throw_tool');
  });

  it('should call initialize on plugin load', async () => {
    await writePlugin('init.js', `
      let initialized = false;
      export const plugin = {
        name: 'init-test',
        version: '1.0.0',
        initialize: async () => { initialized = true; },
        tools: [{
          name: 'check_init',
          description: 'Check if initialized',
          parameters: { type: 'object', properties: {} },
          execute: async () => ({ success: true, output: String(initialized) })
        }]
      };
    `);

    const loader = new PluginLoader(tmpDir);
    await loader.loadAll();

    // Tool should have been registered after initialize
    const tool = toolRegistry.get('check_init')!;
    const result = await tool.execute({}, { sessionId: 'test', workingDirectory: '/tmp', timeout: 5000 });
    expect(result.output).toBe('true');

    toolRegistry.unregister('check_init');
  });

  it('should return empty list for missing directory', async () => {
    const loader = new PluginLoader('/nonexistent/path/plugins');
    const plugins = await loader.loadAll();
    expect(plugins).toHaveLength(0);
  });
});
```

**Step 7: Install and run tests**

Run: `pnpm install && pnpm test -- --run packages/plugins/ packages/config/ packages/core/`

Expected: ~13 plugin tests + existing config/core tests PASS.

**Step 8: Commit**

```bash
git add packages/plugins/ packages/core/src/index.ts packages/config/ packages/audit/src/index.ts
git commit -m "feat(plugins): implement plugin loader with validation, tool registration, and tests"
```

---

### Task 3: Add plugins endpoint to dashboard

**Files:**
- Modify: `packages/dashboard/src/types.ts`
- Modify: `packages/dashboard/src/router.ts`
- Modify: `packages/dashboard/tests/router.test.ts`

**Step 1: Add getPlugins to DashboardDeps**

In `packages/dashboard/src/types.ts`, add to the `DashboardDeps` interface after `getAuditEntries`:

```typescript
  getPlugins?: () => Array<{
    name: string;
    version: string;
    file: string;
    toolCount: number;
    toolNames: string[];
    status: string;
    error?: string;
  }>;
```

**Step 2: Add plugins endpoint to router**

In `packages/dashboard/src/router.ts`, after the `/status` route handler and before `return { router, auth }`:

```typescript
  // Plugins
  router.get('/plugins', (req: Request, res: Response) => {
    const plugins = deps.getPlugins ? deps.getPlugins() : [];
    res.json({ data: plugins });
  });
```

**Step 3: Add test for plugins endpoint**

In `packages/dashboard/tests/router.test.ts`, add `getPlugins` to `createMockDeps()` after `getAuditEntries`:

```typescript
    getPlugins: vi.fn().mockReturnValue([
      { name: 'test-plugin', version: '1.0.0', file: 'test.js', toolCount: 1, toolNames: ['test_tool'], status: 'loaded' },
    ]),
```

Then add a new describe block after the `status API` block:

```typescript
  describe('plugins API', () => {
    it('should list loaded plugins', async () => {
      const cookie = await loginAndGetCookie(app);
      const res = await request(app)
        .get('/api/v1/dashboard/plugins')
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('test-plugin');
    });
  });
```

**Step 4: Run tests and commit**

Run: `pnpm test -- --run packages/dashboard/`

Expected: 6 auth + 16 router + 1 plugins = ~23 tests PASS.

```bash
git add packages/dashboard/
git commit -m "feat(dashboard): add read-only plugins endpoint to REST API"
```

---

### Task 4: Wire plugins into runtime

**Files:**
- Modify: `packages/runtime/package.json`
- Modify: `packages/runtime/src/index.ts`

**Step 1: Add dependency**

In `packages/runtime/package.json`, add to `dependencies`:

```json
"@auxiora/plugins": "workspace:*"
```

**Step 2: Add import**

In `packages/runtime/src/index.ts`, add after the dashboard import:

```typescript
import { PluginLoader } from '@auxiora/plugins';
```

**Step 3: Add pluginLoader field**

In the `Auxiora` class, add after the `webhookManager` field:

```typescript
  private pluginLoader?: PluginLoader;
```

**Step 4: Add plugin initialization**

In `initialize()`, after the dashboard block and before the closing `}` of `initialize()`, add:

```typescript
    // Initialize plugin system (if enabled)
    if (this.config.plugins?.enabled !== false) {
      const pluginsDir = this.config.plugins?.dir || undefined;
      this.pluginLoader = new PluginLoader(pluginsDir);
      const loaded = await this.pluginLoader.loadAll();
      const successful = loaded.filter(p => p.status === 'loaded');
      if (loaded.length > 0) {
        console.log(`Plugins: ${successful.length} loaded, ${loaded.length - successful.length} failed`);
      }
    }
```

**Step 5: Wire getPlugins into dashboard deps**

In `initialize()`, find the `createDashboardRouter` call and add `getPlugins` to the `deps` object:

```typescript
          getPlugins: () => this.pluginLoader?.listPlugins() ?? [],
```

This goes after `getAuditEntries`.

**Step 6: Add shutdown**

In the `stop()` method, after the voice manager shutdown:

```typescript
    if (this.pluginLoader) {
      await this.pluginLoader.shutdownAll();
    }
```

**Step 7: Install, run tests, commit**

```bash
pnpm install && pnpm test
```

All tests should pass.

```bash
git add packages/runtime/
git commit -m "feat(runtime): integrate plugin loader with tool registration and dashboard"
```

---

### Task 5: Version bump to 1.8.0

**Files:**
- Modify: `package.json` (root)

**Step 1: Bump version**

In root `package.json`, change version from `"1.7.0"` to `"1.8.0"`.

**Step 2: Run full test suite**

Run: `pnpm test`

Expected: All ~311 tests pass.

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 1.8.0"
```
