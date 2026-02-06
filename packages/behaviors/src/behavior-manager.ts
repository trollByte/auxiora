import { nanoid } from 'nanoid';
import { getLogger } from '@auxiora/logger';
import type {
  Behavior,
  BehaviorType,
  BehaviorStatus,
  BehaviorSchedule,
  BehaviorPolling,
  BehaviorDelay,
  BehaviorChannel,
} from './types.js';
import { BEHAVIOR_DEFAULTS } from './types.js';
import { BehaviorStore } from './store.js';
import { Scheduler } from './scheduler.js';
import { MonitorEngine } from './monitor.js';
import { BehaviorExecutor, type ExecutorDeps } from './executor.js';

const logger = getLogger('behaviors:manager');

export interface CreateBehaviorInput {
  type: BehaviorType;
  action: string;
  schedule?: BehaviorSchedule;
  polling?: BehaviorPolling;
  delay?: BehaviorDelay;
  channel: BehaviorChannel;
  createdBy: string;
}

export interface BehaviorManagerOptions {
  storePath: string;
  executorDeps: ExecutorDeps;
  auditFn: (event: string, details: Record<string, unknown>) => Promise<void> | void;
}

export class BehaviorManager {
  private store: BehaviorStore;
  private scheduler: Scheduler;
  private monitor: MonitorEngine;
  private executor: BehaviorExecutor;
  private auditFn: (event: string, details: Record<string, unknown>) => Promise<void> | void;
  private executionQueue: Promise<void> = Promise.resolve();
  private oneshotTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: BehaviorManagerOptions) {
    this.store = new BehaviorStore(options.storePath);
    this.scheduler = new Scheduler();
    this.monitor = new MonitorEngine();
    this.executor = new BehaviorExecutor(options.executorDeps);
    this.auditFn = options.auditFn;
  }

  async start(): Promise<void> {
    const behaviors = await this.store.listActive();
    logger.info('Starting behavior manager', { activeBehaviors: behaviors.length });

    for (const behavior of behaviors) {
      this.activate(behavior);
    }
  }

  async stop(): Promise<void> {
    this.scheduler.stopAll();
    this.monitor.stopAll();
    for (const [, timer] of this.oneshotTimers) {
      clearTimeout(timer);
    }
    this.oneshotTimers.clear();
    logger.info('Behavior manager stopped');
  }

  async create(input: CreateBehaviorInput): Promise<Behavior> {
    this.validate(input);

    const behavior: Behavior = {
      id: `bh_${nanoid(8)}`,
      type: input.type,
      status: 'active',
      action: input.action,
      schedule: input.schedule,
      polling: input.polling,
      delay: input.delay,
      channel: input.channel,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      runCount: 0,
      failCount: 0,
      maxFailures: BEHAVIOR_DEFAULTS.maxFailures,
    };

    await this.store.save(behavior);
    this.activate(behavior);

    this.auditFn('behavior.created', {
      behaviorId: behavior.id,
      type: behavior.type,
    });

    logger.info('Created behavior', { id: behavior.id, type: behavior.type, action: behavior.action });
    return behavior;
  }

  async list(filter?: { type?: BehaviorType; status?: BehaviorStatus }): Promise<Behavior[]> {
    const all = await this.store.getAll();
    return all.filter((b) => {
      if (filter?.type && b.type !== filter.type) return false;
      if (filter?.status && b.status !== filter.status) return false;
      return true;
    });
  }

  async get(id: string): Promise<Behavior | undefined> {
    return this.store.get(id);
  }

  async update(id: string, updates: Partial<Behavior>): Promise<Behavior | undefined> {
    const current = await this.store.get(id);
    if (!current) return undefined;

    const wasActive = current.status === 'active';
    const updated = await this.store.update(id, updates);
    if (!updated) return undefined;

    const isActive = updated.status === 'active';

    // Handle status transitions
    if (wasActive && !isActive) {
      this.deactivate(id);
    } else if (!wasActive && isActive) {
      this.activate(updated);
    } else if (wasActive && isActive) {
      // Re-activate with new settings
      this.deactivate(id);
      this.activate(updated);
    }

    logger.info('Updated behavior', { id, updates: Object.keys(updates) });
    return updated;
  }

  async executeNow(id: string): Promise<{ success: boolean; error?: string }> {
    const behavior = await this.store.get(id);
    if (!behavior) {
      throw new Error(`Behavior ${id} not found`);
    }
    const result = await this.executor.execute(behavior);
    return { success: result.success, error: result.error };
  }

  async remove(id: string): Promise<boolean> {
    this.deactivate(id);
    const removed = await this.store.remove(id);

    if (removed) {
      this.auditFn('behavior.deleted', {
        behaviorId: id,
      });
      logger.info('Removed behavior', { id });
    }

    return removed;
  }

  private validate(input: CreateBehaviorInput): void {
    if (input.type === 'scheduled') {
      if (!input.schedule?.cron) {
        throw new Error('Scheduled behaviors require a cron expression');
      }
      if (!Scheduler.isValidCron(input.schedule.cron)) {
        throw new Error(`Invalid cron expression: ${input.schedule.cron}`);
      }
    }

    if (input.type === 'monitor') {
      if (!input.polling?.intervalMs || !input.polling?.condition) {
        throw new Error('Monitor behaviors require polling interval and condition');
      }
      if (input.polling.intervalMs < BEHAVIOR_DEFAULTS.minPollingIntervalMs) {
        throw new Error(
          `Polling interval must be at least ${BEHAVIOR_DEFAULTS.minPollingIntervalMs}ms (${BEHAVIOR_DEFAULTS.minPollingIntervalMs / 1000}s)`
        );
      }
    }

    if (input.type === 'one-shot') {
      if (!input.delay?.fireAt) {
        throw new Error('One-shot behaviors require a fireAt timestamp');
      }
      const fireAt = new Date(input.delay.fireAt);
      if (fireAt.getTime() <= Date.now()) {
        throw new Error('One-shot fireAt must be in the future');
      }
    }
  }

  private activate(behavior: Behavior): void {
    switch (behavior.type) {
      case 'scheduled':
        if (behavior.schedule) {
          this.scheduler.schedule(
            behavior.id,
            behavior.schedule.cron,
            () => this.enqueueExecution(behavior.id),
            behavior.schedule.timezone
          );
        }
        break;

      case 'monitor':
        if (behavior.polling) {
          this.monitor.start(
            behavior.id,
            behavior.polling.intervalMs,
            () => this.enqueueExecution(behavior.id)
          );
        }
        break;

      case 'one-shot':
        if (behavior.delay) {
          const delayMs = new Date(behavior.delay.fireAt).getTime() - Date.now();
          if (delayMs > 0) {
            const timer = setTimeout(() => {
              this.oneshotTimers.delete(behavior.id);
              this.enqueueExecution(behavior.id);
            }, delayMs);
            this.oneshotTimers.set(behavior.id, timer);
          } else {
            // Missed one-shot
            this.store.update(behavior.id, { status: 'missed' });
          }
        }
        break;
    }
  }

  private deactivate(id: string): void {
    this.scheduler.stop(id);
    this.monitor.stop(id);
    const timer = this.oneshotTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.oneshotTimers.delete(id);
    }
  }

  private enqueueExecution(behaviorId: string): void {
    this.executionQueue = this.executionQueue.then(async () => {
      await this.executeWithRetry(behaviorId);
    }).catch((error) => {
      logger.error('Execution queue error', { behaviorId, error: error instanceof Error ? error : new Error(String(error)) });
    });
  }

  private async executeWithRetry(behaviorId: string): Promise<void> {
    const behavior = await this.store.get(behaviorId);
    if (!behavior || behavior.status !== 'active') return;

    let result = await this.executor.execute(behavior);

    // Retry once on transient failure
    if (!result.success) {
      logger.info('Retrying behavior execution', { id: behaviorId });
      await new Promise((resolve) => setTimeout(resolve, BEHAVIOR_DEFAULTS.retryDelayMs));
      result = await this.executor.execute(behavior);
    }

    // Update behavior state
    const updates: Partial<Behavior> = {
      lastRun: new Date().toISOString(),
      lastResult: result.success ? result.result?.slice(0, 500) : result.error,
      runCount: behavior.runCount + 1,
    };

    if (result.success) {
      updates.failCount = 0;

      // Auto-remove completed one-shots
      if (behavior.type === 'one-shot') {
        updates.status = 'deleted';
        this.deactivate(behaviorId);
      }
    } else {
      updates.failCount = behavior.failCount + 1;

      // Auto-pause on repeated failures
      if (updates.failCount >= behavior.maxFailures) {
        updates.status = 'paused';
        this.deactivate(behaviorId);
        logger.warn('Auto-paused behavior due to repeated failures', {
          id: behaviorId,
          failCount: updates.failCount,
        });
      }
    }

    await this.store.update(behaviorId, updates);

    this.auditFn('behavior.executed', {
      behaviorId,
      success: result.success,
      error: result.error,
    });
  }
}
