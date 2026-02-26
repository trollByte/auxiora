import { describe, it, expect } from 'vitest';
import { inferStrengths } from '../src/strengths.js';

describe('inferStrengths', () => {
  it('identifies reasoning and code for opus models', () => {
    const strengths = inferStrengths('anthropic/claude-3-opus');
    expect(strengths).toContain('reasoning');
    expect(strengths).toContain('code');
    expect(strengths).toContain('vision');
  });

  it('identifies fast for small models', () => {
    const strengths = inferStrengths('meta-llama/llama-3-8b-instruct');
    expect(strengths).toContain('fast');
  });

  it('identifies code for coder models', () => {
    const strengths = inferStrengths('deepseek/deepseek-coder-33b');
    expect(strengths).toContain('code');
  });

  it('returns general for unknown models', () => {
    const strengths = inferStrengths('unknown/new-model');
    expect(strengths).toEqual(['general']);
  });

  it('deduplicates strengths', () => {
    // 'code' matched by both opus and coder patterns
    const strengths = inferStrengths('anthropic/claude-3-opus-coder');
    const codeCount = strengths.filter(s => s === 'code').length;
    expect(codeCount).toBe(1);
  });

  it('identifies creative models', () => {
    const strengths = inferStrengths('some/creative-writer');
    expect(strengths).toContain('creative');
  });

  it('identifies long-context models', () => {
    const strengths = inferStrengths('some/model-128k');
    expect(strengths).toContain('long-context');
  });
});
