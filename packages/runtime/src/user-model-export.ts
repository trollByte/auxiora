import { getLogger } from '@auxiora/logger';

const logger = getLogger('runtime:user-model-export');

export interface UserModelView {
  /** Display name if known */
  displayName?: string;
  /** Communication preferences */
  communication: {
    preferredStyle: string;
    preferredTone: string;
    technicalDepth: string;
  };
  /** Domain expertise profiles */
  domains: DomainProfile[];
  /** Active preferences */
  preferences: PreferenceItem[];
  /** Recent decisions */
  recentDecisions: DecisionItem[];
  /** Satisfaction metrics */
  satisfaction: {
    overallScore: number;
    recentTrend: 'improving' | 'stable' | 'declining';
    lastFeedbackAt: number;
  };
  /** Memory statistics */
  memoryStats: {
    totalMemories: number;
    byCategory: Record<string, number>;
    oldestMemoryAt: number;
    newestMemoryAt: number;
  };
  /** When this model was last updated */
  lastUpdatedAt: number;
}

export interface DomainProfile {
  name: string;
  expertise: 'novice' | 'intermediate' | 'expert';
  interactionCount: number;
  lastActive: number;
}

export interface PreferenceItem {
  key: string;
  value: string;
  source: string;
  confidence: number;
  updatedAt: number;
}

export interface DecisionItem {
  id: string;
  summary: string;
  status: 'active' | 'completed' | 'abandoned';
  createdAt: number;
  followUpAt?: number;
}

/** Structural types for data sources */
export interface MemoryStatsSource {
  getStats(): Promise<{
    totalMemories: number;
    oldestMemory: number;
    newestMemory: number;
    averageImportance: number;
    topTags: Array<{ tag: string; count: number }>;
  }>;
  getByCategory(category: string): Promise<Array<{ category: string }>>;
}

export interface PreferenceSource {
  getAll(): Array<{ key: string; value: string; source: string; confidence: number; updatedAt: number }>;
}

export interface DecisionSource {
  getRecent(limit: number): Array<{
    id: string;
    summary: string;
    status: string;
    createdAt: number;
    followUpAt?: number;
  }>;
}

export class UserModelExporter {
  /**
   * Build a complete UserModelView from available data sources.
   * All sources are optional — missing sources produce sensible defaults.
   */
  async build(sources: {
    memoryStats?: MemoryStatsSource;
    preferences?: PreferenceSource;
    decisions?: DecisionSource;
    displayName?: string;
    communicationPrefs?: { style?: string; tone?: string; depth?: string };
    domains?: DomainProfile[];
    satisfaction?: { score: number; trend: 'improving' | 'stable' | 'declining'; lastFeedbackAt: number };
  }): Promise<UserModelView> {
    // Memory stats
    let memoryStats: UserModelView['memoryStats'] = {
      totalMemories: 0,
      byCategory: {},
      oldestMemoryAt: 0,
      newestMemoryAt: 0,
    };

    if (sources.memoryStats) {
      try {
        const stats = await sources.memoryStats.getStats();
        const categories = ['preference', 'fact', 'context', 'relationship', 'pattern', 'personality'];
        const byCategory: Record<string, number> = {};
        for (const cat of categories) {
          const entries = await sources.memoryStats.getByCategory(cat);
          byCategory[cat] = entries.length;
        }
        memoryStats = {
          totalMemories: stats.totalMemories,
          byCategory,
          oldestMemoryAt: stats.oldestMemory,
          newestMemoryAt: stats.newestMemory,
        };
      } catch (err) {
        logger.warn('Failed to load memory stats', { error: err instanceof Error ? err : new Error(String(err)) });
      }
    }

    // Preferences
    const preferences: PreferenceItem[] = sources.preferences
      ? sources.preferences.getAll().map(p => ({
          key: p.key,
          value: p.value,
          source: p.source,
          confidence: p.confidence,
          updatedAt: p.updatedAt,
        }))
      : [];

    // Decisions
    const recentDecisions: DecisionItem[] = sources.decisions
      ? sources.decisions.getRecent(10).map(d => ({
          id: d.id,
          summary: d.summary,
          status: d.status as DecisionItem['status'],
          createdAt: d.createdAt,
          followUpAt: d.followUpAt,
        }))
      : [];

    const model: UserModelView = {
      displayName: sources.displayName,
      communication: {
        preferredStyle: sources.communicationPrefs?.style ?? 'balanced',
        preferredTone: sources.communicationPrefs?.tone ?? 'friendly',
        technicalDepth: sources.communicationPrefs?.depth ?? 'intermediate',
      },
      domains: sources.domains ?? [],
      preferences,
      recentDecisions,
      satisfaction: sources.satisfaction
        ? {
            overallScore: sources.satisfaction.score,
            recentTrend: sources.satisfaction.trend,
            lastFeedbackAt: sources.satisfaction.lastFeedbackAt,
          }
        : {
            overallScore: 0,
            recentTrend: 'stable',
            lastFeedbackAt: 0,
          },
      memoryStats,
      lastUpdatedAt: Date.now(),
    };

    logger.debug('UserModel built', {
      memoryCount: memoryStats.totalMemories,
      preferenceCount: preferences.length,
      decisionCount: recentDecisions.length,
    });

    return model;
  }
}
