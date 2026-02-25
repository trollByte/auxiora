import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { BehaviorManager } from '../src/behavior-manager.js';
import type { ExecutorDeps } from '../src/executor.js';

let testDir: string;

function mockExecutorDeps(): ExecutorDeps {
  return {
    getProvider: () => ({
      name: 'mock',
      complete: vi.fn().mockResolvedValue({
        content: 'Mock result',
        usage: { inputTokens: 10, outputTokens: 20 },
        model: 'mock',
        finishReason: 'end_turn',
      }),
    }),
    sendToChannel: vi.fn().mockResolvedValue({ success: true }),
    getSystemPrompt: () => 'Test prompt',
  };
}

describe('BehaviorManager', () => {
  let manager: BehaviorManager;

  beforeEach(async () => {
    testDir = path.join(
      os.tmpdir(),
      'auxiora-bm-test-' + Date.now() + '-' + Math.random().toString(36).slice(2)
    );
    await fs.mkdir(testDir, { recursive: true });

    manager = new BehaviorManager({
      storePath: path.join(testDir, 'behaviors.json'),
      executorDeps: mockExecutorDeps(),
      auditFn: vi.fn(),
    });
  });

  afterEach(async () => {
    await manager.stop();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should create a scheduled behavior', async () => {
    const behavior = await manager.create({
      type: 'scheduled',
      action: 'Check news',
      schedule: { cron: '0 8 * * *', timezone: 'UTC' },
      channel: { type: 'discord', id: 'ch1', overridden: false },
      createdBy: 'user1',
    });

    expect(behavior.id).toMatch(/^bh_/);
    expect(behavior.status).toBe('active');
    expect(behavior.type).toBe('scheduled');
  });

  it('should create a one-shot behavior', async () => {
    const fireAt = new Date(Date.now() + 3600_000).toISOString();
    const behavior = await manager.create({
      type: 'one-shot',
      action: 'Remind me to call dentist',
      delay: { fireAt },
      channel: { type: 'webchat', id: 'wc1', overridden: false },
      createdBy: 'user1',
    });

    expect(behavior.type).toBe('one-shot');
  });

  it('should create a monitor behavior', async () => {
    const behavior = await manager.create({
      type: 'monitor',
      action: 'Check Bitcoin price',
      polling: { intervalMs: 60_000, condition: 'Below $60k' },
      channel: { type: 'telegram', id: 'tg1', overridden: false },
      createdBy: 'user1',
    });

    expect(behavior.type).toBe('monitor');
  });

  it('should list behaviors', async () => {
    await manager.create({
      type: 'scheduled',
      action: 'Task 1',
      schedule: { cron: '0 8 * * *', timezone: 'UTC' },
      channel: { type: 'discord', id: 'ch1', overridden: false },
      createdBy: 'user1',
    });
    await manager.create({
      type: 'scheduled',
      action: 'Task 2',
      schedule: { cron: '0 9 * * *', timezone: 'UTC' },
      channel: { type: 'discord', id: 'ch1', overridden: false },
      createdBy: 'user1',
    });

    const list = await manager.list();
    expect(list).toHaveLength(2);
  });

  it('should pause and resume a behavior', async () => {
    const behavior = await manager.create({
      type: 'scheduled',
      action: 'Task 1',
      schedule: { cron: '0 8 * * *', timezone: 'UTC' },
      channel: { type: 'discord', id: 'ch1', overridden: false },
      createdBy: 'user1',
    });

    const paused = await manager.update(behavior.id, { status: 'paused' });
    expect(paused!.status).toBe('paused');

    const resumed = await manager.update(behavior.id, { status: 'active' });
    expect(resumed!.status).toBe('active');
  });

  it('should delete a behavior', async () => {
    const behavior = await manager.create({
      type: 'scheduled',
      action: 'Task 1',
      schedule: { cron: '0 8 * * *', timezone: 'UTC' },
      channel: { type: 'discord', id: 'ch1', overridden: false },
      createdBy: 'user1',
    });

    const deleted = await manager.remove(behavior.id);
    expect(deleted).toBe(true);

    const list = await manager.list();
    expect(list).toHaveLength(0);
  });

  it('should reject invalid cron expression', async () => {
    await expect(
      manager.create({
        type: 'scheduled',
        action: 'Task 1',
        schedule: { cron: 'not-valid', timezone: 'UTC' },
        channel: { type: 'discord', id: 'ch1', overridden: false },
        createdBy: 'user1',
      })
    ).rejects.toThrow('Invalid cron');
  });

  it('should reject polling interval below minimum', async () => {
    await expect(
      manager.create({
        type: 'monitor',
        action: 'Check something',
        polling: { intervalMs: 1000, condition: 'something' },
        channel: { type: 'discord', id: 'ch1', overridden: false },
        createdBy: 'user1',
      })
    ).rejects.toThrow('Polling interval');
  });
});
