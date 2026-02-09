import { describe, it, expect } from 'vitest';
import {
  getAnthropicThinkingBudget,
  getOpenAIReasoningEffort,
  isOpenAIReasoningModel,
} from '../src/thinking-levels.js';
import type { ThinkingLevel } from '../src/types.js';

describe('getAnthropicThinkingBudget', () => {
  it('should return undefined for off', () => {
    expect(getAnthropicThinkingBudget('off')).toBeUndefined();
  });

  it('should return 1024 for low', () => {
    expect(getAnthropicThinkingBudget('low')).toBe(1024);
  });

  it('should return 4096 for medium', () => {
    expect(getAnthropicThinkingBudget('medium')).toBe(4096);
  });

  it('should return 10000 for high', () => {
    expect(getAnthropicThinkingBudget('high')).toBe(10000);
  });

  it('should return 32000 for xhigh', () => {
    expect(getAnthropicThinkingBudget('xhigh')).toBe(32000);
  });

  it('should return increasing values as level increases', () => {
    const levels: ThinkingLevel[] = ['low', 'medium', 'high', 'xhigh'];
    const budgets = levels.map(l => getAnthropicThinkingBudget(l)!);
    for (let i = 1; i < budgets.length; i++) {
      expect(budgets[i]).toBeGreaterThan(budgets[i - 1]);
    }
  });
});

describe('getOpenAIReasoningEffort', () => {
  it('should return undefined for off', () => {
    expect(getOpenAIReasoningEffort('off')).toBeUndefined();
  });

  it('should return low for low', () => {
    expect(getOpenAIReasoningEffort('low')).toBe('low');
  });

  it('should return medium for medium', () => {
    expect(getOpenAIReasoningEffort('medium')).toBe('medium');
  });

  it('should return high for high', () => {
    expect(getOpenAIReasoningEffort('high')).toBe('high');
  });

  it('should cap xhigh at high', () => {
    expect(getOpenAIReasoningEffort('xhigh')).toBe('high');
  });
});

describe('isOpenAIReasoningModel', () => {
  it('should identify o1 models', () => {
    expect(isOpenAIReasoningModel('o1')).toBe(true);
    expect(isOpenAIReasoningModel('o1-mini')).toBe(true);
    expect(isOpenAIReasoningModel('o1-preview')).toBe(true);
  });

  it('should identify o3 models', () => {
    expect(isOpenAIReasoningModel('o3')).toBe(true);
    expect(isOpenAIReasoningModel('o3-mini')).toBe(true);
  });

  it('should identify o4 models', () => {
    expect(isOpenAIReasoningModel('o4-mini')).toBe(true);
  });

  it('should not match non-reasoning models', () => {
    expect(isOpenAIReasoningModel('gpt-4o')).toBe(false);
    expect(isOpenAIReasoningModel('gpt-4o-mini')).toBe(false);
    expect(isOpenAIReasoningModel('gpt-3.5-turbo')).toBe(false);
  });
});
