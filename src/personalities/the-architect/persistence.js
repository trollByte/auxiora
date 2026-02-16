import { CorrectionStore } from './correction-store.js';
// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────
const CURRENT_VERSION = 1;
const ALL_DOMAINS = [
    'security_review', 'code_engineering', 'architecture_design', 'debugging',
    'team_leadership', 'one_on_one', 'sales_pitch', 'negotiation',
    'marketing_content', 'strategic_planning', 'crisis_management',
    'creative_work', 'writing_content', 'decision_making',
    'learning_research', 'personal_development', 'general',
];
function emptyUsageHistory() {
    const history = {};
    for (const domain of ALL_DOMAINS) {
        history[domain] = 0;
    }
    return history;
}
function createDefaults() {
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
    storage;
    static STORAGE_KEY = 'architect_preferences';
    constructor(storage) {
        this.storage = storage;
    }
    /** Load preferences from encrypted storage. Returns defaults if none exist. */
    async load() {
        const raw = await this.storage.get(ArchitectPersistence.STORAGE_KEY);
        if (raw === null) {
            return createDefaults();
        }
        const prefs = JSON.parse(raw);
        return this.migrate(prefs);
    }
    /** Save preferences to encrypted storage. Updates lastUsed automatically. */
    async save(prefs) {
        prefs.lastUsed = Date.now();
        await this.storage.set(ArchitectPersistence.STORAGE_KEY, JSON.stringify(prefs));
    }
    /** Increment usage count for a domain and total interactions. */
    async recordUsage(domain) {
        const prefs = await this.load();
        prefs.contextUsageHistory[domain] = (prefs.contextUsageHistory[domain] ?? 0) + 1;
        prefs.totalInteractions++;
        await this.save(prefs);
    }
    /** Update the corrections field from a CorrectionStore instance. */
    async saveCorrections(store) {
        const prefs = await this.load();
        prefs.corrections = store.serialize();
        await this.save(prefs);
    }
    /** Get the top N most-used context domains, sorted by usage descending. */
    async getMostUsedContexts(topN) {
        const prefs = await this.load();
        return Object.entries(prefs.contextUsageHistory)
            .filter(([, count]) => count > 0)
            .sort(([, a], [, b]) => b - a)
            .slice(0, topN)
            .map(([domain]) => domain);
    }
    /** Delete all stored Architect data (user privacy). */
    async clearAll() {
        await this.storage.delete(ArchitectPersistence.STORAGE_KEY);
    }
    /** Export all data as JSON string (user data portability). */
    async exportAll() {
        const prefs = await this.load();
        return JSON.stringify(prefs, null, 2);
    }
    /** Handle version upgrades for stored preferences. */
    async migrate(prefs) {
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
            prefs.version = CURRENT_VERSION;
            await this.save(prefs);
        }
        return prefs;
    }
}
//# sourceMappingURL=persistence.js.map