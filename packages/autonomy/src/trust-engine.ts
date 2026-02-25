import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { paths } from '@auxiora/core';
import type {
  TrustLevel,
  TrustDomain,
  TrustConfig,
  TrustEvidence,
  TrustPromotion,
  TrustDemotion,
  TrustState,
} from './types.js';
import {
  DEFAULT_TRUST_CONFIG,
  ALL_TRUST_DOMAINS,
} from './types.js';

function makeFreshEvidence(): TrustEvidence {
  return { successes: 0, failures: 0, lastActionAt: 0 };
}

function makeFreshState(defaultLevel: TrustLevel): TrustState {
  const levels = {} as Record<TrustDomain, TrustLevel>;
  const evidence = {} as Record<TrustDomain, TrustEvidence>;
  for (const domain of ALL_TRUST_DOMAINS) {
    levels[domain] = defaultLevel;
    evidence[domain] = makeFreshEvidence();
  }
  return { levels, evidence, promotions: [], demotions: [] };
}

export class TrustEngine {
  private state: TrustState;
  private config: TrustConfig;
  private statePath: string;

  constructor(config?: Partial<TrustConfig>, statePath?: string) {
    this.config = { ...DEFAULT_TRUST_CONFIG, ...config };
    this.statePath = statePath ?? path.join(paths.data(), 'trust-state.json');
    this.state = makeFreshState(this.config.defaultLevel);
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.statePath, 'utf-8');
      const parsed = JSON.parse(raw) as TrustState;
      this.state = parsed;

      // Ensure all domains exist (in case new ones were added)
      for (const domain of ALL_TRUST_DOMAINS) {
        if (this.state.levels[domain] === undefined) {
          this.state.levels[domain] = this.config.defaultLevel;
        }
        if (!this.state.evidence[domain]) {
          this.state.evidence[domain] = makeFreshEvidence();
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, use fresh state
    }
  }

  async save(): Promise<void> {
    const dir = path.dirname(this.statePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  getTrustLevel(domain: TrustDomain): TrustLevel {
    return this.state.levels[domain] ?? this.config.defaultLevel;
  }

  getAllLevels(): Record<TrustDomain, TrustLevel> {
    return { ...this.state.levels };
  }

  getEvidence(domain: TrustDomain): TrustEvidence {
    return { ...(this.state.evidence[domain] ?? makeFreshEvidence()) };
  }

  async setTrustLevel(domain: TrustDomain, level: TrustLevel, reason: string): Promise<void> {
    const current = this.getTrustLevel(domain);
    if (level === current) return;

    if (level > current) {
      this.state.promotions.push({
        domain,
        fromLevel: current,
        toLevel: level,
        reason,
        timestamp: Date.now(),
        automatic: false,
      });
      this.state.evidence[domain].lastPromotedAt = Date.now();
    } else {
      this.state.demotions.push({
        domain,
        fromLevel: current,
        toLevel: level,
        reason,
        timestamp: Date.now(),
      });
      this.state.evidence[domain].lastDemotedAt = Date.now();
    }

    this.state.levels[domain] = level;
    await this.save();
  }

  checkPermission(domain: TrustDomain, requiredLevel: TrustLevel): boolean {
    return this.getTrustLevel(domain) >= requiredLevel;
  }

  async recordOutcome(domain: TrustDomain, success: boolean): Promise<TrustPromotion | TrustDemotion | null> {
    const ev = this.state.evidence[domain] ?? makeFreshEvidence();
    ev.lastActionAt = Date.now();

    if (success) {
      ev.successes++;
      ev.failures = 0; // Reset consecutive failure count on success
    } else {
      ev.failures++;
    }

    this.state.evidence[domain] = ev;

    // Check for auto-demotion
    if (ev.failures >= this.config.demotionThreshold) {
      const current = this.getTrustLevel(domain);
      if (current > 0) {
        const newLevel = (current - 1) as TrustLevel;
        const demotion: TrustDemotion = {
          domain,
          fromLevel: current,
          toLevel: newLevel,
          reason: `Automatic demotion after ${ev.failures} consecutive failures`,
          timestamp: Date.now(),
        };
        this.state.levels[domain] = newLevel;
        this.state.demotions.push(demotion);
        ev.failures = 0;
        ev.lastDemotedAt = Date.now();
        await this.save();
        return demotion;
      }
    }

    // Check for auto-promotion
    const promotion = this.evaluatePromotion(domain);
    if (promotion) {
      this.state.levels[domain] = promotion.toLevel;
      this.state.promotions.push(promotion);
      ev.successes = 0; // Reset counter after promotion
      ev.lastPromotedAt = Date.now();
      await this.save();
      return promotion;
    }

    await this.save();
    return null;
  }

  evaluatePromotion(domain: TrustDomain): TrustPromotion | null {
    if (!this.config.autoPromote) return null;

    const current = this.getTrustLevel(domain);
    if (current >= this.config.autoPromoteCeiling) return null;
    if (current >= 4) return null;

    const ev = this.state.evidence[domain];
    if (!ev || ev.successes < this.config.promotionThreshold) return null;

    const newLevel = (current + 1) as TrustLevel;
    return {
      domain,
      fromLevel: current,
      toLevel: newLevel,
      reason: `Automatic promotion after ${ev.successes} successful actions`,
      timestamp: Date.now(),
      automatic: true,
    };
  }

  async demote(domain: TrustDomain, reason: string): Promise<TrustDemotion | null> {
    const current = this.getTrustLevel(domain);
    if (current <= 0) return null;

    const newLevel = (current - 1) as TrustLevel;
    const demotion: TrustDemotion = {
      domain,
      fromLevel: current,
      toLevel: newLevel,
      reason,
      timestamp: Date.now(),
    };

    this.state.levels[domain] = newLevel;
    this.state.demotions.push(demotion);
    this.state.evidence[domain].lastDemotedAt = Date.now();
    await this.save();
    return demotion;
  }

  getPromotions(): TrustPromotion[] {
    return [...this.state.promotions];
  }

  getDemotions(): TrustDemotion[] {
    return [...this.state.demotions];
  }

  getState(): TrustState {
    return JSON.parse(JSON.stringify(this.state)) as TrustState;
  }
}
