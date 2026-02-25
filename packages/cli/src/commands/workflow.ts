import { Command } from 'commander';

export function createWorkflowCommand(): Command {
  const cmd = new Command('workflow').description('Manage workflows and approvals');

  cmd
    .command('create <name>')
    .description('Create a new workflow')
    .option('-d, --description <desc>', 'Workflow description', '')
    .option('-u, --user <userId>', 'Created by user ID', 'default')
    .action(async (name: string, opts: { description: string; user: string }) => {
      const { WorkflowEngine } = await import('@auxiora/workflows');

      const engine = new WorkflowEngine();
      const workflow = await engine.createWorkflow({
        name,
        description: opts.description,
        createdBy: opts.user,
        steps: [],
      });

      console.log(`Created workflow: ${workflow.name} (${workflow.id})`);
      console.log('  Use "auxiora workflow status <id>" to view details');
    });

  cmd
    .command('list')
    .description('List workflows')
    .option('-a, --all', 'Show all workflows (including completed)')
    .action(async (opts: { all?: boolean }) => {
      const { WorkflowEngine } = await import('@auxiora/workflows');

      const engine = new WorkflowEngine();
      const workflows = opts.all ? await engine.listAll() : await engine.listActive();

      if (workflows.length === 0) {
        console.log(opts.all ? 'No workflows found.' : 'No active workflows.');
        return;
      }

      console.log(`${opts.all ? 'All' : 'Active'} Workflows:`);
      for (const wf of workflows) {
        const completed = wf.steps.filter(s => s.status === 'completed').length;
        const total = wf.steps.length;
        const progress = total > 0 ? `${completed}/${total} steps` : 'no steps';
        console.log(`  ${wf.name} (${wf.id}) [${wf.status}] - ${progress}`);
      }
    });

  cmd
    .command('status <workflowId>')
    .description('Show workflow status and progress')
    .action(async (workflowId: string) => {
      const { WorkflowEngine } = await import('@auxiora/workflows');

      const engine = new WorkflowEngine();
      const result = await engine.getStatus(workflowId);

      if (!result) {
        console.error(`Workflow not found: ${workflowId}`);
        process.exit(1);
      }

      const { workflow, progress } = result;
      console.log(`\nWorkflow: ${workflow.name} (${workflow.id})`);
      console.log(`  Status: ${workflow.status}`);
      console.log(`  Progress: ${(progress * 100).toFixed(0)}%`);
      console.log(`  Created: ${new Date(workflow.createdAt).toLocaleString()}`);
      if (workflow.completedAt) {
        console.log(`  Completed: ${new Date(workflow.completedAt).toLocaleString()}`);
      }

      if (workflow.steps.length > 0) {
        console.log('\n  Steps:');
        for (const step of workflow.steps) {
          const status = step.status === 'completed' ? 'done' : step.status;
          const assignee = step.assigneeId;
          const deps = step.dependsOn.length > 0 ? ` (after: ${step.dependsOn.join(', ')})` : '';
          console.log(`    [${status}] ${step.name} -> ${assignee}${deps}`);
        }
      }

      if (workflow.events.length > 0) {
        console.log('\n  Recent Events:');
        const recent = workflow.events.slice(-5);
        for (const event of recent) {
          const date = new Date(event.timestamp).toLocaleString();
          console.log(`    [${date}] ${event.type}${event.details ? `: ${event.details}` : ''}`);
        }
      }
    });

  cmd
    .command('approve <approvalId>')
    .description('Approve a pending approval')
    .option('-u, --user <userId>', 'Approving user ID', 'default')
    .option('-r, --reason <reason>', 'Reason for approval')
    .action(async (approvalId: string, opts: { user: string; reason?: string }) => {
      const { ApprovalManager } = await import('@auxiora/workflows');

      const manager = new ApprovalManager();
      const result = await manager.approve(approvalId, opts.user, opts.reason);

      if (result) {
        console.log(`Approved: ${approvalId}`);
      } else {
        console.error(`Could not approve: ${approvalId} (not found, already decided, or not authorized)`);
        process.exit(1);
      }
    });

  cmd
    .command('pending')
    .description('List pending approvals')
    .option('-u, --user <userId>', 'Filter by approver user ID')
    .action(async (opts: { user?: string }) => {
      const { ApprovalManager } = await import('@auxiora/workflows');

      const manager = new ApprovalManager();
      const pending = await manager.getPending(opts.user);

      if (pending.length === 0) {
        console.log('No pending approvals.');
        return;
      }

      console.log('Pending Approvals:');
      for (const req of pending) {
        const date = new Date(req.createdAt).toLocaleString();
        console.log(`  ${req.id}: ${req.description}`);
        console.log(`    Workflow: ${req.workflowId} | Step: ${req.stepId} | From: ${req.requestedBy} | ${date}`);
      }
    });

  return cmd;
}
