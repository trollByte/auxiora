import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { CostTracker } from '../cost-tracker.js';

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    // Use a temp path so we don't write to real workspace
    const tempPath = path.join(os.tmpdir(), `cost-test-${Date.now()}.json`);
    tracker = new CostTracker({ warnAt: 0.8 }, tempPath);
  });

  it('should start with zero spend', () => {
    const summary = tracker.getSummary();
    expect(summary.today).toBe(0);
    expect(summary.thisMonth).toBe(0);
    expect(summary.isOverBudget).toBe(false);
  });

  it('should track recorded costs', () => {
    tracker.record({
      timestamp: Date.now(),
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 1000,
      outputTokens: 500,
      cost: 0.0105,
    });

    expect(tracker.getTodaySpend()).toBeCloseTo(0.0105);
    expect(tracker.getMonthSpend()).toBeCloseTo(0.0105);
  });

  it('should aggregate multiple records', () => {
    tracker.record({ timestamp: Date.now(), provider: 'anthropic', model: 'claude', inputTokens: 1000, outputTokens: 500, cost: 0.01 });
    tracker.record({ timestamp: Date.now(), provider: 'openai', model: 'gpt-4o', inputTokens: 2000, outputTokens: 1000, cost: 0.02 });

    expect(tracker.getTodaySpend()).toBeCloseTo(0.03);
  });

  it('should track spend by provider', () => {
    tracker.record({ timestamp: Date.now(), provider: 'anthropic', model: 'claude', inputTokens: 1000, outputTokens: 500, cost: 0.01 });
    tracker.record({ timestamp: Date.now(), provider: 'openai', model: 'gpt', inputTokens: 1000, outputTokens: 500, cost: 0.02 });
    tracker.record({ timestamp: Date.now(), provider: 'anthropic', model: 'claude', inputTokens: 1000, outputTokens: 500, cost: 0.03 });

    const byProvider = tracker.getByProvider();
    expect(byProvider.get('anthropic')).toBeCloseTo(0.04);
    expect(byProvider.get('openai')).toBeCloseTo(0.02);
  });

  it('should track spend by model', () => {
    tracker.record({ timestamp: Date.now(), provider: 'anthropic', model: 'claude-sonnet', inputTokens: 1000, outputTokens: 500, cost: 0.01 });
    tracker.record({ timestamp: Date.now(), provider: 'anthropic', model: 'claude-opus', inputTokens: 1000, outputTokens: 500, cost: 0.05 });

    const byModel = tracker.getByModel();
    expect(byModel.get('claude-sonnet')).toBeCloseTo(0.01);
    expect(byModel.get('claude-opus')).toBeCloseTo(0.05);
  });

  describe('budget enforcement', () => {
    it('should detect over budget (daily)', () => {
      const budgetTracker = new CostTracker({ dailyBudget: 0.05, warnAt: 0.8 }, path.join(os.tmpdir(), `cost-budget-${Date.now()}.json`));
      budgetTracker.record({ timestamp: Date.now(), provider: 'anthropic', model: 'claude', inputTokens: 1000, outputTokens: 500, cost: 0.06 });

      const summary = budgetTracker.getSummary();
      expect(summary.isOverBudget).toBe(true);
      expect(summary.budgetRemaining).toBe(0);
    });

    it('should detect warning threshold', () => {
      const budgetTracker = new CostTracker({ dailyBudget: 1.0, warnAt: 0.8 }, path.join(os.tmpdir(), `cost-warn-${Date.now()}.json`));
      budgetTracker.record({ timestamp: Date.now(), provider: 'anthropic', model: 'claude', inputTokens: 1000, outputTokens: 500, cost: 0.85 });

      const summary = budgetTracker.getSummary();
      expect(summary.warningThresholdReached).toBe(true);
      expect(summary.isOverBudget).toBe(false);
    });

    it('should reject unaffordable requests', () => {
      const budgetTracker = new CostTracker({ dailyBudget: 0.10, warnAt: 0.8 }, path.join(os.tmpdir(), `cost-afford-${Date.now()}.json`));
      budgetTracker.record({ timestamp: Date.now(), provider: 'anthropic', model: 'claude', inputTokens: 1000, outputTokens: 500, cost: 0.08 });

      expect(budgetTracker.canAfford(0.05)).toBe(false);
      expect(budgetTracker.canAfford(0.01)).toBe(true);
    });

    it('should reject messages over per-message max', () => {
      const budgetTracker = new CostTracker({ perMessageMax: 0.01, warnAt: 0.8 }, path.join(os.tmpdir(), `cost-msg-${Date.now()}.json`));
      expect(budgetTracker.canAfford(0.02)).toBe(false);
      expect(budgetTracker.canAfford(0.005)).toBe(true);
    });
  });

  it('should reset all records', () => {
    tracker.record({ timestamp: Date.now(), provider: 'anthropic', model: 'claude', inputTokens: 1000, outputTokens: 500, cost: 0.05 });
    expect(tracker.getTodaySpend()).toBeGreaterThan(0);

    tracker.reset();
    expect(tracker.getTodaySpend()).toBe(0);
  });

  it('should not count old records in today spend', () => {
    // Record from earlier this month (but not today) so it counts in month but not today.
    // Use the 1st of the current month at midnight to guarantee it's within this month.
    const now = new Date();
    const earlierThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0).getTime();
    // If today IS the 1st, push it back 1ms so it's still "today" but use a different approach:
    // just subtract 1 hour — it's still today on the 1st but let's use a safe date instead.
    // We only need: not today + same month. If it's the 1st, there's no earlier day in the month,
    // so skip the month assertion in that edge case.
    const isFirstOfMonth = now.getDate() === 1;
    const timestamp = isFirstOfMonth
      ? Date.now() - 86400000 // yesterday (different month, skip month check)
      : earlierThisMonth;     // 1st of this month at midnight (same month, not today)

    tracker.record({ timestamp, provider: 'anthropic', model: 'claude', inputTokens: 1000, outputTokens: 500, cost: 1.00 });

    expect(tracker.getTodaySpend()).toBe(0);
    if (!isFirstOfMonth) {
      expect(tracker.getMonthSpend()).toBeCloseTo(1.00);
    }
  });
});
