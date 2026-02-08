import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorkflowEngine } from '../src/engine.js';
import { ApprovalManager } from '../src/approval.js';
import { ReminderService } from '../src/reminder.js';

describe('WorkflowEngine', () => {
  let tmpDir: string;
  let engine: WorkflowEngine;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflows-'));
    engine = new WorkflowEngine({ dir: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should create a workflow', async () => {
    const workflow = await engine.createWorkflow({
      name: 'Deploy Feature',
      description: 'Deploy the new feature to production',
      createdBy: 'user-alice',
      steps: [
        { name: 'Code Review', description: 'Review the code', assigneeId: 'user-bob' },
        { name: 'QA Test', description: 'Run QA tests', assigneeId: 'user-charlie', dependsOn: ['step-1'] },
        { name: 'Deploy', description: 'Deploy to prod', assigneeId: 'user-alice', dependsOn: ['step-2'] },
      ],
    });

    expect(workflow.id).toMatch(/^wf-/);
    expect(workflow.status).toBe('pending');
    expect(workflow.steps).toHaveLength(3);
    expect(workflow.events).toHaveLength(1);
    expect(workflow.events[0].type).toBe('created');
  });

  it('should start a workflow and activate first steps', async () => {
    const created = await engine.createWorkflow({
      name: 'Test',
      description: 'Test workflow',
      createdBy: 'user-alice',
      steps: [
        { name: 'Step 1', description: 'First', assigneeId: 'user-bob' },
        { name: 'Step 2', description: 'Second', assigneeId: 'user-charlie', dependsOn: ['step-1'] },
      ],
    });

    const started = await engine.startWorkflow(created.id);
    expect(started).toBeDefined();
    expect(started!.status).toBe('active');
    expect(started!.steps[0].status).toBe('active');
    expect(started!.steps[1].status).toBe('pending');
  });

  it('should complete a step and advance dependencies', async () => {
    const created = await engine.createWorkflow({
      name: 'Sequential',
      description: 'Sequential workflow',
      createdBy: 'user-alice',
      steps: [
        { name: 'Step 1', description: 'First', assigneeId: 'user-bob' },
        { name: 'Step 2', description: 'Second', assigneeId: 'user-charlie', dependsOn: ['step-1'] },
      ],
    });

    await engine.startWorkflow(created.id);
    const updated = await engine.completeStep(created.id, 'step-1', 'user-bob', 'Looks good');

    expect(updated).toBeDefined();
    expect(updated!.steps[0].status).toBe('completed');
    expect(updated!.steps[0].completedBy).toBe('user-bob');
    expect(updated!.steps[1].status).toBe('active'); // Advanced!
  });

  it('should complete workflow when all steps done', async () => {
    const created = await engine.createWorkflow({
      name: 'Simple',
      description: 'Simple workflow',
      createdBy: 'user-alice',
      steps: [
        { name: 'Only Step', description: 'The only step', assigneeId: 'user-bob' },
      ],
    });

    await engine.startWorkflow(created.id);
    const updated = await engine.completeStep(created.id, 'step-1', 'user-bob');

    expect(updated!.status).toBe('completed');
    expect(updated!.completedAt).toBeDefined();
  });

  it('should get workflow status with progress', async () => {
    const created = await engine.createWorkflow({
      name: 'Progress',
      description: 'Track progress',
      createdBy: 'user-alice',
      steps: [
        { name: 'Step 1', description: 'First', assigneeId: 'user-bob' },
        { name: 'Step 2', description: 'Second', assigneeId: 'user-bob' },
      ],
    });

    await engine.startWorkflow(created.id);
    await engine.completeStep(created.id, 'step-1', 'user-bob');

    const status = await engine.getStatus(created.id);
    expect(status).toBeDefined();
    expect(status!.progress).toBe(0.5);
  });

  it('should list active workflows', async () => {
    await engine.createWorkflow({
      name: 'Active',
      description: 'Will be started',
      createdBy: 'user-alice',
      steps: [{ name: 'Step', description: 'Step', assigneeId: 'user-bob' }],
    });

    const active = await engine.listActive();
    expect(active).toHaveLength(1);
  });

  it('should cancel a workflow', async () => {
    const created = await engine.createWorkflow({
      name: 'Cancel Me',
      description: 'To be cancelled',
      createdBy: 'user-alice',
      steps: [{ name: 'Step', description: 'Step', assigneeId: 'user-bob' }],
    });

    await engine.startWorkflow(created.id);
    const cancelled = await engine.cancelWorkflow(created.id);
    expect(cancelled).toBe(true);

    const workflow = await engine.getWorkflow(created.id);
    expect(workflow!.status).toBe('cancelled');
  });

  it('should list workflows by user', async () => {
    await engine.createWorkflow({
      name: 'Alice Workflow',
      description: 'Created by alice',
      createdBy: 'user-alice',
      steps: [{ name: 'Step', description: 'For bob', assigneeId: 'user-bob' }],
    });

    const aliceWorkflows = await engine.listByUser('user-alice');
    expect(aliceWorkflows).toHaveLength(1);

    const bobWorkflows = await engine.listByUser('user-bob');
    expect(bobWorkflows).toHaveLength(1); // Bob is assignee
  });

  it('should handle parallel steps', async () => {
    const created = await engine.createWorkflow({
      name: 'Parallel',
      description: 'Steps run in parallel',
      createdBy: 'user-alice',
      steps: [
        { name: 'Review A', description: 'Review part A', assigneeId: 'user-bob' },
        { name: 'Review B', description: 'Review part B', assigneeId: 'user-charlie' },
        { name: 'Merge', description: 'Merge results', assigneeId: 'user-alice', dependsOn: ['step-1', 'step-2'] },
      ],
    });

    await engine.startWorkflow(created.id);
    let wf = await engine.getWorkflow(created.id);
    expect(wf!.steps[0].status).toBe('active');
    expect(wf!.steps[1].status).toBe('active');
    expect(wf!.steps[2].status).toBe('pending');

    await engine.completeStep(created.id, 'step-1', 'user-bob');
    wf = await engine.getWorkflow(created.id);
    expect(wf!.steps[2].status).toBe('pending'); // Still waiting for step-2

    await engine.completeStep(created.id, 'step-2', 'user-charlie');
    wf = await engine.getWorkflow(created.id);
    expect(wf!.steps[2].status).toBe('active'); // Now ready
  });
});

