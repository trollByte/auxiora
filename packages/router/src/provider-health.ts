import { getLogger } from '@auxiora/logger';

const logger = getLogger('router:provider-health');

export interface ProviderHealthSnapshot {
  provider: string;
  /** Whether the provider is currently healthy */
  healthy: boolean;
  /** Average latency over the last N requests (ms) */
  avgLatencyMs: number;
  /** p95 latency (ms) */
  p95LatencyMs: number;
  /** Requests in the tracking window */
  totalRequests: number;
  /** Errors in the tracking window */
  totalErrors: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Last successful request timestamp */
  lastSuccessAt: number;
  /** Last error timestamp */
  lastErrorAt: number;
  /** Current status */
  status: 'active' | 'degraded' | 'down';
}

export interface HealthTrackerOptions {
  /** Max entries per provider for windowed stats. Default: 100 */
  windowSize?: number;
  /** Error rate threshold to mark as degraded. Default: 0.2 */
  degradedThreshold?: number;
  /** Error rate threshold to mark as down. Default: 0.5 */
  downThreshold?: number;
}

interface RequestRecord {
  latencyMs: number;
  success: boolean;
  timestamp: number;
}

export class ProviderHealthTracker {
  private records = new Map<string, RequestRecord[]>();
  private readonly windowSize: number;
  private readonly degradedThreshold: number;
  private readonly downThreshold: number;

  constructor(options?: HealthTrackerOptions) {
    this.windowSize = options?.windowSize ?? 100;
    this.degradedThreshold = options?.degradedThreshold ?? 0.2;
    this.downThreshold = options?.downThreshold ?? 0.5;
  }

  /** Record a successful request */
  recordSuccess(provider: string, latencyMs: number): void {
    this.addRecord(provider, { latencyMs, success: true, timestamp: Date.now() });
  }

  /** Record a failed request */
  recordError(provider: string, latencyMs: number): void {
    this.addRecord(provider, { latencyMs, success: false, timestamp: Date.now() });
    logger.warn('Provider error recorded', { provider, latencyMs });
  }

  /** Get health snapshot for a specific provider */
  getHealth(provider: string): ProviderHealthSnapshot {
    const records = this.records.get(provider) ?? [];
    return this.buildSnapshot(provider, records);
  }

  /** Get health snapshots for all tracked providers */
  getAllHealth(): ProviderHealthSnapshot[] {
    const snapshots: ProviderHealthSnapshot[] = [];
    for (const [provider] of this.records) {
      snapshots.push(this.getHealth(provider));
    }
    return snapshots;
  }

  /** Get list of tracked providers */
  getProviders(): string[] {
    return [...this.records.keys()];
  }

  /** Reset all tracking data */
  reset(): void {
    this.records.clear();
  }

  private addRecord(provider: string, record: RequestRecord): void {
    let records = this.records.get(provider);
    if (!records) {
      records = [];
      this.records.set(provider, records);
    }
    records.push(record);
    if (records.length > this.windowSize) {
      records.shift();
    }
  }

  private buildSnapshot(provider: string, records: RequestRecord[]): ProviderHealthSnapshot {
    if (records.length === 0) {
      return {
        provider,
        healthy: true,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        totalRequests: 0,
        totalErrors: 0,
        errorRate: 0,
        lastSuccessAt: 0,
        lastErrorAt: 0,
        status: 'active',
      };
    }

    const latencies = records.map(r => r.latencyMs);
    const sorted = [...latencies].sort((a, b) => a - b);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95Index = Math.ceil(0.95 * sorted.length) - 1;

    const errors = records.filter(r => !r.success);
    const successes = records.filter(r => r.success);
    const errorRate = errors.length / records.length;

    const lastSuccess = successes.length > 0 ? successes[successes.length - 1].timestamp : 0;
    const lastError = errors.length > 0 ? errors[errors.length - 1].timestamp : 0;

    let status: 'active' | 'degraded' | 'down' = 'active';
    if (errorRate >= this.downThreshold) {
      status = 'down';
    } else if (errorRate >= this.degradedThreshold) {
      status = 'degraded';
    }

    return {
      provider,
      healthy: status === 'active',
      avgLatencyMs: Math.round(avg),
      p95LatencyMs: sorted[Math.max(0, p95Index)],
      totalRequests: records.length,
      totalErrors: errors.length,
      errorRate,
      lastSuccessAt: lastSuccess,
      lastErrorAt: lastError,
      status,
    };
  }
}
