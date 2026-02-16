import { describe, it, expect, vi } from 'vitest';
import { BehaviorExecutor } from '../src/executor.js';
import type { Behavior } from '../src/types.js';

function makeBehavior(overrides: Partial<Behavior> = {}): Behavior {
  return {
    id: 'bh_test1',
    type: 'scheduled',
    status: 'active',
    action: 'Summarize today\'s news',
    schedule: { cron: '0 8 * * *', timezone: 'UTC' },
    channel: { type: 'discord', id: 'ch123', overridden: false },
    createdBy: 'user1',
    createdAt: new Date().toISOString(),
    runCount: 0,
    failCount: 0,
    maxFailures: 3,
    ...overrides,
  };
}

describe('BehaviorExecutor', () => {
  it('should execute a behavior and return the result', async () => {
    const mockProvider = {
      name: 'mock',
      complete: vi.fn().mockResolvedValue({
        content: 'Here is your summary',
        usage: { inputTokens: 10, outputTokens: 20 },
        model: 'mock',
        finishReason: 'end_turn',
      }),
      stream: vi.fn(),
    };

    const mockSend = vi.fn().mockResolvedValue({ success: true });

    const executor = new BehaviorExecutor({
      getProvider: () => mockProvider,
      sendToChannel: mockSend,
      getSystemPrompt: () => 'You are Auxiora.',
    });

    const result = await executor.execute(makeBehavior());

    expect(result.success).toBe(true);
    expect(result.result).toBe('Here is your summary');
    expect(mockProvider.complete).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it('should return failure when provider throws', async () => {
    const mockProvider = {
      name: 'mock',
      complete: vi.fn().mockRejectedValue(new Error('API down')),
      stream: vi.fn(),
    };

    const executor = new BehaviorExecutor({
      getProvider: () => mockProvider,
      sendToChannel: vi.fn(),
      getSystemPrompt: () => 'You are Auxiora.',
    });

    const result = await executor.execute(makeBehavior());

    expect(result.success).toBe(false);
    expect(result.error).toContain('API down');
  });

  it('should return failure when channel send fails', async () => {
    const mockProvider = {
      name: 'mock',
      complete: vi.fn().mockResolvedValue({
        content: 'Result',
        usage: { inputTokens: 10, outputTokens: 20 },
        model: 'mock',
        finishReason: 'end_turn',
      }),
      stream: vi.fn(),
    };

    const mockSend = vi.fn().mockResolvedValue({ success: false, error: 'Channel offline' });

    const executor = new BehaviorExecutor({
      getProvider: () => mockProvider,
      sendToChannel: mockSend,
      getSystemPrompt: () => 'You are Auxiora.',
    });

    const result = await executor.execute(makeBehavior());

    expect(result.success).toBe(false);
    expect(result.error).toContain('Channel offline');
  });

  it('should use executeWithTools when available', async () => {
    const mockProvider = {
      name: 'mock',
      complete: vi.fn(),
      stream: vi.fn(),
    };

    const mockSend = vi.fn().mockResolvedValue({ success: true });
    const mockExecuteWithTools = vi.fn().mockResolvedValue({
      content: 'Researched result with tools',
      usage: { inputTokens: 50, outputTokens: 100 },
    });

    const executor = new BehaviorExecutor({
      getProvider: () => mockProvider,
      sendToChannel: mockSend,
      getSystemPrompt: () => 'You are Auxiora.',
      executeWithTools: mockExecuteWithTools,
    });

    const result = await executor.execute(makeBehavior());

    expect(result.success).toBe(true);
    expect(result.result).toBe('Researched result with tools');
    expect(mockExecuteWithTools).toHaveBeenCalledOnce();
    expect(mockProvider.complete).not.toHaveBeenCalled();
  });

  it('should fall back to provider.complete when executeWithTools is not provided', async () => {
    const mockProvider = {
      name: 'mock',
      complete: vi.fn().mockResolvedValue({
        content: 'Fallback result',
        usage: { inputTokens: 10, outputTokens: 20 },
        model: 'mock',
        finishReason: 'end_turn',
      }),
      stream: vi.fn(),
    };

    const mockSend = vi.fn().mockResolvedValue({ success: true });

    const executor = new BehaviorExecutor({
      getProvider: () => mockProvider,
      sendToChannel: mockSend,
      getSystemPrompt: () => 'You are Auxiora.',
      // no executeWithTools
    });

    const result = await executor.execute(makeBehavior());

    expect(result.success).toBe(true);
    expect(result.result).toBe('Fallback result');
    expect(mockProvider.complete).toHaveBeenCalledOnce();
  });

  it('should format monitor results with condition info', async () => {
    const mockProvider = {
      name: 'mock',
      complete: vi.fn().mockResolvedValue({
        content: 'Bitcoin is at $59,000',
        usage: { inputTokens: 10, outputTokens: 20 },
        model: 'mock',
        finishReason: 'end_turn',
      }),
      stream: vi.fn(),
    };

    const mockSend = vi.fn().mockResolvedValue({ success: true });

    const executor = new BehaviorExecutor({
      getProvider: () => mockProvider,
      sendToChannel: mockSend,
      getSystemPrompt: () => 'You are Auxiora.',
    });

    const behavior = makeBehavior({
      type: 'monitor',
      polling: { intervalMs: 60_000, condition: 'Bitcoin price below $60k' },
    });

    await executor.execute(behavior);

    const callArgs = mockProvider.complete.mock.calls[0];
    const messages = callArgs[0];
    const userMessage = messages.find((m: any) => m.role === 'user');
    expect(userMessage.content).toContain('Bitcoin price below $60k');
  });
});
