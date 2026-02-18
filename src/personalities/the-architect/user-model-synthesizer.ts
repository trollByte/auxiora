import type { ContextDomain, TraitMix } from '../schema.js';
import type { PreferenceHistory, PreferenceConflict } from './preference-history.js';
import type { DecisionLog, Decision } from './decision-log.js';
import type { FeedbackStore } from './feedback-store.js';
import type { CorrectionStore } from './correction-store.js';
import type { ArchitectPreferences } from './persistence.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface DomainProfile {
  domain: ContextDomain;
  count: number;
  share: number;               // 0.0-1.0, proportion of total
  satisfactionRate: number | null;  // helpful / total for domain, null if no feedback
  feedbackCount: number;
}

export interface CommunicationStyle {
  verbosityPreference: number;  // effective offset from preference history
  warmthPreference: number;
  humorPreference: number;
  verbosityLabel: 'concise' | 'balanced' | 'detailed';
  toneLabel: 'analytical' | 'balanced' | 'warm';
}

export interface SatisfactionProfile {
  overallTrend: 'improving' | 'declining' | 'stable';
  strongDomains: ContextDomain[];  // >80% helpful + >=3 entries
  weakDomains: ContextDomain[];    // from FeedbackInsight
  totalFeedback: number;
}

export interface CorrectionSummary {
  totalCorrections: number;
  topPatterns: Array<{ from: ContextDomain; to: ContextDomain; count: number }>;  // top 3
}

export interface UserModel {
  synthesizedAt: number;
  topDomains: DomainProfile[];          // top 5 by usage, non-zero only
  communicationStyle: CommunicationStyle;
  satisfaction: SatisfactionProfile;
  activeDecisions: Decision[];          // status 'active' | 'revisit'
  dueFollowUps: Decision[];
  preferenceConflicts: PreferenceConflict[];
  correctionSummary: CorrectionSummary;
  totalInteractions: number;
  firstUsed: number;
  lastUsed: number;
  narrative: string;                    // 1-3 template-generated sentences
}

// ────────────────────────────────────────────────────────────────────────────
// Dependencies interface
// ────────────────────────────────────────────────────────────────────────────

interface SynthesizerDeps {
  preferenceHistory: PreferenceHistory;
  decisionLog: DecisionLog;
  feedbackStore: FeedbackStore;
  correctionStore: CorrectionStore;
  preferences?: ArchitectPreferences;
}

// ────────────────────────────────────────────────────────────────────────────
// UserModelSynthesizer
// ────────────────────────────────────────────────────────────────────────────

/**
 * Read-only aggregator that synthesizes a coherent user model from
 * all personality engine data stores. Does not persist its own state.
 *
 * Instantiate fresh and call `synthesize()` to produce a `UserModel`.
 */
export class UserModelSynthesizer {
  private readonly preferenceHistory: PreferenceHistory;
  private readonly decisionLog: DecisionLog;
  private readonly feedbackStore: FeedbackStore;
  private readonly correctionStore: CorrectionStore;
  private readonly preferences?: ArchitectPreferences;

  constructor(deps: SynthesizerDeps) {
    this.preferenceHistory = deps.preferenceHistory;
    this.decisionLog = deps.decisionLog;
    this.feedbackStore = deps.feedbackStore;
    this.correctionStore = deps.correctionStore;
    this.preferences = deps.preferences;
  }

