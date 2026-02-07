import type { PlanDefinition, TenantPlan, TenantQuotas } from './types.js';

const PLAN_DEFINITIONS: Record<TenantPlan, PlanDefinition> = {
  free: {
    plan: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceYearly: 0,
    quotas: {
      maxMessages: 100,
      maxSessions: 3,
      maxStorageMb: 50,
      maxPlugins: 2,
      maxBehaviors: 5,
      maxChannels: 1,
      maxAgents: 1,
    },
    features: ['Single channel', 'Basic vault', 'Community support'],
  },
  pro: {
    plan: 'pro',
    name: 'Pro',
    priceMonthly: 19,
    priceYearly: 190,
    quotas: {
      maxMessages: 5000,
      maxSessions: 20,
      maxStorageMb: 1024,
      maxPlugins: 20,
      maxBehaviors: 50,
      maxChannels: 5,
      maxAgents: 3,
    },
    features: ['Multi-channel', 'Cloud vault', 'Priority support', 'Custom behaviors'],
  },
  team: {
    plan: 'team',
    name: 'Team',
    priceMonthly: 49,
    priceYearly: 490,
    quotas: {
      maxMessages: 25000,
      maxSessions: 100,
      maxStorageMb: 5120,
      maxPlugins: 50,
      maxBehaviors: 200,
      maxChannels: 20,
      maxAgents: 10,
    },
    features: ['All Pro features', 'Team collaboration', 'Orchestration', 'Audit logs'],
  },
  enterprise: {
    plan: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 199,
    priceYearly: 1990,
    quotas: {
      maxMessages: -1, // unlimited
      maxSessions: -1,
      maxStorageMb: -1,
      maxPlugins: -1,
      maxBehaviors: -1,
      maxChannels: -1,
      maxAgents: -1,
    },
    features: ['All Team features', 'Unlimited usage', 'SLA', 'Dedicated support', 'SSO'],
  },
};

export function getPlanDefinition(plan: TenantPlan): PlanDefinition {
  return PLAN_DEFINITIONS[plan];
}

export function getPlanQuotas(plan: TenantPlan): TenantQuotas {
  return PLAN_DEFINITIONS[plan].quotas;
}

export function getAllPlans(): PlanDefinition[] {
  return Object.values(PLAN_DEFINITIONS);
}

export function isValidPlan(plan: string): plan is TenantPlan {
  return plan in PLAN_DEFINITIONS;
}
