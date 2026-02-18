// ────────────────────────────────────────────────────────────────────────────
// Personality engine barrel export
//
// Re-exports everything consumers need from the personality engine.
// Organized by phase so downstream packages can import from a single path:
//   import { createArchitect, type TraitMix } from '@auxiora/personality/architect';
// ────────────────────────────────────────────────────────────────────────────

// Phase 1: core engine
export { TheArchitect, createArchitect } from './the-architect/index.js';
export { ARCHITECT_BASE_PROMPT } from './the-architect/system-prompt.js';
export { CONTEXT_PROFILES } from './the-architect/context-profiles.js';
export { SOURCE_MAP } from './the-architect/source-map.js';
export { TRAIT_TO_INSTRUCTION } from './the-architect/trait-to-instruction.js';
export { detectContext, scoreAllDomains } from './the-architect/context-detector.js';
export { assemblePromptModifier, getActiveSources } from './the-architect/prompt-assembler.js';
export { EMOTIONAL_OVERRIDES, applyEmotionalOverride } from './the-architect/emotional-overrides.js';
export type {
  TraitMix,
  TraitValue,
  TaskContext,
  TraitSource,
  ContextDomain,
  EmotionalRegister,
  ContextSignal,
  PromptOutput,
} from './schema.js';

// Phase 2: correction learning
export { CorrectionStore } from './the-architect/correction-store.js';
export type { DetectionCorrection, CorrectionPattern } from './the-architect/correction-store.js';

// Phase 3: persistence, recommendations, settings
export { InMemoryEncryptedStorage, VaultStorageAdapter } from './the-architect/persistence-adapter.js';
export type { EncryptedStorage, VaultLike } from './the-architect/persistence-adapter.js';
export { ArchitectPersistence } from './the-architect/persistence.js';
export type { ArchitectPreferences } from './the-architect/persistence.js';
export { ContextRecommender } from './the-architect/recommender.js';
export type { ContextRecommendation } from './the-architect/recommender.js';
export { ConversationContext } from './the-architect/conversation-context.js';
export type { ConversationSummary, ConversationState, DetectionRecord } from './the-architect/conversation-context.js';
export { EmotionalTracker, estimateIntensity } from './the-architect/emotional-tracker.js';
export type { EmotionalTrajectory, EffectiveEmotion } from './the-architect/emotional-tracker.js';

// Phase 4: custom weights, conversation export
export { CustomWeights, WEIGHT_PRESETS } from './the-architect/custom-weights.js';
export type { WeightPreset } from './the-architect/custom-weights.js';
export { ConversationExporter } from './the-architect/conversation-export.js';
export type { ChatMessage, AssistantMetadata, ExportedMessage, ExportedConversation } from './the-architect/conversation-export.js';

// Phase 5: self-awareness modules
export { PreferenceHistory } from './the-architect/preference-history.js';
export type { PreferenceEntry, PreferenceConflict } from './the-architect/preference-history.js';
export { DecisionLog } from './the-architect/decision-log.js';
export type { Decision, DecisionQuery, DecisionStatus } from './the-architect/decision-log.js';
export { FeedbackStore } from './the-architect/feedback-store.js';
export type { FeedbackRating, FeedbackEntry, FeedbackInsight } from './the-architect/feedback-store.js';

// Phase 5: user model synthesizer
export { UserModelSynthesizer } from './the-architect/user-model-synthesizer.js';
export type { UserModel, DomainProfile, CommunicationStyle, SatisfactionProfile, CorrectionSummary }
  from './the-architect/user-model-synthesizer.js';
