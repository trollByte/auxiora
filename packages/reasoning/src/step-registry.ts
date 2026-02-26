import type { ReasoningStep, StepState, StepProgress } from './types.js';

export class StepRegistry {
  private readonly states: Map<string, StepState>;
  private readonly ordered: ReasoningStep[];

  constructor(steps: ReasoningStep[]) {
    this.ordered = [...steps].sort((a, b) => a.order - b.order);
    this.states = new Map();

    for (const step of this.ordered) {
      this.states.set(step.name, { step, status: 'pending' });
    }

    if (this.ordered.length > 0) {
      this.states.get(this.ordered[0].name)!.status = 'available';
    }
  }

  currentStep(): ReasoningStep | undefined {
    for (const step of this.ordered) {
      const state = this.states.get(step.name)!;
      if (state.status === 'available') {
        return step;
      }
    }
    return undefined;
  }

  isAvailable(name: string): boolean {
    const state = this.states.get(name);
    if (!state) return false;
    return state.status === 'available';
  }

  canSkip(name: string): boolean {
    const state = this.states.get(name);
    if (!state) return false;
    return !state.step.required && state.status === 'available';
  }

  complete(name: string, output?: Record<string, unknown>): void {
    const state = this.states.get(name);
    if (!state) {
      throw new Error(`Step "${name}" not found`);
    }
    if (state.status !== 'available') {
      throw new Error(`Step "${name}" is not available`);
    }
    state.status = 'completed';
    state.output = output;
    state.completedAt = Date.now();
    this.advanceNext(name);
  }

  skip(name: string): void {
    const state = this.states.get(name);
    if (!state) {
      throw new Error(`Step "${name}" not found`);
    }
    if (state.step.required) {
      throw new Error(`Step "${name}" is required and cannot be skipped`);
    }
    if (state.status !== 'available') {
      throw new Error(`Step "${name}" is not available`);
    }
    state.status = 'skipped';
    this.advanceNext(name);
  }

  progress(): StepProgress {
    let completed = 0;
    const total = this.ordered.length;
    for (const state of this.states.values()) {
      if (state.status === 'completed' || state.status === 'skipped') {
        completed++;
      }
    }
    return {
      completed,
      total,
      percentage: total === 0 ? 100 : Math.round((completed / total) * 100),
    };
  }

  isComplete(): boolean {
    for (const state of this.states.values()) {
      if (state.step.required && state.status !== 'completed') {
        return false;
      }
      if (!state.step.required && state.status !== 'completed' && state.status !== 'skipped') {
        return false;
      }
    }
    return true;
  }

  getOutputs(): Map<string, Record<string, unknown>> {
    const outputs = new Map<string, Record<string, unknown>>();
    for (const [name, state] of this.states) {
      if (state.output) {
        outputs.set(name, state.output);
      }
    }
    return outputs;
  }

  private advanceNext(completedName: string): void {
    const idx = this.ordered.findIndex((s) => s.name === completedName);
    if (idx < this.ordered.length - 1) {
      const next = this.ordered[idx + 1];
      const nextState = this.states.get(next.name)!;
      if (nextState.status === 'pending') {
        nextState.status = 'available';
      }
    }
  }
}
