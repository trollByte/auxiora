import { describe, it, expect, afterEach } from 'vitest';
import { RateLimitCooldown } from '@auxiora/telemetry';
import { LearningStore } from '@auxiora/telemetry';
import { LearningStage } from '../src/enrichment/stages/learning-stage.js';
import type { EnrichmentContext } from '../src/enrichment/types.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const makeCtx = (): EnrichmentContext => ({
  basePrompt: 'You are helpful.',
  userMessage: 'Hello',
  history: [],
  channelType: 'web',
  chatId: 'c1',
  sessionId: 's1',
  userId: 'u1',
  toolsUsed: [],
  config: {} as any,
});

describe('Self-Improving Runtime Wiring', () => {
  it('RateLimitCooldown integrates with provider failure tracking', () => {
    const cooldown = new RateLimitCooldown({
      windowMs: 60_000,
      failureThreshold: 3,
      cooldownMs: 30_000,
    });

    // Simulate provider failures
    cooldown.recordFailure('openai');
    cooldown.recordFailure('openai');
    expect(cooldown.isCoolingDown('openai')).toBe(false);

    cooldown.recordFailure('openai');
    expect(cooldown.isCoolingDown('openai')).toBe(true);

    // Fallback provider still available
    expect(cooldown.isCoolingDown('anthropic')).toBe(false);

    // getStatus reflects state
    const statuses = cooldown.getStatus();
    const openaiStatus = statuses.find((s) => s.key === 'openai');
    expect(openaiStatus?.coolingDown).toBe(true);
    expect(openaiStatus?.failureCount).toBe(3);
  });

  it('LearningStage integrates with LearningStore-shaped data', async () => {
    const mockLearnings = [
      { content: 'Validate all inputs', category: 'warning', occurrences: 3 },
      { content: 'Use exponential backoff', category: 'pattern', occurrences: 1 },
    ];

    const stage = new LearningStage(() => mockLearnings);
    expect(stage.enabled(makeCtx())).toBe(true);

    const result = await stage.enrich(makeCtx(), 'Base prompt.');
    expect(result.prompt).toContain('[Learned Patterns]');
    expect(result.prompt).toContain('Validate all inputs');
    expect(result.prompt).toContain('(seen 3x)');
    expect(result.prompt).not.toContain('(seen 1x)');
    expect(result.metadata?.learningCount).toBe(2);
  });

  describe('LearningStore -> LearningStage end-to-end', () => {
    let store: LearningStore;
    let tmpDir: string;

    afterEach(() => {
      store?.close();
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it('extracts learnings from job output and feeds LearningStage', async () => {
      tmpDir = mkdtempSync(join(tmpdir(), 'wiring-'));
      store = new LearningStore(join(tmpDir, 'learn.db'));

      // Simulate job output with embedded learnings
      const jobOutput = [
        'Task completed successfully.',
        'Warning: API keys should be rotated every 90 days',
        'Pattern: Retry with jitter reduces thundering herd',
        'Warning: API keys should be rotated every 90 days',
      ].join('\n');

      const extracted = store.extractAndStore(jobOutput, 'job-1', 'code-review');
      expect(extracted).toBe(3); // 2 warnings (one duplicate) + 1 pattern

      // Wire learnings into the stage via structural typing
      const recent = store.getRecent(10);
      const stage = new LearningStage(() =>
        recent.map((l) => ({
          content: l.content,
          category: l.category,
          occurrences: l.occurrences,
        })),
      );

      expect(stage.enabled(makeCtx())).toBe(true);
      const result = await stage.enrich(makeCtx(), 'Base.');
      expect(result.prompt).toContain('API keys should be rotated every 90 days');
      expect(result.prompt).toContain('(seen 2x)');
      expect(result.prompt).toContain('Retry with jitter');
      expect(result.metadata?.learningCount).toBe(2);
    });
  });
});
