import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import { getAuxioraDir } from '@auxiora/core';
import type {
  HumanWorkflow,
  WorkflowStep,
  WorkflowStatus,
  WorkflowEvent,
  ReminderConfig,
  EscalationPolicy,
  AutonomousAction,
} from './types.js';

const logger = getLogger('workflows:engine');

export interface CreateWorkflowOptions {
  name: string;
  description: string;
  createdBy: string;
  steps: Array<{
    name: string;
    description: string;
    assigneeId: string;
    dependsOn?: string[];
    action?: AutonomousAction;
  }>;
  reminder?: Partial<ReminderConfig>;
  escalation?: Partial<EscalationPolicy>;
  autonomous?: boolean;
}

const DEFAULT_REMINDER: ReminderConfig = {
  enabled: false,
  intervalMs: 3600_000, // 1 hour
  maxReminders: 3,
};

const DEFAULT_ESCALATION: EscalationPolicy = {
  enabled: false,
  escalateAfterMs: 86400_000, // 24 hours
  escalateToUserId: '',
  maxEscalations: 1,
};

export class WorkflowEngine {
  private filePath: string;

  constructor(options?: { dir?: string }) {
    const dir = options?.dir ?? path.join(getAuxioraDir(), 'workflows');
    this.filePath = path.join(dir, 'workflows.json');
  }

  async createWorkflow(options: CreateWorkflowOptions): Promise<HumanWorkflow> {
    const workflows = await this.readFile();
    const now = Date.now();
    const workflowId = `wf-${crypto.randomUUID().slice(0, 8)}`;

    const steps: WorkflowStep[] = options.steps.map((s, i) => ({
      id: `step-${i + 1}`,
      name: s.name,
      description: s.description,
      assigneeId: s.assigneeId,
      status: 'pending',
      dependsOn: s.dependsOn ?? [],
      ...(s.action ? { action: s.action } : {}),
    }));

    const workflow: HumanWorkflow = {
      id: workflowId,
      name: options.name,
      description: options.description,
      createdBy: options.createdBy,
      status: 'pending',
      steps,
      reminder: { ...DEFAULT_REMINDER, ...options.reminder },
      escalation: { ...DEFAULT_ESCALATION, ...options.escalation },
      events: [],
      createdAt: now,
      updatedAt: now,
      ...(options.autonomous ? { autonomous: true } : {}),
    };

    workflow.events.push(this.createEvent(workflowId, 'created', { userId: options.createdBy }));

    workflows.push(workflow);
    await this.writeFile(workflows);
    void audit('workflow.created', { id: workflowId, name: options.name });
    logger.debug('Created workflow', { id: workflowId });
    return workflow;
  }

  async startWorkflow(workflowId: string): Promise<HumanWorkflow | undefined> {
    const workflows = await this.readFile();
    const workflow = workflows.find(w => w.id === workflowId);
    if (!workflow || workflow.status !== 'pending') return undefined;

    workflow.status = 'active';
    workflow.updatedAt = Date.now();

    // Activate steps with no dependencies
    for (const step of workflow.steps) {
      if (step.dependsOn.length === 0) {
        step.status = 'active';
      }
    }

    await this.writeFile(workflows);
    void audit('workflow.started', { id: workflowId });
    return workflow;
  }

  async completeStep(
    workflowId: string,
    stepId: string,
    completedBy: string,
    result?: string,
  ): Promise<HumanWorkflow | undefined> {
    const workflows = await this.readFile();
    const workflow = workflows.find(w => w.id === workflowId);
    if (!workflow || workflow.status !== 'active') return undefined;

    const step = workflow.steps.find(s => s.id === stepId);
    if (!step || step.status !== 'active') return undefined;

    step.status = 'completed';
    step.completedAt = Date.now();
    step.completedBy = completedBy;
    step.result = result;

    workflow.events.push(
      this.createEvent(workflowId, 'step_completed', {
        stepId,
        userId: completedBy,
        details: result,
      }),
    );

    // Advance: activate any steps whose dependencies are now met
    this.advanceWorkflow(workflow);

    workflow.updatedAt = Date.now();
    await this.writeFile(workflows);
    void audit('workflow.step_completed', { workflowId, stepId, completedBy });
    return workflow;
  }

