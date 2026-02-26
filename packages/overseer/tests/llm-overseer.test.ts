import { describe, it, expect, vi } from 'vitest';
import { ActiveOverseer } from '../src/llm-overseer.js';
import type { AgentSnapshot, OverseerConfig } from '../src/types.js';

const defaultConfig: OverseerConfig = {
  loopThreshold: 3,
  stallTimeoutMs: 30_000,
  maxTokenBudget: 50_000,
  checkIntervalMs: 5_000,
};

const makeSnapshot = (overrides: Partial<AgentSnapshot> = {}): AgentSnapshot => ({
  agentId: 'test-agent',
  toolCalls: [],
  tokenUsage: 0,
  lastActivityAt: Date.now(),
  startedAt: Date.now() - 10_000,
  ...overrides,
});

describe('ActiveOverseer', () => {
  it('returns heuristic alerts when no LLM is provided', async () => {
    const overseer = new ActiveOverseer(defaultConfig);

    const snapshot = makeSnapshot({
      toolCalls: [
        { tool: 'read', timestamp: 1 },
        { tool: 'read', timestamp: 2 },
        { tool: 'read', timestamp: 3 },
      ],
    });

    const result = await overseer.assess(snapshot);
    expect(result.heuristicAlerts.length).toBeGreaterThan(0);
    expect(result.llmAssessment).toBeUndefined();
    expect(result.action).toBe('alert');
  });

  it('calls LLM for assessment when provided and heuristic triggers', async () => {
    const mockLLM = vi.fn().mockResolvedValue({
      severity: 'critical',
      reasoning: 'Agent is stuck in a read loop',
      suggestedAction: 'cancel',
      notification: 'You appear to be repeating the same action. Please try a different approach.',
    });

    const overseer = new ActiveOverseer(defaultConfig, { assessWithLLM: mockLLM });

    const snapshot = makeSnapshot({
      toolCalls: [
        { tool: 'read', timestamp: 1 },
        { tool: 'read', timestamp: 2 },
        { tool: 'read', timestamp: 3 },
      ],
    });

    const result = await overseer.assess(snapshot);
    expect(mockLLM).toHaveBeenCalledTimes(1);
    expect(result.llmAssessment).toBeDefined();
    expect(result.llmAssessment?.suggestedAction).toBe('cancel');
    expect(result.action).toBe('cancel');
    expect(result.notification).toBe('You appear to be repeating the same action. Please try a different approach.');
  });

  it('skips LLM when heuristic finds no issues', async () => {
    const mockLLM = vi.fn();
    const overseer = new ActiveOverseer(defaultConfig, { assessWithLLM: mockLLM });

    const snapshot = makeSnapshot();
    const result = await overseer.assess(snapshot);

    expect(mockLLM).not.toHaveBeenCalled();
    expect(result.heuristicAlerts).toHaveLength(0);
    expect(result.action).toBe('none');
  });

  it('falls back to heuristic action when LLM fails', async () => {
    const mockLLM = vi.fn().mockRejectedValue(new Error('LLM unavailable'));
    const overseer = new ActiveOverseer(defaultConfig, { assessWithLLM: mockLLM });

    const snapshot = makeSnapshot({
      tokenUsage: 60_000,
    });

    const result = await overseer.assess(snapshot);
    expect(result.heuristicAlerts.length).toBeGreaterThan(0);
    expect(result.llmAssessment).toBeUndefined();
    expect(result.action).toBe('alert');
  });

  it('records assessments in history', async () => {
    const overseer = new ActiveOverseer(defaultConfig);

    await overseer.assess(makeSnapshot({ tokenUsage: 60_000 }));
    await overseer.assess(makeSnapshot());

    const history = overseer.getAssessmentHistory();
    expect(history).toHaveLength(2);
    expect(history[0].action).toBe('alert');
    expect(history[1].action).toBe('none');
  });
});
