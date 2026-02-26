import { OverseerMonitor } from './monitor.js';
import type {
  OverseerConfig,
  AgentSnapshot,
  OverseerAlert,
  AssessmentResult,
  LLMAssessment,
  LLMCallerLike,
  OverseerAction,
} from './types.js';

export class ActiveOverseer {
  private readonly monitor: OverseerMonitor;
  private readonly llmCaller?: LLMCallerLike;
  private readonly history: AssessmentResult[] = [];

  constructor(config: OverseerConfig, llmCaller?: LLMCallerLike) {
    this.monitor = new OverseerMonitor(config);
    this.llmCaller = llmCaller;
  }

  async assess(snapshot: AgentSnapshot): Promise<AssessmentResult> {
    const heuristicAlerts = this.monitor.analyze(snapshot);

    let llmAssessment: LLMAssessment | undefined;
    let action: OverseerAction = 'none';
    let notification: string | undefined;

    if (heuristicAlerts.length > 0) {
      action = 'alert';

      if (this.llmCaller) {
        try {
          llmAssessment = await this.llmCaller.assessWithLLM(heuristicAlerts, snapshot);
          action = llmAssessment.suggestedAction;
          notification = llmAssessment.notification;
        } catch {
          // LLM failed — fall back to heuristic action
        }
      }
    }

    const result: AssessmentResult = {
      agentId: snapshot.agentId,
      heuristicAlerts,
      llmAssessment,
      action,
      notification,
      assessedAt: Date.now(),
    };

    this.history.push(result);
    return result;
  }

  getAssessmentHistory(): AssessmentResult[] {
    return [...this.history];
  }
}
