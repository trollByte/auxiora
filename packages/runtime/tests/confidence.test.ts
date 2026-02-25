import { describe, it, expect, beforeEach } from 'vitest';
import { ConfidenceAssessor, type ConfidenceSignal, type KnowledgeSource } from '../src/confidence.js';

describe('ConfidenceAssessor', () => {
  let assessor: ConfidenceAssessor;

  beforeEach(() => {
    assessor = new ConfidenceAssessor();
  });

  it('returns default low assessment when no signals provided', () => {
    const result = assessor.assess([]);

    expect(result.level).toBe('low');
    expect(result.score).toBe(0.5);
    expect(result.explanation).toBe('No confidence signals available');
    expect(result.signals).toHaveLength(0);
    expect(result.uncertaintyMarkers).toHaveLength(0);
  });

  it('returns high confidence from user_data signals', () => {
    const signals: ConfidenceSignal[] = [
      { source: 'user_data', confidence: 0.95, evidence: 'Found in user preferences' },
      { source: 'user_data', confidence: 0.9, evidence: 'Found in user history' },
    ];

    const result = assessor.assess(signals);

    expect(result.level).toBe('high');
    expect(result.score).toBeGreaterThanOrEqual(0.7);
  });

  it('returns low/medium confidence from generation-only signals', () => {
    const signals: ConfidenceSignal[] = [
      { source: 'generation', confidence: 0.3, evidence: 'Generated from model' },
    ];

    const result = assessor.assess(signals);

    expect(result.score).toBeLessThan(0.7);
    expect(['low', 'medium']).toContain(result.level);
  });

  it('computes weighted average for mixed signals', () => {
    const signals: ConfidenceSignal[] = [
      { source: 'user_data', confidence: 0.9, evidence: 'User preference' },
      { source: 'generation', confidence: 0.3, evidence: 'Generated content' },
    ];

    const result = assessor.assess(signals);

    // user_data weight=1.5, generation weight=0.5
    // weighted = (0.9*1.5 + 0.3*0.5) / (1.5+0.5) = (1.35+0.15)/2.0 = 0.75
    expect(result.score).toBe(0.75);
    expect(result.level).toBe('high');
  });

  it('scoreToLevel returns correct thresholds', () => {
    expect(assessor.scoreToLevel(1.0)).toBe('high');
    expect(assessor.scoreToLevel(0.7)).toBe('high');
    expect(assessor.scoreToLevel(0.69)).toBe('medium');
    expect(assessor.scoreToLevel(0.4)).toBe('medium');
    expect(assessor.scoreToLevel(0.39)).toBe('low');
    expect(assessor.scoreToLevel(0.0)).toBe('low');
  });

  it('sourceBreakdown percentages sum correctly', () => {
    const signals: ConfidenceSignal[] = [
      { source: 'user_data', confidence: 0.9, evidence: 'a' },
      { source: 'user_data', confidence: 0.8, evidence: 'b' },
      { source: 'tool_result', confidence: 0.7, evidence: 'c' },
      { source: 'generation', confidence: 0.3, evidence: 'd' },
    ];

    const result = assessor.assess(signals);
    const totalPct = Object.values(result.sourceBreakdown).reduce((a, b) => a + b, 0);

    expect(totalPct).toBeCloseTo(1.0);
    expect(result.sourceBreakdown.user_data).toBeCloseTo(0.5);
    expect(result.sourceBreakdown.tool_result).toBeCloseTo(0.25);
    expect(result.sourceBreakdown.generation).toBeCloseTo(0.25);
  });

  it('creates one uncertainty marker per source type with no duplicates', () => {
    const signals: ConfidenceSignal[] = [
      { source: 'user_data', confidence: 0.9, evidence: 'first user data' },
      { source: 'user_data', confidence: 0.8, evidence: 'second user data' },
      { source: 'tool_result', confidence: 0.7, evidence: 'tool output' },
    ];

    const result = assessor.assess(signals);
    const sources = result.uncertaintyMarkers.map(m => m.source);

    expect(result.uncertaintyMarkers).toHaveLength(2);
    expect(new Set(sources).size).toBe(sources.length);
    expect(sources).toContain('user_data');
    expect(sources).toContain('tool_result');
  });

  it('assessGenerated returns medium or low confidence', () => {
    const result = assessor.assessGenerated();

    expect(result.score).toBe(0.5);
    expect(result.level).toBe('medium');
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].source).toBe('generation');
  });

  it('explanation includes level and source types', () => {
    const signals: ConfidenceSignal[] = [
      { source: 'user_data', confidence: 0.9, evidence: 'pref' },
      { source: 'search_result', confidence: 0.8, evidence: 'web' },
    ];

    const result = assessor.assess(signals);

    expect(result.explanation).toContain('High confidence');
    expect(result.explanation).toContain('user_data');
    expect(result.explanation).toContain('search_result');
  });

  it('score is rounded to 2 decimal places', () => {
    // Create signals that would produce a non-round number
    const signals: ConfidenceSignal[] = [
      { source: 'inference', confidence: 0.333, evidence: 'a' },
      { source: 'generation', confidence: 0.666, evidence: 'b' },
    ];

    const result = assessor.assess(signals);
    const decimalPlaces = result.score.toString().split('.')[1]?.length ?? 0;

    expect(decimalPlaces).toBeLessThanOrEqual(2);
    expect(result.score).toBe(Math.round(result.score * 100) / 100);
  });
});
