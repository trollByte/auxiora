import { StepRegistry } from './step-registry.js';
import { StepToolGenerator } from './step-tools.js';
import type { ReasoningStep } from './types.js';
import type { ImprovementProposal, StepDescription } from './improvement-types.js';

const META_STEPS: ReasoningStep[] = [
  {
    name: 'observe',
    description: 'Collect performance metrics, error rates, and anomalies from recent operations. Output should include numeric metrics and notable anomalies.',
    order: 1,
    required: true,
  },
  {
    name: 'reflect',
    description: 'Analyze observations to identify patterns, correlations, and root causes. Output should include identified patterns and hypothesized root causes.',
    order: 2,
    required: true,
  },
  {
    name: 'hypothesize',
    description: 'Propose concrete changes based on reflections. Each proposal should include the change description and confidence level (0-1).',
    order: 3,
    required: true,
  },
  {
    name: 'validate',
    description: 'Test proposed changes against benchmarks or simulations. Output should include test results with pass/fail and measured improvement.',
    order: 4,
    required: true,
  },
];

export class MetaImprovementStructure {
  private readonly registry: StepRegistry;
  private readonly toolGenerator: StepToolGenerator;

  constructor() {
    this.registry = new StepRegistry([...META_STEPS]);
    this.toolGenerator = new StepToolGenerator(this.registry);
  }

  getCurrentStepName(): string | undefined {
    return this.registry.currentStep()?.name;
  }

  completeStep(name: string, output: Record<string, unknown>): void {
    if (!this.registry.isAvailable(name)) {
      throw new Error(`Step "${name}" is not available. Current step: ${this.getCurrentStepName()}`);
    }
    this.registry.complete(name, output);
  }

  getProgress(): { completed: number; total: number; percentage: number } {
    return this.registry.progress();
  }

  isComplete(): boolean {
    return this.registry.isComplete();
  }

  getCurrentTools(): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    run(args: Record<string, unknown>): Promise<{ success: boolean; data: Record<string, unknown> }>;
    getPermission(): string;
  }> {
    return this.toolGenerator.getCurrentTools();
  }

  buildProposal(): ImprovementProposal | undefined {
    if (!this.isComplete()) return undefined;
    const outputs = this.registry.getOutputs();

    return {
      observations: outputs.get('observe') ?? {},
      reflections: outputs.get('reflect') ?? {},
      hypotheses: outputs.get('hypothesize') ?? {},
      validations: outputs.get('validate') ?? {},
      status: 'pending_review',
      createdAt: Date.now(),
    };
  }

  getStepDescriptions(): StepDescription[] {
    return META_STEPS.map((s) => ({
      name: s.name,
      description: s.description,
      order: s.order,
      required: s.required,
    }));
  }
}
