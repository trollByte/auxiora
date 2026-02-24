import { getLogger } from '@auxiora/logger';
import type { ReActCallbacks, ReActCheckpoint, ReActConfig, ReActResult, ReActStep, LoopStatus } from './types.js';
import { StepTracker } from './step-tracker.js';

const log = getLogger('react-loop');

const DEFAULT_MAX_STEPS = 10;
const DEFAULT_MAX_TOKEN_BUDGET = 50_000;
const DEFAULT_TIMEOUT_MS = 300_000;

export class ReActLoop {
  private status: LoopStatus = 'idle';
  private tracker = new StepTracker();
  private totalTokens = 0;
  private abortReason?: string;

  constructor(
    private readonly callbacks: ReActCallbacks,
    private readonly config?: ReActConfig,
  ) {}

  getStatus(): LoopStatus {
    return this.status;
  }

  getSteps(): ReActStep[] {
    return this.tracker.getSteps();
  }

  pause(): void {
    if (this.status === 'running') {
      this.status = 'paused';
    }
  }

  resume(): void {
    if (this.status === 'paused') {
      this.status = 'running';
    }
  }

  abort(reason?: string): void {
    this.abortReason = reason ?? 'aborted';
    this.status = 'failed';
  }

  async run(goal: string, resumeFrom?: ReActCheckpoint): Promise<ReActResult> {
    const sessionId = this.config?.sessionId ?? crypto.randomUUID();
    const maxSteps = this.config?.maxSteps ?? DEFAULT_MAX_STEPS;
    const maxTokenBudget = this.config?.maxTokenBudget ?? DEFAULT_MAX_TOKEN_BUDGET;
    const timeoutMs = this.config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();

    // Resume from explicit checkpoint
    if (resumeFrom) {
      for (const step of resumeFrom.steps) {
        this.tracker.addStep(step);
      }
      this.totalTokens = resumeFrom.totalTokens;
    } else if (this.config?.checkpointHandler && this.config.sessionId) {
      // Auto-load from handler
      const saved = await this.config.checkpointHandler.load(sessionId);
      if (saved) {
        for (const step of saved.steps) {
          this.tracker.addStep(step);
        }
        this.totalTokens = saved.totalTokens;
      }
    }

    this.status = 'running';
    log.info(`Starting ReAct loop for goal: ${goal}`);

    let stepCount = 0;

    try {
      while (this.status === 'running') {
        // Check step limit
        if (stepCount >= maxSteps) {
          this.status = 'max_steps_reached';
          break;
        }

        // Check timeout
        if (Date.now() - startTime > timeoutMs) {
          this.status = 'failed';
          return this.buildResult(startTime, 'Timeout exceeded');
        }

        // Check token budget
        if (this.totalTokens >= maxTokenBudget) {
          this.status = 'max_steps_reached';
          break;
        }

        // Wait if paused (pause() is called externally; cast defeats narrowing)
        while ((this.status as LoopStatus) === 'paused') {
          await sleep(50);
        }
        if (this.status !== 'running') {
          break;
        }

        // Think
        const thinkStart = Date.now();
        const thinkResult = await this.callbacks.think(goal, this.tracker.getSteps());
        const thinkDuration = Date.now() - thinkStart;

        // Record thought
        const thoughtStep: ReActStep = {
          type: 'thought',
          content: thinkResult.thought,
          timestamp: Date.now(),
          durationMs: thinkDuration,
        };
        this.tracker.addStep(thoughtStep);
        this.callbacks.onStep?.(thoughtStep);
        this.estimateAndTrack(thinkResult.thought);
        stepCount++;

        if (!(await this.checkpointAndValidate(thoughtStep, sessionId, goal))) {
          return this.buildResult(startTime, this.abortReason);
        }

        // Answer provided — done
        if (thinkResult.answer) {
          const answerStep: ReActStep = {
            type: 'answer',
            content: thinkResult.answer,
            timestamp: Date.now(),
          };
          this.tracker.addStep(answerStep);
          this.callbacks.onStep?.(answerStep);
          await this.checkpointAndValidate(answerStep, sessionId, goal);
          this.status = 'completed';
          return this.buildResult(startTime, undefined, thinkResult.answer);
        }

        // Action requested
        if (thinkResult.action) {
          const { tool, params } = thinkResult.action;

          // Check whitelist/blacklist
          if (!this.isToolAllowed(tool)) {
            const deniedStep: ReActStep = {
              type: 'observation',
              content: `Tool "${tool}" is not allowed by configuration.`,
              toolName: tool,
              timestamp: Date.now(),
            };
            this.tracker.addStep(deniedStep);
            this.callbacks.onStep?.(deniedStep);
            stepCount++;
            if (!(await this.checkpointAndValidate(deniedStep, sessionId, goal))) {
              return this.buildResult(startTime, this.abortReason);
            }
            continue;
          }

          // Record action step
          const actionStep: ReActStep = {
            type: 'action',
            content: `Calling ${tool}`,
            toolName: tool,
            toolParams: params,
            timestamp: Date.now(),
          };
          this.tracker.addStep(actionStep);
          this.callbacks.onStep?.(actionStep);
          stepCount++;

          if (!(await this.checkpointAndValidate(actionStep, sessionId, goal))) {
            return this.buildResult(startTime, this.abortReason);
          }

          // Check approval
          if (this.config?.requireApproval && this.callbacks.onApprovalNeeded) {
            const approved = await this.callbacks.onApprovalNeeded(actionStep);
            if (!approved) {
              const deniedStep: ReActStep = {
                type: 'observation',
                content: 'Action denied by approval callback.',
                toolName: tool,
                timestamp: Date.now(),
              };
              this.tracker.addStep(deniedStep);
              this.callbacks.onStep?.(deniedStep);
              stepCount++;
              if (!(await this.checkpointAndValidate(deniedStep, sessionId, goal))) {
                return this.buildResult(startTime, this.abortReason);
              }
              continue;
            }
          }

          // Execute tool
          const execStart = Date.now();
          const toolResult = await this.callbacks.executeTool(tool, params);
          const execDuration = Date.now() - execStart;

          const observationStep: ReActStep = {
            type: 'observation',
            content: toolResult,
            toolName: tool,
            toolResult,
            timestamp: Date.now(),
            durationMs: execDuration,
          };
          this.tracker.addStep(observationStep);
          this.callbacks.onStep?.(observationStep);
          this.estimateAndTrack(toolResult);
          stepCount++;

          if (!(await this.checkpointAndValidate(observationStep, sessionId, goal))) {
            return this.buildResult(startTime, this.abortReason);
          }
        }
      }
    } catch (err: unknown) {
      const wrapped: Error = err instanceof Error ? err : new Error(String(err));
      log.error('ReAct loop error', wrapped);
      this.status = 'failed';
      return this.buildResult(startTime, wrapped.message);
    }

    // Aborted
    if (this.abortReason) {
      return this.buildResult(startTime, this.abortReason);
    }

    return this.buildResult(startTime);
  }

