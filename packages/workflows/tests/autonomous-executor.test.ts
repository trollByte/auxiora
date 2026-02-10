import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorkflowEngine } from '../src/engine.js';
import { AutonomousExecutor } from '../src/autonomous-executor.js';
import type { AutonomousExecutorDeps, GateCheckResult } from '../src/autonomous-executor.js';

function createMockDeps(engine: WorkflowEngine, overrides: Partial<AutonomousExecutorDeps> = {}): AutonomousExecutorDeps {
  return {
    workflowEngine: engine,
    trustGate: {
      gate: vi.fn<[string, string, number], GateCheckResult>().mockReturnValue({
        allowed: true,
        message: 'Allowed',
      }),
    },
    trustEngine: {
      recordOutcome: vi.fn(),
    },
    auditTrail: {
      record: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      markRolledBack: vi.fn().mockResolvedValue(true),
    },
    executeTool: vi.fn().mockResolvedValue({ success: true, output: 'done' }),
    ...overrides,
  };
}

async function createTestWorkflow(engine: WorkflowEngine, options?: { autonomous?: boolean }) {
  const workflow = await engine.createWorkflow({
    name: 'Test Autonomous',
    description: 'A test workflow',
    createdBy: 'system',
    autonomous: options?.autonomous ?? true,
    steps: [
      {
        name: 'Read config',
        description: 'Read the config file',
        assigneeId: 'system',
        action: {
          tool: 'file_read',
          params: { path: '/etc/config.json' },
          trustDomain: 'files',
          trustRequired: 1,
        },
      },
      {
        name: 'Send report',
        description: 'Send the report email',
        assigneeId: 'system',
        dependsOn: ['step-1'],
        action: {
          tool: 'email_compose',
          params: { to: 'user@example.com', subject: 'Report' },
          trustDomain: 'email',
          trustRequired: 2,
        },
      },
    ],
  });
  await engine.startWorkflow(workflow.id);
  return workflow;
}

