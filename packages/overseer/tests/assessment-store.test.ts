import { describe, it, expect, afterEach } from 'vitest';
import { AssessmentStore } from '../src/assessment-store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AssessmentResult } from '../src/types.js';

describe('AssessmentStore', () => {
  let store: AssessmentStore;
  let tmpDir: string;

  afterEach(() => {
    store?.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores and retrieves assessments', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'as-'));
    store = new AssessmentStore(join(tmpDir, 'assessments.db'));

    const assessment: AssessmentResult = {
      agentId: 'agent-1',
      heuristicAlerts: [{ type: 'loop_detected', agentId: 'agent-1', message: 'loop', severity: 'warning', detectedAt: 1000 }],
      action: 'alert',
      assessedAt: Date.now(),
    };

    store.record(assessment);
    const results = store.getByAgent('agent-1');
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('alert');
    expect(results[0].heuristicAlerts).toHaveLength(1);
  });

  it('stores assessments with LLM data', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'as-'));
    store = new AssessmentStore(join(tmpDir, 'assessments.db'));

    const assessment: AssessmentResult = {
      agentId: 'agent-2',
      heuristicAlerts: [{ type: 'budget_exceeded', agentId: 'agent-2', message: 'over budget', severity: 'critical', detectedAt: 2000 }],
      llmAssessment: { severity: 'critical', reasoning: 'Agent has used too many tokens', suggestedAction: 'cancel', notification: 'Stop' },
      action: 'cancel',
      notification: 'Stop',
      assessedAt: Date.now(),
    };

    store.record(assessment);
    const results = store.getByAgent('agent-2');
    expect(results[0].llmAssessment?.reasoning).toBe('Agent has used too many tokens');
    expect(results[0].notification).toBe('Stop');
  });

  it('filters by action type', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'as-'));
    store = new AssessmentStore(join(tmpDir, 'assessments.db'));

    store.record({ agentId: 'a', heuristicAlerts: [], action: 'none', assessedAt: 1000 });
    store.record({ agentId: 'b', heuristicAlerts: [{ type: 'stall_detected', agentId: 'b', message: 'stall', severity: 'warning', detectedAt: 2000 }], action: 'alert', assessedAt: 2000 });
    store.record({ agentId: 'c', heuristicAlerts: [{ type: 'loop_detected', agentId: 'c', message: 'loop', severity: 'critical', detectedAt: 3000 }], action: 'cancel', assessedAt: 3000 });

    const cancels = store.getByAction('cancel');
    expect(cancels).toHaveLength(1);
    expect(cancels[0].agentId).toBe('c');
  });

  it('returns recent assessments with limit', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'as-'));
    store = new AssessmentStore(join(tmpDir, 'assessments.db'));

    for (let i = 0; i < 5; i++) {
      store.record({ agentId: `a${i}`, heuristicAlerts: [], action: 'none', assessedAt: i * 1000 });
    }

    const recent = store.getRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].agentId).toBe('a4');
  });
});
