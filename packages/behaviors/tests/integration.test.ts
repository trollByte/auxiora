import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { BehaviorManager } from '../src/behavior-manager.js';
import type { ExecutorDeps } from '../src/executor.js';

let testDir: string;

describe('Behaviors Integration', () => {
  let manager: BehaviorManager;

  beforeEach(async () => {
    testDir = path.join(
      os.tmpdir(),
      'auxiora-behaviors-int-' + Date.now() + '-' + Math.random().toString(36).slice(2)
    );
    await fs.mkdir(testDir, { recursive: true });

    const deps: ExecutorDeps = {
      getProvider: () => ({
        name: 'mock',
        complete: vi.fn().mockResolvedValue({
          content: 'Test result',
          usage: { inputTokens: 5, outputTokens: 10 },
          model: 'mock',
          finishReason: 'end_turn',
        }),
      }),
      sendToChannel: vi.fn().mockResolvedValue({ success: true }),
      getSystemPrompt: () => 'Test',
    };

    manager = new BehaviorManager({
      storePath: path.join(testDir, 'behaviors.json'),
      executorDeps: deps,
      auditFn: vi.fn(),
    });
  });

  afterEach(async () => {
    await manager.stop();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should persist behaviors across manager restarts', async () => {
    await manager.create({
      type: 'scheduled',
      action: 'Check news',
      schedule: { cron: '0 8 * * *', timezone: 'UTC' },
      channel: { type: 'discord', id: 'ch1', overridden: false },
      createdBy: 'user1',
    });
    await manager.stop();

    // Create new manager with same store path
    const deps2: ExecutorDeps = {
      getProvider: () => ({
        name: 'mock',
        complete: vi.fn().mockResolvedValue({
          content: 'Test result',
          usage: { inputTokens: 5, outputTokens: 10 },
          model: 'mock',
          finishReason: 'end_turn',
        }),
      }),
      sendToChannel: vi.fn().mockResolvedValue({ success: true }),
      getSystemPrompt: () => 'Test',
    };

    const manager2 = new BehaviorManager({
      storePath: path.join(testDir, 'behaviors.json'),
      executorDeps: deps2,
      auditFn: vi.fn(),
    });
    await manager2.start();

    const list = await manager2.list();
    expect(list).toHaveLength(1);
    expect(list[0].action).toBe('Check news');

    await manager2.stop();
  });

  it('should support full CRUD lifecycle', async () => {
    // Create
    const behavior = await manager.create({
      type: 'scheduled',
      action: 'Do something',
      schedule: { cron: '0 8 * * *', timezone: 'UTC' },
      channel: { type: 'webchat', id: 'wc1', overridden: false },
      createdBy: 'user1',
    });
    expect(behavior.status).toBe('active');

    // Read
    const fetched = await manager.get(behavior.id);
    expect(fetched).toBeDefined();

    // Update (pause)
    const paused = await manager.update(behavior.id, { status: 'paused' });
    expect(paused!.status).toBe('paused');

    // Update (resume)
    const resumed = await manager.update(behavior.id, { status: 'active' });
    expect(resumed!.status).toBe('active');

    // Delete
    const deleted = await manager.remove(behavior.id);
    expect(deleted).toBe(true);

    const list = await manager.list();
    expect(list).toHaveLength(0);
  });

  it('should handle all three behavior types', async () => {
    await manager.create({
      type: 'scheduled',
      action: 'Scheduled task',
      schedule: { cron: '0 8 * * *', timezone: 'UTC' },
      channel: { type: 'discord', id: 'ch1', overridden: false },
      createdBy: 'user1',
    });

    await manager.create({
      type: 'monitor',
      action: 'Monitor task',
      polling: { intervalMs: 60_000, condition: 'some condition' },
      channel: { type: 'telegram', id: 'tg1', overridden: false },
      createdBy: 'user1',
    });

    const futureDate = new Date(Date.now() + 3600_000).toISOString();
    await manager.create({
      type: 'one-shot',
      action: 'Reminder',
      delay: { fireAt: futureDate },
      channel: { type: 'webchat', id: 'wc1', overridden: false },
      createdBy: 'user1',
    });

    const all = await manager.list();
    expect(all).toHaveLength(3);

    const types = all.map((b) => b.type).sort();
    expect(types).toEqual(['monitor', 'one-shot', 'scheduled']);
  });
});