describe('AutonomousExecutor', () => {
  let tmpDir: string;
  let engine: WorkflowEngine;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-exec-'));
    engine = new WorkflowEngine({ dir: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('tick', () => {
    it('should execute active autonomous workflow steps', async () => {
      const workflow = await createTestWorkflow(engine);
      const deps = createMockDeps(engine);
      const executor = new AutonomousExecutor(deps);

      const result = await executor.tick();

      expect(result.workflowsProcessed).toBe(1);
      expect(result.stepsExecuted).toBe(1); // Only step-1 (step-2 depends on it)
      expect(deps.executeTool).toHaveBeenCalledWith('file_read', { path: '/etc/config.json' });
      expect(deps.trustGate.gate).toHaveBeenCalledWith('files', 'file_read', 1);
      expect(deps.trustEngine.recordOutcome).toHaveBeenCalledWith('files', true);
    });

    it('should advance dependent steps after completion', async () => {
      const workflow = await createTestWorkflow(engine);
      const deps = createMockDeps(engine);
      const executor = new AutonomousExecutor(deps);

      // First tick: execute step-1
      await executor.tick();

      // Second tick: step-2 should now be active
      const result = await executor.tick();

      expect(result.stepsExecuted).toBe(1);
      expect(deps.executeTool).toHaveBeenCalledWith('email_compose', {
        to: 'user@example.com',
        subject: 'Report',
      });
    });

    it('should complete workflow when all steps finish', async () => {
      const workflow = await createTestWorkflow(engine);
      const onCompleted = vi.fn();
      const deps = createMockDeps(engine, { onWorkflowCompleted: onCompleted });
      const executor = new AutonomousExecutor(deps);

      // Two ticks to complete both steps
      await executor.tick();
      await executor.tick();

      const status = await engine.getStatus(workflow.id);
      expect(status?.workflow.status).toBe('completed');
      expect(onCompleted).toHaveBeenCalledWith(workflow.id);
    });

    it('should skip non-autonomous workflows', async () => {
      await engine.createWorkflow({
        name: 'Human Workflow',
        description: 'Not autonomous',
        createdBy: 'user',
        steps: [
          { name: 'Manual step', description: 'Do this by hand', assigneeId: 'user' },
        ],
      });

      const deps = createMockDeps(engine);
      const executor = new AutonomousExecutor(deps);

      const result = await executor.tick();

      expect(result.workflowsProcessed).toBe(0);
      expect(deps.executeTool).not.toHaveBeenCalled();
    });

    it('should skip steps without actions', async () => {
      const workflow = await engine.createWorkflow({
        name: 'Mixed Workflow',
        description: 'Has both auto and manual steps',
        createdBy: 'system',
        autonomous: true,
        steps: [
          { name: 'Manual review', description: 'Review by human', assigneeId: 'user-bob' },
          {
            name: 'Auto deploy',
            description: 'Auto deploy',
            assigneeId: 'system',
            dependsOn: ['step-1'],
            action: {
              tool: 'bash',
              params: { command: 'deploy.sh' },
              trustDomain: 'shell',
              trustRequired: 3,
            },
          },
        ],
      });
      await engine.startWorkflow(workflow.id);

      const deps = createMockDeps(engine);
      const executor = new AutonomousExecutor(deps);

      const result = await executor.tick();

      // step-1 is active but has no action, step-2 is pending (depends on step-1)
      expect(result.stepsExecuted).toBe(0);
      expect(deps.executeTool).not.toHaveBeenCalled();
    });

    it('should not process concurrently', async () => {
      await createTestWorkflow(engine);
      const deps = createMockDeps(engine, {
        executeTool: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({ success: true, output: 'ok' }), 50)),
        ),
      });
      const executor = new AutonomousExecutor(deps);

      // Start two ticks simultaneously
      const [r1, r2] = await Promise.all([executor.tick(), executor.tick()]);

      // One should have been skipped
      const total = r1.stepsExecuted + r2.stepsExecuted;
      expect(total).toBe(1);
    });
  });

  describe('trust gating', () => {
    it('should skip steps when trust is denied', async () => {
      await createTestWorkflow(engine);
      const deps = createMockDeps(engine, {
        trustGate: {
          gate: vi.fn<[string, string, number], GateCheckResult>().mockReturnValue({
            allowed: false,
            message: 'Trust level too low',
          }),
        },
      });
      const executor = new AutonomousExecutor(deps);

      const result = await executor.tick();

      expect(result.stepsSkipped).toBe(1);
      expect(result.stepsExecuted).toBe(0);
      expect(deps.executeTool).not.toHaveBeenCalled();
    });

    it('should not fail the step on trust denial', async () => {
      const workflow = await createTestWorkflow(engine);
      const deps = createMockDeps(engine, {
        trustGate: {
          gate: vi.fn<[string, string, number], GateCheckResult>().mockReturnValue({
            allowed: false,
            message: 'Denied',
          }),
        },
      });
      const executor = new AutonomousExecutor(deps);

      await executor.tick();

      // Step should still be active (not failed)
      const status = await engine.getStatus(workflow.id);
      const step1 = status?.workflow.steps.find((s) => s.id === 'step-1');
      expect(step1?.status).toBe('active');
    });
  });

  describe('failure handling', () => {
    it('should mark step as failed when tool fails', async () => {
      const workflow = await createTestWorkflow(engine);
      const onFailed = vi.fn();
      const deps = createMockDeps(engine, {
        executeTool: vi.fn().mockResolvedValue({ success: false, error: 'File not found' }),
        onStepFailed: onFailed,
      });
      const executor = new AutonomousExecutor(deps);

      const result = await executor.tick();

      expect(result.stepsFailed).toBe(1);
      expect(deps.trustEngine.recordOutcome).toHaveBeenCalledWith('files', false);
      expect(onFailed).toHaveBeenCalledWith(workflow.id, 'step-1', 'File not found');
    });

    it('should handle tool execution exceptions', async () => {
      const workflow = await createTestWorkflow(engine);
      const deps = createMockDeps(engine, {
        executeTool: vi.fn().mockRejectedValue(new Error('Connection refused')),
      });
      const executor = new AutonomousExecutor(deps);

      const result = await executor.tick();

      expect(result.stepsFailed).toBe(1);
      expect(deps.trustEngine.recordOutcome).toHaveBeenCalledWith('files', false);
    });

    it('should attempt rollback on failure when rollback tool is defined', async () => {
      const workflow = await engine.createWorkflow({
        name: 'Rollback Test',
        description: 'Test rollback',
        createdBy: 'system',
        autonomous: true,
        steps: [
          {
            name: 'Write file',
            description: 'Write then rollback',
            assigneeId: 'system',
            action: {
              tool: 'file_write',
              params: { path: '/tmp/test.txt', content: 'data' },
              trustDomain: 'files',
              trustRequired: 2,
              rollbackTool: 'file_write',
              rollbackParams: { path: '/tmp/test.txt', content: '' },
            },
          },
        ],
      });
      await engine.startWorkflow(workflow.id);

      const executeTool = vi.fn()
        .mockResolvedValueOnce({ success: false, error: 'Disk full' }) // Main tool fails
        .mockResolvedValueOnce({ success: true, output: 'Rolled back' }); // Rollback succeeds

      const deps = createMockDeps(engine, { executeTool });
      const executor = new AutonomousExecutor(deps);

      await executor.tick();

      expect(executeTool).toHaveBeenCalledTimes(2);
      expect(executeTool).toHaveBeenNthCalledWith(2, 'file_write', {
        path: '/tmp/test.txt',
        content: '',
      });
      expect(deps.auditTrail.markRolledBack).toHaveBeenCalledWith('audit-1');
    });
  });

  describe('audit trail', () => {
    it('should record audit entries for executed steps', async () => {
      await createTestWorkflow(engine);
      const deps = createMockDeps(engine);
      const executor = new AutonomousExecutor(deps);

      await executor.tick();

      // Two audit records: one pending (before execution), one success (after)
      expect(deps.auditTrail.record).toHaveBeenCalledTimes(2);

      const firstCall = (deps.auditTrail.record as any).mock.calls[0][0];
      expect(firstCall.outcome).toBe('pending');
      expect(firstCall.domain).toBe('files');

      const secondCall = (deps.auditTrail.record as any).mock.calls[1][0];
      expect(secondCall.outcome).toBe('success');
    });
  });

  describe('callbacks', () => {
    it('should call onStepCompleted on success', async () => {
      const workflow = await createTestWorkflow(engine);
      const onCompleted = vi.fn();
      const deps = createMockDeps(engine, { onStepCompleted: onCompleted });
      const executor = new AutonomousExecutor(deps);

      await executor.tick();

      expect(onCompleted).toHaveBeenCalledWith(workflow.id, 'step-1', 'done');
    });
  });

  describe('start/stop', () => {
    it('should start and stop the timer', () => {
      const deps = createMockDeps(engine);
      const executor = new AutonomousExecutor(deps);

      expect(executor.isRunning()).toBe(false);

      executor.start(60_000);
      expect(executor.isRunning()).toBe(true);

      executor.stop();
      expect(executor.isRunning()).toBe(false);
    });

    it('should not start twice', () => {
      const deps = createMockDeps(engine);
      const executor = new AutonomousExecutor(deps);

      executor.start(60_000);
      executor.start(60_000); // Should be no-op

      expect(executor.isRunning()).toBe(true);
      executor.stop();
    });
  });
});
