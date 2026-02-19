import type { SystemPulse, Anomaly } from './monitor-types.js';
import type { SignalSynthesizer } from './signal-synthesizer.js';

export interface SelfMonitorOptions {
  intervalMs?: number;
}

const EMPTY_PULSE: SystemPulse = {
  timestamp: 0,
  overall: 'healthy',
  subsystems: [],
  anomalies: [],
  reasoning: { avgResponseQuality: 0, domainAccuracy: 0, preferenceStability: 0 },
  resources: { memoryUsageMb: 0, cpuPercent: 0, activeConnections: 0, uptimeSeconds: 0 },
  capabilities: { totalCapabilities: 0, healthyCapabilities: 0, degradedCapabilities: [] },
};

function anomalyKey(a: Anomaly): string {
  return `${a.subsystem}:${a.description}`;
}

export class SelfMonitor {
  private readonly synthesizer: SignalSynthesizer;
  private readonly intervalMs: number;
  private latestPulse: SystemPulse = EMPTY_PULSE;
  private previousAnomalyKeys: Set<string> = new Set();
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private anomalyHandlers: Array<(anomaly: Anomaly) => void> = [];

  constructor(synthesizer: SignalSynthesizer, options?: SelfMonitorOptions) {
    this.synthesizer = synthesizer;
    this.intervalMs = options?.intervalMs ?? 30_000;
  }

  start(): void {
    this.tick();
    this.intervalId = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  getPulse(): SystemPulse {
    return this.latestPulse;
  }

  onAnomaly(handler: (anomaly: Anomaly) => void): void {
    this.anomalyHandlers.push(handler);
  }

  private tick(): void {
    const pulse = this.synthesizer.synthesize();
    this.latestPulse = pulse;

    const currentKeys = new Set(pulse.anomalies.map(anomalyKey));

    for (const anomaly of pulse.anomalies) {
      const key = anomalyKey(anomaly);
      if (!this.previousAnomalyKeys.has(key)) {
        for (const handler of this.anomalyHandlers) {
          handler(anomaly);
        }
      }
    }

    this.previousAnomalyKeys = currentKeys;
  }
}
