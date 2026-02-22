import { describe, it, expect } from 'vitest';
import { scoreConfidence } from '../confidence-scorer.js';

describe('scoreConfidence', () => {
  it('returns base score 0.7 with no signals', () => {
    const result = scoreConfidence({
      toolsUsed: [],
      hasMemoryRecall: false,
      hasUserData: false,
      finishReason: 'stop',
      knowledgeBoundaryCorrections: 0,
      hedgePhraseCount: 0,
      escalationAlert: false,
    });
    // Base 0.7 + clean_finish +0.05 + no_corrections +0.05 - ungrounded -0.10 = 0.70
    expect(result.score).toBeCloseTo(0.70, 2);
    expect(result.level).toBe('medium');
  });

  it('boosts for tool grounding', () => {
    const result = scoreConfidence({
      toolsUsed: ['web_search'],
      hasMemoryRecall: false,
      hasUserData: false,
      finishReason: 'stop',
      knowledgeBoundaryCorrections: 0,
      hedgePhraseCount: 0,
      escalationAlert: false,
    });
    // Base 0.7 + tool_grounded +0.15 + clean_finish +0.05 + no_corrections +0.05 = 0.95
    expect(result.score).toBeCloseTo(0.95, 2);
    expect(result.level).toBe('high');
    expect(result.factors.find(f => f.signal === 'tool_grounded')).toBeDefined();
  });

  it('penalizes for knowledge boundary corrections', () => {
    const result = scoreConfidence({
      toolsUsed: [],
      hasMemoryRecall: false,
      hasUserData: false,
      finishReason: 'stop',
      knowledgeBoundaryCorrections: 2,
      hedgePhraseCount: 0,
      escalationAlert: false,
    });
    // Base 0.7 + clean_finish +0.05 - knowledge_boundary -0.30 - ungrounded -0.10 = 0.35
    expect(result.score).toBeCloseTo(0.35, 2);
    expect(result.level).toBe('low');
  });

  it('penalizes for max_tokens truncation', () => {
    const result = scoreConfidence({
      toolsUsed: ['web_search'],
      hasMemoryRecall: false,
      hasUserData: false,
      finishReason: 'max_tokens',
      knowledgeBoundaryCorrections: 0,
      hedgePhraseCount: 0,
      escalationAlert: false,
    });
    // Base 0.7 + tool_grounded +0.15 + no_corrections +0.05 - truncated -0.20 = 0.70
    expect(result.score).toBeCloseTo(0.70, 2);
  });

  it('penalizes for hedge density above threshold', () => {
    const result = scoreConfidence({
      toolsUsed: [],
      hasMemoryRecall: false,
      hasUserData: false,
      finishReason: 'stop',
      knowledgeBoundaryCorrections: 0,
      hedgePhraseCount: 4,
      escalationAlert: false,
    });
    // Base 0.7 + clean_finish +0.05 + no_corrections +0.05 - hedge_density -0.10 - ungrounded -0.10 = 0.60
    expect(result.score).toBeCloseTo(0.60, 2);
    expect(result.level).toBe('medium');
  });

  it('boosts for memory and user data', () => {
    const result = scoreConfidence({
      toolsUsed: [],
      hasMemoryRecall: true,
      hasUserData: true,
      finishReason: 'stop',
      knowledgeBoundaryCorrections: 0,
      hedgePhraseCount: 0,
      escalationAlert: false,
    });
    // Base 0.7 + memory_backed +0.10 + user_data +0.05 + clean_finish +0.05 + no_corrections +0.05 = 0.95
    expect(result.score).toBeCloseTo(0.95, 2);
    expect(result.level).toBe('high');
  });

  it('clamps score to minimum 0.1', () => {
    const result = scoreConfidence({
      toolsUsed: [],
      hasMemoryRecall: false,
      hasUserData: false,
      finishReason: 'max_tokens',
      knowledgeBoundaryCorrections: 2,
      hedgePhraseCount: 5,
      escalationAlert: true,
    });
    // Many penalties: 0.7 -0.30 -0.20 -0.10 -0.10 -0.10 = -0.10 -> clamped to 0.1
    expect(result.score).toBe(0.1);
    expect(result.level).toBe('low');
  });

  it('caps knowledge boundary penalty at -0.30', () => {
    const result = scoreConfidence({
      toolsUsed: ['web_search'],
      hasMemoryRecall: true,
      hasUserData: true,
      finishReason: 'stop',
      knowledgeBoundaryCorrections: 5,
      hedgePhraseCount: 0,
      escalationAlert: false,
    });
    // Even with 5 corrections, penalty is capped at -0.30 not -0.75
    expect(result.factors.find(f => f.signal === 'knowledge_boundary')?.detail).toContain('5');
    // Base 0.7 + 0.15 + 0.10 + 0.05 + 0.05 - 0.30 = 0.75
    expect(result.score).toBeCloseTo(0.75, 2);
  });
});
