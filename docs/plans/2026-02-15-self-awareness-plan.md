# Self-Awareness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give Auxiora a live capability catalog, continuous health monitoring, an introspection tool, and a prompt fragment so the AI always knows what it can do and when something is broken.

**Architecture:** New `packages/introspection` package with CapabilityCatalog (event-driven registry), HealthMonitor (background check loop), IntrospectionTool (AI-callable), and prompt fragment generator. Wired into the runtime alongside existing packages, with trust-gated auto-fixes.

**Tech Stack:** TypeScript strict ESM, vitest for tests, pnpm workspace package

---

### Task 1: Scaffold the introspection package

**Files:**
- Create: `packages/introspection/package.json`
- Create: `packages/introspection/tsconfig.json`
- Create: `packages/introspection/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@auxiora/introspection",
  "version": "1.0.0",
  "description": "Self-awareness: capability catalog, health monitoring, and introspection for Auxiora",
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
  "dependencies": {
    "@auxiora/logger": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "vitest": "^3.1.1"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

Note: Keep dependencies minimal. The introspection package receives data via interfaces — it does NOT import the tools/channels/behaviors packages directly. The runtime passes in the data.

**Step 2: Create tsconfig.json**

Reference an existing one (e.g. `packages/audit/tsconfig.json`) and copy its structure:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 3: Create empty index.ts**

```typescript
// Exports added as modules are built
export {};
```

**Step 4: Install dependencies**

Run: `pnpm install`

**Step 5: Verify build**

Run: `pnpm --filter introspection build`
Expected: Compiles cleanly

**Step 6: Commit**

```bash
git add packages/introspection/
git commit -m "chore: scaffold introspection package"
```

---

### Task 2: Define types

**Files:**
- Create: `packages/introspection/src/types.ts`
- Modify: `packages/introspection/src/index.ts`

**Step 1: Create types.ts with all interfaces**

```typescript
export interface ToolCapability {
  name: string;
  description: string;
  parameterCount: number;
}

export interface ChannelCapability {
  type: string;
  connected: boolean;
  hasDefault: boolean;
}

export interface BehaviorCapability {
  id: string;
  type: string;
  status: string;
  action: string;
  runCount: number;
  failCount: number;
  maxFailures: number;
  lastRun?: string;
  health: 'healthy' | 'warning' | 'failing' | 'paused';
}

export interface ProviderCapability {
  name: string;
  displayName: string;
  available: boolean;
  isPrimary: boolean;
  isFallback: boolean;
  models: string[];
}

export interface PluginCapability {
  name: string;
  version: string;
  status: string;
  toolCount: number;
  behaviorCount: number;
}

export interface CapabilityCatalog {
  tools: ToolCapability[];
  channels: ChannelCapability[];
  behaviors: BehaviorCapability[];
  providers: ProviderCapability[];
  plugins: PluginCapability[];
  features: Record<string, boolean>;
  updatedAt: string;
}

export interface SubsystemHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: string;
  details?: string;
}

export interface HealthIssue {
  id: string;
  subsystem: string;
  severity: 'warning' | 'critical';
  description: string;
  detectedAt: string;
  resolvedAt?: string;
  suggestedFix?: string;
  autoFixable: boolean;
  trustLevelRequired?: number;
}

export interface HealthState {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  subsystems: SubsystemHealth[];
  issues: HealthIssue[];
  lastCheck: string;
}

/**
 * Sources the catalog queries to build its state.
 * Passed in by the runtime — keeps this package dependency-free.
 */
export interface IntrospectionSources {
  getTools: () => Array<{ name: string; description: string; parameters: any[] }>;
  getConnectedChannels: () => string[];
  getConfiguredChannels: () => string[];
  getDefaultChannelId?: (type: string) => string | undefined;
  getBehaviors: () => Promise<Array<{
    id: string; type: string; status: string; action: string;
    runCount: number; failCount: number; maxFailures: number; lastRun?: string;
  }>>;
  getProviders: () => Array<{ name: string; displayName: string; models: Record<string, unknown> }>;
  getPrimaryProviderName: () => string;
  getFallbackProviderName: () => string | undefined;
  checkProviderAvailable?: (name: string) => Promise<boolean>;
  getPlugins: () => Array<{
    name: string; version: string; status: string;
    toolCount: number; behaviorNames: string[];
  }>;
  getFeatures: () => Record<string, boolean>;
  getAuditEntries: (limit?: number) => Promise<Array<{
    timestamp: string; event: string; details: Record<string, unknown>;
  }>>;
  getTrustLevel?: (domain: string) => number;
}

/**
 * Actions the health monitor can take for auto-fixes.
 * Passed in by the runtime.
 */
export interface AutoFixActions {
  reconnectChannel?: (type: string) => Promise<boolean>;
  restartBehavior?: (id: string) => Promise<boolean>;
  switchToFallbackProvider?: () => Promise<boolean>;
}
```

**Step 2: Export from index.ts**

```typescript
export * from './types.js';
```

**Step 3: Verify build**

Run: `pnpm --filter introspection build`
Expected: Compiles cleanly

**Step 4: Commit**

```bash
git add packages/introspection/src/
git commit -m "feat(introspection): define capability and health types"
```

---

### Task 3: Build the CapabilityCatalog

**Files:**
- Create: `packages/introspection/tests/catalog.test.ts`
- Create: `packages/introspection/src/catalog.ts`
- Modify: `packages/introspection/src/index.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CapabilityCatalogImpl } from '../src/catalog.js';
import type { IntrospectionSources } from '../src/types.js';

function mockSources(overrides?: Partial<IntrospectionSources>): IntrospectionSources {
  return {
    getTools: () => [
      { name: 'bash', description: 'Run shell commands', parameters: [{ name: 'command', type: 'string' }] },
      { name: 'web_browser', description: 'Browse the web', parameters: [] },
    ],
    getConnectedChannels: () => ['discord', 'webchat'],
    getConfiguredChannels: () => ['discord', 'telegram', 'webchat'],
    getDefaultChannelId: () => 'channel-123',
    getBehaviors: async () => [
      { id: 'b1', type: 'scheduled', status: 'active', action: 'Daily report', runCount: 10, failCount: 0, maxFailures: 3, lastRun: '2026-02-15T10:00:00Z' },
      { id: 'b2', type: 'monitor', status: 'paused', action: 'Watch prices', runCount: 5, failCount: 3, maxFailures: 3 },
    ],
    getProviders: () => [
      { name: 'anthropic', displayName: 'Anthropic', models: { 'claude-sonnet': {} } },
      { name: 'openai', displayName: 'OpenAI', models: { 'gpt-4': {} } },
    ],
    getPrimaryProviderName: () => 'anthropic',
    getFallbackProviderName: () => 'openai',
    getPlugins: () => [
      { name: 'weather', version: '1.0.0', status: 'loaded', toolCount: 2, behaviorNames: [] },
    ],
    getFeatures: () => ({ behaviors: true, browser: true, voice: false }),
    getAuditEntries: async () => [],
    ...overrides,
  };
}

