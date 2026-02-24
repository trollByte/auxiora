import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrchestrationEngine } from '../src/engine.js';
import type {
  AgentEvent,
  AgentTask,
  OrchestrationResult,
  WorkflowCheckpointHandler,
  WorkflowCheckpoint,
} from '../src/types.js';
import type { OrchestrationConfig } from '@auxiora/config';
import type { Provider, CompletionResult, ProviderMetadata } from '@auxiora/providers';
import type { ProviderFactory } from '@auxiora/providers';

function makeConfig(overrides: Partial<OrchestrationConfig> = {}): OrchestrationConfig {
  return {
    enabled: true,
    maxConcurrentAgents: 5,
    defaultTimeout: 60000,
    totalTimeout: 300000,
    allowedPatterns: ['parallel', 'sequential', 'debate', 'map-reduce', 'supervisor'],
    costMultiplierWarning: 3,
    ...overrides,
  };
}

function makeCompletionResult(content: string, model = 'test-model'): CompletionResult {
  return {
    content,
    usage: { inputTokens: 100, outputTokens: 50 },
    model,
    finishReason: 'stop',
  };
}

function makeMockProvider(name: string): Provider {
  const defaultResponse = `Response from ${name}`;
  return {
    name,
    metadata: {
      name,
      displayName: name,
      models: {},
      isAvailable: async () => true,
    } as ProviderMetadata,
    complete: vi.fn(async () => makeCompletionResult(defaultResponse, `${name}-model`)),
    stream: vi.fn(),
  };
}

function makeMockFactory(providers: Map<string, Provider>): ProviderFactory {
  return {
    getProvider(name?: string): Provider {
      const providerName = name ?? 'test';
      const provider = providers.get(providerName);
      if (!provider) throw new Error(`Provider not configured: ${providerName}`);
      return provider;
    },
    getPrimaryProvider() { return this.getProvider('test'); },
    getFallbackProvider() { return null; },
    listAvailable() { return Array.from(providers.keys()); },
    withFallback: vi.fn(),
  } as unknown as ProviderFactory;
}

function makeTask(id: string, overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id,
    name: `Agent ${id}`,
    provider: 'test',
    systemPrompt: `You are agent ${id}`,
    userPrompt: `Task for ${id}`,
    ...overrides,
  };
}

async function collectEvents(
  gen: AsyncGenerator<AgentEvent, OrchestrationResult, unknown>,
): Promise<{ events: AgentEvent[]; result: OrchestrationResult }> {
  const events: AgentEvent[] = [];
  let result: IteratorResult<AgentEvent, OrchestrationResult>;
  do {
    result = await gen.next();
    if (!result.done) {
      events.push(result.value);
    }
  } while (!result.done);
  return { events, result: result.value };
}

describe('Orchestration Observability', () => {
  let mockProvider: Provider;
  let factory: ProviderFactory;
  let config: OrchestrationConfig;

  beforeEach(() => {
    mockProvider = makeMockProvider('test');
    factory = makeMockFactory(new Map([['test', mockProvider]]));
    config = makeConfig();
  });

  it('should emit task_progress events for sequential workflows', async () => {
    const engine = new OrchestrationEngine(factory, config);
    const workflow = engine.sequential([
      makeTask('t1', { name: 'Task 1' }),
      makeTask('t2', { name: 'Task 2' }),
    ]);

    const { events } = await collectEvents(engine.execute(workflow));

    const progressEvents = events.filter(e => e.type === 'task_progress');
    expect(progressEvents.length).toBe(2);

    const first = progressEvents[0] as Extract<AgentEvent, { type: 'task_progress' }>;
    expect(first.completedTasks).toBe(1);
    expect(first.totalTasks).toBe(2);
    expect(first.taskId).toBe('t1');
    expect(first.name).toBe('Task 1');
    expect(first.elapsedMs).toBeGreaterThanOrEqual(0);

    const second = progressEvents[1] as Extract<AgentEvent, { type: 'task_progress' }>;
    expect(second.completedTasks).toBe(2);
    expect(second.totalTasks).toBe(2);
    expect(second.taskId).toBe('t2');
  });

  it('should emit task_progress events for parallel workflows', async () => {
    const engine = new OrchestrationEngine(factory, config);
    const workflow = engine.parallel([
      makeTask('t1', { name: 'Task 1' }),
      makeTask('t2', { name: 'Task 2' }),
    ]);

    const { events } = await collectEvents(engine.execute(workflow));

    const progressEvents = events.filter(e => e.type === 'task_progress');
    expect(progressEvents.length).toBe(2);
  });

  it('should save checkpoints for sequential workflows', async () => {
    const saved: WorkflowCheckpoint[] = [];
    const handler: WorkflowCheckpointHandler = {
      save: async (cp) => { saved.push(structuredClone(cp)); },
      load: async () => undefined,
    };

    const engine = new OrchestrationEngine(factory, config, undefined, handler);
    const workflow = engine.sequential([
      makeTask('t1', { name: 'Task 1' }),
      makeTask('t2', { name: 'Task 2' }),
    ]);

    const { events } = await collectEvents(engine.execute(workflow));

    expect(saved.length).toBe(2);
    expect(saved[0].completedTaskIds).toEqual(['t1']);
    expect(saved[1].completedTaskIds).toEqual(['t1', 't2']);

    const checkpointEvents = events.filter(e => e.type === 'checkpoint_saved');
    expect(checkpointEvents.length).toBe(2);

    const firstCp = checkpointEvents[0] as Extract<AgentEvent, { type: 'checkpoint_saved' }>;
    expect(firstCp.completedTaskIds).toEqual(['t1']);
    expect(firstCp.savedAt).toBeGreaterThan(0);
  });

  it('should not emit checkpoint events when no handler is provided', async () => {
    const engine = new OrchestrationEngine(factory, config);
    const workflow = engine.sequential([
      makeTask('t1', { name: 'Task 1' }),
    ]);

    const { events } = await collectEvents(engine.execute(workflow));

    const checkpointEvents = events.filter(e => e.type === 'checkpoint_saved');
    expect(checkpointEvents.length).toBe(0);

    // But progress events should still be emitted
    const progressEvents = events.filter(e => e.type === 'task_progress');
    expect(progressEvents.length).toBe(1);
  });

  it('should include completed results in checkpoint data', async () => {
    const saved: WorkflowCheckpoint[] = [];
    const handler: WorkflowCheckpointHandler = {
      save: async (cp) => { saved.push(structuredClone(cp)); },
      load: async () => undefined,
    };

    const engine = new OrchestrationEngine(factory, config, undefined, handler);
    const workflow = engine.sequential([
      makeTask('t1', { name: 'Task 1' }),
      makeTask('t2', { name: 'Task 2' }),
    ]);

    await collectEvents(engine.execute(workflow));

    expect(saved[0].completedResults).toHaveLength(1);
    expect(saved[0].completedResults[0].taskId).toBe('t1');
    expect(saved[0].pattern).toBe('sequential');

    expect(saved[1].completedResults).toHaveLength(2);
    expect(saved[1].completedResults[1].taskId).toBe('t2');
  });
});
