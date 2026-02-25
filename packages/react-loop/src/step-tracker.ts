import type { ReActStep } from './types.js';

export class StepTracker {
  private steps: ReActStep[] = [];

  addStep(step: ReActStep): void {
    this.steps.push(step);
  }

  getSteps(): ReActStep[] {
    return [...this.steps];
  }

  summarize(): {
    thoughts: number;
    actions: number;
    observations: number;
    uniqueTools: string[];
    totalDurationMs: number;
  } {
    const tools = new Set<string>();
    let totalDurationMs = 0;
    let thoughts = 0;
    let actions = 0;
    let observations = 0;

    for (const step of this.steps) {
      if (step.durationMs) {
        totalDurationMs += step.durationMs;
      }
      switch (step.type) {
        case 'thought':
          thoughts++;
          break;
        case 'action':
          actions++;
          if (step.toolName) {
            tools.add(step.toolName);
          }
          break;
        case 'observation':
          observations++;
          break;
      }
    }

    return {
      thoughts,
      actions,
      observations,
      uniqueTools: [...tools],
      totalDurationMs,
    };
  }

  getLastAction(): ReActStep | undefined {
    for (let i = this.steps.length - 1; i >= 0; i--) {
      if (this.steps[i].type === 'action') {
        return this.steps[i];
      }
    }
    return undefined;
  }

  detectLoop(windowSize = 4): boolean {
    const actionSteps = this.steps.filter((s) => s.type === 'action');
    if (actionSteps.length < windowSize) {
      return false;
    }

    const recent = actionSteps.slice(-windowSize);
    const first = recent[0];
    return recent.every(
      (s) =>
        s.toolName === first.toolName &&
        JSON.stringify(s.toolParams) === JSON.stringify(first.toolParams),
    );
  }

  toMarkdown(): string {
    const summary = this.summarize();
    const lines: string[] = [
      '## ReAct Loop Summary',
      '',
      `- **Thoughts:** ${String(summary.thoughts)}`,
      `- **Actions:** ${String(summary.actions)}`,
      `- **Observations:** ${String(summary.observations)}`,
      `- **Unique tools:** ${summary.uniqueTools.length > 0 ? summary.uniqueTools.join(', ') : 'none'}`,
      `- **Total duration:** ${String(summary.totalDurationMs)}ms`,
      '',
      '### Steps',
      '',
    ];

    for (const [i, step] of this.steps.entries()) {
      const prefix = `${String(i + 1)}. **[${step.type}]**`;
      if (step.type === 'action' && step.toolName) {
        lines.push(`${prefix} ${step.toolName}: ${step.content}`);
      } else {
        lines.push(`${prefix} ${step.content}`);
      }
    }

    return lines.join('\n');
  }
}
