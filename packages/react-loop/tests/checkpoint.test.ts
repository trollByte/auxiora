import { describe, it, expect, vi } from 'vitest';
import { ReActLoop } from '../src/react-loop.js';
import type { ReActCallbacks, CheckpointHandler, ReActCheckpoint } from '../src/types.js';

function makeCallbacks(steps: number): ReActCallbacks {
  let count = 0;
  return {
    think: async () => {
      count++;
      if (count >= steps) return { thought: 'Done', answer: 'Final answer' };
      return { thought: `Step ${count}`, action: { tool: 'test', params: {} } };
    },
    executeTool: async () => 'tool result',
  };
}

describe('ReActLoop checkpoints', () => {
  it('should call checkpoint handler after each step', async () => {
    const saved: ReActCheckpoint[] = [];
    const handler: CheckpointHandler = {
      save: async (cp) => { saved.push(structuredClone(cp)); },
      load: async () => undefined,
    };

    const loop = new ReActLoop(makeCallbacks(2), {
      sessionId: 'test-session',
      checkpointHandler: handler,
    });

    await loop.run('test goal');

    // Should have checkpoints for each step
    expect(saved.length).toBeGreaterThan(0);
    expect(saved[0].sessionId).toBe('test-session');
    expect(saved[0].goal).toBe('test goal');
  });

  it('should resume from checkpoint', async () => {
    const existingSteps = [
      { type: 'thought' as const, content: 'Previous thought', timestamp: Date.now() },
    ];

    const checkpoint: ReActCheckpoint = {
      sessionId: 'resume-session',
      goal: 'test goal',
      steps: existingSteps,
      totalTokens: 100,
      status: 'running',
      savedAt: Date.now(),
    };

    const loop = new ReActLoop(makeCallbacks(1), { sessionId: 'resume-session' });
    const result = await loop.run('test goal', checkpoint);

    // Should have the restored step plus new steps
    expect(result.steps.length).toBeGreaterThan(1);
    expect(result.steps[0].content).toBe('Previous thought');
    expect(result.totalTokens).toBeGreaterThan(100);
  });

  it('should auto-load checkpoint from handler when sessionId is set', async () => {
    const storedCheckpoint: ReActCheckpoint = {
      sessionId: 'auto-session',
      goal: 'test goal',
      steps: [{ type: 'thought' as const, content: 'Auto-loaded thought', timestamp: Date.now() }],
      totalTokens: 50,
      status: 'running',
      savedAt: Date.now(),
    };

    const handler: CheckpointHandler = {
      save: async () => {},
      load: async (id) => id === 'auto-session' ? storedCheckpoint : undefined,
    };

    const loop = new ReActLoop(makeCallbacks(1), {
      sessionId: 'auto-session',
      checkpointHandler: handler,
    });
    const result = await loop.run('test goal');

    expect(result.steps[0].content).toBe('Auto-loaded thought');
    expect(result.totalTokens).toBeGreaterThan(50);
  });

  it('should generate sessionId when not provided', async () => {
    const saved: ReActCheckpoint[] = [];
    const handler: CheckpointHandler = {
      save: async (cp) => { saved.push(cp); },
      load: async () => undefined,
    };

    const loop = new ReActLoop(makeCallbacks(1), { checkpointHandler: handler });
    await loop.run('test goal');

    expect(saved.length).toBeGreaterThan(0);
    // sessionId should be a UUID
    expect(saved[0].sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe('ReActLoop step validation', () => {
  it('should call validateStep after each step', async () => {
    const validations: string[] = [];

    const loop = new ReActLoop(makeCallbacks(1), {
      validateStep: async (step) => {
        validations.push(step.type);
        return { valid: true };
      },
    });

    await loop.run('test goal');
    expect(validations.length).toBeGreaterThan(0);
  });

  it('should abort on validation failure with abort flag', async () => {
    const loop = new ReActLoop(makeCallbacks(5), {
      validateStep: async (_step, allSteps) => {
        if (allSteps.length > 2) {
          return { valid: false, abort: true, message: 'Too many steps' };
        }
        return { valid: true };
      },
    });

    const result = await loop.run('test goal');
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Too many steps');
  });

  it('should continue on validation failure without abort', async () => {
    const warnings: string[] = [];

    const loop = new ReActLoop(makeCallbacks(2), {
      validateStep: async () => ({ valid: false, message: 'Warning' }),
    });

    const result = await loop.run('test goal');
    // Should complete despite validation warnings
    expect(result.answer).toBe('Final answer');
  });

  it('should pass current step and all steps to validator', async () => {
    const calls: Array<{ stepType: string; allCount: number }> = [];

    const loop = new ReActLoop(makeCallbacks(1), {
      validateStep: async (step, allSteps) => {
        calls.push({ stepType: step.type, allCount: allSteps.length });
        return { valid: true };
      },
    });

    await loop.run('test goal');

    // All steps should be accumulated
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i].allCount).toBeGreaterThanOrEqual(calls[i - 1].allCount);
    }
  });
});
