import type { ScanResult, ThreatLevel } from './types.js';

export interface GuardrailStats {
  totalScans: number;
  inputScans: number;
  outputScans: number;
  totalThreats: number;
  threatsByType: Record<string, number>;
  threatsByLevel: Record<ThreatLevel, number>;
  actionCounts: Record<string, number>;
  blockedCount: number;
  redactedCount: number;
  lastScanAt: number;
}

export class GuardrailMetrics {
  private totalScans = 0;
  private inputScans = 0;
  private outputScans = 0;
  private totalThreats = 0;
  private threatsByType = new Map<string, number>();
  private threatsByLevel = new Map<ThreatLevel, number>();
  private actionCounts = new Map<string, number>();
  private blockedCount = 0;
  private redactedCount = 0;
  private lastScanAt = 0;

  /** Record an input scan result */
  recordInputScan(result: ScanResult): void {
    this.totalScans++;
    this.inputScans++;
    this.recordScanResult(result);
  }

  /** Record an output scan result */
  recordOutputScan(result: ScanResult): void {
    this.totalScans++;
    this.outputScans++;
    this.recordScanResult(result);
  }

  /** Get current stats snapshot */
  getStats(): GuardrailStats {
    return {
      totalScans: this.totalScans,
      inputScans: this.inputScans,
      outputScans: this.outputScans,
      totalThreats: this.totalThreats,
      threatsByType: Object.fromEntries(this.threatsByType),
      threatsByLevel: Object.fromEntries(this.threatsByLevel),
      actionCounts: Object.fromEntries(this.actionCounts),
      blockedCount: this.blockedCount,
      redactedCount: this.redactedCount,
      lastScanAt: this.lastScanAt,
    };
  }

  /** Reset all counters */
  reset(): void {
    this.totalScans = 0;
    this.inputScans = 0;
    this.outputScans = 0;
    this.totalThreats = 0;
    this.threatsByType.clear();
    this.threatsByLevel.clear();
    this.actionCounts.clear();
    this.blockedCount = 0;
    this.redactedCount = 0;
    this.lastScanAt = 0;
  }

  private recordScanResult(result: ScanResult): void {
    this.lastScanAt = Date.now();

    // Track action
    const current = this.actionCounts.get(result.action) ?? 0;
    this.actionCounts.set(result.action, current + 1);

    if (result.action === 'block') this.blockedCount++;
    if (result.action === 'redact') this.redactedCount++;

    // Track threats
    for (const threat of result.threats) {
      this.totalThreats++;
      const typeCount = this.threatsByType.get(threat.type) ?? 0;
      this.threatsByType.set(threat.type, typeCount + 1);
      const levelCount = this.threatsByLevel.get(threat.level) ?? 0;
      this.threatsByLevel.set(threat.level, levelCount + 1);
    }
  }
}
