import { describe, it, expect, vi } from 'vitest';
import { ReActLoop } from '../src/react-loop.js';
import type { ReActCallbacks, ReActConfig } from '../src/types.js';

function makeCallbacks(overrides?: Partial<ReActCallbacks>): ReActCallbacks {
  return {
    think: overrides?.think ?? vi.fn(),
    executeTool: overrides?.executeTool ?? vi.fn(async () => 'tool result'),
    onStep: overrides?.onStep,
    onApprovalNeeded: overrides?.onApprovalNeeded,
    estimateTokens: overrides?.estimateTokens,
  };
}

describe('ReActLoop', () => {
  it('completes a simple think-action-observation-answer flow', async () => {
    let callCount = 0;
    const callbacks = makeCallbacks({
      think: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            thought: 'I need to search for the answer',
            action: { tool: 'search', params: { query: 'test' } },
          };
        }
        return { thought: 'I found the answer', answer: 'The answer is 42' };
      },
      executeTool: async () => 'search result: 42',
    });

    const loop = new ReActLoop(callbacks);
    const result = await loop.run('What is the answer?');

    expect(result.status).toBe('completed');
    expect(result.answer).toBe('The answer is 42');
    expect(result.steps.length).toBe(5); // thought, action, observation, thought, answer
    expect(result.steps[0].type).toBe('thought');
    expect(result.steps[1].type).toBe('action');
    expect(result.steps[1].toolName).toBe('search');
    expect(result.steps[2].type).toBe('observation');
    expect(result.steps[2].toolResult).toBe('search result: 42');
    expect(result.steps[3].type).toBe('thought');
    expect(result.steps[4].type).toBe('answer');
  });

  it('reaches max_steps_reached when step limit exceeded', async () => {
    const callbacks = makeCallbacks({
      think: async () => ({
        thought: 'thinking...',
        action: { tool: 'search', params: {} },
      }),
      executeTool: async () => 'result',
    });

    const config: ReActConfig = { maxSteps: 3 };
    const loop = new ReActLoop(callbacks, config);
    const result = await loop.run('endless goal');

    expect(result.status).toBe('max_steps_reached');
    expect(result.answer).toBeUndefined();
  });

  it('blocks disallowed tools via whitelist', async () => {
    let callCount = 0;
    const callbacks = makeCallbacks({
      think: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            thought: 'try dangerous tool',
            action: { tool: 'dangerous', params: {} },
          };
        }
        return { thought: 'done', answer: 'blocked it' };
      },
    });

    const config: ReActConfig = { allowedTools: ['safe_tool'] };
    const loop = new ReActLoop(callbacks, config);
    const result = await loop.run('test whitelist');

    expect(result.status).toBe('completed');
    // Should have observation about denied tool
    const denied = result.steps.find(
      (s) => s.type === 'observation' && s.content.includes('not allowed'),
    );
    expect(denied).toBeDefined();
    expect(callbacks.executeTool).not.toHaveBeenCalled();
  });

  it('blocks tools via blacklist', async () => {
    let callCount = 0;
    const callbacks = makeCallbacks({
      think: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            thought: 'try blocked tool',
            action: { tool: 'blocked_tool', params: {} },
          };
        }
        return { thought: 'done', answer: 'ok' };
      },
    });

    const config: ReActConfig = { deniedTools: ['blocked_tool'] };
    const loop = new ReActLoop(callbacks, config);
    const result = await loop.run('test blacklist');

    expect(result.status).toBe('completed');
    const denied = result.steps.find(
      (s) => s.type === 'observation' && s.content.includes('not allowed'),
    );
    expect(denied).toBeDefined();
  });

  it('pauses for approval when requireApproval is set', async () => {
    let callCount = 0;
    const onApprovalNeeded = vi.fn(async () => true);

    const callbacks = makeCallbacks({
      think: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            thought: 'need to act',
            action: { tool: 'write', params: { file: 'test.txt' } },
          };
        }
        return { thought: 'done', answer: 'wrote it' };
      },
      executeTool: async () => 'written',
      onApprovalNeeded,
    });

    const config: ReActConfig = { requireApproval: true };
    const loop = new ReActLoop(callbacks, config);
    const result = await loop.run('write file');

    expect(result.status).toBe('completed');
    expect(onApprovalNeeded).toHaveBeenCalledOnce();
  });

  it('denies action when approval is rejected', async () => {
    let callCount = 0;
    const executeTool = vi.fn(async () => 'should not be called');
    const callbacks = makeCallbacks({
      think: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            thought: 'need to act',
            action: { tool: 'write', params: {} },
          };
        }
        return { thought: 'ok denied', answer: 'skipped' };
      },
      executeTool,
      onApprovalNeeded: async () => false,
    });

    const config: ReActConfig = { requireApproval: true };
    const loop = new ReActLoop(callbacks, config);
    const result = await loop.run('write file');

    expect(result.status).toBe('completed');
    expect(executeTool).not.toHaveBeenCalled();
    const denied = result.steps.find(
      (s) => s.type === 'observation' && s.content.includes('denied'),
    );
    expect(denied).toBeDefined();
  });

  it('stops loop when abort is called', async () => {
    let loopRef: ReActLoop | undefined;
    let callCount = 0;
    const callbacks = makeCallbacks({
      think: async () => {
        callCount++;
        if (callCount >= 2 && loopRef) {
          loopRef.abort('user cancelled');
        }
        return {
          thought: 'thinking...',
          action: { tool: 'search', params: {} },
        };
      },
      executeTool: async () => 'result',
    });

    const loop = new ReActLoop(callbacks, { maxSteps: 20 });
    loopRef = loop;
    const result = await loop.run('abort test');

    expect(result.status).toBe('failed');
    expect(result.error).toBe('user cancelled');
  });

  it('fails on timeout', async () => {
    const callbacks = makeCallbacks({
      think: async () => {
        // Simulate slow thinking
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          thought: 'slow thought',
          action: { tool: 'search', params: {} },
        };
      },
      executeTool: async () => 'result',
    });

    const config: ReActConfig = { timeoutMs: 10, maxSteps: 100 };
    const loop = new ReActLoop(callbacks, config);
    const result = await loop.run('timeout test');

    expect(result.status).toBe('failed');
    expect(result.error).toBe('Timeout exceeded');
  });

  it('respects token budget', async () => {
    const callbacks = makeCallbacks({
      think: async () => ({
        thought: 'a'.repeat(1000),
        action: { tool: 'search', params: {} },
      }),
      executeTool: async () => 'b'.repeat(1000),
      estimateTokens: (text: string) => text.length, // 1 token per char
    });

    const config: ReActConfig = { maxTokenBudget: 500, maxSteps: 100 };
    const loop = new ReActLoop(callbacks, config);
    const result = await loop.run('budget test');

    expect(result.status).toBe('max_steps_reached');
    expect(result.totalTokens).toBeGreaterThanOrEqual(500);
  });

  it('handles errors in think callback', async () => {
    const callbacks = makeCallbacks({
      think: async () => {
        throw new Error('LLM API error');
      },
    });

    const loop = new ReActLoop(callbacks);
    const result = await loop.run('error test');

    expect(result.status).toBe('failed');
    expect(result.error).toBe('LLM API error');
  });

  it('handles non-Error thrown in think callback', async () => {
    const callbacks = makeCallbacks({
      think: async () => {
        throw 'string error'; // eslint-disable-line no-throw-literal
      },
    });

    const loop = new ReActLoop(callbacks);
    const result = await loop.run('error test');

    expect(result.status).toBe('failed');
    expect(result.error).toBe('string error');
  });

  it('calls onStep callback for each step', async () => {
    const onStep = vi.fn();
    let callCount = 0;
    const callbacks = makeCallbacks({
      think: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            thought: 'thinking',
            action: { tool: 'test', params: {} },
          };
        }
        return { thought: 'done', answer: 'result' };
      },
      executeTool: async () => 'ok',
      onStep,
    });

    const loop = new ReActLoop(callbacks);
    await loop.run('step tracking');

    // thought, action, observation, thought, answer = 5 calls
    expect(onStep).toHaveBeenCalledTimes(5);
  });

  it('reports status transitions correctly', async () => {
    const callbacks = makeCallbacks({
      think: async () => ({ thought: 'done', answer: 'yes' }),
    });

    const loop = new ReActLoop(callbacks);
    expect(loop.getStatus()).toBe('idle');

    const result = await loop.run('status test');
    expect(result.status).toBe('completed');
    expect(loop.getStatus()).toBe('completed');
  });
});
