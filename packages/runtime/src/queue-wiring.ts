import { getLogger } from '@auxiora/logger';

const logger = getLogger('runtime:queue-wiring');

/** Payload for a queued ReAct job */
export interface QueuedReActPayload {
  goal: string;
  sessionId: string;
  config?: {
    maxSteps?: number;
    maxTokenBudget?: number;
    timeoutMs?: number;
    allowedTools?: string[];
    deniedTools?: string[];
  };
}

/** Payload for a queued orchestration job */
export interface QueuedWorkflowPayload {
  workflowId: string;
  pattern: string;
  tasks: Array<{
    id: string;
    name: string;
    provider: string;
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    timeout?: number;
  }>;
  synthesisPrompt?: string;
}

/** Structural type for JobContext (avoids direct import) */
export interface JobContextLike {
  jobId: string;
  attempt: number;
  signal: AbortSignal;
  checkpoint: (data: unknown) => void;
  getCheckpoint: <T = unknown>() => T | undefined;
}

/** Structural type for ReActLoop (avoids direct import) */
export interface ReActLoopLike {
  run(goal: string, resumeFrom?: unknown): Promise<{
    status: string;
    steps: unknown[];
    answer?: string;
    totalTokens: number;
    totalDurationMs: number;
    error?: string;
  }>;
}

/** Factory function type for creating ReActLoop instances */
export type ReActLoopFactory = (config: QueuedReActPayload['config'] & {
  sessionId: string;
  checkpointHandler?: {
    save: (cp: unknown) => Promise<void>;
    load: (id: string) => Promise<unknown | undefined>;
  };
}) => ReActLoopLike;

/**
 * Create a job handler for ReAct loops.
 * The handler checkpoints after each step for crash recovery.
 */
export function createReActJobHandler(
  loopFactory: ReActLoopFactory,
): (payload: QueuedReActPayload, ctx: JobContextLike) => Promise<unknown> {
  return async (payload: QueuedReActPayload, ctx: JobContextLike) => {
    logger.info('Starting queued ReAct job', { jobId: ctx.jobId, goal: payload.goal, attempt: ctx.attempt });

    // Create checkpoint handler that bridges to job queue
    const checkpointHandler = {
      save: async (cp: unknown) => {
        ctx.checkpoint(cp);
      },
      load: async (_id: string) => {
        return ctx.getCheckpoint<unknown>();
      },
    };

    // Resume from checkpoint if this is a retry
    const savedCheckpoint = ctx.attempt > 1 ? ctx.getCheckpoint<unknown>() : undefined;

    const loop = loopFactory({
      ...payload.config,
      sessionId: payload.sessionId,
      checkpointHandler,
    });

    const result = await loop.run(payload.goal, savedCheckpoint);

    logger.info('ReAct job completed', {
      jobId: ctx.jobId,
      status: result.status,
      steps: result.steps.length,
      tokens: result.totalTokens,
    });

    return result;
  };
}

/** Structural type for orchestration engine */
export interface OrchestrationEngineLike {
  execute(workflow: unknown): AsyncGenerator<unknown, unknown, unknown>;
}

/** Factory for creating orchestration engine instances */
export type OrchestrationFactory = () => OrchestrationEngineLike;

/**
 * Create a job handler for orchestration workflows.
 * The handler checkpoints after each task completion.
 */
export function createWorkflowJobHandler(
  engineFactory: OrchestrationFactory,
): (payload: QueuedWorkflowPayload, ctx: JobContextLike) => Promise<unknown> {
  return async (payload: QueuedWorkflowPayload, ctx: JobContextLike) => {
    logger.info('Starting queued workflow job', { jobId: ctx.jobId, workflowId: payload.workflowId, attempt: ctx.attempt });

    const engine = engineFactory();
    const workflow = {
      id: payload.workflowId,
      pattern: payload.pattern,
      tasks: payload.tasks,
      synthesisPrompt: payload.synthesisPrompt,
    };

    // Consume the async generator
    const generator = engine.execute(workflow);
    let lastEvent: unknown;
    let result: unknown;

    while (true) {
      const next = await generator.next();
      if (next.done) {
        result = next.value;
        break;
      }
      lastEvent = next.value;

      // Checkpoint progress events
      const event = lastEvent as Record<string, unknown>;
      if (event && (event.type === 'task_progress' || event.type === 'agent_completed')) {
        ctx.checkpoint({ lastEvent: event, workflowId: payload.workflowId });
      }
    }

    logger.info('Workflow job completed', { jobId: ctx.jobId, workflowId: payload.workflowId });
    return result;
  };
}
