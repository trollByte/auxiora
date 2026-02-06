import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { BehaviorStore } from '../src/store.js';
import type { Behavior } from '../src/types.js';

let testDir: string;
let storePath: string;

function makeBehavior(overrides: Partial<Behavior> = {}): Behavior {
  return {
    id: 'bh_test1',
    type: 'scheduled',
    status: 'active',
    action: 'Test action',
    schedule: { cron: '0 8 * * *', timezone: 'UTC' },
    channel: { type: 'discord', id: 'ch123', overridden: false },
    createdBy: 'user1',
    createdAt: new Date().toISOString(),
    runCount: 0,
    failCount: 0,
    maxFailures: 3,
    ...overrides,
  };
}

describe('BehaviorStore', () => {
  beforeEach(async () => {
    testDir = path.join(
      os.tmpdir(),
      'auxiora-behaviors-test-' + Date.now() + '-' + Math.random().toString(36).slice(2)
    );
    storePath = path.join(testDir, 'behaviors.json');
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should create store file on first save', async () => {
    const store = new BehaviorStore(storePath);
    const behavior = makeBehavior();
    await store.save(behavior);

    const exists = await fs.access(storePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('should save and load a behavior', async () => {
    const store = new BehaviorStore(storePath);
    const behavior = makeBehavior();
    await store.save(behavior);

    const loaded = await store.get('bh_test1');
    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe('bh_test1');
    expect(loaded!.action).toBe('Test action');
  });

  it('should list all active behaviors', async () => {
    const store = new BehaviorStore(storePath);
    await store.save(makeBehavior({ id: 'bh_1', status: 'active' }));
    await store.save(makeBehavior({ id: 'bh_2', status: 'active' }));
    await store.save(makeBehavior({ id: 'bh_3', status: 'deleted' }));

    const active = await store.listActive();
    expect(active).toHaveLength(2);
  });

  it('should update a behavior', async () => {
    const store = new BehaviorStore(storePath);
    await store.save(makeBehavior());

    await store.update('bh_test1', { status: 'paused' });
    const updated = await store.get('bh_test1');
    expect(updated!.status).toBe('paused');
  });

  it('should delete a behavior', async () => {
    const store = new BehaviorStore(storePath);
    await store.save(makeBehavior());

    await store.remove('bh_test1');
    const deleted = await store.get('bh_test1');
    expect(deleted).toBeUndefined();
  });

  it('should persist across instances', async () => {
    const store1 = new BehaviorStore(storePath);
    await store1.save(makeBehavior());

    const store2 = new BehaviorStore(storePath);
    const loaded = await store2.get('bh_test1');
    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe('bh_test1');
  });

  it('should return all behaviors', async () => {
    const store = new BehaviorStore(storePath);
    await store.save(makeBehavior({ id: 'bh_1' }));
    await store.save(makeBehavior({ id: 'bh_2' }));

    const all = await store.getAll();
    expect(all).toHaveLength(2);
  });
});
