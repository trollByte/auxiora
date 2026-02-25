import type { ContextDomain } from '../schema.js';
import type { EncryptedStorage } from './persistence-adapter.js';
import { CorrectionStore } from './correction-store.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ArchitectPreferences {
  /** Serialized CorrectionStore (context detection learning data). */
  corrections: string;

  /** Serialized CustomWeights (user trait adjustments). */
  customWeights?: string;

  /** Serialized PreferenceHistory (timestamped preference changes). */
  preferenceHistory?: string;

  /** Serialized DecisionLog (cross-session decision tracking). */
  decisionLog?: string;

  /** Serialized FeedbackStore (response feedback collection). */
  feedbackStore?: string;

  /** Whether to show the context indicator pill in the chat UI. */
  showContextIndicator: boolean;

  /** Whether to show the sources/provenance button in the chat UI. */
  showSourcesButton: boolean;

  /** Whether to auto-detect context from messages. */
  autoDetectContext: boolean;

  /** User-set default context override (null = auto-detect). */
  defaultContext: ContextDomain | null;

  /** Per-domain usage counts (local analytics, never transmitted). */
  contextUsageHistory: Record<ContextDomain, number>;

  /** Total number of interactions with The Architect. */
  totalInteractions: number;

  /** Timestamp of first use. */
  firstUsed: number;

  /** Timestamp of last use. */
  lastUsed: number;

  /** Schema version for migration support. */
  version: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const CURRENT_VERSION = 2;

const ALL_DOMAINS: ContextDomain[] = [
  'security_review', 'code_engineering', 'architecture_design', 'debugging',
  'team_leadership', 'one_on_one', 'sales_pitch', 'negotiation',
  'marketing_content', 'strategic_planning', 'crisis_management',
  'creative_work', 'writing_content', 'decision_making',
  'learning_research', 'personal_development', 'general',
];

function emptyUsageHistory(): Record<ContextDomain, number> {
  const history = {} as Record<ContextDomain, number>;
  for (const domain of ALL_DOMAINS) {
    history[domain] = 0;
  }
  return history;
}

function createDefaults(): ArchitectPreferences {
  const now = Date.now();
  return {
    corrections: new CorrectionStore().serialize(),
    showContextIndicator: true,
    showSourcesButton: true,
    autoDetectContext: true,
    defaultContext: null,
    contextUsageHistory: emptyUsageHistory(),
    totalInteractions: 0,
    firstUsed: now,
    lastUsed: now,
    version: CURRENT_VERSION,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// ArchitectPersistence
// ────────────────────────────────────────────────────────────────────────────

export class ArchitectPersistence {
  private storage: EncryptedStorage;
  private static STORAGE_KEY = 'architect_preferences';

  constructor(storage: EncryptedStorage) {
    this.storage = storage;
  }

  /** Load preferences from encrypted storage. Returns defaults if none exist. */
  async load(): Promise<ArchitectPreferences> {
    const raw = await this.storage.get(ArchitectPersistence.STORAGE_KEY);
    if (raw === null) {
      return createDefaults();
    }

    const prefs = JSON.parse(raw) as ArchitectPreferences;
    return this.migrate(prefs);
  }

  /** Save preferences to encrypted storage. Updates lastUsed automatically. */
  async save(prefs: ArchitectPreferences): Promise<void> {
    prefs.lastUsed = Date.now();
    await this.storage.set(
      ArchitectPersistence.STORAGE_KEY,
      JSON.stringify(prefs),
    );
  }

  /** Increment usage count for a domain and total interactions. */
  async recordUsage(domain: ContextDomain): Promise<void> {
    const prefs = await this.load();
    prefs.contextUsageHistory[domain] = (prefs.contextUsageHistory[domain] ?? 0) + 1;
    prefs.totalInteractions++;
    await this.save(prefs);
  }

  /** Update the corrections field from a CorrectionStore instance. */
  async saveCorrections(store: CorrectionStore): Promise<void> {
    const prefs = await this.load();
    prefs.corrections = store.serialize();
    await this.save(prefs);
  }

  /** Get the top N most-used context domains, sorted by usage descending. */
  async getMostUsedContexts(topN: number): Promise<ContextDomain[]> {
    const prefs = await this.load();
    return (Object.entries(prefs.contextUsageHistory) as Array<[ContextDomain, number]>)
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)
      .map(([domain]) => domain);
  }

  /** Delete all stored Architect data (user privacy). */
  async clearAll(): Promise<void> {
    await this.storage.delete(ArchitectPersistence.STORAGE_KEY);
  }

  /** Export all data as JSON string (user data portability). */
  async exportAll(): Promise<string> {
    const prefs = await this.load();
    return JSON.stringify(prefs, null, 2);
  }

  /** Handle version upgrades for stored preferences. */
  private async migrate(prefs: ArchitectPreferences): Promise<ArchitectPreferences> {
    if (prefs.version === CURRENT_VERSION) {
      return prefs;
    }

    // Version 0 → 1: add missing fields with defaults
    if (prefs.version === 0 || prefs.version === undefined) {
      const defaults = createDefaults();
      prefs.showContextIndicator ??= defaults.showContextIndicator;
      prefs.showSourcesButton ??= defaults.showSourcesButton;
      prefs.autoDetectContext ??= defaults.autoDetectContext;
      prefs.defaultContext ??= defaults.defaultContext;
      prefs.contextUsageHistory ??= defaults.contextUsageHistory;
      prefs.totalInteractions ??= defaults.totalInteractions;
      prefs.firstUsed ??= defaults.firstUsed;
      prefs.lastUsed ??= defaults.lastUsed;
      prefs.corrections ??= defaults.corrections;

      // Ensure all domains exist in usage history
      for (const domain of ALL_DOMAINS) {
        prefs.contextUsageHistory[domain] ??= 0;
      }

      prefs.version = 1;
    }

    // Version 1 → 2: add self-awareness modules (preference history, decision log, feedback store)
    if (prefs.version === 1) {
      prefs.preferenceHistory ??= undefined;
      prefs.decisionLog ??= undefined;
      prefs.feedbackStore ??= undefined;

      prefs.version = CURRENT_VERSION;
    }

    await this.save(prefs);

    return prefs;
  }
}
