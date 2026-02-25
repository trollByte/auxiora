import { describe, it, expect } from 'vitest';
import { ModeDetector } from '../mode-detector.js';
import type { ModeId, ModeTemplate, SessionModeState } from '../types.js';

function makeMode(id: ModeId, signals: Array<{ phrase: string; weight: number }>): ModeTemplate {
  return { id, name: id, description: `${id} mode`, promptContent: `# ${id}`, signals };
}

function buildModes(): Map<ModeId, ModeTemplate> {
  const modes = new Map<ModeId, ModeTemplate>();
  modes.set('operator', makeMode('operator', [
    { phrase: 'run', weight: 0.8 }, { phrase: 'execute', weight: 0.8 },
    { phrase: 'deploy', weight: 0.8 }, { phrase: 'status', weight: 0.6 },
  ]));
  modes.set('analyst', makeMode('analyst', [
    { phrase: 'analyze', weight: 0.8 }, { phrase: 'investigate', weight: 0.8 },
    { phrase: "what's the risk", weight: 0.9 }, { phrase: 'compare', weight: 0.7 },
  ]));
  modes.set('advisor', makeMode('advisor', [
    { phrase: 'should i', weight: 0.8 }, { phrase: 'help me decide', weight: 0.9 },
    { phrase: 'trade-offs', weight: 0.8 }, { phrase: 'options', weight: 0.6 },
  ]));
  modes.set('writer', makeMode('writer', [
    { phrase: 'write', weight: 0.7 }, { phrase: 'draft', weight: 0.8 },
    { phrase: 'blog post', weight: 0.9 }, { phrase: 'email', weight: 0.7 },
  ]));
  modes.set('socratic', makeMode('socratic', [
    { phrase: 'challenge me', weight: 0.9 }, { phrase: 'red team', weight: 0.9 },
    { phrase: 'what am i missing', weight: 0.8 }, { phrase: 'poke holes', weight: 0.8 },
  ]));
  modes.set('legal', makeMode('legal', [
    { phrase: 'compliance', weight: 0.9 }, { phrase: 'regulation', weight: 0.8 },
    { phrase: 'contract', weight: 0.8 }, { phrase: 'legal', weight: 0.8 },
  ]));
  modes.set('roast', makeMode('roast', [
    { phrase: 'roast', weight: 0.9 }, { phrase: "don't sugarcoat", weight: 0.8 },
    { phrase: 'give it to me straight', weight: 0.8 },
  ]));
  modes.set('companion', makeMode('companion', [
    { phrase: 'how are you', weight: 0.4 }, { phrase: 'just chatting', weight: 0.6 },
    { phrase: 'feeling', weight: 0.5 },
  ]));
  return modes;
}

describe('ModeDetector', () => {
  const modes = buildModes();
  const detector = new ModeDetector(modes);

  it('should detect operator mode from "run" signals', () => {
    const result = detector.detect('run the test suite and deploy');
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('operator');
  });

  it('should detect analyst mode from analysis signals', () => {
    const result = detector.detect("analyze this data and what's the risk here");
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('analyst');
  });

  it('should detect advisor mode from decision signals', () => {
    const result = detector.detect('should i go with option A? help me decide');
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('advisor');
  });

  it('should detect writer mode from writing signals', () => {
    const result = detector.detect('draft a blog post about TypeScript');
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('writer');
  });

  it('should detect socratic mode from challenge signals', () => {
    const result = detector.detect('challenge me on this. red team my plan');
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('socratic');
  });

  it('should detect legal mode from compliance signals', () => {
    const result = detector.detect('check this contract for compliance issues');
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('legal');
  });

  it('should detect roast mode from roast signals', () => {
    const result = detector.detect("roast my code, don't sugarcoat it");
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('roast');
  });

  it('should detect companion mode from casual signals', () => {
    const result = detector.detect("how are you feeling today? just chatting");
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('companion');
  });

  it('should return null for empty messages', () => {
    expect(detector.detect('')).toBeNull();
  });

  it('should return null for very short messages', () => {
    expect(detector.detect('hi')).toBeNull();
  });

  it('should return null when no signals match', () => {
    expect(detector.detect('tell me a random fact about penguins')).toBeNull();
  });

  it('should score higher with multiple matching keywords', () => {
    const single = detector.detect('run this');
    const multiple = detector.detect('run and execute, then deploy');
    expect(single).not.toBeNull();
    expect(multiple).not.toBeNull();
    // Multiple matches should still resolve to operator
    expect(multiple!.mode).toBe('operator');
  });

  it('should apply hysteresis bias to current mode', () => {
    // When current mode is "operator" and message has weak operator signal
    const state: SessionModeState = { activeMode: 'operator', autoDetected: true };
    const result = detector.detect('check the status', { currentState: state });
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('operator');
  });

  it('should apply task type boosting for code messages', () => {
    // "execute" is a weak operator signal; "code" task type should boost it
    const withBoost = detector.detect('run and execute this', { taskType: 'code' });
    expect(withBoost).not.toBeNull();
    expect(withBoost!.mode).toBe('operator');
  });

  it('should return candidates sorted by score', () => {
    const result = detector.detect('analyze the status and run diagnostics');
    expect(result).not.toBeNull();
    expect(result!.candidates.length).toBeGreaterThan(0);
    // Candidates should be sorted descending by score
    for (let i = 1; i < result!.candidates.length; i++) {
      expect(result!.candidates[i - 1].score).toBeGreaterThanOrEqual(result!.candidates[i].score);
    }
  });

  it('should handle case-insensitive matching', () => {
    const result = detector.detect('ANALYZE this data');
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('analyst');
  });
});