describe('CapabilityCatalog', () => {
  it('builds catalog from sources', async () => {
    const catalog = new CapabilityCatalogImpl(mockSources());
    await catalog.rebuild();
    const state = catalog.getCatalog();

    expect(state.tools).toHaveLength(2);
    expect(state.tools[0].name).toBe('bash');
    expect(state.tools[0].parameterCount).toBe(1);

    expect(state.channels).toHaveLength(3);
    expect(state.channels.find(c => c.type === 'discord')?.connected).toBe(true);
    expect(state.channels.find(c => c.type === 'telegram')?.connected).toBe(false);

    expect(state.behaviors).toHaveLength(2);
    expect(state.behaviors[0].health).toBe('healthy');
    expect(state.behaviors[1].health).toBe('paused');

    expect(state.providers).toHaveLength(2);
    expect(state.providers[0].isPrimary).toBe(true);
    expect(state.providers[1].isFallback).toBe(true);

    expect(state.plugins).toHaveLength(1);
    expect(state.features.behaviors).toBe(true);
    expect(state.updatedAt).toBeTruthy();
  });

  it('classifies behavior health correctly', async () => {
    const catalog = new CapabilityCatalogImpl(mockSources({
      getBehaviors: async () => [
        { id: 'b1', type: 'scheduled', status: 'active', action: 'Test', runCount: 10, failCount: 0, maxFailures: 3 },
        { id: 'b2', type: 'scheduled', status: 'active', action: 'Warn', runCount: 10, failCount: 2, maxFailures: 3 },
        { id: 'b3', type: 'scheduled', status: 'active', action: 'Fail', runCount: 10, failCount: 3, maxFailures: 3 },
        { id: 'b4', type: 'scheduled', status: 'paused', action: 'Paused', runCount: 0, failCount: 0, maxFailures: 3 },
      ],
    }));
    await catalog.rebuild();
    const state = catalog.getCatalog();

    expect(state.behaviors[0].health).toBe('healthy');
    expect(state.behaviors[1].health).toBe('warning');
    expect(state.behaviors[2].health).toBe('failing');
    expect(state.behaviors[3].health).toBe('paused');
  });

  it('handles partial rebuild for channels', async () => {
    const catalog = new CapabilityCatalogImpl(mockSources());
    await catalog.rebuild();

    expect(catalog.getCatalog().channels).toHaveLength(3);

    catalog.rebuildSection('channels');
    expect(catalog.getCatalog().channels).toHaveLength(3);
    expect(catalog.getCatalog().tools).toHaveLength(2); // unchanged
  });

  it('fires onChange callback on rebuild', async () => {
    const catalog = new CapabilityCatalogImpl(mockSources());
    const cb = vi.fn();
    catalog.onChange(cb);

    await catalog.rebuild();
    expect(cb).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/introspection/tests/catalog.test.ts`
Expected: FAIL — module not found

**Step 3: Implement catalog.ts**

```typescript
import type {
  CapabilityCatalog,
  ToolCapability,
  ChannelCapability,
  BehaviorCapability,
  ProviderCapability,
  PluginCapability,
  IntrospectionSources,
} from './types.js';

function classifyBehaviorHealth(b: { status: string; failCount: number; maxFailures: number }): BehaviorCapability['health'] {
  if (b.status === 'paused' || b.status === 'deleted') return 'paused';
  if (b.failCount >= b.maxFailures) return 'failing';
  if (b.failCount >= Math.ceil(b.maxFailures / 2)) return 'warning';
  return 'healthy';
}

export class CapabilityCatalogImpl {
  private sources: IntrospectionSources;
  private catalog: CapabilityCatalog;
  private listeners: Array<(catalog: CapabilityCatalog) => void> = [];

  constructor(sources: IntrospectionSources) {
    this.sources = sources;
    this.catalog = {
      tools: [],
      channels: [],
      behaviors: [],
      providers: [],
      plugins: [],
      features: {},
      updatedAt: new Date().toISOString(),
    };
  }

  async rebuild(): Promise<void> {
    this.buildTools();
    this.buildChannels();
    await this.buildBehaviors();
    this.buildProviders();
    this.buildPlugins();
    this.catalog.features = this.sources.getFeatures();
    this.catalog.updatedAt = new Date().toISOString();
    this.notify();
  }

  rebuildSection(section: 'tools' | 'channels' | 'providers' | 'plugins'): void {
    switch (section) {
      case 'tools': this.buildTools(); break;
      case 'channels': this.buildChannels(); break;
      case 'providers': this.buildProviders(); break;
      case 'plugins': this.buildPlugins(); break;
    }
    this.catalog.updatedAt = new Date().toISOString();
    this.notify();
  }

  getCatalog(): CapabilityCatalog {
    return this.catalog;
  }

  onChange(cb: (catalog: CapabilityCatalog) => void): void {
    this.listeners.push(cb);
  }

  private notify(): void {
    for (const cb of this.listeners) cb(this.catalog);
  }

  private buildTools(): void {
    this.catalog.tools = this.sources.getTools().map((t): ToolCapability => ({
      name: t.name,
      description: t.description,
      parameterCount: t.parameters.length,
    }));
  }

  private buildChannels(): void {
    const connected = new Set(this.sources.getConnectedChannels());
    const configured = this.sources.getConfiguredChannels();
    this.catalog.channels = configured.map((type): ChannelCapability => ({
      type,
      connected: connected.has(type),
      hasDefault: !!this.sources.getDefaultChannelId?.(type),
    }));
  }

  private async buildBehaviors(): Promise<void> {
    const behaviors = await this.sources.getBehaviors();
    this.catalog.behaviors = behaviors.map((b): BehaviorCapability => ({
      id: b.id,
      type: b.type,
      status: b.status,
      action: b.action,
      runCount: b.runCount,
      failCount: b.failCount,
      maxFailures: b.maxFailures,
      lastRun: b.lastRun,
      health: classifyBehaviorHealth(b),
    }));
  }

  private buildProviders(): void {
    const primary = this.sources.getPrimaryProviderName();
    const fallback = this.sources.getFallbackProviderName();
    this.catalog.providers = this.sources.getProviders().map((p): ProviderCapability => ({
      name: p.name,
      displayName: p.displayName,
      available: true, // sync check; async check done by health monitor
      isPrimary: p.name === primary,
      isFallback: p.name === fallback,
      models: Object.keys(p.models),
    }));
  }

  private buildPlugins(): void {
    this.catalog.plugins = this.sources.getPlugins().map((p): PluginCapability => ({
      name: p.name,
      version: p.version,
      status: p.status,
      toolCount: p.toolCount,
      behaviorCount: p.behaviorNames.length,
    }));
  }
}
```

**Step 4: Export from index.ts**

```typescript
export * from './types.js';
export { CapabilityCatalogImpl } from './catalog.js';
```

**Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/introspection/tests/catalog.test.ts`
Expected: PASS — all 4 tests

**Step 6: Commit**

```bash
git add packages/introspection/
git commit -m "feat(introspection): implement CapabilityCatalog with tests"
```

---

### Task 4: Build the prompt fragment generator

**Files:**
- Create: `packages/introspection/tests/prompt-fragment.test.ts`
- Create: `packages/introspection/src/prompt-fragment.ts`
- Modify: `packages/introspection/src/index.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import { generatePromptFragment } from '../src/prompt-fragment.js';
import type { CapabilityCatalog, HealthState } from '../src/types.js';

const catalog: CapabilityCatalog = {
  tools: [
    { name: 'bash', description: 'Run commands', parameterCount: 1 },
    { name: 'web_browser', description: 'Browse', parameterCount: 1 },
    { name: 'research', description: 'Research topics', parameterCount: 2 },
  ],
  channels: [
    { type: 'discord', connected: true, hasDefault: true },
    { type: 'telegram', connected: false, hasDefault: false },
    { type: 'webchat', connected: true, hasDefault: true },
  ],
  behaviors: [
    { id: 'b1', type: 'scheduled', status: 'active', action: 'Daily report', runCount: 10, failCount: 0, maxFailures: 3, health: 'healthy' },
    { id: 'b2', type: 'monitor', status: 'paused', action: 'Watch', runCount: 5, failCount: 3, maxFailures: 3, health: 'paused' },
  ],
  providers: [
    { name: 'anthropic', displayName: 'Anthropic', available: true, isPrimary: true, isFallback: false, models: ['claude-sonnet'] },
    { name: 'openai', displayName: 'OpenAI', available: true, isPrimary: false, isFallback: true, models: ['gpt-4'] },
  ],
  plugins: [
    { name: 'weather', version: '1.0.0', status: 'loaded', toolCount: 2, behaviorCount: 0 },
  ],
  features: { behaviors: true, browser: true, voice: false },
  updatedAt: '2026-02-15T12:00:00Z',
};

const healthyState: HealthState = {
  overall: 'healthy',
  subsystems: [],
  issues: [],
  lastCheck: '2026-02-15T12:00:00Z',
};

const degradedState: HealthState = {
  overall: 'degraded',
  subsystems: [],
  issues: [
    { id: 'i1', subsystem: 'channels', severity: 'warning', description: 'Telegram disconnected', detectedAt: '2026-02-15T11:55:00Z', autoFixable: true, trustLevelRequired: 2 },
  ],
  lastCheck: '2026-02-15T12:00:00Z',
};

describe('generatePromptFragment', () => {
  it('includes tool names', () => {
    const fragment = generatePromptFragment(catalog, healthyState);
    expect(fragment).toContain('bash');
    expect(fragment).toContain('web_browser');
    expect(fragment).toContain('research');
  });

  it('shows channel connectivity', () => {
    const fragment = generatePromptFragment(catalog, healthyState);
    expect(fragment).toContain('discord');
    expect(fragment).toMatch(/discord.*connected/i);
  });

  it('shows behavior summary', () => {
    const fragment = generatePromptFragment(catalog, healthyState);
    expect(fragment).toMatch(/1 active/);
    expect(fragment).toMatch(/1 paused/);
  });

  it('shows provider info', () => {
    const fragment = generatePromptFragment(catalog, healthyState);
    expect(fragment).toContain('Anthropic');
    expect(fragment).toMatch(/primary/i);
  });

  it('shows healthy status when all good', () => {
    const fragment = generatePromptFragment(catalog, healthyState);
    expect(fragment).toMatch(/all systems? operational/i);
  });

  it('shows issues when degraded', () => {
    const fragment = generatePromptFragment(catalog, degradedState);
    expect(fragment).toContain('Telegram disconnected');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/introspection/tests/prompt-fragment.test.ts`
Expected: FAIL

**Step 3: Implement prompt-fragment.ts**

```typescript
import type { CapabilityCatalog, HealthState } from './types.js';

export function generatePromptFragment(catalog: CapabilityCatalog, health: HealthState): string {
  const lines: string[] = ['[Self-Awareness]'];

  // Tools
  const toolNames = catalog.tools.map((t) => t.name).join(', ');
  lines.push(`Tools (${catalog.tools.length}): ${toolNames}`);

  // Channels
  const channelParts = catalog.channels.map((c) =>
    `${c.type} (${c.connected ? 'connected' : 'disconnected'})`
  );
  lines.push(`Channels: ${channelParts.join(', ')}`);

  // Behaviors
  const active = catalog.behaviors.filter((b) => b.status === 'active').length;
  const paused = catalog.behaviors.filter((b) => b.status === 'paused').length;
  const failing = catalog.behaviors.filter((b) => b.health === 'failing').length;
  const parts: string[] = [];
  if (active > 0) parts.push(`${active} active`);
  if (paused > 0) parts.push(`${paused} paused`);
  if (failing > 0) parts.push(`${failing} failing`);
  if (parts.length === 0) parts.push('none');
  lines.push(`Behaviors: ${parts.join(', ')}`);

  // Providers
  const primary = catalog.providers.find((p) => p.isPrimary);
  const fallback = catalog.providers.find((p) => p.isFallback);
  let providerLine = primary ? `${primary.displayName} (primary)` : 'none';
  if (fallback) providerLine += `, ${fallback.displayName} (fallback)`;
  lines.push(`Provider: ${providerLine}`);

  // Plugins
  const loadedPlugins = catalog.plugins.filter((p) => p.status === 'loaded');
  if (loadedPlugins.length > 0) {
    const names = loadedPlugins.map((p) => p.name).join(', ');
    lines.push(`Plugins: ${loadedPlugins.length} loaded (${names})`);
  }

  // Health
  if (health.overall === 'healthy') {
    lines.push('Health: All systems operational');
  } else {
    const issueLines = health.issues.map((i) => `- ${i.description}`);
    lines.push(`Health: ${health.overall}\n${issueLines.join('\n')}`);
  }

  return lines.join('\n');
}
```

**Step 4: Export from index.ts**

Add to existing exports:
```typescript
export { generatePromptFragment } from './prompt-fragment.js';
```

**Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/introspection/tests/prompt-fragment.test.ts`
Expected: PASS — all 6 tests

**Step 6: Commit**

```bash
git add packages/introspection/
git commit -m "feat(introspection): add prompt fragment generator with tests"
```

---

### Task 5: Build the HealthMonitor

**Files:**
- Create: `packages/introspection/tests/health-monitor.test.ts`
- Create: `packages/introspection/src/health-monitor.ts`
- Modify: `packages/introspection/src/index.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthMonitorImpl } from '../src/health-monitor.js';
import type { IntrospectionSources, AutoFixActions } from '../src/types.js';

function mockSources(overrides?: Partial<IntrospectionSources>): IntrospectionSources {
  return {
    getTools: () => [],
    getConnectedChannels: () => ['discord'],
    getConfiguredChannels: () => ['discord', 'telegram'],
    getBehaviors: async () => [
      { id: 'b1', type: 'scheduled', status: 'active', action: 'Test', runCount: 10, failCount: 0, maxFailures: 3 },
    ],
    getProviders: () => [{ name: 'anthropic', displayName: 'Anthropic', models: {} }],
    getPrimaryProviderName: () => 'anthropic',
    getFallbackProviderName: () => undefined,
    checkProviderAvailable: async () => true,
    getPlugins: () => [],
    getFeatures: () => ({}),
    getAuditEntries: async () => [],
    getTrustLevel: () => 3,
    ...overrides,
  };
}

describe('HealthMonitor', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('reports healthy when all systems are up', async () => {
    const monitor = new HealthMonitorImpl(mockSources());
    await monitor.check();

    const state = monitor.getHealthState();
    expect(state.overall).toBe('healthy');
    expect(state.issues).toHaveLength(0);
  });

  it('detects disconnected channels', async () => {
    const monitor = new HealthMonitorImpl(mockSources({
      getConnectedChannels: () => [],
      getConfiguredChannels: () => ['discord'],
    }));
    await monitor.check();

    const state = monitor.getHealthState();
    expect(state.overall).toBe('degraded');
    expect(state.issues).toHaveLength(1);
    expect(state.issues[0].subsystem).toBe('channels');
    expect(state.issues[0].description).toContain('discord');
    expect(state.issues[0].autoFixable).toBe(true);
  });

  it('detects unavailable providers', async () => {
    const monitor = new HealthMonitorImpl(mockSources({
      checkProviderAvailable: async () => false,
      getFallbackProviderName: () => undefined,
    }));
    await monitor.check();

    const state = monitor.getHealthState();
    expect(state.issues.some(i => i.subsystem === 'providers')).toBe(true);
    expect(state.issues.find(i => i.subsystem === 'providers')?.severity).toBe('critical');
  });

  it('detects failing behaviors', async () => {
    const monitor = new HealthMonitorImpl(mockSources({
      getBehaviors: async () => [
        { id: 'b1', type: 'scheduled', status: 'active', action: 'Broken', runCount: 10, failCount: 3, maxFailures: 3 },
      ],
    }));
    await monitor.check();

    const state = monitor.getHealthState();
    expect(state.issues.some(i => i.subsystem === 'behaviors')).toBe(true);
  });

  it('attempts auto-fix when trust level sufficient', async () => {
    const reconnect = vi.fn().mockResolvedValue(true);
    const monitor = new HealthMonitorImpl(
      mockSources({
        getConnectedChannels: () => [],
        getConfiguredChannels: () => ['discord'],
        getTrustLevel: () => 3,
      }),
      { reconnectChannel: reconnect },
    );
    await monitor.check();

    expect(reconnect).toHaveBeenCalledWith('discord');
  });

  it('skips auto-fix when trust level insufficient', async () => {
    const reconnect = vi.fn().mockResolvedValue(true);
    const monitor = new HealthMonitorImpl(
      mockSources({
        getConnectedChannels: () => [],
        getConfiguredChannels: () => ['discord'],
        getTrustLevel: () => 0,
      }),
      { reconnectChannel: reconnect },
    );
    await monitor.check();

    expect(reconnect).not.toHaveBeenCalled();
  });

  it('fires onChange callback', async () => {
    const monitor = new HealthMonitorImpl(mockSources());
    const cb = vi.fn();
    monitor.onChange(cb);
    await monitor.check();

    expect(cb).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/introspection/tests/health-monitor.test.ts`
Expected: FAIL

**Step 3: Implement health-monitor.ts**

```typescript
import { getLogger } from '@auxiora/logger';
import type {
  HealthState,
  HealthIssue,
  SubsystemHealth,
  IntrospectionSources,
  AutoFixActions,
} from './types.js';

const logger = getLogger('introspection:health');

export class HealthMonitorImpl {
  private sources: IntrospectionSources;
  private actions: AutoFixActions;
  private state: HealthState;
  private listeners: Array<(state: HealthState) => void> = [];
  private interval?: ReturnType<typeof setInterval>;

  constructor(sources: IntrospectionSources, actions?: AutoFixActions) {
    this.sources = sources;
    this.actions = actions ?? {};
    this.state = {
      overall: 'healthy',
      subsystems: [],
      issues: [],
      lastCheck: new Date().toISOString(),
    };
  }

  async check(): Promise<void> {
    const issues: HealthIssue[] = [];
    const subsystems: SubsystemHealth[] = [];

    // Check channels
    const channelHealth = await this.checkChannels(issues);
    subsystems.push(channelHealth);

    // Check providers
    const providerHealth = await this.checkProviders(issues);
    subsystems.push(providerHealth);

    // Check behaviors
    const behaviorHealth = await this.checkBehaviors(issues);
    subsystems.push(behaviorHealth);

    // Determine overall health
    const hasCritical = issues.some((i) => i.severity === 'critical');
    const hasWarning = issues.some((i) => i.severity === 'warning');

    this.state = {
      overall: hasCritical ? 'unhealthy' : hasWarning ? 'degraded' : 'healthy',
      subsystems,
      issues,
      lastCheck: new Date().toISOString(),
    };

    // Attempt auto-fixes
    await this.attemptAutoFixes(issues);

    this.notify();
  }

  getHealthState(): HealthState {
    return this.state;
  }

  onChange(cb: (state: HealthState) => void): void {
    this.listeners.push(cb);
  }

  start(intervalMs: number = 30_000): void {
    this.interval = setInterval(() => { this.check().catch((e) => logger.warn('Health check failed', { error: e })); }, intervalMs);
    // Run immediately
    this.check().catch((e) => logger.warn('Initial health check failed', { error: e }));
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private async checkChannels(issues: HealthIssue[]): Promise<SubsystemHealth> {
    const connected = new Set(this.sources.getConnectedChannels());
    const configured = this.sources.getConfiguredChannels();
    const disconnected = configured.filter((c) => !connected.has(c));

    for (const ch of disconnected) {
      issues.push({
        id: `channel-disconnected-${ch}`,
        subsystem: 'channels',
        severity: 'warning',
        description: `${ch} is configured but disconnected`,
        detectedAt: new Date().toISOString(),
        suggestedFix: `Reconnect ${ch} channel`,
        autoFixable: true,
        trustLevelRequired: 2,
      });
    }

    return {
      name: 'channels',
      status: disconnected.length > 0 ? 'degraded' : 'healthy',
      lastCheck: new Date().toISOString(),
      details: disconnected.length > 0 ? `${disconnected.join(', ')} disconnected` : undefined,
    };
  }

  private async checkProviders(issues: HealthIssue[]): Promise<SubsystemHealth> {
    const primary = this.sources.getPrimaryProviderName();
    const fallback = this.sources.getFallbackProviderName();
    let primaryAvailable = true;

    if (this.sources.checkProviderAvailable) {
      primaryAvailable = await this.sources.checkProviderAvailable(primary);
    }

    if (!primaryAvailable) {
      issues.push({
        id: `provider-unavailable-${primary}`,
        subsystem: 'providers',
        severity: fallback ? 'warning' : 'critical',
        description: `Primary provider ${primary} is unavailable${fallback ? `, fallback ${fallback} available` : ', no fallback configured'}`,
        detectedAt: new Date().toISOString(),
        suggestedFix: fallback ? 'Switch to fallback provider' : 'Check provider API key and connectivity',
        autoFixable: !!fallback,
        trustLevelRequired: 3,
      });
    }

    return {
      name: 'providers',
      status: !primaryAvailable && !fallback ? 'unhealthy' : !primaryAvailable ? 'degraded' : 'healthy',
      lastCheck: new Date().toISOString(),
    };
  }

  private async checkBehaviors(issues: HealthIssue[]): Promise<SubsystemHealth> {
    const behaviors = await this.sources.getBehaviors();
    let hasIssues = false;

    for (const b of behaviors) {
      if (b.status === 'active' && b.failCount >= b.maxFailures) {
        hasIssues = true;
        issues.push({
          id: `behavior-failing-${b.id}`,
          subsystem: 'behaviors',
          severity: 'warning',
          description: `Behavior "${b.action}" has reached ${b.failCount}/${b.maxFailures} failures`,
          detectedAt: new Date().toISOString(),
          suggestedFix: `Restart or investigate behavior ${b.id}`,
          autoFixable: true,
          trustLevelRequired: 2,
        });
      }
    }

    return {
      name: 'behaviors',
      status: hasIssues ? 'degraded' : 'healthy',
      lastCheck: new Date().toISOString(),
    };
  }

  private async attemptAutoFixes(issues: HealthIssue[]): Promise<void> {
    const getTrust = this.sources.getTrustLevel ?? (() => 0);

    for (const issue of issues) {
      if (!issue.autoFixable) continue;
      const trustLevel = getTrust(issue.subsystem);
      if (trustLevel < (issue.trustLevelRequired ?? 999)) continue;

      try {
        if (issue.subsystem === 'channels' && this.actions.reconnectChannel) {
          const channelType = issue.id.replace('channel-disconnected-', '');
          const success = await this.actions.reconnectChannel(channelType);
          if (success) {
            issue.resolvedAt = new Date().toISOString();
            logger.info('Auto-fixed channel disconnection', { channel: channelType });
          }
        } else if (issue.subsystem === 'providers' && this.actions.switchToFallbackProvider) {
          const success = await this.actions.switchToFallbackProvider();
          if (success) {
            issue.resolvedAt = new Date().toISOString();
            logger.info('Auto-switched to fallback provider');
          }
        } else if (issue.subsystem === 'behaviors' && this.actions.restartBehavior) {
          const behaviorId = issue.id.replace('behavior-failing-', '');
          const success = await this.actions.restartBehavior(behaviorId);
          if (success) {
            issue.resolvedAt = new Date().toISOString();
            logger.info('Auto-restarted behavior', { behaviorId });
          }
        }
      } catch (err) {
        logger.warn('Auto-fix failed', { issue: issue.id, error: err });
      }
    }
  }

  private notify(): void {
    for (const cb of this.listeners) cb(this.state);
  }
}
```

**Step 4: Export from index.ts**

Add to existing exports:
```typescript
export { HealthMonitorImpl } from './health-monitor.js';
```

**Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/introspection/tests/health-monitor.test.ts`
Expected: PASS — all 7 tests

**Step 6: Commit**

```bash
git add packages/introspection/
git commit -m "feat(introspection): add HealthMonitor with trust-gated auto-fixes"
```

---

### Task 6: Build the IntrospectionTool

**Files:**
- Create: `packages/introspection/tests/introspect-tool.test.ts`
- Create: `packages/introspection/src/introspect-tool.ts`
- Modify: `packages/introspection/src/index.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import { createIntrospectTool } from '../src/introspect-tool.js';
import type { CapabilityCatalog, HealthState, IntrospectionSources } from '../src/types.js';

const catalog: CapabilityCatalog = {
  tools: [{ name: 'bash', description: 'Run commands', parameterCount: 1 }],
  channels: [{ type: 'discord', connected: true, hasDefault: true }],
  behaviors: [{ id: 'b1', type: 'scheduled', status: 'active', action: 'Daily report', runCount: 10, failCount: 0, maxFailures: 3, health: 'healthy' }],
  providers: [{ name: 'anthropic', displayName: 'Anthropic', available: true, isPrimary: true, isFallback: false, models: ['claude-sonnet'] }],
  plugins: [{ name: 'weather', version: '1.0.0', status: 'loaded', toolCount: 2, behaviorCount: 0 }],
  features: { behaviors: true },
  updatedAt: '2026-02-15T12:00:00Z',
};

const health: HealthState = {
  overall: 'healthy',
  subsystems: [{ name: 'channels', status: 'healthy', lastCheck: '2026-02-15T12:00:00Z' }],
  issues: [],
  lastCheck: '2026-02-15T12:00:00Z',
};

const sources: Pick<IntrospectionSources, 'getAuditEntries' | 'getFeatures'> = {
  getAuditEntries: async () => [
    { timestamp: '2026-02-15T11:50:00Z', event: 'channel.error', details: { channelType: 'discord', error: 'Send failed' } },
    { timestamp: '2026-02-15T11:55:00Z', event: 'channel.error', details: { channelType: 'discord', error: 'Send failed' } },
    { timestamp: '2026-02-15T11:58:00Z', event: 'behavior.failed', details: { error: 'Timeout' } },
  ],
  getFeatures: () => ({ behaviors: true, browser: true, voice: false }),
};

describe('IntrospectionTool', () => {
  it('returns capabilities', async () => {
    const tool = createIntrospectTool(() => catalog, () => health, sources);
    const result = await tool.execute({ query: 'capabilities' }, {} as any);

    expect(result.success).toBe(true);
    expect(result.result).toContain('bash');
    expect(result.result).toContain('discord');
    expect(result.result).toContain('Anthropic');
  });

  it('returns health', async () => {
    const tool = createIntrospectTool(() => catalog, () => health, sources);
    const result = await tool.execute({ query: 'health' }, {} as any);

    expect(result.success).toBe(true);
    expect(result.result).toContain('healthy');
  });

  it('returns errors with aggregation', async () => {
    const tool = createIntrospectTool(() => catalog, () => health, sources);
    const result = await tool.execute({ query: 'errors', timeRange: '24h' }, {} as any);

    expect(result.success).toBe(true);
    expect(result.result).toContain('channel.error');
    expect(result.result).toContain('2'); // 2 channel errors
  });

  it('returns config/features', async () => {
    const tool = createIntrospectTool(() => catalog, () => health, sources);
    const result = await tool.execute({ query: 'config' }, {} as any);

    expect(result.success).toBe(true);
    expect(result.result).toContain('behaviors');
    expect(result.result).toContain('true');
  });

  it('returns specific subsystem', async () => {
    const tool = createIntrospectTool(() => catalog, () => health, sources);
    const result = await tool.execute({ query: 'channels' }, {} as any);

    expect(result.success).toBe(true);
    expect(result.result).toContain('discord');
    expect(result.result).toContain('connected');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/introspection/tests/introspect-tool.test.ts`
Expected: FAIL

**Step 3: Implement introspect-tool.ts**

```typescript
import type { CapabilityCatalog, HealthState, IntrospectionSources } from './types.js';

interface ToolResult {
  success: boolean;
  result?: string;
  error?: string;
}

const TIME_RANGES: Record<string, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
};

export function createIntrospectTool(
  getCatalog: () => CapabilityCatalog,
  getHealth: () => HealthState,
  sources: Pick<IntrospectionSources, 'getAuditEntries' | 'getFeatures'>,
) {
  return {
    name: 'introspect',
    description: 'Query your own capabilities, health, configuration, and error history. Use this to understand what you can do and diagnose issues.',
    parameters: [
      { name: 'query', type: 'string', required: true, description: '"capabilities", "health", "config", "errors", or a subsystem: "channels", "providers", "behaviors", "plugins", "tools"' },
      { name: 'timeRange', type: 'string', required: false, description: 'For error queries: "1h", "24h", "7d". Defaults to "1h".' },
    ],
    execute: async (params: { query: string; timeRange?: string }, _context: any): Promise<ToolResult> => {
      const query = params.query.toLowerCase().trim();

      switch (query) {
        case 'capabilities': return { success: true, result: formatCapabilities(getCatalog()) };
        case 'health': return { success: true, result: formatHealth(getHealth()) };
        case 'config': return { success: true, result: formatConfig(sources.getFeatures()) };
        case 'errors': return { success: true, result: await formatErrors(sources, params.timeRange) };
        case 'tools': return { success: true, result: formatTools(getCatalog()) };
        case 'channels': return { success: true, result: formatChannels(getCatalog()) };
        case 'providers': return { success: true, result: formatProviders(getCatalog()) };
        case 'behaviors': return { success: true, result: formatBehaviors(getCatalog()) };
        case 'plugins': return { success: true, result: formatPlugins(getCatalog()) };
        default: return { success: false, error: `Unknown query: "${query}". Use: capabilities, health, config, errors, tools, channels, providers, behaviors, plugins` };
      }
    },
    getPermission: () => ({ level: 'none' as const }),
  };
}

function formatCapabilities(c: CapabilityCatalog): string {
  const lines: string[] = ['# My Capabilities\n'];

  lines.push(`## Tools (${c.tools.length})`);
  for (const t of c.tools) lines.push(`- **${t.name}**: ${t.description} (${t.parameterCount} params)`);

  lines.push(`\n## Channels (${c.channels.length})`);
  for (const ch of c.channels) lines.push(`- **${ch.type}**: ${ch.connected ? 'connected' : 'disconnected'}${ch.hasDefault ? ' (has default channel)' : ''}`);

  lines.push(`\n## Behaviors (${c.behaviors.length})`);
  for (const b of c.behaviors) lines.push(`- **${b.action}** [${b.type}]: ${b.status} — ${b.health} (${b.runCount} runs, ${b.failCount} failures)`);

  lines.push(`\n## Providers (${c.providers.length})`);
  for (const p of c.providers) {
    const role = p.isPrimary ? 'primary' : p.isFallback ? 'fallback' : '';
    lines.push(`- **${p.displayName}** (${role}): ${p.available ? 'available' : 'unavailable'} — models: ${p.models.join(', ')}`);
  }

  if (c.plugins.length > 0) {
    lines.push(`\n## Plugins (${c.plugins.length})`);
    for (const p of c.plugins) lines.push(`- **${p.name}** v${p.version}: ${p.status} (${p.toolCount} tools, ${p.behaviorCount} behaviors)`);
  }

  return lines.join('\n');
}

function formatHealth(h: HealthState): string {
  const lines: string[] = [`# System Health: ${h.overall.toUpperCase()}\n`];
  lines.push(`Last check: ${h.lastCheck}\n`);

  if (h.subsystems.length > 0) {
    lines.push('## Subsystems');
    for (const s of h.subsystems) {
      lines.push(`- **${s.name}**: ${s.status}${s.details ? ` — ${s.details}` : ''}`);
    }
  }

  if (h.issues.length > 0) {
    lines.push('\n## Active Issues');
    for (const i of h.issues) {
      lines.push(`- [${i.severity}] ${i.description}`);
      if (i.suggestedFix) lines.push(`  Fix: ${i.suggestedFix}`);
      if (i.autoFixable) lines.push(`  Auto-fixable at trust level ${i.trustLevelRequired ?? '?'}`);
    }
  } else {
    lines.push('\nNo active issues.');
  }

  return lines.join('\n');
}

function formatConfig(features: Record<string, boolean>): string {
  const lines: string[] = ['# Configuration\n', '## Feature Flags'];
  for (const [key, val] of Object.entries(features)) {
    lines.push(`- **${key}**: ${val ? 'enabled' : 'disabled'}`);
  }
  return lines.join('\n');
}

async function formatErrors(
  sources: Pick<IntrospectionSources, 'getAuditEntries'>,
  timeRange?: string,
): Promise<string> {
  const rangeMs = TIME_RANGES[timeRange ?? '1h'] ?? TIME_RANGES['1h'];
  const cutoff = Date.now() - rangeMs;

  const entries = await sources.getAuditEntries(500);
  const errors = entries.filter(
    (e) => (e.event.includes('error') || e.event.includes('failed')) && new Date(e.timestamp).getTime() >= cutoff,
  );

  if (errors.length === 0) return `No errors in the last ${timeRange ?? '1h'}.`;

  // Aggregate by event type
  const counts = new Map<string, { count: number; lastTimestamp: string; lastDetails: Record<string, unknown> }>();
  for (const e of errors) {
    const existing = counts.get(e.event);
    if (existing) {
      existing.count++;
      if (e.timestamp > existing.lastTimestamp) {
        existing.lastTimestamp = e.timestamp;
        existing.lastDetails = e.details;
      }
    } else {
      counts.set(e.event, { count: 1, lastTimestamp: e.timestamp, lastDetails: e.details });
    }
  }

  const lines: string[] = [`# Errors (last ${timeRange ?? '1h'})\n`];
  for (const [event, info] of counts) {
    const detail = info.lastDetails.error ?? info.lastDetails.channelType ?? '';
    lines.push(`- **${event}**: ${info.count} occurrence${info.count > 1 ? 's' : ''} (last: ${info.lastTimestamp})${detail ? ` — ${detail}` : ''}`);
  }
  return lines.join('\n');
}

function formatTools(c: CapabilityCatalog): string {
  const lines: string[] = [`# Tools (${c.tools.length})\n`];
  for (const t of c.tools) lines.push(`- **${t.name}**: ${t.description} (${t.parameterCount} params)`);
  return lines.join('\n');
}

function formatChannels(c: CapabilityCatalog): string {
  const lines: string[] = [`# Channels (${c.channels.length})\n`];
  for (const ch of c.channels) lines.push(`- **${ch.type}**: ${ch.connected ? 'connected' : 'disconnected'}${ch.hasDefault ? ' (has default)' : ''}`);
  return lines.join('\n');
}

function formatProviders(c: CapabilityCatalog): string {
  const lines: string[] = [`# Providers (${c.providers.length})\n`];
  for (const p of c.providers) {
    const role = p.isPrimary ? 'primary' : p.isFallback ? 'fallback' : '';
    lines.push(`- **${p.displayName}** (${role}): ${p.available ? 'available' : 'unavailable'} — ${p.models.join(', ')}`);
  }
  return lines.join('\n');
}

function formatBehaviors(c: CapabilityCatalog): string {
  const lines: string[] = [`# Behaviors (${c.behaviors.length})\n`];
  for (const b of c.behaviors) lines.push(`- **${b.action}** [${b.type}/${b.status}]: ${b.health} — ${b.runCount} runs, ${b.failCount} failures${b.lastRun ? `, last: ${b.lastRun}` : ''}`);
  return lines.join('\n');
}

function formatPlugins(c: CapabilityCatalog): string {
  if (c.plugins.length === 0) return 'No plugins loaded.';
  const lines: string[] = [`# Plugins (${c.plugins.length})\n`];
  for (const p of c.plugins) lines.push(`- **${p.name}** v${p.version}: ${p.status} (${p.toolCount} tools, ${p.behaviorCount} behaviors)`);
  return lines.join('\n');
}
```

**Step 4: Export from index.ts**

Add to existing exports:
```typescript
export { createIntrospectTool } from './introspect-tool.js';
```

**Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/introspection/tests/introspect-tool.test.ts`
Expected: PASS — all 5 tests

**Step 6: Commit**

```bash
git add packages/introspection/
git commit -m "feat(introspection): add introspect tool for AI self-queries"
```

---

### Task 7: Wire introspection into the runtime

**Files:**
- Modify: `packages/runtime/src/index.ts`

This is the integration task. The runtime creates the catalog, health monitor, and tool, then wires them together.

**Step 1: Add imports to runtime/src/index.ts**

Near the top imports (around line 55), add:

```typescript
import { CapabilityCatalogImpl, HealthMonitorImpl, createIntrospectTool, generatePromptFragment } from '@auxiora/introspection';
import type { IntrospectionSources, AutoFixActions } from '@auxiora/introspection';
```

**Step 2: Add properties to Auxiora class**

Near the existing private properties (around line 163), add:

```typescript
private capabilityCatalog?: CapabilityCatalogImpl;
private healthMonitor?: HealthMonitorImpl;
private capabilityPromptFragment: string = '';
```

**Step 3: Build the IntrospectionSources in start()**

After all existing initialization is complete (providers, channels, behaviors, plugins, trust — around line 1040), add:

```typescript
// --- Self-awareness: capability catalog + health monitor ---
const introspectionSources: IntrospectionSources = {
  getTools: () => toolRegistry.list(),
  getConnectedChannels: () => this.channels?.getConnectedChannels() ?? [],
  getConfiguredChannels: () => this.channels?.getConfiguredChannels() ?? [],
  getDefaultChannelId: (type) => this.channels?.getDefaultChannelId(type as any),
  getBehaviors: async () => this.behaviors?.list() ?? [],
  getProviders: () => {
    const names = this.providers?.listAvailable() ?? [];
    return names.map((n) => {
      const p = this.providers!.getProvider(n);
      return { name: n, displayName: p.metadata.displayName, models: p.metadata.models };
    });
  },
  getPrimaryProviderName: () => this.config.provider.primary,
  getFallbackProviderName: () => this.config.provider.fallback,
  checkProviderAvailable: async (name) => {
    try {
      const p = this.providers?.getProvider(name);
      return p ? await p.metadata.isAvailable() : false;
    } catch { return false; }
  },
  getPlugins: () => this.pluginLoader?.listPlugins() ?? [],
  getFeatures: () => ({
    behaviors: this.config.features?.behaviors !== false,
    browser: this.config.features?.browser !== false,
    voice: !!this.config.features?.voice,
    webhooks: !!this.config.features?.webhooks,
    plugins: !!this.config.features?.plugins,
    memory: this.config.memory?.enabled !== false,
  }),
  getAuditEntries: async (limit) => {
    const auditLogger = getAuditLogger();
    return auditLogger.getEntries(limit);
  },
  getTrustLevel: (domain) => this.trustEngine?.getLevel(domain) ?? 0,
};

// Build catalog
this.capabilityCatalog = new CapabilityCatalogImpl(introspectionSources);
await this.capabilityCatalog.rebuild();

// Generate initial prompt fragment
const healthState = { overall: 'healthy' as const, subsystems: [], issues: [], lastCheck: new Date().toISOString() };
this.capabilityPromptFragment = generatePromptFragment(this.capabilityCatalog.getCatalog(), healthState);

// Start health monitor
const autoFixActions: AutoFixActions = {
  reconnectChannel: async (type) => {
    try { await this.channels?.reconnect(type as any); return true; } catch { return false; }
  },
  restartBehavior: async (id) => {
    try { await this.behaviors?.resume(id); return true; } catch { return false; }
  },
};
this.healthMonitor = new HealthMonitorImpl(introspectionSources, autoFixActions);
this.healthMonitor.onChange((state) => {
  this.capabilityPromptFragment = generatePromptFragment(this.capabilityCatalog!.getCatalog(), state);
  this.gateway.broadcast({ type: 'health_update', payload: state }, (c) => c.authenticated);
});
this.healthMonitor.start(30_000);

// Register introspect tool
const introspectTool = createIntrospectTool(
  () => this.capabilityCatalog!.getCatalog(),
  () => this.healthMonitor!.getHealthState(),
  introspectionSources,
);
toolRegistry.register(introspectTool as any);

// Update catalog on audit events
const auditLogger = getAuditLogger();
const prevOnEntry = auditLogger.onEntry;
auditLogger.onEntry = (entry) => {
  prevOnEntry?.(entry);
  if (entry.event.startsWith('channel.') || entry.event.startsWith('plugin.')) {
    this.capabilityCatalog?.rebuildSection(entry.event.startsWith('channel.') ? 'channels' : 'plugins');
  }
};

this.logger.info('Self-awareness initialized', {
  tools: this.capabilityCatalog.getCatalog().tools.length,
  channels: this.capabilityCatalog.getCatalog().channels.length,
});
```

**Step 4: Inject prompt fragment into system prompt**

Find where `this.systemPrompt` is built (around line 1565). After the existing prompt parts are joined, append the capability fragment:

```typescript
// After: this.systemPrompt = parts.join('\n\n---\n\n');
if (this.capabilityPromptFragment) {
  this.systemPrompt += '\n\n---\n\n' + this.capabilityPromptFragment;
}
```

**Step 5: Add introspection dependency to runtime package.json**

In `packages/runtime/package.json`, add to dependencies:

```json
"@auxiora/introspection": "workspace:*"
```

Run: `pnpm install`

**Step 6: Build and verify**

Run: `pnpm --filter introspection build && pnpm --filter runtime build`
Expected: Both compile cleanly

**Step 7: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 8: Commit**

```bash
git add packages/runtime/ packages/introspection/
git commit -m "feat(runtime): wire introspection into startup, prompt, and audit events"
```

---

### Task 8: Add dashboard endpoints

**Files:**
- Modify: `packages/dashboard/src/types.ts`
- Modify: `packages/dashboard/src/router.ts`
- Modify: `packages/runtime/src/index.ts` (DashboardDeps wiring)

**Step 1: Add to DashboardDeps in types.ts**

Near the existing `getActiveAgents` property (around line 62), add:

```typescript
getHealthState?: () => {
  overall: string;
  subsystems: Array<{ name: string; status: string; lastCheck: string; details?: string }>;
  issues: Array<{ id: string; subsystem: string; severity: string; description: string; detectedAt: string; suggestedFix?: string; autoFixable: boolean }>;
  lastCheck: string;
};
getCapabilities?: () => {
  tools: Array<{ name: string; description: string; parameterCount: number }>;
  channels: Array<{ type: string; connected: boolean; hasDefault: boolean }>;
  behaviors: Array<{ id: string; type: string; status: string; action: string; health: string; runCount: number; failCount: number }>;
  providers: Array<{ name: string; displayName: string; available: boolean; isPrimary: boolean; isFallback: boolean; models: string[] }>;
  plugins: Array<{ name: string; version: string; status: string; toolCount: number }>;
  features: Record<string, boolean>;
  updatedAt: string;
};
```

**Step 2: Add REST endpoints in router.ts**

After the existing `/status/agents` endpoint (around line 703), add:

```typescript
// --- Health + capabilities ---
router.get('/status/health', (_req: Request, res: Response) => {
  res.json({ data: deps.getHealthState?.() ?? { overall: 'unknown', subsystems: [], issues: [], lastCheck: '' } });
});

router.get('/status/capabilities', (_req: Request, res: Response) => {
  res.json({ data: deps.getCapabilities?.() ?? null });
});
```

**Step 3: Wire into DashboardDeps in runtime**

In `packages/runtime/src/index.ts`, near the existing `getActiveAgents` property (around line 582), add:

```typescript
getHealthState: () => this.healthMonitor?.getHealthState() ?? { overall: 'unknown', subsystems: [], issues: [], lastCheck: '' },
getCapabilities: () => this.capabilityCatalog?.getCatalog() ?? null,
```

**Step 4: Add to frontend API**

In `packages/dashboard/ui/src/api.ts`, near `getActiveAgents`:

```typescript
getHealthState: () => fetchApi<{ data: any }>('/status/health'),
getCapabilities: () => fetchApi<{ data: any }>('/status/capabilities'),
```

**Step 5: Build and verify**

Run: `pnpm --filter dashboard build && pnpm --filter runtime build`
Expected: Both compile cleanly

**Step 6: Commit**

```bash
git add packages/dashboard/ packages/runtime/
git commit -m "feat(dashboard): add health and capabilities REST endpoints"
```

---

### Task 9: Add health indicator to Mission Control UI

**Files:**
- Modify: `packages/dashboard/ui/src/pages/Overview.tsx`
- Modify: `packages/dashboard/ui/src/styles/global.css`

**Step 1: Add health card to status strip in Overview.tsx**

Import `useApi` is already there. Add a health fetch alongside the existing status/models fetches:

```typescript
const { data: healthData } = useApi(() => api.getHealthState(), []);
```

Add to the polling callback:
```typescript
usePolling(() => { refresh(); refreshModels(); refreshHealth(); });
```

Add a 4th status card after the Uptime card:

```typescript
<div className="status-card">
  <h3>Health</h3>
  <div className="value">
    <span className={`health-dot health-${healthData?.data?.overall ?? 'unknown'}`} />
    {(healthData?.data?.overall ?? 'unknown').charAt(0).toUpperCase() + (healthData?.data?.overall ?? 'unknown').slice(1)}
  </div>
  <div className="sub">{healthData?.data?.issues?.length ?? 0} issues</div>
</div>
```

Add a health alert bar below the status grid when issues exist:

```typescript
{healthData?.data?.issues?.length > 0 && (
  <div className="health-alerts">
    {healthData.data.issues.map((issue: any) => (
      <div key={issue.id} className={`health-alert health-alert-${issue.severity}`}>
        <span className="health-alert-text">{issue.description}</span>
        {issue.suggestedFix && <span className="health-alert-fix">{issue.suggestedFix}</span>}
      </div>
    ))}
  </div>
)}
```

**Step 2: Add CSS for health indicators in global.css**

```css
/* Health indicators */
.health-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 0.4rem;
  vertical-align: middle;
}

.health-healthy { background: var(--success); }
.health-degraded { background: #f59e0b; }
.health-unhealthy { background: var(--danger); }
.health-unknown { background: var(--text-secondary); }

.health-alerts {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 1.5rem;
}

.health-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius);
  font-size: 0.82rem;
  animation: mc-fade-in var(--transition-base);
}

.health-alert-warning {
  background: rgba(245, 158, 11, 0.1);
  border-left: 3px solid #f59e0b;
}

.health-alert-critical {
  background: rgba(239, 68, 68, 0.1);
  border-left: 3px solid var(--danger);
}

.health-alert-text {
  color: var(--text-primary);
}

.health-alert-fix {
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-family: var(--font-mono);
}
```

**Step 3: Verify the UI builds**

Run: `pnpm --filter @auxiora/dashboard-ui build`
Expected: Compiles cleanly

**Step 4: Commit**

```bash
git add packages/dashboard/ui/
git commit -m "feat(dashboard): add health indicator and alert bar to Mission Control"
```

---

### Task 10: Final build, test, and push

**Step 1: Build all packages**

Run: `pnpm build`
Expected: All packages compile

**Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests pass (existing + new introspection tests)

**Step 3: Push**

Run: `git push`
