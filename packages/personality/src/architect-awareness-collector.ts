import type { SignalCollector, AwarenessSignal, CollectionContext } from '@auxiora/self-awareness';

export interface ToolUsage {
  name: string;
  success: boolean;
}

export interface ArchitectSnapshot {
  detectedContext: {
    domain: string;
    emotionalRegister: string;
    stakes: string;
    complexity: string;
    detectionConfidence?: number;
  };
  emotionalTrajectory?: string;
  escalationAlert?: boolean;
}

export class ArchitectAwarenessCollector implements SignalCollector {
  readonly name = 'architect-bridge';
  enabled = true;

  private latest: ArchitectSnapshot | null = null;
  private toolUsages: ToolUsage[] = [];

  updateOutput(snapshot: ArchitectSnapshot): void {
    this.latest = snapshot;
  }

  updateToolContext(tools: ToolUsage[]): void {
    this.toolUsages = tools;
  }

  async collect(_context: CollectionContext): Promise<AwarenessSignal[]> {
    if (!this.latest) return [];
    const signals: AwarenessSignal[] = [];
    const { detectedContext, emotionalTrajectory, escalationAlert } = this.latest;

    if (detectedContext.domain !== 'general') {
      const conf = detectedContext.detectionConfidence;
      signals.push({
        dimension: 'architect-context',
        priority: 0.6,
        text: `Currently in ${detectedContext.domain} context (confidence: ${conf != null ? conf.toFixed(2) : 'n/a'}, stakes: ${detectedContext.stakes})`,
        data: { domain: detectedContext.domain, confidence: conf ?? 0, stakes: detectedContext.stakes },
      });
    }

    if (emotionalTrajectory && emotionalTrajectory !== 'stable') {
      signals.push({
        dimension: 'architect-emotion',
        priority: 0.8,
        text: `User emotional trajectory: ${emotionalTrajectory} (register: ${detectedContext.emotionalRegister})`,
        data: { trajectory: emotionalTrajectory, register: detectedContext.emotionalRegister },
      });
    }

    if (escalationAlert) {
      signals.push({
        dimension: 'architect-escalation',
        priority: 1.0,
        text: 'Emotional escalation detected — user may need de-escalation support',
        data: { escalation: true, domain: detectedContext.domain },
      });
    }

    if (this.toolUsages.length > 0) {
      const names = this.toolUsages.map(t => t.name);
      const successCount = this.toolUsages.filter(t => t.success).length;
      const failureCount = this.toolUsages.length - successCount;
      signals.push({
        dimension: 'architect-tools',
        priority: 0.4,
        text: `Tools used: ${names.join(', ')} (${successCount} succeeded, ${failureCount} failed)`,
        data: { tools: names, successCount, failureCount },
      });
      this.toolUsages = []; // Reset after collection
    }

    return signals;
  }
}
