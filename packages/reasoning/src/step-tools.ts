import type { StepRegistry } from './step-registry.js';

export interface ToolLike {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run(args: Record<string, unknown>): Promise<{ success: boolean; data: Record<string, unknown> }>;
  getPermission(): string;
}

export class StepToolGenerator {
  private readonly registry: StepRegistry;

  constructor(registry: StepRegistry) {
    this.registry = registry;
  }

  getCurrentTools(): ToolLike[] {
    const step = this.registry.currentStep();
    if (!step) {
      return [];
    }

    const registry = this.registry;

    return [
      {
        name: `reasoning_${step.name}`,
        description: `[Reasoning Step ${step.order}] ${step.description}`,
        parameters: {
          type: 'object',
          properties: {
            result: { type: 'object' },
          },
        },
        async run(args: Record<string, unknown>): Promise<{ success: boolean; data: Record<string, unknown> }> {
          registry.complete(step.name, args);
          const progress = registry.progress();
          const nextStep = registry.currentStep();
          return {
            success: true,
            data: {
              step: step.name,
              progress,
              nextStep: nextStep?.name ?? null,
            },
          };
        },
        getPermission(): string {
          return 'AUTO_APPROVE';
        },
      },
    ];
  }
}
