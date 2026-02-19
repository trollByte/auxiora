// ── Journal ──────────────────────────────────────────────────────────────────
export { SessionJournal } from './journal/session-journal.js';
export type { VaultLike } from './journal/session-journal.js';
export type {
  ContextDomain,
  JournalEntry,
  JournalEntryType,
  JournalEntryMessage,
  JournalEntryContext,
  JournalEntrySelfState,
  SessionSummary,
  JournalSearchQuery,
} from './journal/journal-types.js';

// ── Monitor ─────────────────────────────────────────────────────────────────
export { SignalSynthesizer } from './monitor/signal-synthesizer.js';
export type {
  HealthMonitorLike,
  FeedbackStoreLike as SynthesizerFeedbackStoreLike,
  CorrectionStoreLike,
  PreferenceHistoryLike,
  SignalSynthesizerDeps,
} from './monitor/signal-synthesizer.js';
export { SelfMonitor } from './monitor/self-monitor.js';
export type { SelfMonitorOptions } from './monitor/self-monitor.js';
export type {
  SystemPulse,
  SubsystemStatus,
  Anomaly,
  ReasoningMetrics,
  ResourceMetrics,
  CapabilityMetrics,
} from './monitor/monitor-types.js';

// ── Repair ──────────────────────────────────────────────────────────────────
export { SelfRepairEngine } from './repair/self-repair-engine.js';
export type { SelfRepairEngineDeps } from './repair/self-repair-engine.js';
export { BUILT_IN_PATTERNS } from './repair/repair-actions.js';
export type { RepairPattern } from './repair/repair-actions.js';
export type {
  Diagnosis,
  RepairAction,
  RepairLog,
  RepairTier,
} from './repair/repair-types.js';

// ── Model ───────────────────────────────────────────────────────────────────
export { SelfModel } from './model/self-model.js';
export type {
  SelfModelDeps,
  SessionJournalLike,
  SelfMonitorLike,
  SelfRepairEngineLike,
  DecisionLogLike,
  FeedbackStoreLike as ModelFeedbackStoreLike,
} from './model/self-model.js';
export type {
  SelfModelSnapshot,
  IdentityInfo,
  MemoryInfo,
  PerformanceInfo,
  RepairInfo,
} from './model/model-types.js';

// ── Orchestrator ────────────────────────────────────────────────────────────
export { Consciousness } from './consciousness.js';
export type { ConsciousnessDeps } from './consciousness.js';