  private async checkpointAndValidate(
    step: ReActStep,
    sessionId: string,
    goal: string,
  ): Promise<boolean> {
    // Save checkpoint
    if (this.config?.checkpointHandler) {
      await this.config.checkpointHandler.save({
        sessionId,
        goal,
        steps: this.tracker.getSteps(),
        totalTokens: this.totalTokens,
        status: this.status,
        savedAt: Date.now(),
      });
    }

    // Validate step
    if (this.config?.validateStep) {
      const validation = await this.config.validateStep(step, this.tracker.getSteps());
      if (!validation.valid) {
        if (validation.abort) {
          this.abort(validation.message ?? 'Step validation failed');
          return false;
        }
        // Log warning but continue
        this.callbacks.onStep?.({
          type: 'observation',
          content: `Validation warning: ${validation.message ?? 'step invalid'}`,
          timestamp: Date.now(),
        });
      }
    }
    return true;
  }

  private isToolAllowed(tool: string): boolean {
    const { allowedTools, deniedTools } = this.config ?? {};
    if (allowedTools && !allowedTools.includes(tool)) {
      return false;
    }
    if (deniedTools && deniedTools.includes(tool)) {
      return false;
    }
    return true;
  }

  private estimateAndTrack(text: string): void {
    const estimate = this.callbacks.estimateTokens
      ? this.callbacks.estimateTokens(text)
      : Math.ceil(text.length / 4);
    this.totalTokens += estimate;
  }

  private buildResult(startTime: number, error?: string, answer?: string): ReActResult {
    return {
      status: this.status,
      steps: this.tracker.getSteps(),
      answer,
      totalTokens: this.totalTokens,
      totalDurationMs: Date.now() - startTime,
      error,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