  /** Synthesize a complete user model. Pure computation, no side effects. */
  synthesize(): UserModel {
    const topDomains = this.buildDomainProfiles();
    const communicationStyle = this.buildCommunicationStyle();
    const satisfaction = this.buildSatisfactionProfile();
    const activeDecisions = this.getActiveDecisions();
    const dueFollowUps = this.decisionLog.getDueFollowUps();
    const preferenceConflicts = this.preferenceHistory.detectConflicts();
    const correctionSummary = this.buildCorrectionSummary();

    const totalInteractions = this.preferences?.totalInteractions ?? 0;
    const firstUsed = this.preferences?.firstUsed ?? 0;
    const lastUsed = this.preferences?.lastUsed ?? 0;

    const narrative = this.generateNarrative(
      topDomains,
      communicationStyle,
      satisfaction,
      activeDecisions,
      totalInteractions,
    );

    return {
      synthesizedAt: Date.now(),
      topDomains,
      communicationStyle,
      satisfaction,
      activeDecisions,
      dueFollowUps,
      preferenceConflicts,
      correctionSummary,
      totalInteractions,
      firstUsed,
      lastUsed,
      narrative,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Build domain profiles from contextUsageHistory.
   * Returns top 5 non-zero domains sorted by count descending.
   */
  private buildDomainProfiles(): DomainProfile[] {
    const usage = this.preferences?.contextUsageHistory;
    if (!usage) return [];

    const total = Object.values(usage).reduce((sum, n) => sum + n, 0);
    if (total === 0) return [];

    const profiles: DomainProfile[] = [];

    for (const [domain, count] of Object.entries(usage) as Array<[ContextDomain, number]>) {
      if (count === 0) continue;

      const feedback = this.feedbackStore.getForDomain(domain);
      const feedbackCount = feedback.length;
      let satisfactionRate: number | null = null;

      if (feedbackCount > 0) {
        const helpful = feedback.filter(f => f.rating === 'helpful').length;
        satisfactionRate = helpful / feedbackCount;
      }

      profiles.push({
        domain,
        count,
        share: count / total,
        satisfactionRate,
        feedbackCount,
      });
    }

    // Sort by count descending, take top 5
    profiles.sort((a, b) => b.count - a.count);
    return profiles.slice(0, 5);
  }

  /**
   * Build communication style from preference history effective offsets.
   * Factors in feedback-suggested adjustments.
   */
  private buildCommunicationStyle(): CommunicationStyle {
    let verbosityPreference = this.preferenceHistory.getEffectiveOffset('verbosity');
    let warmthPreference = this.preferenceHistory.getEffectiveOffset('warmth');
    const humorPreference = this.preferenceHistory.getEffectiveOffset('humor');

    // Factor in feedback-suggested adjustments
    const insights = this.feedbackStore.getInsights();
    if (insights.suggestedAdjustments.verbosity !== undefined) {
      verbosityPreference += insights.suggestedAdjustments.verbosity;
    }
    if (insights.suggestedAdjustments.warmth !== undefined) {
      warmthPreference += insights.suggestedAdjustments.warmth;
    }

    const verbosityLabel: CommunicationStyle['verbosityLabel'] =
      verbosityPreference < -0.1 ? 'concise' :
        verbosityPreference > 0.1 ? 'detailed' : 'balanced';

    const toneLabel: CommunicationStyle['toneLabel'] =
      warmthPreference < -0.1 ? 'analytical' :
        warmthPreference > 0.1 ? 'warm' : 'balanced';

    return {
      verbosityPreference,
      warmthPreference,
      humorPreference,
      verbosityLabel,
      toneLabel,
    };
  }

  /**
   * Build satisfaction profile from feedback store insights.
   * Strong domains: >80% helpful with >=3 feedback entries.
   */
  private buildSatisfactionProfile(): SatisfactionProfile {
    const insights = this.feedbackStore.getInsights();

    // Compute strong domains: >80% helpful rate with >=3 entries
    const strongDomains: ContextDomain[] = [];
    const usage = this.preferences?.contextUsageHistory;

    if (usage) {
      for (const domain of Object.keys(usage) as ContextDomain[]) {
        const feedback = this.feedbackStore.getForDomain(domain);
        if (feedback.length >= 3) {
          const helpful = feedback.filter(f => f.rating === 'helpful').length;
          if (helpful / feedback.length > 0.8) {
            strongDomains.push(domain);
          }
        }
      }
    }

    return {
      overallTrend: insights.trend,
      strongDomains,
      weakDomains: insights.weakDomains,
      totalFeedback: insights.totalFeedback,
    };
  }

  /**
   * Get active and revisit decisions.
   */
  private getActiveDecisions(): Decision[] {
    const active = this.decisionLog.query({ status: 'active', limit: 10 });
    const revisit = this.decisionLog.query({ status: 'revisit', limit: 5 });

    // Merge, deduplicating by id
    const seen = new Set(active.map(d => d.id));
    const merged = [...active];
    for (const d of revisit) {
      if (!seen.has(d.id)) {
        merged.push(d);
      }
    }
    return merged;
  }

  /**
   * Build correction summary from correction store stats.
   */
  private buildCorrectionSummary(): CorrectionSummary {
    const stats = this.correctionStore.getStats();
    return {
      totalCorrections: stats.totalCorrections,
      topPatterns: stats.topMisclassifications.slice(0, 3),
    };
  }

  /**
   * Generate a deterministic 1-3 sentence narrative describing the user.
   */
  private generateNarrative(
    topDomains: DomainProfile[],
    style: CommunicationStyle,
    satisfaction: SatisfactionProfile,
    activeDecisions: Decision[],
    totalInteractions: number,
  ): string {
    const sentences: string[] = [];

    // Sentence 1: domain focus
    if (totalInteractions === 0) {
      sentences.push('This is a new user with no interaction history yet.');
    } else if (totalInteractions < 5) {
      sentences.push(`This user is just getting started, with ${totalInteractions} interaction${totalInteractions === 1 ? '' : 's'} so far.`);
    } else if (topDomains.length === 0) {
      sentences.push(`This user has ${totalInteractions} interactions but no domain usage recorded.`);
    } else if (topDomains.length === 1) {
      const d = topDomains[0];
      const pct = Math.round(d.share * 100);
      sentences.push(`This user primarily works in ${formatDomain(d.domain)} (${pct}% of ${totalInteractions} interactions).`);
    } else {
      const names = topDomains.slice(0, 3).map(d => formatDomain(d.domain));
      const last = names.pop()!;
      sentences.push(`Across ${totalInteractions} interactions, this user focuses on ${names.join(', ')} and ${last}.`);
    }

    // Sentence 2: communication style (only if non-balanced)
    if (style.verbosityLabel !== 'balanced' || style.toneLabel !== 'balanced') {
      let styleSentence = 'They prefer ';
      styleSentence += style.verbosityLabel !== 'balanced'
        ? `${style.verbosityLabel} responses`
        : 'responses';

      if (style.toneLabel !== 'balanced') {
        styleSentence += ` with a ${style.toneLabel} tone`;
      }
      styleSentence += '.';
      sentences.push(styleSentence);
    }

    // Sentence 3: satisfaction or activity
    if (satisfaction.overallTrend === 'declining') {
      sentences.push('Recent satisfaction has been declining -- responses may need recalibration.');
    } else if (activeDecisions.length > 0) {
      sentences.push(`They have ${activeDecisions.length} active decision thread${activeDecisions.length === 1 ? '' : 's'} being tracked.`);
    } else if (satisfaction.overallTrend === 'improving') {
      sentences.push('Satisfaction has been trending upward recently.');
    }

    return sentences.join(' ');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Format a domain slug as readable text (e.g. 'code_engineering' → 'code engineering'). */
function formatDomain(domain: ContextDomain): string {
  return domain.replace(/_/g, ' ');
}
