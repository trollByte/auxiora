import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResourceAwareEngine, type ResourceAwareConfig } from '../src/resource-aware-engine.js';
import type { ResourceProbeLike, ResourceSnapshotLike, MachineProfileLike } from '../src/resource-types.js';
import type { AgentEvent, OrchestrationResult, Workflow, OrchestrationEngineLike, AgentTask } from '../src/types.js';

function createMockProbe(overrides?: Partial<ResourceSnapshotLike>): ResourceProbeLike {
  const snapshot: ResourceSnapshotLike = {
    cpu: { cores: 8, utilization: 0.3, loadAvg1m: 2.4 },
    memory: { totalMB: 16384, freeMB: 8192, availableMB: 10240, usedPercent: 37.5 },
    swap: { usedPercent: 5 },
    timestamp: Date.now(),
    ...overrides,
  };
  return {
    probe: vi.fn().mockResolvedValue(snapshot),
    classify: vi.fn().mockReturnValue({
      machineClass: 'standard',
      hasGpu: false,
      recommendedMaxAgents: 3,
      cpuCeiling: 0.8,
      ramCeiling: 0.8,
    } satisfies MachineProfileLike),
    safeSlots: vi.fn().mockReturnValue(3),
  };
}

function createMockInnerEngine(result?: Partial<OrchestrationResult>): OrchestrationEngineLike {
  return {
    execute: vi.fn(async function* (workflow: Workflow) {
      yield {
        type: 'workflow_started' as const,
        workflowId: workflow.id,
        pattern: workflow.pattern,
        taskCount: workflow.tasks.length,
      };
      yield {
        type: 'workflow_completed' as const,
        workflowId: workflow.id,
        finalResult: 'done',
        totalUsage: { inputTokens: 100, outputTokens: 50 },
        totalCost: 0.001,
      };
      return {
        workflowId: workflow.id,
        pattern: workflow.pattern,
        agentResults: workflow.tasks.map(t => ({
          taskId: t.id,
          name: t.name,
          provider: t.provider,
          model: 'test',
          content: `Result of ${t.name}`,
          usage: { inputTokens: 100, outputTokens: 50 },
          duration: 100,
        })),
        synthesis: 'done',
        totalUsage: { inputTokens: 100, outputTokens: 50 },
        totalCost: 0.001,
        totalDuration: 100,
        ...result,
      };
    }),
  };
}

function defaultConfig(overrides?: Partial<ResourceAwareConfig>): ResourceAwareConfig {
  return {
    enabled: true,
    cpuCeiling: 0.8,
    ramCeiling: 0.8,
    reprobeIntervalMs: 2000,
    fallbackMaxAgents: 3,
    breakers: {},
    ...overrides,
  };
}

function makeTask(id: string, name?: string, dependsOn?: string[]): AgentTask {
  return {
    id,
    name: name ?? id,
    provider: 'test-provider',
    systemPrompt: 'You are a test agent.',
    userPrompt: `Do task ${id}`,
    dependsOn,
  };
}

async function collectEvents(gen: AsyncGenerator<AgentEvent, OrchestrationResult, unknown>): Promise<{ events: AgentEvent[]; result: OrchestrationResult }> {
  const events: AgentEvent[] = [];
  let iterResult: IteratorResult<AgentEvent, OrchestrationResult>;
  do {
    iterResult = await gen.next();
    if (!iterResult.done) {
      events.push(iterResult.value);
    }
  } while (!iterResult.done);
  return { events, result: iterResult.value };
}

