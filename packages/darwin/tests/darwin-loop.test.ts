import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DarwinLoop } from '../src/darwin-loop.js';
import { ArchiveStore } from '../src/archive-store.js';
import { DEFAULT_DARWIN_CONFIG } from '../src/types.js';
import type { LLMCallerLike, SandboxLike, EventBusLike, TelemetryLike } from '../src/types.js';

function makeMockLLM(): LLMCallerLike {
  return {
    call: vi.fn().mockResolvedValue(
      '```typescript\nexport default { name: "evolved", version: "1.0.0", tools: [{ name: "t", description: "d", parameters: {}, run: async () => ({ result: "ok" }) }] };\n```',
    ),
  };
}

function makeMockSandbox(): SandboxLike {
  return {
    createSession: vi.fn().mockResolvedValue({
      runCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: '{"score":0.85,"latencyMs":150}',
        stderr: '',
        timedOut: false,
      }),
      stop: vi.fn().mockResolvedValue(undefined),
    }),
    destroySession: vi.fn().mockResolvedValue(true),
  };
}

function makeMockEventBus(): EventBusLike {
  return { publish: vi.fn() };
}

function makeMockTelemetry(): TelemetryLike {
  return {
    getFlaggedTools: vi.fn().mockReturnValue([]),
    getAllStats: vi.fn().mockReturnValue([]),
  };
}

describe('DarwinLoop', () => {
  const dirs: string[] = [];
  const stores: ArchiveStore[] = [];

  function makeTmpDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'darwin-loop-'));
    dirs.push(dir);
    return dir;
  }

  function makeStore(): ArchiveStore {
    const store = new ArchiveStore(':memory:');
    stores.push(store);
    return store;
  }

  function makeLoop(overrides: Partial<Parameters<typeof DarwinLoop['prototype']['tick']> extends [] ? {
    store?: ArchiveStore;
    llm?: LLMCallerLike;
    sandbox?: SandboxLike;
    eventBus?: EventBusLike;
    telemetry?: TelemetryLike;
    darwinDir?: string;
    domains?: string[];
  } : never> = {}) {
    const store = overrides.store ?? makeStore();
    const darwinDir = overrides.darwinDir ?? makeTmpDir();
    return new DarwinLoop({
      store,
      llm: overrides.llm ?? makeMockLLM(),
      sandbox: overrides.sandbox ?? makeMockSandbox(),
      eventBus: overrides.eventBus,
      telemetry: overrides.telemetry,
      darwinDir,
      config: { ...DEFAULT_DARWIN_CONFIG },
      domains: overrides.domains ?? ['coding'],
    });
  }

  afterEach(() => {
    for (const s of stores) {
      try { s.close(); } catch { /* ignore */ }
    }
    stores.length = 0;
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it('runs a complete tick cycle', async () => {
    const loop = makeLoop();
    const result = await loop.tick();

    expect(result.completed).toBe(true);
    expect(result.variantId).toBeDefined();
    expect(result.niche).toBeDefined();
    expect(result.strategy).toBeDefined();
  });

  it('publishes cycle events', async () => {
    const eventBus = makeMockEventBus();
    const loop = makeLoop({ eventBus });

    await loop.tick();

    const calls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
    const topics = calls.map((c: unknown[]) => (c[0] as { topic: string }).topic);
    expect(topics).toContain('darwin.cycle.start');
    expect(topics).toContain('darwin.variant.created');
  });

  it('saves variant to store after evaluation', async () => {
    const store = makeStore();
    const loop = makeLoop({ store });

    const result = await loop.tick();
    expect(result.variantId).toBeDefined();

    const saved = store.getVariant(result.variantId!);
    expect(saved).not.toBeNull();
    expect(saved!.id).toBe(result.variantId);
  });

  it('updates archive cell when variant passes', async () => {
    const store = makeStore();
    const loop = makeLoop({ store });

    const result = await loop.tick();
    expect(result.archiveUpdated).toBe(true);

    const cell = store.getCell(result.niche!);
    expect(cell).not.toBeNull();
    expect(cell!.variantId).toBe(result.variantId);
  });

  it('increments staleness each tick', async () => {
    const store = makeStore();
    const loop = makeLoop({ store });

    await loop.tick();
    const cellAfterFirst = store.getCell({ domain: 'coding', complexity: 'simple' });
    expect(cellAfterFirst).not.toBeNull();
    // After first tick, staleness is 1 because incrementStaleness runs after setCell (which resets to 0)
    expect(cellAfterFirst!.staleness).toBe(1);
  });

  it('skips when resource governor blocks', async () => {
    const loop = makeLoop();
    // Exhaust token budget
    loop.getGovernor().recordTokenUsage(999_999);

    const result = await loop.tick();
    expect(result.completed).toBe(false);
    expect(result.skippedReason).toBe('resource_limit');
  });

  it('targets empty niches first with create_new strategy', async () => {
    const loop = makeLoop();
    const result = await loop.tick();

    expect(result.completed).toBe(true);
    expect(result.strategy).toBe('create_new');
    expect(result.niche).toEqual({ domain: 'coding', complexity: 'simple' });
  });

  it('handles LLM failure gracefully', async () => {
    const llm: LLMCallerLike = {
      call: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    };
    const loop = makeLoop({ llm });

    const result = await loop.tick();
    expect(result.completed).toBe(false);
    expect(result.error).toBe('LLM unavailable');
  });

  it('reports loop stats', async () => {
    const loop = makeLoop();
    const statsBefore = loop.getStats();

    expect(statsBefore.totalCycles).toBe(0);
    expect(statsBefore.successfulCycles).toBe(0);
    expect(statsBefore.failedCycles).toBe(0);

    await loop.tick();
    const statsAfter = loop.getStats();

    expect(statsAfter.totalCycles).toBe(1);
    expect(statsAfter.successfulCycles).toBe(1);
  });

  it('increments cycle counts after tick', async () => {
    const loop = makeLoop();

    await loop.tick();
    await loop.tick();

    const stats = loop.getStats();
    expect(stats.totalCycles).toBe(2);
    // Both target empty niches (simple, then moderate), both should pass
    expect(stats.successfulCycles).toBe(2);
    expect(stats.archiveOccupancy).toBe(2);
  });
});
