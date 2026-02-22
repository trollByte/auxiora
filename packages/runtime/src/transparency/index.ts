export type {
  TransparencyMeta,
  ConfidenceFactor,
  SourceAttribution,
  ConfidenceLevel,
  SourceType,
} from './types.js';
export { scoreConfidence } from './confidence-scorer.js';
export type { ConfidenceInput, ConfidenceResult } from './confidence-scorer.js';
export { attributeSources, countHedgePhrases } from './source-attributor.js';
export type { SourceInput } from './source-attributor.js';
export { collectTransparencyMeta } from './collector.js';
export type { CollectorInput } from './collector.js';
