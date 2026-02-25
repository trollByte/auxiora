import { describe, it, expect } from 'vitest';
import { WorkflowBuilder } from '../src/workflow-builder.js';
import type { AgentTask } from '../src/types.js';

function makeTask(id: string): AgentTask {
  return {
    id,
    name: `Agent ${id}`,
    provider: 'test',
    systemPrompt: `System for ${id}`,
    userPrompt: `Task for ${id}`,
  };
}

describe('WorkflowBuilder', () => {
  it('should build a workflow with defaults', () => {
    const workflow = new WorkflowBuilder()
      .addAgent(makeTask('a'))
      .build();

    expect(workflow.id).toMatch(/^wf_/);
    expect(workflow.pattern).toBe('parallel');
    expect(workflow.tasks).toHaveLength(1);
  });

  it('should allow setting pattern', () => {
    const workflow = new WorkflowBuilder()
      .pattern('sequential')
      .addAgent(makeTask('a'))
      .build();

    expect(workflow.pattern).toBe('sequential');
  });

  it('should support synthesis prompt', () => {
    const workflow = new WorkflowBuilder()
      .addAgent(makeTask('a'))
      .addAgent(makeTask('b'))
      .synthesize('Combine all results', 'anthropic')
      .build();

    expect(workflow.synthesisPrompt).toBe('Combine all results');
    expect(workflow.synthesisProvider).toBe('anthropic');
  });

  it('should support metadata', () => {
    const workflow = new WorkflowBuilder()
      .addAgent(makeTask('a'))
      .meta('purpose', 'testing')
      .meta('priority', 1)
      .build();

    expect(workflow.metadata).toEqual({ purpose: 'testing', priority: 1 });
  });

  it('should throw if no tasks provided', () => {
    expect(() => new WorkflowBuilder().build()).toThrow('Workflow must have at least one task');
  });

  it('should support fluent chaining', () => {
    const builder = new WorkflowBuilder();
    const result = builder
      .pattern('debate')
      .addAgent(makeTask('a'))
      .addAgent(makeTask('b'))
      .synthesize('judge it')
      .meta('key', 'value');

    expect(result).toBe(builder);
  });

  it('should create independent copies of tasks', () => {
    const task = makeTask('a');
    const workflow = new WorkflowBuilder()
      .addAgent(task)
      .build();

    task.name = 'Modified';
    expect(workflow.tasks[0].name).toBe('Agent a');
  });
});