describe('ApprovalManager', () => {
  let tmpDir: string;
  let manager: ApprovalManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'approvals-'));
    manager = new ApprovalManager({ dir: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should create an approval request', async () => {
    const request = await manager.requestApproval(
      'wf-1',
      'step-1',
      'user-alice',
      ['user-bob', 'user-charlie'],
      'Please approve the deploy',
    );

    expect(request.id).toMatch(/^appr-/);
    expect(request.status).toBe('pending');
    expect(request.approverIds).toContain('user-bob');
  });

  it('should approve a request', async () => {
    const request = await manager.requestApproval(
      'wf-1', 'step-1', 'user-alice', ['user-bob'], 'Approve this',
    );

    const approved = await manager.approve(request.id, 'user-bob', 'Looks good');
    expect(approved).toBeDefined();
    expect(approved!.status).toBe('approved');
    expect(approved!.decidedBy).toBe('user-bob');
  });

  it('should reject a request', async () => {
    const request = await manager.requestApproval(
      'wf-1', 'step-1', 'user-alice', ['user-bob'], 'Approve this',
    );

    const rejected = await manager.reject(request.id, 'user-bob', 'Needs changes');
    expect(rejected).toBeDefined();
    expect(rejected!.status).toBe('rejected');
    expect(rejected!.decisionReason).toBe('Needs changes');
  });

  it('should not allow non-approver to decide', async () => {
    const request = await manager.requestApproval(
      'wf-1', 'step-1', 'user-alice', ['user-bob'], 'Approve this',
    );

    const result = await manager.approve(request.id, 'user-charlie');
    expect(result).toBeUndefined();
  });

  it('should list pending approvals for a user', async () => {
    await manager.requestApproval('wf-1', 'step-1', 'user-alice', ['user-bob'], 'Request 1');
    await manager.requestApproval('wf-1', 'step-2', 'user-alice', ['user-charlie'], 'Request 2');

    const bobPending = await manager.getPending('user-bob');
    expect(bobPending).toHaveLength(1);

    const allPending = await manager.getPending();
    expect(allPending).toHaveLength(2);
  });

  it('should not return already-decided approvals', async () => {
    const request = await manager.requestApproval(
      'wf-1', 'step-1', 'user-alice', ['user-bob'], 'Approve this',
    );
    await manager.approve(request.id, 'user-bob');

    const pending = await manager.getPending('user-bob');
    expect(pending).toHaveLength(0);
  });
});

describe('ReminderService', () => {
  let service: ReminderService;

  beforeEach(() => {
    service = new ReminderService();
  });

  afterEach(() => {
    service.shutdown();
  });

  it('should track active reminders', () => {
    expect(service.getActiveCount()).toBe(0);
  });

  it('should cancel reminders', () => {
    service.cancelReminder('wf-1', 'step-1');
    expect(service.getActiveCount()).toBe(0);
  });

  it('should shutdown cleanly', () => {
    service.shutdown();
    expect(service.getActiveCount()).toBe(0);
  });
});
