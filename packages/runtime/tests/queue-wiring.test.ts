import { describe, it, expect, vi } from 'vitest';
import {
  createReActJobHandler,
  createWorkflowJobHandler,
  type QueuedReActPayload,
  type QueuedWorkflowPayload,
  type JobContextLike,
  type ReActLoopFactory,
  type OrchestrationFactory,
} from '../src/queue-wiring.js';

function makeJobContext(overrides: Partial<JobContextLike> = {}): JobContextLike {
  return {
    jobId: 'job-1',
    attempt: 1,
    signal: AbortSignal.timeout(30_000),
    checkpoint: vi.fn(),
    getCheckpoint: vi.fn(() => undefined),
    ...overrides,
  };
}

function makeReActPayload(overrides: Partial<QueuedReActPayload> = {}): QueuedReActPayload {
  return {
    goal: 'test goal',
    sessionId: 'session-1',
    ...overrides,
  };
}

const defaultLoopResult = {
  status: 'completed',
  steps: [{ thought: 'thinking' }],
  answer: 'done',
  totalTokens: 100,
  totalDurationMs: 500,
};

describe('createReActJobHandler', () => {
  it('returns a function', () => {
    const factory: ReActLoopFactory = () => ({ run: async () => defaultLoopResult });
    const handler = createReActJobHandler(factory);
    expect(typeof handler).toBe('function');
  });

  it('calls loopFactory with correct config', async () => {
    const factory = vi.fn<ReActLoopFactory>(() => ({
      run: async () => defaultLoopResult,
    }));
    const handler = createReActJobHandler(factory);
    const payload = makeReActPayload({ config: { maxSteps: 5 } });
    const ctx = makeJobContext();

    await handler(payload, ctx);

    expect(factory).toHaveBeenCalledOnce();
    const arg = factory.mock.calls[0][0];
    expect(arg.sessionId).toBe('session-1');
    expect(arg.maxSteps).toBe(5);
  });

  it('passes checkpoint handler to factory', async () => {
    const factory = vi.fn<ReActLoopFactory>(() => ({
      run: async () => defaultLoopResult,
    }));
    const handler = createReActJobHandler(factory);
    const ctx = makeJobContext();

    await handler(makeReActPayload(), ctx);

    const arg = factory.mock.calls[0][0];
    expect(arg.checkpointHandler).toBeDefined();
    expect(typeof arg.checkpointHandler!.save).toBe('function');
    expect(typeof arg.checkpointHandler!.load).toBe('function');

    // Verify save delegates to ctx.checkpoint
    await arg.checkpointHandler!.save({ step: 1 });
    expect(ctx.checkpoint).toHaveBeenCalledWith({ step: 1 });
  });

  it('resumes from checkpoint on retry (attempt > 1)', async () => {
    const savedCp = { step: 2, partial: true };
    const runFn = vi.fn(async () => defaultLoopResult);
    const factory: ReActLoopFactory = () => ({ run: runFn });
    const handler = createReActJobHandler(factory);
    const ctx = makeJobContext({
      attempt: 2,
      getCheckpoint: vi.fn(() => savedCp),
    });

    await handler(makeReActPayload(), ctx);

    expect(ctx.getCheckpoint).toHaveBeenCalled();
    expect(runFn).toHaveBeenCalledWith('test goal', savedCp);
  });

  it('does not resume from checkpoint on first attempt', async () => {
    const runFn = vi.fn(async () => defaultLoopResult);
    const factory: ReActLoopFactory = () => ({ run: runFn });
    const handler = createReActJobHandler(factory);
    const ctx = makeJobContext({ attempt: 1 });

    await handler(makeReActPayload(), ctx);

    expect(runFn).toHaveBeenCalledWith('test goal', undefined);
  });

  it('returns loop result', async () => {
    const factory: ReActLoopFactory = () => ({
      run: async () => defaultLoopResult,
    });
    const handler = createReActJobHandler(factory);

    const result = await handler(makeReActPayload(), makeJobContext());
    expect(result).toEqual(defaultLoopResult);
  });
});

