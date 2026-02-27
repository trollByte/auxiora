import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DeploymentManager } from '../src/deployment-manager.js';
import type { Variant, EventBusLike, PluginLoaderLike } from '../src/types.js';

function makeVariant(overrides: Partial<Variant> = {}): Variant {
  return {
    id: 'v-001',
    generation: 1,
    parentIds: [],
    strategy: 'create_new',
    type: 'prompt',
    content: 'You are a helpful assistant.',
    metadata: {},
    metrics: { accuracy: 0.9, latencyP50: 100, latencyP95: 200, errorRate: 0.01 },
    securityPassed: true,
    reviewScore: 0.8,
    status: 'evaluated',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('DeploymentManager', () => {
  const dirs: string[] = [];

  function makeTmpDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'darwin-deploy-'));
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it('classifies prompt as minor', () => {
    const dm = new DeploymentManager({ darwinDir: makeTmpDir() });
    expect(dm.classify(makeVariant({ type: 'prompt' }))).toBe('minor');
  });

  it('classifies config as minor', () => {
    const dm = new DeploymentManager({ darwinDir: makeTmpDir() });
    expect(dm.classify(makeVariant({ type: 'config' }))).toBe('minor');
  });

  it('classifies skill as major', () => {
    const dm = new DeploymentManager({ darwinDir: makeTmpDir() });
    expect(dm.classify(makeVariant({ type: 'skill' }))).toBe('major');
  });

  it('auto-deploys prompt to disk', async () => {
    const dir = makeTmpDir();
    const dm = new DeploymentManager({ darwinDir: dir });
    const variant = makeVariant({
      type: 'prompt',
      content: 'Be concise.',
      metadata: { niche: { domain: 'coding', complexity: 'moderate' } },
    });

    const result = await dm.deploy(variant);

    expect(result.deployed).toBe(true);
    expect(result.method).toBe('auto');
    const expectedPath = join(dir, 'prompts', 'coding-moderate.txt');
    expect(result.path).toBe(expectedPath);
    expect(existsSync(expectedPath)).toBe(true);
    expect(readFileSync(expectedPath, 'utf-8')).toBe('Be concise.');
  });

  it('queues skill for approval', async () => {
    const dir = makeTmpDir();
    const dm = new DeploymentManager({ darwinDir: dir });
    const variant = makeVariant({
      id: 'skill-001',
      type: 'skill',
      content: 'export function run() { return 42; }',
    });

    const result = await dm.deploy(variant);

    expect(result.deployed).toBe(false);
    expect(result.method).toBe('queued');
    expect(result.approvalRequired).toBe(true);
    const stagedPath = join(dir, 'skills', 'skill-001.ts');
    expect(existsSync(stagedPath)).toBe(true);
  });

  it('hot-loads on approval', async () => {
    const dir = makeTmpDir();
    const loadCalls: string[] = [];
    const pluginLoader: PluginLoaderLike = {
      async loadSingle(filePath: string) {
        loadCalls.push(filePath);
        return { name: 'test-skill', status: 'loaded' };
      },
    };
    const events: Array<{ topic: string; data?: Record<string, unknown> }> = [];
    const eventBus: EventBusLike = {
      publish(event) { events.push(event); },
    };

    const dm = new DeploymentManager({ darwinDir: dir, pluginLoader, eventBus });
    const variant = makeVariant({ id: 'skill-002', type: 'skill', content: 'code' });

    await dm.deploy(variant);
    const approved = await dm.approve('skill-002');

    expect(approved).toBe(true);
    expect(loadCalls).toHaveLength(1);
    expect(loadCalls[0]).toContain('skill-002.ts');
    expect(events.some(e => e.topic === 'darwin.deployed' && e.data?.approved === true)).toBe(true);
  });

  it('publishes event on auto-deploy', async () => {
    const dir = makeTmpDir();
    const events: Array<{ topic: string; data?: Record<string, unknown> }> = [];
    const eventBus: EventBusLike = {
      publish(event) { events.push(event); },
    };

    const dm = new DeploymentManager({ darwinDir: dir, eventBus });
    await dm.deploy(makeVariant({ id: 'p-1', type: 'prompt', content: 'hi' }));

    expect(events).toHaveLength(1);
    expect(events[0]!.topic).toBe('darwin.deployed');
    expect(events[0]!.data?.variantId).toBe('p-1');
  });

  it('lists pending approvals', async () => {
    const dir = makeTmpDir();
    const dm = new DeploymentManager({ darwinDir: dir });

    await dm.deploy(makeVariant({ id: 's1', type: 'skill', content: 'a' }));
    await dm.deploy(makeVariant({ id: 's2', type: 'skill', content: 'b' }));

    const pending = dm.getPendingApprovals();
    expect(pending).toHaveLength(2);
    expect(pending.map(p => p.variantId).sort()).toEqual(['s1', 's2']);
  });

  it('rejects queued variant', async () => {
    const dir = makeTmpDir();
    const dm = new DeploymentManager({ darwinDir: dir });

    await dm.deploy(makeVariant({ id: 's3', type: 'skill', content: 'x' }));
    expect(dm.getPendingApprovals()).toHaveLength(1);

    const rejected = dm.reject('s3');
    expect(rejected).toBe(true);
    expect(dm.getPendingApprovals()).toHaveLength(0);
  });
});