describe('ResourceAwareEngine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('emits resource_snapshot event on start', async () => {
    const probe = createMockProbe();
    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());

    const workflow: Workflow = { id: 'w1', pattern: 'sequential', tasks: [makeTask('t1')] };
    const { events } = await collectEvents(engine.execute(workflow));

    const snapshotEvent = events.find(e => e.type === 'resource_snapshot');
    expect(snapshotEvent).toBeDefined();
    expect(snapshotEvent!.type).toBe('resource_snapshot');
    if (snapshotEvent!.type === 'resource_snapshot') {
      expect(snapshotEvent!.safeSlots).toBe(3);
      expect(snapshotEvent!.machineClass).toBe('standard');
    }
  });

  it('non-DAG pattern delegates to inner engine', async () => {
    const probe = createMockProbe();
    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());

    const workflow: Workflow = { id: 'w1', pattern: 'parallel', tasks: [makeTask('t1')] };
    const { result } = await collectEvents(engine.execute(workflow));

    expect(inner.execute).toHaveBeenCalledWith(workflow);
    expect(result.workflowId).toBe('w1');
    expect(result.pattern).toBe('parallel');
  });

  it('DAG wave execution: A->B->C produces correct wave order', async () => {
    const probe = createMockProbe();
    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());
    vi.spyOn(engine as any, 'delay').mockResolvedValue(undefined);

    const tasks = [
      makeTask('A', 'Task A'),
      makeTask('B', 'Task B', ['A']),
      makeTask('C', 'Task C', ['B']),
    ];
    const workflow: Workflow = { id: 'w1', pattern: 'dag', tasks };
    const { events, result } = await collectEvents(engine.execute(workflow));

    const waveStarted = events.filter(e => e.type === 'wave_started');
    expect(waveStarted).toHaveLength(3);

    // Wave 0: A, Wave 1: B, Wave 2: C
    if (waveStarted[0]!.type === 'wave_started') {
      expect(waveStarted[0]!.taskIds).toEqual(['A']);
    }
    if (waveStarted[1]!.type === 'wave_started') {
      expect(waveStarted[1]!.taskIds).toEqual(['B']);
    }
    if (waveStarted[2]!.type === 'wave_started') {
      expect(waveStarted[2]!.taskIds).toEqual(['C']);
    }

    expect(result.agentResults).toHaveLength(3);
    expect(result.pattern).toBe('dag');
  });

  it('DAG diamond: A->{B,C}->D produces 3 waves', async () => {
    const probe = createMockProbe();
    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());
    vi.spyOn(engine as any, 'delay').mockResolvedValue(undefined);

    const tasks = [
      makeTask('A', 'Task A'),
      makeTask('B', 'Task B', ['A']),
      makeTask('C', 'Task C', ['A']),
      makeTask('D', 'Task D', ['B', 'C']),
    ];
    const workflow: Workflow = { id: 'w1', pattern: 'dag', tasks };
    const { events } = await collectEvents(engine.execute(workflow));

    const waveStarted = events.filter(e => e.type === 'wave_started');
    expect(waveStarted).toHaveLength(3);

    // Wave 0: A, Wave 1: B+C, Wave 2: D
    if (waveStarted[0]!.type === 'wave_started') {
      expect(waveStarted[0]!.taskIds).toEqual(['A']);
    }
    if (waveStarted[1]!.type === 'wave_started') {
      expect(waveStarted[1]!.taskIds.sort()).toEqual(['B', 'C']);
    }
    if (waveStarted[2]!.type === 'wave_started') {
      expect(waveStarted[2]!.taskIds).toEqual(['D']);
    }
  });

  it('kill action throws error and refuses to start', async () => {
    const probe = createMockProbe({
      memory: { totalMB: 16384, freeMB: 1000, availableMB: 1000, usedPercent: 95 },
    });
    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());

    const workflow: Workflow = { id: 'w1', pattern: 'sequential', tasks: [makeTask('t1')] };

    const events: AgentEvent[] = [];
    const gen = engine.execute(workflow);

    await expect(async () => {
      let iterResult: IteratorResult<AgentEvent, OrchestrationResult>;
      do {
        iterResult = await gen.next();
        if (!iterResult.done) events.push(iterResult.value);
      } while (!iterResult.done);
    }).rejects.toThrow('Resource breaker triggered');

    const warningEvent = events.find(e => e.type === 'resource_warning');
    expect(warningEvent).toBeDefined();
    if (warningEvent?.type === 'resource_warning') {
      expect(warningEvent.action).toBe('kill');
    }
  });

  it('pause action waits and re-probes, succeeds when resources recover', async () => {
    // First probe returns high RAM (pause), subsequent probes return normal
    const highRamSnapshot: ResourceSnapshotLike = {
      cpu: { cores: 8, utilization: 0.3, loadAvg1m: 2.4 },
      memory: { totalMB: 16384, freeMB: 2000, availableMB: 2000, usedPercent: 87 },
      swap: { usedPercent: 5 },
      timestamp: Date.now(),
    };
    const normalSnapshot: ResourceSnapshotLike = {
      cpu: { cores: 8, utilization: 0.3, loadAvg1m: 2.4 },
      memory: { totalMB: 16384, freeMB: 8192, availableMB: 10240, usedPercent: 37.5 },
      swap: { usedPercent: 5 },
      timestamp: Date.now(),
    };

    const probe: ResourceProbeLike = {
      probe: vi.fn()
        .mockResolvedValueOnce(highRamSnapshot)
        .mockResolvedValueOnce(normalSnapshot),
      classify: vi.fn().mockReturnValue({
        machineClass: 'standard',
        hasGpu: false,
        recommendedMaxAgents: 3,
        cpuCeiling: 0.8,
        ramCeiling: 0.8,
      }),
      safeSlots: vi.fn().mockReturnValue(3),
    };

    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());
    vi.spyOn(engine as any, 'delay').mockResolvedValue(undefined);

    const workflow: Workflow = { id: 'w1', pattern: 'sequential', tasks: [makeTask('t1')] };
    const { events, result } = await collectEvents(engine.execute(workflow));

    expect(result.workflowId).toBe('w1');
    const pauseWarning = events.find(e => e.type === 'resource_warning');
    expect(pauseWarning).toBeDefined();
    if (pauseWarning?.type === 'resource_warning') {
      expect(pauseWarning.action).toBe('pause');
    }
  });

  it('pause action throws after 3 retries', async () => {
    const highRamSnapshot: ResourceSnapshotLike = {
      cpu: { cores: 8, utilization: 0.3, loadAvg1m: 2.4 },
      memory: { totalMB: 16384, freeMB: 2000, availableMB: 2000, usedPercent: 87 },
      swap: { usedPercent: 5 },
      timestamp: Date.now(),
    };

    const probe: ResourceProbeLike = {
      probe: vi.fn().mockResolvedValue(highRamSnapshot),
      classify: vi.fn().mockReturnValue({
        machineClass: 'standard',
        hasGpu: false,
        recommendedMaxAgents: 3,
        cpuCeiling: 0.8,
        ramCeiling: 0.8,
      }),
      safeSlots: vi.fn().mockReturnValue(3),
    };

    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());
    vi.spyOn(engine as any, 'delay').mockResolvedValue(undefined);

    const workflow: Workflow = { id: 'w1', pattern: 'sequential', tasks: [makeTask('t1')] };

    await expect(async () => {
      await collectEvents(engine.execute(workflow));
    }).rejects.toThrow('Resources did not recover after 3 pause retries');
  });

  it('throttle emits warning and reduces DAG slots by 50%', async () => {
    const probe = createMockProbe({
      cpu: { cores: 8, utilization: 0.95, loadAvg1m: 7.6 },
    });
    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());
    vi.spyOn(engine as any, 'delay').mockResolvedValue(undefined);

    const tasks = [
      makeTask('A', 'Task A'),
      makeTask('B', 'Task B', ['A']),
    ];
    const workflow: Workflow = { id: 'w1', pattern: 'dag', tasks };
    const { events } = await collectEvents(engine.execute(workflow));

    const throttleWarning = events.find(e => e.type === 'resource_warning');
    expect(throttleWarning).toBeDefined();
    if (throttleWarning?.type === 'resource_warning') {
      expect(throttleWarning.action).toBe('throttle');
    }

    // safeSlots = 3, throttled = floor(3/2) = 1
    const waveStarted = events.find(e => e.type === 'wave_started');
    if (waveStarted?.type === 'wave_started') {
      expect(waveStarted.slots).toBe(1);
    }
  });

  it('probe failure uses fallback snapshot', async () => {
    const probe: ResourceProbeLike = {
      probe: vi.fn().mockRejectedValue(new Error('probe failed')),
      classify: vi.fn(),
      safeSlots: vi.fn(),
    };

    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());

    const workflow: Workflow = { id: 'w1', pattern: 'sequential', tasks: [makeTask('t1')] };
    const { events } = await collectEvents(engine.execute(workflow));

    const snapshotEvent = events.find(e => e.type === 'resource_snapshot');
    expect(snapshotEvent).toBeDefined();
    if (snapshotEvent?.type === 'resource_snapshot') {
      expect(snapshotEvent.machineClass).toBe('standard');
      expect(snapshotEvent.safeSlots).toBe(3);
      expect(snapshotEvent.snapshot.cpu.cores).toBe(4);
      expect(snapshotEvent.snapshot.memory.usedPercent).toBe(50);
    }
  });

  it('getLastSnapshot() returns latest snapshot', async () => {
    const probe = createMockProbe();
    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());

    expect(engine.getLastSnapshot()).toBeNull();

    const workflow: Workflow = { id: 'w1', pattern: 'sequential', tasks: [makeTask('t1')] };
    await collectEvents(engine.execute(workflow));

    const snapshot = engine.getLastSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.cpu.cores).toBe(8);
  });

  it('getMachineProfile() returns latest profile', async () => {
    const probe = createMockProbe();
    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());

    expect(engine.getMachineProfile()).toBeNull();

    const workflow: Workflow = { id: 'w1', pattern: 'sequential', tasks: [makeTask('t1')] };
    await collectEvents(engine.execute(workflow));

    const profile = engine.getMachineProfile();
    expect(profile).not.toBeNull();
    expect(profile!.machineClass).toBe('standard');
    expect(profile!.recommendedMaxAgents).toBe(3);
  });

  it('resource events emitted for wave_started/wave_completed', async () => {
    const probe = createMockProbe();
    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());
    vi.spyOn(engine as any, 'delay').mockResolvedValue(undefined);

    const tasks = [makeTask('A', 'Task A'), makeTask('B', 'Task B')];
    const workflow: Workflow = { id: 'w1', pattern: 'dag', tasks };
    const { events } = await collectEvents(engine.execute(workflow));

    const waveStarted = events.filter(e => e.type === 'wave_started');
    const waveCompleted = events.filter(e => e.type === 'wave_completed');
    expect(waveStarted).toHaveLength(1);
    expect(waveCompleted).toHaveLength(1);

    if (waveStarted[0]?.type === 'wave_started') {
      expect(waveStarted[0].waveIndex).toBe(0);
      expect(waveStarted[0].taskIds.sort()).toEqual(['A', 'B']);
    }
    if (waveCompleted[0]?.type === 'wave_completed') {
      expect(waveCompleted[0].waveIndex).toBe(0);
    }
  });

  it('re-probe between DAG waves', async () => {
    const probe = createMockProbe();
    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());
    vi.spyOn(engine as any, 'delay').mockResolvedValue(undefined);

    const tasks = [
      makeTask('A', 'Task A'),
      makeTask('B', 'Task B', ['A']),
    ];
    const workflow: Workflow = { id: 'w1', pattern: 'dag', tasks };
    await collectEvents(engine.execute(workflow));

    // probe called once initially + once between waves
    expect(probe.probe).toHaveBeenCalledTimes(2);
  });

  it('kill triggered between DAG waves stops execution', async () => {
    const normalSnapshot: ResourceSnapshotLike = {
      cpu: { cores: 8, utilization: 0.3, loadAvg1m: 2.4 },
      memory: { totalMB: 16384, freeMB: 8192, availableMB: 10240, usedPercent: 37.5 },
      swap: { usedPercent: 5 },
      timestamp: Date.now(),
    };
    const killSnapshot: ResourceSnapshotLike = {
      cpu: { cores: 8, utilization: 0.3, loadAvg1m: 2.4 },
      memory: { totalMB: 16384, freeMB: 500, availableMB: 500, usedPercent: 95 },
      swap: { usedPercent: 5 },
      timestamp: Date.now(),
    };

    const probe: ResourceProbeLike = {
      probe: vi.fn()
        .mockResolvedValueOnce(normalSnapshot)  // initial probe
        .mockResolvedValueOnce(killSnapshot),    // re-probe between waves
      classify: vi.fn().mockReturnValue({
        machineClass: 'standard', hasGpu: false,
        recommendedMaxAgents: 3, cpuCeiling: 0.8, ramCeiling: 0.8,
      }),
      safeSlots: vi.fn().mockReturnValue(3),
    };

    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());
    vi.spyOn(engine as any, 'delay').mockResolvedValue(undefined);

    const tasks = [
      makeTask('A', 'Task A'),
      makeTask('B', 'Task B', ['A']),
      makeTask('C', 'Task C', ['B']),
    ];
    const workflow: Workflow = { id: 'w1', pattern: 'dag', tasks };

    await expect(async () => {
      await collectEvents(engine.execute(workflow));
    }).rejects.toThrow('Resource breaker triggered between waves');
  });

  it('dependency results passed between waves', async () => {
    const probe = createMockProbe();
    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());
    vi.spyOn(engine as any, 'delay').mockResolvedValue(undefined);

    const tasks = [
      makeTask('A', 'Task A'),
      makeTask('B', 'Task B', ['A']),
    ];
    const workflow: Workflow = { id: 'w1', pattern: 'dag', tasks };
    await collectEvents(engine.execute(workflow));

    // The inner engine should have been called for task B with augmented prompt
    const executeCalls = (inner.execute as ReturnType<typeof vi.fn>).mock.calls;
    // Find the call for task B (which has dependsOn: ['A'])
    const taskBCall = executeCalls.find(
      (call: [Workflow]) => call[0].tasks[0]?.id === 'B',
    );
    expect(taskBCall).toBeDefined();
    expect(taskBCall![0].tasks[0]!.userPrompt).toContain('Previous results:');
    expect(taskBCall![0].tasks[0]!.userPrompt).toContain('Task A');
  });

  it('empty workflow produces no waves', async () => {
    const probe = createMockProbe();
    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());

    const workflow: Workflow = { id: 'w1', pattern: 'dag', tasks: [] };
    const { events, result } = await collectEvents(engine.execute(workflow));

    const waveStarted = events.filter(e => e.type === 'wave_started');
    expect(waveStarted).toHaveLength(0);
    expect(result.agentResults).toHaveLength(0);
  });

  it('throttle during re-probe reduces slots', async () => {
    const normalSnapshot: ResourceSnapshotLike = {
      cpu: { cores: 8, utilization: 0.3, loadAvg1m: 2.4 },
      memory: { totalMB: 16384, freeMB: 8192, availableMB: 10240, usedPercent: 37.5 },
      swap: { usedPercent: 5 },
      timestamp: Date.now(),
    };
    const throttleSnapshot: ResourceSnapshotLike = {
      cpu: { cores: 8, utilization: 0.95, loadAvg1m: 7.6 },
      memory: { totalMB: 16384, freeMB: 8192, availableMB: 10240, usedPercent: 37.5 },
      swap: { usedPercent: 5 },
      timestamp: Date.now(),
    };

    const probe: ResourceProbeLike = {
      probe: vi.fn()
        .mockResolvedValueOnce(normalSnapshot)    // initial probe
        .mockResolvedValueOnce(throttleSnapshot),  // re-probe between waves
      classify: vi.fn().mockReturnValue({
        machineClass: 'standard', hasGpu: false,
        recommendedMaxAgents: 3, cpuCeiling: 0.8, ramCeiling: 0.8,
      }),
      safeSlots: vi.fn().mockReturnValue(4),
    };

    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());
    vi.spyOn(engine as any, 'delay').mockResolvedValue(undefined);

    const tasks = [
      makeTask('A', 'Task A'),
      makeTask('B', 'Task B', ['A']),
      makeTask('C', 'Task C', ['B']),
    ];
    const workflow: Workflow = { id: 'w1', pattern: 'dag', tasks };
    const { events } = await collectEvents(engine.execute(workflow));

    const waveStarted = events.filter(e => e.type === 'wave_started');
    // Wave 0: slots=4 (not throttled), Wave 1: slots=4 (not yet throttled), Wave 2: slots=2 (throttled after re-probe)
    expect(waveStarted).toHaveLength(3);
    if (waveStarted[0]?.type === 'wave_started') {
      expect(waveStarted[0].slots).toBe(4);
    }
    // After re-probe between wave 0 and 1, throttle kicks in -> floor(4/2) = 2
    if (waveStarted[1]?.type === 'wave_started') {
      expect(waveStarted[1].slots).toBe(2);
    }
    if (waveStarted[2]?.type === 'wave_started') {
      expect(waveStarted[2].slots).toBe(2);
    }
  });

  it('resource_warning event emitted for throttle', async () => {
    const probe = createMockProbe({
      cpu: { cores: 8, utilization: 0.95, loadAvg1m: 7.6 },
    });
    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());

    const workflow: Workflow = { id: 'w1', pattern: 'sequential', tasks: [makeTask('t1')] };
    const { events } = await collectEvents(engine.execute(workflow));

    const warning = events.find(e => e.type === 'resource_warning');
    expect(warning).toBeDefined();
    if (warning?.type === 'resource_warning') {
      expect(warning.action).toBe('throttle');
      expect(warning.reasons.length).toBeGreaterThan(0);
    }
  });

  it('resource_warning event emitted for pause', async () => {
    const highRamSnapshot: ResourceSnapshotLike = {
      cpu: { cores: 8, utilization: 0.3, loadAvg1m: 2.4 },
      memory: { totalMB: 16384, freeMB: 2000, availableMB: 2000, usedPercent: 87 },
      swap: { usedPercent: 5 },
      timestamp: Date.now(),
    };
    const normalSnapshot: ResourceSnapshotLike = {
      cpu: { cores: 8, utilization: 0.3, loadAvg1m: 2.4 },
      memory: { totalMB: 16384, freeMB: 8192, availableMB: 10240, usedPercent: 37.5 },
      swap: { usedPercent: 5 },
      timestamp: Date.now(),
    };

    const probe: ResourceProbeLike = {
      probe: vi.fn()
        .mockResolvedValueOnce(highRamSnapshot)
        .mockResolvedValueOnce(normalSnapshot),
      classify: vi.fn().mockReturnValue({
        machineClass: 'standard', hasGpu: false,
        recommendedMaxAgents: 3, cpuCeiling: 0.8, ramCeiling: 0.8,
      }),
      safeSlots: vi.fn().mockReturnValue(3),
    };

    const inner = createMockInnerEngine();
    const engine = new ResourceAwareEngine(inner, probe, defaultConfig());
    vi.spyOn(engine as any, 'delay').mockResolvedValue(undefined);

    const workflow: Workflow = { id: 'w1', pattern: 'sequential', tasks: [makeTask('t1')] };
    const { events } = await collectEvents(engine.execute(workflow));

    const warning = events.find(e => e.type === 'resource_warning');
    expect(warning).toBeDefined();
    if (warning?.type === 'resource_warning') {
      expect(warning.action).toBe('pause');
      expect(warning.reasons.length).toBeGreaterThan(0);
    }
  });
});
