import { describe, it, expect } from 'vitest';
import type { ReasoningStep } from '../src/types.js';
import { StepRegistry } from '../src/step-registry.js';

function makeSteps(): ReasoningStep[] {
  return [
    { name: 'analyze', description: 'Analyze the problem', order: 1, required: true },
    { name: 'plan', description: 'Plan a solution', order: 2, required: true },
    { name: 'validate', description: 'Validate the plan', order: 3, required: false },
    { name: 'apply', description: 'Apply the solution', order: 4, required: true },
  ];
}

describe('StepRegistry', () => {
  it('tracks step completion in order', () => {
    const registry = new StepRegistry(makeSteps());

    expect(registry.currentStep()?.name).toBe('analyze');
    registry.complete('analyze', { result: 'ok' });

    expect(registry.currentStep()?.name).toBe('plan');
    registry.complete('plan', { strategy: 'incremental' });

    expect(registry.currentStep()?.name).toBe('validate');
  });

  it('allows skipping optional steps', () => {
    const registry = new StepRegistry(makeSteps());

    registry.complete('analyze');
    registry.complete('plan');
    expect(registry.canSkip('validate')).toBe(true);
    registry.skip('validate');

    expect(registry.currentStep()?.name).toBe('apply');
  });

  it('rejects out-of-order completion', () => {
    const registry = new StepRegistry(makeSteps());

    expect(() => registry.complete('plan')).toThrow(/not available/);
  });

  it('rejects skipping required steps', () => {
    const registry = new StepRegistry(makeSteps());

    expect(() => registry.skip('analyze')).toThrow(/required/);
  });

  it('reports overall progress', () => {
    const registry = new StepRegistry(makeSteps());

    registry.complete('analyze');
    const progress = registry.progress();
    expect(progress.completed).toBe(1);
    expect(progress.total).toBe(4);
    expect(progress.percentage).toBe(25);
  });

  it('reports completion when all required steps done', () => {
    const registry = new StepRegistry(makeSteps());

    expect(registry.isComplete()).toBe(false);
    registry.complete('analyze');
    registry.complete('plan');
    registry.skip('validate');
    registry.complete('apply');
    expect(registry.isComplete()).toBe(true);
  });

  it('collects outputs from all completed steps', () => {
    const registry = new StepRegistry(makeSteps());

    registry.complete('analyze', { findings: ['a', 'b'] });
    registry.complete('plan', { strategy: 'fast' });
    registry.skip('validate');
    registry.complete('apply', { applied: true });

    const outputs = registry.getOutputs();
    expect(outputs.size).toBe(3);
    expect(outputs.get('analyze')).toEqual({ findings: ['a', 'b'] });
    expect(outputs.get('plan')).toEqual({ strategy: 'fast' });
    expect(outputs.get('apply')).toEqual({ applied: true });
  });
});
