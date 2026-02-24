import type { ProviderFactory } from '@auxiora/providers';
import type { OrchestrationConfig } from '@auxiora/config';
import type { Provider, ChatMessage, CompletionResult } from '@auxiora/providers';
import type {
  Workflow,
  AgentTask,
  AgentEvent,
  AgentResult,
  OrchestrationResult,
  OrchestrationPattern,
  WorkflowCheckpoint,
  WorkflowCheckpointHandler,
} from './types.js';

interface CostTrackerLike {
  record(record: {
    timestamp: number;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }): void;
}

class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;

  constructor(private limit: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

function generateId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export class OrchestrationEngine {
  private semaphore: Semaphore;

  constructor(
    private providerFactory: ProviderFactory,
    private config: OrchestrationConfig,
    private costTracker?: CostTrackerLike,
    private checkpointHandler?: WorkflowCheckpointHandler,
  ) {
    this.semaphore = new Semaphore(config.maxConcurrentAgents);
  }

  async *execute(workflow: Workflow): AsyncGenerator<AgentEvent, OrchestrationResult, unknown> {
    const startTime = Date.now();

    yield {
      type: 'workflow_started',
      workflowId: workflow.id,
      pattern: workflow.pattern,
      taskCount: workflow.tasks.length,
    };

    let agentResults: AgentResult[];
    let synthesis: string;

    switch (workflow.pattern) {
      case 'parallel':
        ({ agentResults, synthesis } = yield* this.runParallel(workflow));
        break;
      case 'sequential':
        ({ agentResults, synthesis } = yield* this.runSequential(workflow));
        break;
      case 'debate':
        ({ agentResults, synthesis } = yield* this.runDebate(workflow));
        break;
      case 'map-reduce':
        ({ agentResults, synthesis } = yield* this.runMapReduce(workflow));
        break;
      case 'supervisor':
        ({ agentResults, synthesis } = yield* this.runSupervisor(workflow));
        break;
      default:
        throw new Error(`Unknown pattern: ${workflow.pattern as string}`);
    }

    const totalUsage = agentResults.reduce(
      (acc, r) => ({
        inputTokens: acc.inputTokens + r.usage.inputTokens,
        outputTokens: acc.outputTokens + r.usage.outputTokens,
      }),
      { inputTokens: 0, outputTokens: 0 },
    );

    const totalCost = this.estimateCost(totalUsage.inputTokens, totalUsage.outputTokens);

    yield {
      type: 'workflow_completed',
      workflowId: workflow.id,
      finalResult: synthesis,
      totalUsage,
      totalCost,
    };

    return {
      workflowId: workflow.id,
      pattern: workflow.pattern,
      agentResults,
      synthesis,
      totalUsage,
      totalCost,
      totalDuration: Date.now() - startTime,
    };
  }

  parallel(tasks: AgentTask[], synthesisPrompt?: string): Workflow {
    return {
      id: generateId(),
      pattern: 'parallel',
      tasks,
      synthesisPrompt,
    };
  }

  sequential(tasks: AgentTask[]): Workflow {
    return {
      id: generateId(),
      pattern: 'sequential',
      tasks,
    };
  }

  debate(proposition: string, agents: [AgentTask, AgentTask], judgeTask: AgentTask): Workflow {
    const [pro, con] = agents;
    return {
      id: generateId(),
      pattern: 'debate',
      tasks: [
        { ...pro, userPrompt: `Argue IN FAVOR of: ${proposition}\n\n${pro.userPrompt}` },
        { ...con, userPrompt: `Argue AGAINST: ${proposition}\n\n${con.userPrompt}` },
        judgeTask,
      ],
      metadata: { proposition },
    };
  }

  mapReduce(
    items: string[],
    mapTask: Omit<AgentTask, 'userPrompt'>,
    reduceTask: Omit<AgentTask, 'userPrompt'>,
  ): Workflow {
    const mapTasks: AgentTask[] = items.map((item, i) => ({
      ...mapTask,
      id: `${mapTask.id}_map_${i}`,
      name: `${mapTask.name} [${i}]`,
      userPrompt: item,
    }));

    const reducer: AgentTask = {
      ...reduceTask,
      id: `${reduceTask.id}_reduce`,
      name: reduceTask.name,
      userPrompt: '', // will be filled with map results
      dependsOn: mapTasks.map((t) => t.id),
    };

    return {
      id: generateId(),
      pattern: 'map-reduce',
      tasks: [...mapTasks, reducer],
      metadata: { itemCount: items.length },
    };
  }

  supervisor(goal: string, workerTasks: AgentTask[]): Workflow {
    const supervisorTask: AgentTask = {
      id: 'supervisor',
      name: 'Supervisor',
      provider: workerTasks[0]?.provider ?? 'anthropic',
      systemPrompt: [
        'You are a supervisor agent. Your goal is to delegate work to available workers and synthesize their results.',
        'Available workers:',
        ...workerTasks.map((w) => `- ${w.name} (id: ${w.id}): ${w.systemPrompt}`),
        '',
        'Respond with a JSON array of worker IDs to delegate to. Example: ["worker1", "worker2"]',
      ].join('\n'),
      userPrompt: goal,
    };

    return {
      id: generateId(),
      pattern: 'supervisor',
      tasks: [supervisorTask, ...workerTasks],
      metadata: { goal },
    };
  }

  private async *runParallel(
    workflow: Workflow,
  ): AsyncGenerator<AgentEvent, { agentResults: AgentResult[]; synthesis: string }, unknown> {
    const results = yield* this.executeTasksConcurrently(workflow.id, workflow.tasks);

    let synthesis: string;
    if (workflow.synthesisPrompt) {
      yield { type: 'synthesis_started', workflowId: workflow.id };

      const combinedResults = results
        .map((r) => `### ${r.name}\n${r.content}`)
        .join('\n\n');

      const synthProvider = this.getProvider(workflow.synthesisProvider);
      const messages: ChatMessage[] = [
        { role: 'user', content: `${workflow.synthesisPrompt}\n\n${combinedResults}` },
      ];

      const synthResult = await this.callProvider(synthProvider, messages, {});
      synthesis = synthResult.content;

      yield { type: 'synthesis_chunk', workflowId: workflow.id, content: synthesis };
    } else {
      synthesis = results
        .map((r) => `### ${r.name}\n${r.content}`)
        .join('\n\n');
    }

    return { agentResults: results, synthesis };
  }

  private async *runSequential(
    workflow: Workflow,
  ): AsyncGenerator<AgentEvent, { agentResults: AgentResult[]; synthesis: string }, unknown> {
    const results: AgentResult[] = [];
    let previousOutput = '';
    const startTime = Date.now();

    for (const [index, task] of workflow.tasks.entries()) {
      const augmentedPrompt = previousOutput
        ? `Previous agent output:\n${previousOutput}\n\n${task.userPrompt}`
        : task.userPrompt;

      const result = yield* this.executeSingleTask(workflow.id, {
        ...task,
        userPrompt: augmentedPrompt,
      });

      results.push(result);
      previousOutput = result.content;

      // Emit progress
      yield {
        type: 'task_progress',
        workflowId: workflow.id,
        taskId: task.id,
        name: task.name,
        completedTasks: index + 1,
        totalTasks: workflow.tasks.length,
        elapsedMs: Date.now() - startTime,
      };

      // Save checkpoint
      if (this.checkpointHandler) {
        const checkpoint: WorkflowCheckpoint = {
          workflowId: workflow.id,
          pattern: workflow.pattern,
          completedTaskIds: results.map(r => r.taskId),
          completedResults: results,
          savedAt: Date.now(),
        };
        await this.checkpointHandler.save(checkpoint);
        yield {
          type: 'checkpoint_saved',
          workflowId: workflow.id,
          completedTaskIds: checkpoint.completedTaskIds,
          savedAt: checkpoint.savedAt,
        };
      }
    }

    const synthesis = results[results.length - 1]?.content ?? '';
    return { agentResults: results, synthesis };
  }

  private async *runDebate(
    workflow: Workflow,
  ): AsyncGenerator<AgentEvent, { agentResults: AgentResult[]; synthesis: string }, unknown> {
    const [proTask, conTask, judgeTask] = workflow.tasks;
    if (!proTask || !conTask || !judgeTask) {
      throw new Error('Debate pattern requires exactly 3 tasks: pro, con, judge');
    }

    // Run pro and con in parallel
    const debaterResults = yield* this.executeTasksConcurrently(workflow.id, [proTask, conTask]);

    const proResult = debaterResults.find((r) => r.taskId === proTask.id);
    const conResult = debaterResults.find((r) => r.taskId === conTask.id);

    // Run judge with both arguments
    const judgePrompt = [
      'Review the following arguments and provide a balanced synthesis:',
      '',
      '## Argument FOR:',
      proResult?.content ?? '(no argument)',
      '',
      '## Argument AGAINST:',
      conResult?.content ?? '(no argument)',
      '',
      judgeTask.userPrompt,
    ].join('\n');

    const judgeResult = yield* this.executeSingleTask(workflow.id, {
      ...judgeTask,
      systemPrompt: judgeTask.systemPrompt || 'You are an impartial judge. Review both arguments and provide a balanced synthesis.',
      userPrompt: judgePrompt,
    });

    const allResults = [...debaterResults, judgeResult];
    return { agentResults: allResults, synthesis: judgeResult.content };
  }

  private async *runMapReduce(
    workflow: Workflow,
  ): AsyncGenerator<AgentEvent, { agentResults: AgentResult[]; synthesis: string }, unknown> {
    // Separate map tasks from reduce task
    const reduceTasks = workflow.tasks.filter((t) => t.dependsOn && t.dependsOn.length > 0);
    const mapTasks = workflow.tasks.filter((t) => !t.dependsOn || t.dependsOn.length === 0);
    const reduceTask = reduceTasks[0];

    if (!reduceTask) {
      throw new Error('Map-reduce pattern requires at least one reduce task with dependsOn');
    }

    // Run all map tasks concurrently
    const mapResults = yield* this.executeTasksConcurrently(workflow.id, mapTasks);

    // Build reduce input from map results
    const reduceInput = mapResults
      .map((r, i) => `### Result ${i + 1} (${r.name})\n${r.content}`)
      .join('\n\n');

    yield { type: 'synthesis_started', workflowId: workflow.id };

    const reduceResult = yield* this.executeSingleTask(workflow.id, {
      ...reduceTask,
      userPrompt: `Combine and synthesize the following results:\n\n${reduceInput}`,
    });

    yield { type: 'synthesis_chunk', workflowId: workflow.id, content: reduceResult.content };

    const allResults = [...mapResults, reduceResult];
    return { agentResults: allResults, synthesis: reduceResult.content };
  }

  private async *runSupervisor(
    workflow: Workflow,
  ): AsyncGenerator<AgentEvent, { agentResults: AgentResult[]; synthesis: string }, unknown> {
    const [supervisorTask, ...workerTasks] = workflow.tasks;
    if (!supervisorTask) {
      throw new Error('Supervisor pattern requires at least a supervisor task');
    }

    // Step 1: Ask supervisor which workers to delegate to
    const delegationResult = yield* this.executeSingleTask(workflow.id, supervisorTask);

    // Parse worker IDs from supervisor response
    let delegatedIds: string[];
    try {
      const match = delegationResult.content.match(/\[.*\]/s);
      delegatedIds = match ? JSON.parse(match[0]) as string[] : [];
    } catch {
      delegatedIds = workerTasks.map((t) => t.id);
    }

    // Step 2: Execute delegated workers
    const selectedWorkers = workerTasks.filter((t) => delegatedIds.includes(t.id));
    const tasksToRun = selectedWorkers.length > 0 ? selectedWorkers : workerTasks;

    const workerResults = yield* this.executeTasksConcurrently(workflow.id, tasksToRun);

    // Step 3: Feed results back to supervisor for synthesis
    const workerOutput = workerResults
      .map((r) => `### ${r.name}\n${r.content}`)
      .join('\n\n');

    yield { type: 'synthesis_started', workflowId: workflow.id };

    const synthesisResult = yield* this.executeSingleTask(workflow.id, {
      ...supervisorTask,
      id: `${supervisorTask.id}_synthesis`,
      name: 'Supervisor (synthesis)',
      systemPrompt: 'You are a supervisor agent. Synthesize the worker results into a final comprehensive answer.',
      userPrompt: `Original goal: ${supervisorTask.userPrompt}\n\nWorker results:\n\n${workerOutput}`,
    });

    yield { type: 'synthesis_chunk', workflowId: workflow.id, content: synthesisResult.content };

    const allResults = [delegationResult, ...workerResults, synthesisResult];
    return { agentResults: allResults, synthesis: synthesisResult.content };
  }

  private async *executeTasksConcurrently(
    workflowId: string,
    tasks: AgentTask[],
  ): AsyncGenerator<AgentEvent, AgentResult[], unknown> {
    const results: AgentResult[] = [];
    const eventQueue: AgentEvent[] = [];
    let resolveWaiter: (() => void) | null = null;

    const pushEvent = (event: AgentEvent): void => {
      eventQueue.push(event);
      if (resolveWaiter) {
        const r = resolveWaiter;
        resolveWaiter = null;
        r();
      }
    };

    let completedCount = 0;
    const totalTasks = tasks.length;
    const concurrentStartTime = Date.now();

    const taskPromises = tasks.map(async (task) => {
      await this.semaphore.acquire();
      try {
        const result = await this.executeTaskInternal(workflowId, task, pushEvent);
        results.push(result);
        pushEvent({
          type: 'task_progress',
          workflowId,
          taskId: task.id,
          name: task.name,
          completedTasks: completedCount,
          totalTasks,
          elapsedMs: Date.now() - concurrentStartTime,
        });
      } finally {
        completedCount++;
        this.semaphore.release();
      }
    });

    const allDone = Promise.all(taskPromises);
    let settled = false;
    allDone.then(
      () => { settled = true; if (resolveWaiter) { const r = resolveWaiter; resolveWaiter = null; r(); } },
      () => { settled = true; if (resolveWaiter) { const r = resolveWaiter; resolveWaiter = null; r(); } },
    );

    while (!settled || eventQueue.length > 0) {
      if (eventQueue.length > 0) {
        yield eventQueue.shift()!;
      } else if (!settled) {
        await new Promise<void>((resolve) => { resolveWaiter = resolve; });
      }
    }

    await allDone;
    return results;
  }

  private async *executeSingleTask(
    workflowId: string,
    task: AgentTask,
  ): AsyncGenerator<AgentEvent, AgentResult, unknown> {
    yield {
      type: 'agent_started',
      workflowId,
      taskId: task.id,
      name: task.name,
      provider: task.provider,
      model: task.model,
    };

    const startTime = Date.now();

    try {
      const provider = this.getProvider(task.provider);
      const messages: ChatMessage[] = [
        { role: 'user', content: task.userPrompt },
      ];

      const completion = await this.callProviderWithTimeout(provider, messages, task);

      const result: AgentResult = {
        taskId: task.id,
        name: task.name,
        provider: task.provider,
        model: completion.model,
        content: completion.content,
        usage: completion.usage,
        duration: Date.now() - startTime,
      };

      this.recordCost(task.provider, completion);

      yield {
        type: 'agent_completed',
        workflowId,
        taskId: task.id,
        name: task.name,
        result: completion.content,
        usage: completion.usage,
      };

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      yield {
        type: 'agent_error',
        workflowId,
        taskId: task.id,
        name: task.name,
        error: errorMsg,
      };

      return {
        taskId: task.id,
        name: task.name,
        provider: task.provider,
        model: task.model ?? 'unknown',
        content: '',
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: Date.now() - startTime,
        error: errorMsg,
      };
    }
  }

  private async executeTaskInternal(
    workflowId: string,
    task: AgentTask,
    emit: (event: AgentEvent) => void,
  ): Promise<AgentResult> {
    emit({
      type: 'agent_started',
      workflowId,
      taskId: task.id,
      name: task.name,
      provider: task.provider,
      model: task.model,
    });

    const startTime = Date.now();

    try {
      const provider = this.getProvider(task.provider);
      const messages: ChatMessage[] = [
        { role: 'user', content: task.userPrompt },
      ];

      const completion = await this.callProviderWithTimeout(provider, messages, task);

      this.recordCost(task.provider, completion);

      emit({
        type: 'agent_completed',
        workflowId,
        taskId: task.id,
        name: task.name,
        result: completion.content,
        usage: completion.usage,
      });

      return {
        taskId: task.id,
        name: task.name,
        provider: task.provider,
        model: completion.model,
        content: completion.content,
        usage: completion.usage,
        duration: Date.now() - startTime,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      emit({
        type: 'agent_error',
        workflowId,
        taskId: task.id,
        name: task.name,
        error: errorMsg,
      });

      return {
        taskId: task.id,
        name: task.name,
        provider: task.provider,
        model: task.model ?? 'unknown',
        content: '',
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: Date.now() - startTime,
        error: errorMsg,
      };
    }
  }

  private getProvider(name?: string): Provider {
    return this.providerFactory.getProvider(name);
  }

  private async callProvider(
    provider: Provider,
    messages: ChatMessage[],
    taskOptions: Partial<AgentTask>,
  ): Promise<CompletionResult> {
    return provider.complete(messages, {
      systemPrompt: taskOptions.systemPrompt,
      maxTokens: taskOptions.maxTokens,
      temperature: taskOptions.temperature,
    });
  }

  private async callProviderWithTimeout(
    provider: Provider,
    messages: ChatMessage[],
    task: AgentTask,
  ): Promise<CompletionResult> {
    const timeout = task.timeout ?? this.config.defaultTimeout;
    const completionPromise = this.callProvider(provider, messages, task);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Agent "${task.name}" timed out after ${timeout}ms`)), timeout);
    });

    return Promise.race([completionPromise, timeoutPromise]);
  }

  private recordCost(providerName: string, result: CompletionResult): void {
    if (!this.costTracker) return;
    this.costTracker.record({
      timestamp: Date.now(),
      provider: providerName,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cost: this.estimateCost(result.usage.inputTokens, result.usage.outputTokens),
    });
  }

  private estimateCost(inputTokens: number, outputTokens: number): number {
    // Simple cost estimation: $3/M input, $15/M output (Claude-class pricing)
    return (inputTokens * 3 + outputTokens * 15) / 1_000_000;
  }
}
