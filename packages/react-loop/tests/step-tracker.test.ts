import { describe, it, expect } from 'vitest';
import { StepTracker } from '../src/step-tracker.js';
import type { ReActStep } from '../src/types.js';

function makeStep(overrides: Partial<ReActStep> & Pick<ReActStep, 'type' | 'content'>): ReActStep {
  return {
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('StepTracker', () => {
  it('tracks steps and returns copies', () => {
    const tracker = new StepTracker();
    const step = makeStep({ type: 'thought', content: 'thinking' });
    tracker.addStep(step);

    const steps = tracker.getSteps();
    expect(steps).toHaveLength(1);
    expect(steps[0].content).toBe('thinking');

    // Should be a copy
    steps.push(makeStep({ type: 'thought', content: 'extra' }));
    expect(tracker.getSteps()).toHaveLength(1);
  });

  it('summarizes steps correctly', () => {
    const tracker = new StepTracker();
    tracker.addStep(makeStep({ type: 'thought', content: 't1', durationMs: 10 }));
    tracker.addStep(makeStep({ type: 'action', content: 'a1', toolName: 'search', durationMs: 20 }));
    tracker.addStep(makeStep({ type: 'observation', content: 'o1', durationMs: 5 }));
    tracker.addStep(makeStep({ type: 'action', content: 'a2', toolName: 'write', durationMs: 30 }));
    tracker.addStep(makeStep({ type: 'observation', content: 'o2', durationMs: 5 }));
    tracker.addStep(makeStep({ type: 'thought', content: 't2', durationMs: 15 }));

    const summary = tracker.summarize();
    expect(summary.thoughts).toBe(2);
    expect(summary.actions).toBe(2);
    expect(summary.observations).toBe(2);
    expect(summary.uniqueTools).toContain('search');
    expect(summary.uniqueTools).toContain('write');
    expect(summary.uniqueTools).toHaveLength(2);
    expect(summary.totalDurationMs).toBe(85);
  });

  it('returns undefined when no action steps exist', () => {
    const tracker = new StepTracker();
    tracker.addStep(makeStep({ type: 'thought', content: 'thinking' }));
    expect(tracker.getLastAction()).toBeUndefined();
  });

  it('returns last action step', () => {
    const tracker = new StepTracker();
    tracker.addStep(makeStep({ type: 'action', content: 'first', toolName: 'a' }));
    tracker.addStep(makeStep({ type: 'observation', content: 'obs' }));
    tracker.addStep(makeStep({ type: 'action', content: 'second', toolName: 'b' }));
    tracker.addStep(makeStep({ type: 'thought', content: 'thinking' }));

    const last = tracker.getLastAction();
    expect(last).toBeDefined();
    expect(last!.toolName).toBe('b');
  });

  describe('detectLoop', () => {
    it('returns false with insufficient actions', () => {
      const tracker = new StepTracker();
      tracker.addStep(makeStep({ type: 'action', content: 'a', toolName: 'search', toolParams: { q: '1' } }));
      expect(tracker.detectLoop()).toBe(false);
    });

    it('detects repeated tool+params pattern', () => {
      const tracker = new StepTracker();
      const params = { query: 'stuck' };
      for (let i = 0; i < 4; i++) {
        tracker.addStep(makeStep({ type: 'action', content: 'a', toolName: 'search', toolParams: params }));
      }
      expect(tracker.detectLoop()).toBe(true);
    });

    it('does not flag different tools as loop', () => {
      const tracker = new StepTracker();
      tracker.addStep(makeStep({ type: 'action', content: 'a', toolName: 'search', toolParams: { q: '1' } }));
      tracker.addStep(makeStep({ type: 'action', content: 'a', toolName: 'write', toolParams: { q: '1' } }));
      tracker.addStep(makeStep({ type: 'action', content: 'a', toolName: 'search', toolParams: { q: '1' } }));
      tracker.addStep(makeStep({ type: 'action', content: 'a', toolName: 'write', toolParams: { q: '1' } }));
      expect(tracker.detectLoop()).toBe(false);
    });

    it('respects custom window size', () => {
      const tracker = new StepTracker();
      const params = { query: 'stuck' };
      for (let i = 0; i < 2; i++) {
        tracker.addStep(makeStep({ type: 'action', content: 'a', toolName: 'search', toolParams: params }));
      }
      expect(tracker.detectLoop(2)).toBe(true);
      expect(tracker.detectLoop(3)).toBe(false);
    });
  });

  describe('toMarkdown', () => {
    it('produces formatted markdown summary', () => {
      const tracker = new StepTracker();
      tracker.addStep(makeStep({ type: 'thought', content: 'analyzing', durationMs: 10 }));
      tracker.addStep(makeStep({ type: 'action', content: 'running search', toolName: 'search', durationMs: 20 }));
      tracker.addStep(makeStep({ type: 'observation', content: 'found result', durationMs: 5 }));
      tracker.addStep(makeStep({ type: 'answer', content: 'the answer is 42' }));

      const md = tracker.toMarkdown();
      expect(md).toContain('## ReAct Loop Summary');
      expect(md).toContain('**Thoughts:** 1');
      expect(md).toContain('**Actions:** 1');
      expect(md).toContain('**Observations:** 1');
      expect(md).toContain('search');
      expect(md).toContain('**[thought]**');
      expect(md).toContain('**[action]** search:');
      expect(md).toContain('**[observation]**');
      expect(md).toContain('**[answer]**');
    });

    it('shows none when no tools used', () => {
      const tracker = new StepTracker();
      tracker.addStep(makeStep({ type: 'thought', content: 'just thinking' }));
      const md = tracker.toMarkdown();
      expect(md).toContain('**Unique tools:** none');
    });
  });
});
