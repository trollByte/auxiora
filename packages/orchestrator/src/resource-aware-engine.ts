import type { ResourceProbeLike, ResourceSnapshotLike, MachineProfileLike } from './resource-types.js';
import type { AgentEvent, OrchestrationResult, Workflow, OrchestrationEngineLike, AgentTask, AgentResult } from './types.js';
import { ResourceBreakers, type BreakerThresholds, type ResourceAction } from './resource-breakers.js';
import { buildWaves } from './dag-scheduler.js';

export interface ResourceAwareConfig {
  enabled: boolean;
  cpuCeiling: number;
  ramCeiling: number;
  reprobeIntervalMs: number;
  fallbackMaxAgents: number;
  breakers: Partial<BreakerThresholds>;
}

export class ResourceAwareEngine implements OrchestrationEngineLike {
  private lastSnapshot: ResourceSnapshotLike | null = null;
  private machineProfile: MachineProfileLike | null = null;
  private breakers: ResourceBreakers;

  constructor(
    private inner: OrchestrationEngineLike,
    private probe: ResourceProbeLike,
    private config: ResourceAwareConfig,
  ) {
    this.breakers = new ResourceBreakers(config.breakers);
  }

  async *execute(workflow: Workflow): AsyncGenerator<AgentEvent, OrchestrationResult, unknown> {
    // 1. Probe resources
    let snapshot: ResourceSnapshotLike;
    try {
      snapshot = await this.probe.probe();
      this.lastSnapshot = snapshot;
      this.machineProfile = this.probe.classify(snapshot);
    } catch {
      // Fallback: use default profile if probe fails
      snapshot = this.createFallbackSnapshot();
      this.lastSnapshot = snapshot;
      this.machineProfile = {
        machineClass: 'standard',
        hasGpu: false,
        recommendedMaxAgents: this.config.fallbackMaxAgents,
        cpuCeiling: this.config.cpuCeiling,
        ramCeiling: this.config.ramCeiling,
      };
    }

    const safeSlots = this.probe.safeSlots?.(snapshot, this.machineProfile!) ?? this.config.fallbackMaxAgents;

    // Emit resource snapshot event
    yield {
      type: 'resource_snapshot',
      workflowId: workflow.id,
      snapshot,
      safeSlots,
      machineClass: this.machineProfile!.machineClass,
    };

    // 2. Check breakers
    const breakerResult = this.breakers.evaluate(snapshot);

    if (breakerResult.action === 'kill') {
      yield { type: 'resource_warning', workflowId: workflow.id, action: 'kill', reasons: breakerResult.reasons };
      throw new Error(`Resource breaker triggered: ${breakerResult.reasons.join('; ')}`);
    }

    if (breakerResult.action === 'pause') {
      yield { type: 'resource_warning', workflowId: workflow.id, action: 'pause', reasons: breakerResult.reasons };
      // Wait and re-probe up to 3 times
      let retries = 0;
      let currentAction: ResourceAction = breakerResult.action;
      while (currentAction === 'pause' && retries < 3) {
        await this.delay(5000);
        retries++;
        try {
          snapshot = await this.probe.probe();
          this.lastSnapshot = snapshot;
        } catch {
          /* keep previous snapshot */
        }
        const recheck = this.breakers.evaluate(snapshot);
        currentAction = recheck.action;
        if (currentAction === 'kill') {
          throw new Error(`Resource breaker triggered after pause: ${recheck.reasons.join('; ')}`);
        }
      }
      if (currentAction === 'pause') {
        throw new Error('Resources did not recover after 3 pause retries');
      }
    }

    if (breakerResult.action === 'throttle') {
      yield { type: 'resource_warning', workflowId: workflow.id, action: 'throttle', reasons: breakerResult.reasons };
    }

    // 3. For DAG pattern: wave-by-wave execution
    if (workflow.pattern === 'dag') {
      return yield* this.executeDag(workflow, snapshot, safeSlots, breakerResult.action === 'throttle');
    }

    // 4. For other patterns: delegate to inner engine
    return yield* this.inner.execute(workflow);
  }

