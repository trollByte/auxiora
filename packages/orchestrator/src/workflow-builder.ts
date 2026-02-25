import type { AgentTask, OrchestrationPattern, Workflow } from './types.js';

export class WorkflowBuilder {
  private tasks: AgentTask[] = [];
  private _pattern: OrchestrationPattern = 'parallel';
  private _synthesisPrompt?: string;
  private _synthesisProvider?: string;
  private _metadata: Record<string, unknown> = {};

  pattern(p: OrchestrationPattern): this {
    this._pattern = p;
    return this;
  }

  addAgent(task: AgentTask): this {
    this.tasks.push(task);
    return this;
  }

  synthesize(prompt: string, provider?: string): this {
    this._synthesisPrompt = prompt;
    if (provider) this._synthesisProvider = provider;
    return this;
  }

  meta(key: string, value: unknown): this {
    this._metadata[key] = value;
    return this;
  }

  build(): Workflow {
    if (this.tasks.length === 0) {
      throw new Error('Workflow must have at least one task');
    }

    return {
      id: `wf_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      pattern: this._pattern,
      tasks: this.tasks.map((t) => ({ ...t })),
      synthesisPrompt: this._synthesisPrompt,
      synthesisProvider: this._synthesisProvider,
      metadata: Object.keys(this._metadata).length > 0 ? { ...this._metadata } : undefined,
    };
  }
}
