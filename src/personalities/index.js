// ────────────────────────────────────────────────────────────────────────────
// Personality engine barrel export
// ────────────────────────────────────────────────────────────────────────────
export { TheArchitect, createArchitect } from './the-architect/index.js';
export { ARCHITECT_BASE_PROMPT } from './the-architect/system-prompt.js';
// Phase 3: persistence, recommendations, settings
export { InMemoryEncryptedStorage, VaultStorageAdapter } from './the-architect/persistence-adapter.js';
export { ArchitectPersistence } from './the-architect/persistence.js';
export { ContextRecommender } from './the-architect/recommender.js';
export { ConversationContext } from './the-architect/conversation-context.js';
//# sourceMappingURL=index.js.map