import type { SignalCollector, AwarenessSignal, CollectionContext } from '@auxiora/self-awareness';

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

  updateOutput(snapshot: ArchitectSnapshot): void {
    this.latest = snapshot;
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

    return signals;
  }
}
