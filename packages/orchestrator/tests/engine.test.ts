import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrchestrationEngine } from '../src/engine.js';
import type { AgentEvent, AgentTask, OrchestrationResult, Workflow } from '../src/types.js';
import type { OrchestrationConfig } from '@auxiora/config';
import type { Provider, CompletionResult, ProviderMetadata } from '@auxiora/providers';
import { ProviderFactory } from '@auxiora/providers';

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

function makeMockProvider(name: string, responseMap?: Map<string, string>): Provider {
  const defaultResponse = `Response from ${name}`;
  return {
    name,
    metadata: {
      name,
      displayName: name,
      models: {},
      isAvailable: async () => true,
    } as ProviderMetadata,
    complete: vi.fn(async (messages, _options) => {
      const userMsg = messages.find((m) => m.role === 'user');
      const key = userMsg?.content ?? '';
      const response = responseMap?.get(key) ?? defaultResponse;
      return makeCompletionResult(response, `${name}-model`);
    }),
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

describe('OrchestrationEngine', () => {
  let mockProvider: Provider;
  let factory: ProviderFactory;
  let config: OrchestrationConfig;

  beforeEach(() => {
    mockProvider = makeMockProvider('test');
    factory = makeMockFactory(new Map([['test', mockProvider]]));
    config = makeConfig();
  });

  describe('parallel pattern', () => {
    it('should execute all agents concurrently and return results', async () => {
      const engine = new OrchestrationEngine(factory, config);
      const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
      const workflow = engine.parallel(tasks, 'Synthesize all results');

      const { events, result } = await collectEvents(engine.execute(workflow));

      expect(events.find((e) => e.type === 'workflow_started')).toBeDefined();
      expect(events.filter((e) => e.type === 'agent_started')).toHaveLength(3);
      expect(events.filter((e) => e.type === 'agent_completed')).toHaveLength(3);
      expect(events.find((e) => e.type === 'synthesis_started')).toBeDefined();
      expect(events.find((e) => e.type === 'workflow_completed')).toBeDefined();

      expect(result.agentResults).toHaveLength(3);
      expect(result.synthesis).toBeTruthy();
      expect(result.totalUsage.inputTokens).toBeGreaterThan(0);
    });

    it('should concatenate results when no synthesis prompt given', async () => {
      const engine = new OrchestrationEngine(factory, config);
      const tasks = [makeTask('a'), makeTask('b')];
      const workflow = engine.parallel(tasks);

      const { result } = await collectEvents(engine.execute(workflow));

      expect(result.synthesis).toContain('Agent a');
      expect(result.synthesis).toContain('Agent b');
    });
  });

  describe('sequential pattern', () => {
    it('should chain agent outputs through sequential tasks', async () => {
      const completeFn = vi.fn()
        .mockResolvedValueOnce(makeCompletionResult('Step 1 result'))
        .mockResolvedValueOnce(makeCompletionResult('Step 2 result'))
        .mockResolvedValueOnce(makeCompletionResult('Step 3 final'));

      const seqProvider: Provider = {
        ...mockProvider,
        complete: completeFn,
      };
      const seqFactory = makeMockFactory(new Map([['test', seqProvider]]));

      const engine = new OrchestrationEngine(seqFactory, config);
      const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
      const workflow = engine.sequential(tasks);

      const { events, result } = await collectEvents(engine.execute(workflow));

      expect(events.filter((e) => e.type === 'agent_started')).toHaveLength(3);
      expect(events.filter((e) => e.type === 'agent_completed')).toHaveLength(3);

      // Verify chaining: second call should include first result
      const secondCallMessages = completeFn.mock.calls[1][0];
      expect(secondCallMessages[0].content).toContain('Step 1 result');

      // Third call includes second result
      const thirdCallMessages = completeFn.mock.calls[2][0];
      expect(thirdCallMessages[0].content).toContain('Step 2 result');

      expect(result.synthesis).toBe('Step 3 final');
      expect(result.agentResults).toHaveLength(3);
    });
  });

  describe('debate pattern', () => {
    it('should run pro/con in parallel then judge', async () => {
      const completeFn = vi.fn()
        .mockResolvedValueOnce(makeCompletionResult('Pro argument'))
        .mockResolvedValueOnce(makeCompletionResult('Con argument'))
        .mockResolvedValueOnce(makeCompletionResult('Judge verdict: balanced view'));

      const debateProvider: Provider = {
        ...mockProvider,
        complete: completeFn,
      };
      const debateFactory = makeMockFactory(new Map([['test', debateProvider]]));

      const engine = new OrchestrationEngine(debateFactory, config);
      const pro = makeTask('pro', { name: 'Pro Agent' });
      const con = makeTask('con', { name: 'Con Agent' });
      const judge = makeTask('judge', { name: 'Judge', userPrompt: 'Decide the winner' });

      const workflow = engine.debate('AI is good for humanity', [pro, con], judge);

      const { events, result } = await collectEvents(engine.execute(workflow));

      expect(events.filter((e) => e.type === 'agent_started')).toHaveLength(3);
      expect(events.filter((e) => e.type === 'agent_completed')).toHaveLength(3);

      // Judge should see both arguments
      const judgeCall = completeFn.mock.calls[2][0];
      expect(judgeCall[0].content).toContain('Pro argument');
      expect(judgeCall[0].content).toContain('Con argument');

      expect(result.synthesis).toBe('Judge verdict: balanced view');
      expect(result.agentResults).toHaveLength(3);
    });
  });

  describe('map-reduce pattern', () => {
    it('should map items then reduce results', async () => {
      const completeFn = vi.fn()
        .mockResolvedValueOnce(makeCompletionResult('Summary of doc 1'))
        .mockResolvedValueOnce(makeCompletionResult('Summary of doc 2'))
        .mockResolvedValueOnce(makeCompletionResult('Summary of doc 3'))
        .mockResolvedValueOnce(makeCompletionResult('Combined summary of all docs'));

      const mrProvider: Provider = {
        ...mockProvider,
        complete: completeFn,
      };
      const mrFactory = makeMockFactory(new Map([['test', mrProvider]]));

      const engine = new OrchestrationEngine(mrFactory, config);
      const workflow = engine.mapReduce(
        ['Document 1 content', 'Document 2 content', 'Document 3 content'],
        { id: 'mapper', name: 'Summarizer', provider: 'test', systemPrompt: 'Summarize the document' },
        { id: 'reducer', name: 'Combiner', provider: 'test', systemPrompt: 'Combine summaries' },
      );

      const { events, result } = await collectEvents(engine.execute(workflow));

      // 3 map agents + 1 reduce agent
      expect(events.filter((e) => e.type === 'agent_started')).toHaveLength(4);
      expect(events.filter((e) => e.type === 'agent_completed')).toHaveLength(4);
      expect(events.find((e) => e.type === 'synthesis_started')).toBeDefined();

      expect(result.synthesis).toBe('Combined summary of all docs');
      expect(result.agentResults).toHaveLength(4);
    });
  });

  describe('supervisor pattern', () => {
    it('should delegate to workers then synthesize', async () => {
      const completeFn = vi.fn()
        // Supervisor delegation
        .mockResolvedValueOnce(makeCompletionResult('I will delegate to workers: ["worker1", "worker2"]'))
        // Workers
        .mockResolvedValueOnce(makeCompletionResult('Worker 1 result'))
        .mockResolvedValueOnce(makeCompletionResult('Worker 2 result'))
        // Supervisor synthesis
        .mockResolvedValueOnce(makeCompletionResult('Final synthesized answer'));

      const supProvider: Provider = {
        ...mockProvider,
        complete: completeFn,
      };
      const supFactory = makeMockFactory(new Map([['test', supProvider]]));

      const engine = new OrchestrationEngine(supFactory, config);
      const workers = [
        makeTask('worker1', { name: 'Researcher' }),
        makeTask('worker2', { name: 'Analyst' }),
      ];

      const workflow = engine.supervisor('Analyze the market', workers);

      const { events, result } = await collectEvents(engine.execute(workflow));

      // Supervisor delegation + 2 workers + supervisor synthesis
      expect(events.filter((e) => e.type === 'agent_started')).toHaveLength(4);
      expect(result.synthesis).toBe('Final synthesized answer');
    });
  });

  describe('timeout handling', () => {
    it('should timeout agents that take too long', async () => {
      const slowProvider: Provider = {
        ...mockProvider,
        complete: vi.fn(() => new Promise((resolve) => {
          setTimeout(() => resolve(makeCompletionResult('late')), 5000);
        })),
      };
      const slowFactory = makeMockFactory(new Map([['test', slowProvider]]));

      const engine = new OrchestrationEngine(slowFactory, makeConfig({ defaultTimeout: 50 }));
      const workflow = engine.parallel([makeTask('slow')]);

      const { events, result } = await collectEvents(engine.execute(workflow));

      const errorEvent = events.find((e) => e.type === 'agent_error');
      expect(errorEvent).toBeDefined();
      if (errorEvent && errorEvent.type === 'agent_error') {
        expect(errorEvent.error).toContain('timed out');
      }
      expect(result.agentResults[0]?.error).toContain('timed out');
    });
  });

  describe('error handling', () => {
    it('should handle agent errors without aborting workflow', async () => {
      const completeFn = vi.fn()
        .mockResolvedValueOnce(makeCompletionResult('Success from A'))
        .mockRejectedValueOnce(new Error('Provider unavailable'))
        .mockResolvedValueOnce(makeCompletionResult('Success from C'));

      const errProvider: Provider = {
        ...mockProvider,
        complete: completeFn,
      };
      const errFactory = makeMockFactory(new Map([['test', errProvider]]));

      const engine = new OrchestrationEngine(errFactory, config);
      const workflow = engine.parallel([makeTask('a'), makeTask('b'), makeTask('c')]);

      const { events, result } = await collectEvents(engine.execute(workflow));

      const errorEvents = events.filter((e) => e.type === 'agent_error');
      expect(errorEvents).toHaveLength(1);

      const completedEvents = events.filter((e) => e.type === 'agent_completed');
      expect(completedEvents).toHaveLength(2);

      // Workflow still completes
      expect(events.find((e) => e.type === 'workflow_completed')).toBeDefined();
      expect(result.agentResults).toHaveLength(3);

      const errorResult = result.agentResults.find((r) => r.error);
      expect(errorResult?.error).toContain('Provider unavailable');
    });
  });

  describe('concurrency limit', () => {
    it('should respect maxConcurrentAgents', async () => {
      let activeCalls = 0;
      let peakConcurrency = 0;

      const concProvider: Provider = {
        ...mockProvider,
        complete: vi.fn(async () => {
          activeCalls++;
          peakConcurrency = Math.max(peakConcurrency, activeCalls);
          await new Promise((r) => setTimeout(r, 50));
          activeCalls--;
          return makeCompletionResult('done');
        }),
      };
      const concFactory = makeMockFactory(new Map([['test', concProvider]]));

      const engine = new OrchestrationEngine(concFactory, makeConfig({ maxConcurrentAgents: 2 }));
      const tasks = Array.from({ length: 5 }, (_, i) => makeTask(`task${i}`));
      const workflow = engine.parallel(tasks);

      await collectEvents(engine.execute(workflow));

      expect(peakConcurrency).toBeLessThanOrEqual(2);
    });
  });

  describe('cost tracking', () => {
    it('should record costs to cost tracker', async () => {
      const mockTracker = { record: vi.fn() };
      const engine = new OrchestrationEngine(factory, config, mockTracker);
      const workflow = engine.parallel([makeTask('a')]);

      await collectEvents(engine.execute(workflow));

      expect(mockTracker.record).toHaveBeenCalled();
      const recorded = mockTracker.record.mock.calls[0][0];
      expect(recorded.provider).toBe('test');
      expect(recorded.inputTokens).toBe(100);
      expect(recorded.outputTokens).toBe(50);
      expect(recorded.cost).toBeGreaterThan(0);
    });
  });
});
