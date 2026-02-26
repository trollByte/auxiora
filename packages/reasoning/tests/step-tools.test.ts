import { describe, it, expect } from 'vitest';
import { StepRegistry } from '../src/step-registry.js';
import { StepToolGenerator } from '../src/step-tools.js';
import type { ReasoningStep } from '../src/types.js';

function makeSteps(): ReasoningStep[] {
  return [
    { name: 'gather', description: 'Gather information', order: 1, required: true },
    { name: 'analyze', description: 'Analyze data', order: 2, required: true },
    { name: 'conclude', description: 'Draw conclusions', order: 3, required: true },
  ];
}

describe('StepToolGenerator', () => {
  it('generates tool for current step only', () => {
    const registry = new StepRegistry(makeSteps());
    const generator = new StepToolGenerator(registry);
    const tools = generator.getCurrentTools();

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('reasoning_gather');
    expect(tools[0].description).toBe('[Reasoning Step 1] Gather information');
  });

  it('tool invocation completes step and advances', async () => {
    const registry = new StepRegistry(makeSteps());
    const generator = new StepToolGenerator(registry);

    const tools = generator.getCurrentTools();
    await tools[0].run({ result: 'done' });

    const nextTools = generator.getCurrentTools();
    expect(nextTools).toHaveLength(1);
    expect(nextTools[0].name).toBe('reasoning_analyze');
  });

  it('returns empty tools when all steps complete', async () => {
    const registry = new StepRegistry(makeSteps());
    const generator = new StepToolGenerator(registry);

    // Complete all three steps sequentially
    let tools = generator.getCurrentTools();
    await tools[0].run({ result: 'gathered' });

    tools = generator.getCurrentTools();
    await tools[0].run({ result: 'analyzed' });

    tools = generator.getCurrentTools();
    await tools[0].run({ result: 'concluded' });

    const finalTools = generator.getCurrentTools();
    expect(finalTools).toHaveLength(0);
  });

  it('tool has AUTO_APPROVE permission', () => {
    const registry = new StepRegistry(makeSteps());
    const generator = new StepToolGenerator(registry);
    const tools = generator.getCurrentTools();

    expect(tools[0].getPermission()).toBe('AUTO_APPROVE');
  });

  it('includes progress in tool result', async () => {
    const registry = new StepRegistry(makeSteps());
    const generator = new StepToolGenerator(registry);

    const tools = generator.getCurrentTools();
    const result = await tools[0].run({ result: 'gathered' });

    expect(result.success).toBe(true);
    expect(result.data.progress).toEqual({ completed: 1, total: 3, percentage: 33 });
    expect(result.data.step).toBe('gather');
    expect(result.data.nextStep).toBe('analyze');
  });
});
