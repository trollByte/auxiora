import { describe, it, expect } from 'vitest';
import { getPlanDefinition, getPlanQuotas, getAllPlans, isValidPlan } from '../src/plans.js';

describe('Plans', () => {
  describe('getPlanDefinition', () => {
    it('should return free plan', () => {
      const plan = getPlanDefinition('free');
      expect(plan.name).toBe('Free');
      expect(plan.priceMonthly).toBe(0);
    });

    it('should return pro plan', () => {
      const plan = getPlanDefinition('pro');
      expect(plan.name).toBe('Pro');
      expect(plan.priceMonthly).toBe(19);
    });

    it('should return team plan', () => {
      const plan = getPlanDefinition('team');
      expect(plan.name).toBe('Team');
      expect(plan.priceMonthly).toBe(49);
    });

    it('should return enterprise plan', () => {
      const plan = getPlanDefinition('enterprise');
      expect(plan.name).toBe('Enterprise');
      expect(plan.quotas.maxMessages).toBe(-1);
    });
  });

  describe('getPlanQuotas', () => {
    it('should return quotas for free plan', () => {
      const quotas = getPlanQuotas('free');
      expect(quotas.maxMessages).toBe(100);
      expect(quotas.maxSessions).toBe(3);
    });

    it('should return unlimited for enterprise', () => {
      const quotas = getPlanQuotas('enterprise');
      expect(quotas.maxMessages).toBe(-1);
      expect(quotas.maxSessions).toBe(-1);
    });
  });

  describe('getAllPlans', () => {
    it('should return all four plans', () => {
      const plans = getAllPlans();
      expect(plans).toHaveLength(4);
      const names = plans.map(p => p.plan);
      expect(names).toContain('free');
      expect(names).toContain('pro');
      expect(names).toContain('team');
      expect(names).toContain('enterprise');
    });
  });

  describe('isValidPlan', () => {
    it('should return true for valid plans', () => {
      expect(isValidPlan('free')).toBe(true);
      expect(isValidPlan('pro')).toBe(true);
      expect(isValidPlan('team')).toBe(true);
      expect(isValidPlan('enterprise')).toBe(true);
    });

    it('should return false for invalid plans', () => {
      expect(isValidPlan('platinum')).toBe(false);
      expect(isValidPlan('')).toBe(false);
    });
  });
});
