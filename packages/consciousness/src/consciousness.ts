import { SessionJournal } from './journal/session-journal.js';
import type { VaultLike } from './journal/session-journal.js';
import { SignalSynthesizer } from './monitor/signal-synthesizer.js';
import type {
  HealthMonitorLike,
  FeedbackStoreLike as SynthFeedbackStoreLike,
  CorrectionStoreLike,
  PreferenceHistoryLike,
  SignalSynthesizerDeps,
} from './monitor/signal-synthesizer.js';
import type { ResourceMetrics, CapabilityMetrics } from './monitor/monitor-types.js';
import { SelfMonitor } from './monitor/self-monitor.js';
import { SelfRepairEngine } from './repair/self-repair-engine.js';
import type { Diagnosis, RepairAction } from './repair/repair-types.js';
import { SelfModel } from './model/self-model.js';
import type {
  DecisionLogLike,
  FeedbackStoreLike as ModelFeedbackStoreLike,
} from './model/self-model.js';

export interface ConsciousnessDeps {
  vault: VaultLike;

  // SignalSynthesizer deps
  healthMonitor: HealthMonitorLike;
  feedbackStore: SynthFeedbackStoreLike & ModelFeedbackStoreLike;
  correctionStore: CorrectionStoreLike;
  preferenceHistory: PreferenceHistoryLike;
  getResourceMetrics: () => ResourceMetrics;
  getCapabilityMetrics: () => CapabilityMetrics;

  // SelfRepairEngine deps
  actionExecutor: (command: string) => Promise<string>;
  onNotify: (diagnosis: Diagnosis | null, action: RepairAction) => void;
  onApprovalRequest: (diagnosis: Diagnosis | null, action: RepairAction) => Promise<boolean>;

  // SelfModel deps
  decisionLog: DecisionLogLike;
  version: string;

  // Config
  monitorIntervalMs?: number;
}

export class Consciousness {
  readonly journal: SessionJournal;
  readonly monitor: SelfMonitor;
  readonly repair: SelfRepairEngine;
  readonly model: SelfModel;

  constructor(deps: ConsciousnessDeps) {
    this.journal = new SessionJournal(deps.vault);

    const synthesizerDeps: SignalSynthesizerDeps = {
      healthMonitor: deps.healthMonitor,
      feedbackStore: deps.feedbackStore,
      correctionStore: deps.correctionStore,
      preferenceHistory: deps.preferenceHistory,
      getResourceMetrics: deps.getResourceMetrics,
      getCapabilityMetrics: deps.getCapabilityMetrics,
    };
    const synthesizer = new SignalSynthesizer(synthesizerDeps);

    this.monitor = new SelfMonitor(synthesizer, {
      intervalMs: deps.monitorIntervalMs,
    });

    this.repair = new SelfRepairEngine({
      vault: deps.vault,
      actionExecutor: deps.actionExecutor,
      onNotify: deps.onNotify,
      onApprovalRequest: deps.onApprovalRequest,
    });

    this.model = new SelfModel({
      journal: this.journal,
      monitor: this.monitor,
      repair: this.repair,
      decisionLog: deps.decisionLog,
      feedbackStore: deps.feedbackStore,
      version: deps.version,
    });
  }

  async initialize(): Promise<void> {
    await this.journal.initialize();
    this.monitor.start();
  }

  shutdown(): void {
    this.monitor.stop();
  }
}
