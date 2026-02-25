import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import type { WorkflowEngine } from './engine.js';
import type { HumanWorkflow, WorkflowStep } from './types.js';

const logger = getLogger('workflows:autonomous');

/** Result of executing a tool. */
export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

/** Trust gate check result. */
export interface GateCheckResult {
  allowed: boolean;
  message: string;
}

/** Audit entry for recording autonomous actions. */
export interface AuditEntry {
  trustLevel: number;
  domain: string;
  intent: string;
  plan: string;
  executed: boolean;
  outcome: 'success' | 'failure' | 'pending' | 'rolled_back';
  reasoning: string;
  rollbackAvailable: boolean;
}

/** Result of a single tick. */
export interface TickResult {
  workflowsProcessed: number;
  stepsExecuted: number;
  stepsSkipped: number;
  stepsFailed: number;
  workflowsCompleted: number;
}

/** Dependencies for the AutonomousExecutor (injected). */
export interface AutonomousExecutorDeps {
  workflowEngine: WorkflowEngine;
  trustGate: {
    gate(domain: string, action: string, requiredLevel: number): GateCheckResult;
  };
  trustEngine: {
    recordOutcome(domain: string, success: boolean): void;
  };
  auditTrail: {
    record(entry: AuditEntry): Promise<{ id: string }>;
    markRolledBack(id: string): Promise<boolean>;
  };
  executeTool: (name: string, params: Record<string, unknown>) => Promise<ToolResult>;
  onStepCompleted?: (workflowId: string, stepId: string, result: string) => void;
  onStepFailed?: (workflowId: string, stepId: string, error: string) => void;
  onWorkflowCompleted?: (workflowId: string) => void;
}

/**
 * Executes autonomous workflow steps in the background.
 *
 * Runs on a timer, checking active workflows for steps that have an
 * `action` field and auto-executing them through the trust-gated
 * tool pipeline with full audit trail recording.
 */
export class AutonomousExecutor {
  private readonly deps: AutonomousExecutorDeps;
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private ticking = false;

  constructor(deps: AutonomousExecutorDeps) {
    this.deps = deps;
  }

