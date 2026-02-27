import { describe, it, expect } from 'vitest';
import { ResourceGovernor } from '../src/resource-governor.js';

describe('ResourceGovernor', () => {
  it('allows cycle when under budget', () => {
    const gov = new ResourceGovernor({
      tokenBudgetPerHour: 10_000,
      maxVariantsPerDay: 50,
      pauseDuringUserActivity: false,
    });
    gov.recordTokenUsage(5_000);
    expect(gov.canRunCycle()).toBe(true);
  });

  it('blocks when token budget exceeded', () => {
    const gov = new ResourceGovernor({
      tokenBudgetPerHour: 10_000,
      maxVariantsPerDay: 50,
      pauseDuringUserActivity: false,
    });
    gov.recordTokenUsage(10_000);
    expect(gov.canRunCycle()).toBe(false);
    expect(gov.getStats().pauseReason).toBe('token budget exceeded');
  });

  it('allows after hourly window rolls', () => {
    const gov = new ResourceGovernor({
      tokenBudgetPerHour: 10_000,
      maxVariantsPerDay: 50,
      pauseDuringUserActivity: false,
    });
    gov.recordTokenUsage(10_000);
    expect(gov.canRunCycle()).toBe(false);
    gov.resetHourlyBudget();
    expect(gov.canRunCycle()).toBe(true);
    expect(gov.getStats().tokensUsedThisHour).toBe(0);
  });

  it('blocks at daily variant cap', () => {
    const gov = new ResourceGovernor({
      tokenBudgetPerHour: 100_000,
      maxVariantsPerDay: 3,
      pauseDuringUserActivity: false,
    });
    gov.recordVariantCreated();
    gov.recordVariantCreated();
    gov.recordVariantCreated();
    expect(gov.canRunCycle()).toBe(false);
    expect(gov.getStats().pauseReason).toBe('daily variant cap reached');
  });

  it('blocks during user activity', () => {
    const gov = new ResourceGovernor({
      tokenBudgetPerHour: 100_000,
      maxVariantsPerDay: 50,
      pauseDuringUserActivity: true,
      userActivityTimeoutMs: 60_000,
    });
    gov.recordUserActivity();
    expect(gov.canRunCycle()).toBe(false);
    expect(gov.getStats().pauseReason).toBe('user is active');
  });

  it('allows after activity timeout', () => {
    const gov = new ResourceGovernor({
      tokenBudgetPerHour: 100_000,
      maxVariantsPerDay: 50,
      pauseDuringUserActivity: true,
      userActivityTimeoutMs: 60_000,
    });
    // Set activity in the past, beyond timeout
    gov.setLastUserActivity(Date.now() - 120_000);
    expect(gov.canRunCycle()).toBe(true);
  });

  it('allows when pauseDuringUserActivity is false', () => {
    const gov = new ResourceGovernor({
      tokenBudgetPerHour: 100_000,
      maxVariantsPerDay: 50,
      pauseDuringUserActivity: false,
    });
    gov.recordUserActivity();
    expect(gov.canRunCycle()).toBe(true);
    expect(gov.getStats().paused).toBe(false);
  });

  it('reports usage stats correctly', () => {
    const gov = new ResourceGovernor({
      tokenBudgetPerHour: 10_000,
      maxVariantsPerDay: 20,
      pauseDuringUserActivity: false,
    });
    gov.recordTokenUsage(3_000);
    gov.recordVariantCreated();
    gov.recordVariantCreated();
    const stats = gov.getStats();
    expect(stats.tokensUsedThisHour).toBe(3_000);
    expect(stats.tokenBudgetRemaining).toBe(7_000);
    expect(stats.variantsCreatedToday).toBe(2);
    expect(stats.variantsRemainingToday).toBe(18);
    expect(stats.paused).toBe(false);
    expect(stats.pauseReason).toBeUndefined();
  });

  it('resets daily count', () => {
    const gov = new ResourceGovernor({
      tokenBudgetPerHour: 100_000,
      maxVariantsPerDay: 2,
      pauseDuringUserActivity: false,
    });
    gov.recordVariantCreated();
    gov.recordVariantCreated();
    expect(gov.canRunCycle()).toBe(false);
    gov.resetDailyCount();
    expect(gov.canRunCycle()).toBe(true);
    expect(gov.getStats().variantsCreatedToday).toBe(0);
  });
});