  async failStep(
    workflowId: string,
    stepId: string,
    reason: string,
  ): Promise<HumanWorkflow | undefined> {
    const workflows = await this.readFile();
    const workflow = workflows.find(w => w.id === workflowId);
    if (!workflow || workflow.status !== 'active') return undefined;

    const step = workflow.steps.find(s => s.id === stepId);
    if (!step || step.status !== 'active') return undefined;

    step.status = 'failed';
    workflow.events.push(
      this.createEvent(workflowId, 'step_failed', { stepId, details: reason }),
    );

    // Check if workflow should fail
    const hasActiveSteps = workflow.steps.some(s => s.status === 'active' || s.status === 'pending');
    if (!hasActiveSteps) {
      workflow.status = 'failed';
    }

    workflow.updatedAt = Date.now();
    await this.writeFile(workflows);
    return workflow;
  }

  async cancelWorkflow(workflowId: string): Promise<boolean> {
    const workflows = await this.readFile();
    const workflow = workflows.find(w => w.id === workflowId);
    if (!workflow || workflow.status === 'completed' || workflow.status === 'cancelled') return false;

    workflow.status = 'cancelled';
    workflow.updatedAt = Date.now();
    workflow.events.push(this.createEvent(workflowId, 'cancelled'));

    await this.writeFile(workflows);
    void audit('workflow.cancelled', { id: workflowId });
    return true;
  }

  async getWorkflow(workflowId: string): Promise<HumanWorkflow | undefined> {
    const workflows = await this.readFile();
    return workflows.find(w => w.id === workflowId);
  }

  async getStatus(workflowId: string): Promise<{ workflow: HumanWorkflow; progress: number } | undefined> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) return undefined;

    const completed = workflow.steps.filter(s => s.status === 'completed').length;
    const progress = workflow.steps.length > 0 ? completed / workflow.steps.length : 0;

    return { workflow, progress };
  }

  async listActive(): Promise<HumanWorkflow[]> {
    const workflows = await this.readFile();
    return workflows.filter(w => w.status === 'active' || w.status === 'pending');
  }

  async listAll(): Promise<HumanWorkflow[]> {
    return this.readFile();
  }

  async addEvent(
    workflowId: string,
    type: WorkflowEvent['type'],
    extra?: { stepId?: string; userId?: string; details?: string },
  ): Promise<boolean> {
    const workflows = await this.readFile();
    const workflow = workflows.find(w => w.id === workflowId);
    if (!workflow) return false;

    workflow.events.push(this.createEvent(workflowId, type, extra));
    workflow.updatedAt = Date.now();
    await this.writeFile(workflows);
    return true;
  }

  async listByUser(userId: string): Promise<HumanWorkflow[]> {
    const workflows = await this.readFile();
    return workflows.filter(
      w => w.createdBy === userId || w.steps.some(s => s.assigneeId === userId),
    );
  }

  private advanceWorkflow(workflow: HumanWorkflow): void {
    const completedIds = new Set(
      workflow.steps.filter(s => s.status === 'completed').map(s => s.id),
    );

    for (const step of workflow.steps) {
      if (step.status !== 'pending') continue;

      const depsComplete = step.dependsOn.every(dep => completedIds.has(dep));
      if (depsComplete) {
        step.status = 'active';
      }
    }

    // Check if all steps are completed
    const allDone = workflow.steps.every(
      s => s.status === 'completed' || s.status === 'skipped',
    );
    if (allDone) {
      workflow.status = 'completed';
      workflow.completedAt = Date.now();
      workflow.events.push(this.createEvent(workflow.id, 'completed'));
    }
  }

  private createEvent(
    workflowId: string,
    type: WorkflowEvent['type'],
    extra?: { stepId?: string; userId?: string; details?: string },
  ): WorkflowEvent {
    return {
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      workflowId,
      type,
      stepId: extra?.stepId,
      userId: extra?.userId,
      details: extra?.details,
      timestamp: Date.now(),
    };
  }

  private async readFile(): Promise<HumanWorkflow[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as HumanWorkflow[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeFile(workflows: HumanWorkflow[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(workflows, null, 2), 'utf-8');
  }
}