  /** Start the background execution loop. */
  start(intervalMs = 30_000): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    logger.debug('Autonomous executor started', { intervalMs });
  }

  /** Stop the background execution loop. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.running = false;
    logger.debug('Autonomous executor stopped');
  }

  /** Whether the executor is running. */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Advance all active autonomous workflows one tick.
   * Processes each active step with an action through the trust-gated pipeline.
   */
  async tick(): Promise<TickResult> {
    // Prevent concurrent ticks
    if (this.ticking) {
      return { workflowsProcessed: 0, stepsExecuted: 0, stepsSkipped: 0, stepsFailed: 0, workflowsCompleted: 0 };
    }

    this.ticking = true;
    const result: TickResult = {
      workflowsProcessed: 0,
      stepsExecuted: 0,
      stepsSkipped: 0,
      stepsFailed: 0,
      workflowsCompleted: 0,
    };

    try {
      const activeWorkflows = await this.deps.workflowEngine.listActive();
      const autonomousWorkflows = activeWorkflows.filter(
        (w) => w.autonomous && w.status === 'active',
      );

      for (const workflow of autonomousWorkflows) {
        result.workflowsProcessed++;
        await this.processWorkflow(workflow, result);
      }
    } catch (error) {
      logger.error('Tick failed', error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.ticking = false;
    }

    return result;
  }

  private async processWorkflow(workflow: HumanWorkflow, result: TickResult): Promise<void> {
    const readySteps = workflow.steps.filter(
      (s) => s.status === 'active' && s.action,
    );

    for (const step of readySteps) {
      await this.executeStep(workflow, step, result);
    }

    // Check if workflow completed after executing steps
    const updated = await this.deps.workflowEngine.getWorkflow(workflow.id);
    if (updated?.status === 'completed') {
      result.workflowsCompleted++;
      this.deps.onWorkflowCompleted?.(workflow.id);
      void audit('workflow.autonomous_completed', { id: workflow.id, name: workflow.name });
    }
  }

  private async executeStep(
    workflow: HumanWorkflow,
    step: WorkflowStep,
    result: TickResult,
  ): Promise<void> {
    const action = step.action!;

    // 1. Trust gate check
    const gateResult = this.deps.trustGate.gate(
      action.trustDomain,
      action.tool,
      action.trustRequired,
    );

    if (!gateResult.allowed) {
      result.stepsSkipped++;
      logger.debug('Step trust-denied', {
        workflowId: workflow.id,
        stepId: step.id,
        tool: action.tool,
        reason: gateResult.message,
      });

      // Record as event but don't fail — trust level may increase later
      await this.deps.workflowEngine.addEvent(workflow.id, 'step_trust_denied', {
        stepId: step.id,
        details: gateResult.message,
      });
      return;
    }

    // 2. Record audit entry (pending)
    const auditEntry = await this.deps.auditTrail.record({
      trustLevel: action.trustRequired,
      domain: action.trustDomain,
      intent: `Execute ${action.tool} for workflow step "${step.name}"`,
      plan: `tool=${action.tool} params=${JSON.stringify(action.params)}`,
      executed: true,
      outcome: 'pending',
      reasoning: `Autonomous workflow "${workflow.name}" step "${step.name}"`,
      rollbackAvailable: !!action.rollbackTool,
    });

    // 3. Execute tool
    try {
      const toolResult = await this.deps.executeTool(action.tool, action.params);

      if (toolResult.success) {
        // 4a. Success — record outcome and mark complete
        this.deps.trustEngine.recordOutcome(action.trustDomain, true);
        await this.deps.auditTrail.record({
          ...this.auditBase(action, workflow, step),
          outcome: 'success',
          executed: true,
        });

        const resultText = toolResult.output ?? 'Success';
        await this.deps.workflowEngine.completeStep(
          workflow.id,
          step.id,
          'autonomous-executor',
          resultText,
        );
        result.stepsExecuted++;
        this.deps.onStepCompleted?.(workflow.id, step.id, resultText);

        void audit('workflow.step_auto_executed', {
          workflowId: workflow.id,
          stepId: step.id,
          tool: action.tool,
          success: true,
        });
      } else {
        // 4b. Tool returned failure
        await this.handleStepFailure(
          workflow,
          step,
          action,
          auditEntry.id,
          toolResult.error ?? 'Tool execution failed',
          result,
        );
      }
    } catch (error) {
      // 4c. Tool threw an exception
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.handleStepFailure(
        workflow,
        step,
        action,
        auditEntry.id,
        errorMessage,
        result,
      );
    }
  }

  private async handleStepFailure(
    workflow: HumanWorkflow,
    step: WorkflowStep,
    action: NonNullable<WorkflowStep['action']>,
    auditEntryId: string,
    errorMessage: string,
    result: TickResult,
  ): Promise<void> {
    // Record trust failure
    this.deps.trustEngine.recordOutcome(action.trustDomain, false);

    // Attempt rollback if available
    if (action.rollbackTool) {
      try {
        await this.deps.executeTool(action.rollbackTool, action.rollbackParams ?? {});
        await this.deps.auditTrail.markRolledBack(auditEntryId);
        logger.debug('Rollback succeeded', {
          workflowId: workflow.id,
          stepId: step.id,
          rollbackTool: action.rollbackTool,
        });
      } catch (rollbackError) {
        logger.error('Rollback failed', rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)));
      }
    }

    // Mark step as failed
    await this.deps.workflowEngine.failStep(workflow.id, step.id, errorMessage);
    result.stepsFailed++;
    this.deps.onStepFailed?.(workflow.id, step.id, errorMessage);

    void audit('workflow.step_auto_executed', {
      workflowId: workflow.id,
      stepId: step.id,
      tool: action.tool,
      success: false,
      error: errorMessage,
    });
  }

  private auditBase(
    action: NonNullable<WorkflowStep['action']>,
    workflow: HumanWorkflow,
    step: WorkflowStep,
  ): AuditEntry {
    return {
      trustLevel: action.trustRequired,
      domain: action.trustDomain,
      intent: `Execute ${action.tool} for workflow step "${step.name}"`,
      plan: `tool=${action.tool} params=${JSON.stringify(action.params)}`,
      executed: true,
      outcome: 'pending',
      reasoning: `Autonomous workflow "${workflow.name}" step "${step.name}"`,
      rollbackAvailable: !!action.rollbackTool,
    };
  }
}
