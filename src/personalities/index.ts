// ────────────────────────────────────────────────────────────────────────────
// Personality engine barrel export
// ────────────────────────────────────────────────────────────────────────────

export { TheArchitect, createArchitect } from './the-architect/index.js';
export { ARCHITECT_BASE_PROMPT } from './the-architect/system-prompt.js';
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
