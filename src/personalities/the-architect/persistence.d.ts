import type { ContextDomain } from '../schema.js';
import type { EncryptedStorage } from './persistence-adapter.js';
import { CorrectionStore } from './correction-store.js';
export interface ArchitectPreferences {
    /** Serialized CorrectionStore (context detection learning data). */
    corrections: string;
    /** Serialized CustomWeights (user trait adjustments). */
    customWeights?: string;
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
export declare class ArchitectPersistence {
    private storage;
    private static STORAGE_KEY;
    constructor(storage: EncryptedStorage);
    /** Load preferences from encrypted storage. Returns defaults if none exist. */
    load(): Promise<ArchitectPreferences>;
    /** Save preferences to encrypted storage. Updates lastUsed automatically. */
    save(prefs: ArchitectPreferences): Promise<void>;
    /** Increment usage count for a domain and total interactions. */
    recordUsage(domain: ContextDomain): Promise<void>;
    /** Update the corrections field from a CorrectionStore instance. */
    saveCorrections(store: CorrectionStore): Promise<void>;
    /** Get the top N most-used context domains, sorted by usage descending. */
    getMostUsedContexts(topN: number): Promise<ContextDomain[]>;
    /** Delete all stored Architect data (user privacy). */
    clearAll(): Promise<void>;
    /** Export all data as JSON string (user data portability). */
    exportAll(): Promise<string>;
    /** Handle version upgrades for stored preferences. */
    private migrate;
}
//# sourceMappingURL=persistence.d.ts.map