async function* mockGenerator(events: unknown[], finalResult: unknown) {
  for (const event of events) {
    yield event;
  }
  return finalResult;
}

function makeWorkflowPayload(overrides: Partial<QueuedWorkflowPayload> = {}): QueuedWorkflowPayload {
  return {
    workflowId: 'wf-1',
    pattern: 'parallel',
    tasks: [
      {
        id: 'task-1',
        name: 'Summarize',
        provider: 'openai',
        systemPrompt: 'You are a summarizer.',
        userPrompt: 'Summarize this.',
      },
    ],
    ...overrides,
  };
}

describe('createWorkflowJobHandler', () => {
  it('returns a function', () => {
    const factory: OrchestrationFactory = () => ({
      execute: () => mockGenerator([], {}),
    });
    const handler = createWorkflowJobHandler(factory);
    expect(typeof handler).toBe('function');
  });

  it('calls engineFactory', async () => {
    const factory = vi.fn<OrchestrationFactory>(() => ({
      execute: () => mockGenerator([], { status: 'done' }),
    }));
    const handler = createWorkflowJobHandler(factory);

    await handler(makeWorkflowPayload(), makeJobContext());

    expect(factory).toHaveBeenCalledOnce();
  });

  it('consumes the async generator', async () => {
    const events = [
      { type: 'task_started', taskId: 'task-1' },
      { type: 'task_progress', taskId: 'task-1', progress: 50 },
      { type: 'agent_completed', taskId: 'task-1' },
    ];
    const finalResult = { status: 'completed', outputs: ['summary'] };

    const factory: OrchestrationFactory = () => ({
      execute: () => mockGenerator(events, finalResult),
    });
    const handler = createWorkflowJobHandler(factory);
    const result = await handler(makeWorkflowPayload(), makeJobContext());

    expect(result).toEqual(finalResult);
  });

  it('checkpoints on task_progress events', async () => {
    const events = [
      { type: 'task_started', taskId: 'task-1' },
      { type: 'task_progress', taskId: 'task-1', progress: 50 },
    ];

    const factory: OrchestrationFactory = () => ({
      execute: () => mockGenerator(events, {}),
    });
    const handler = createWorkflowJobHandler(factory);
    const ctx = makeJobContext();

    await handler(makeWorkflowPayload(), ctx);

    // Only task_progress should trigger checkpoint, not task_started
    expect(ctx.checkpoint).toHaveBeenCalledOnce();
    expect(ctx.checkpoint).toHaveBeenCalledWith({
      lastEvent: { type: 'task_progress', taskId: 'task-1', progress: 50 },
      workflowId: 'wf-1',
    });
  });

  it('checkpoints on agent_completed events', async () => {
    const events = [
      { type: 'agent_completed', taskId: 'task-1', output: 'result' },
    ];

    const factory: OrchestrationFactory = () => ({
      execute: () => mockGenerator(events, {}),
    });
    const handler = createWorkflowJobHandler(factory);
    const ctx = makeJobContext();

    await handler(makeWorkflowPayload(), ctx);

    expect(ctx.checkpoint).toHaveBeenCalledOnce();
    expect(ctx.checkpoint).toHaveBeenCalledWith({
      lastEvent: { type: 'agent_completed', taskId: 'task-1', output: 'result' },
      workflowId: 'wf-1',
    });
  });

  it('returns final result from generator', async () => {
    const finalResult = { status: 'completed', taskResults: [{ id: 'task-1', output: 'ok' }] };

    const factory: OrchestrationFactory = () => ({
      execute: () => mockGenerator([], finalResult),
    });
    const handler = createWorkflowJobHandler(factory);

    const result = await handler(makeWorkflowPayload(), makeJobContext());
    expect(result).toEqual(finalResult);
  });
});
