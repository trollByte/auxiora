export type { PersonalityTemplate, SoulConfig, ToneSettings } from './types.js';
export { parseSoulMd } from './parser.js';
export { buildSoulMd } from './builder.js';
export { PersonalityManager } from './manager.js';
export { SoulConversationBuilder } from './conversation-builder.js';
export type { ConversationQuestion, ConversationStep, ConversationComplete, ConversationResult } from './conversation-builder.js';
// Modes system
export { ModeLoader } from './modes/mode-loader.js';
export { ModeDetector } from './modes/mode-detector.js';
export { PromptAssembler } from './modes/prompt-assembler.js';
export type {
  ModeId,
  ModeTemplate,
  ModeSignal,
  ModeDetectionResult,
  UserPreferences,
  SessionModeState,
} from './modes/types.js';
export { MODE_IDS, DEFAULT_PREFERENCES, DEFAULT_SESSION_MODE_STATE } from './modes/types.js';
// [P15] Voice profiles
export {
  getVoiceProfile,
  listVoiceProfiles,
  DEFAULT_VOICE_PROFILE,
  type VoiceProfile,
} from './voice-profiles.js';