  private async *executeDag(
    workflow: Workflow,
    snapshot: ResourceSnapshotLike,
    safeSlots: number,
    throttled: boolean,
  ): AsyncGenerator<AgentEvent, OrchestrationResult, unknown> {
    const waves = buildWaves(workflow.tasks);
    const allResults: AgentResult[] = [];
    const startTime = Date.now();
    const taskMap = new Map(workflow.tasks.map(t => [t.id, t]));

    // Throttle reduces slots by 50%
    let effectiveSlots = throttled ? Math.max(1, Math.floor(safeSlots / 2)) : safeSlots;

    yield {
      type: 'workflow_started',
      workflowId: workflow.id,
      pattern: 'dag',
      taskCount: workflow.tasks.length,
    };

    for (const wave of waves) {
      yield {
        type: 'wave_started',
        workflowId: workflow.id,
        waveIndex: wave.waveIndex,
        taskIds: wave.taskIds,
        slots: effectiveSlots,
      };

      // Execute wave tasks with semaphore-limited concurrency
      const waveTasks = wave.taskIds.map(id => taskMap.get(id)!).filter(Boolean);

      // Build previous results context for tasks that depend on completed tasks
      const previousResultsMap = new Map(allResults.map(r => [r.taskId, r]));

      // Execute tasks in the wave concurrently, limited by effectiveSlots
      const waveResults = await this.executeWaveTasks(workflow.id, waveTasks, effectiveSlots, previousResultsMap);
      allResults.push(...waveResults);

      // Emit completion events for each task in wave
      for (const result of waveResults) {
        yield {
          type: 'agent_completed',
          workflowId: workflow.id,
          taskId: result.taskId,
          name: result.name,
          result: result.content,
          usage: result.usage,
        };
      }

      yield {
        type: 'wave_completed',
        workflowId: workflow.id,
        waveIndex: wave.waveIndex,
        completedTaskIds: waveResults.map(r => r.taskId),
      };

      // Re-probe between waves (if not last wave)
      if (wave.waveIndex < waves.length - 1) {
        try {
          snapshot = await this.probe.probe();
          this.lastSnapshot = snapshot;
          const recheck = this.breakers.evaluate(snapshot);
          if (recheck.action === 'kill') {
            throw new Error(`Resource breaker triggered between waves: ${recheck.reasons.join('; ')}`);
          }
          if (recheck.action === 'throttle') {
            effectiveSlots = Math.max(1, Math.floor(safeSlots / 2));
          }
          if (recheck.action === 'pause') {
            yield { type: 'resource_warning', workflowId: workflow.id, action: 'pause', reasons: recheck.reasons };
            await this.delay(5000);
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('Resource breaker')) throw err;
          // Probe failed, continue with last known snapshot
        }
      }
    }

    const totalUsage = allResults.reduce(
      (acc, r) => ({
        inputTokens: acc.inputTokens + r.usage.inputTokens,
        outputTokens: acc.outputTokens + r.usage.outputTokens,
      }),
      { inputTokens: 0, outputTokens: 0 },
    );

    const synthesis = allResults.map(r => `### ${r.name}\n${r.content}`).join('\n\n');
    const totalCost = (totalUsage.inputTokens * 3 + totalUsage.outputTokens * 15) / 1_000_000;

    yield {
      type: 'workflow_completed',
      workflowId: workflow.id,
      finalResult: synthesis,
      totalUsage,
      totalCost,
    };

    return {
      workflowId: workflow.id,
      pattern: 'dag',
      agentResults: allResults,
      synthesis,
      totalUsage,
      totalCost,
      totalDuration: Date.now() - startTime,
    };
  }

  private async executeWaveTasks(
    workflowId: string,
    tasks: AgentTask[],
    maxSlots: number,
    previousResults: Map<string, AgentResult>,
  ): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    let active = 0;
    const queue = [...tasks];

    return new Promise((resolve, _reject) => {
      const tryNext = (): void => {
        while (active < maxSlots && queue.length > 0) {
          const task = queue.shift()!;
          active++;

          // Augment prompt with dependency results
          let augmentedPrompt = task.userPrompt;
          if (task.dependsOn) {
            const depResults = task.dependsOn
              .map(id => previousResults.get(id))
              .filter(Boolean)
              .map(r => `### ${r!.name}\n${r!.content}`)
              .join('\n\n');
            if (depResults) {
              augmentedPrompt = `Previous results:\n${depResults}\n\n${task.userPrompt}`;
            }
          }

          // Execute via inner engine as a single-task sequential workflow
          const miniWorkflow: Workflow = {
            id: `${workflowId}_wave_${task.id}`,
            pattern: 'sequential',
            tasks: [{ ...task, userPrompt: augmentedPrompt }],
          };

          (async () => {
            const gen = this.inner.execute(miniWorkflow);
            let result: IteratorResult<AgentEvent, OrchestrationResult>;
            do {
              result = await gen.next();
            } while (!result.done);
            return result.value;
          })()
            .then(orchResult => {
              if (orchResult.agentResults[0]) {
                results.push(orchResult.agentResults[0]);
              }
              active--;
              if (queue.length === 0 && active === 0) {
                resolve(results);
              } else {
                tryNext();
              }
            })
            .catch(err => {
              active--;
              // On error, still record a failed result
              results.push({
                taskId: task.id,
                name: task.name,
                provider: task.provider,
                model: task.model ?? 'unknown',
                content: '',
                usage: { inputTokens: 0, outputTokens: 0 },
                duration: 0,
                error: err instanceof Error ? err.message : String(err),
              });
              if (queue.length === 0 && active === 0) {
                resolve(results);
              } else {
                tryNext();
              }
            });
        }
      };

      if (tasks.length === 0) {
        resolve([]);
        return;
      }
      tryNext();
    });
  }

  getLastSnapshot(): ResourceSnapshotLike | null {
    return this.lastSnapshot;
  }

  getMachineProfile(): MachineProfileLike | null {
    return this.machineProfile;
  }

  private createFallbackSnapshot(): ResourceSnapshotLike {
    return {
      cpu: { cores: 4, utilization: 0.5, loadAvg1m: 2 },
      memory: { totalMB: 8192, freeMB: 4096, availableMB: 4096, usedPercent: 50 },
      swap: { usedPercent: 0 },
      timestamp: Date.now(),
    };
  }

  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
