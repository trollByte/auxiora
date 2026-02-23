/**
 * Check if the Auxiora gateway is running and healthy.
 */
export async function checkGateway(
  url = 'http://localhost:18800/api/v1/health',
): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export type GatewayStatus = 'connected' | 'disconnected' | 'checking';

export interface GatewayMonitorOptions {
  url?: string;
  intervalMs?: number;
  onStatusChange?: (status: GatewayStatus) => void;
}

/**
 * Monitors the gateway connection and notifies on status changes.
 * Returns a stop function to cancel monitoring.
 */
export class GatewayMonitor {
  private interval: ReturnType<typeof setInterval> | null = null;
  private status: GatewayStatus = 'checking';
  private readonly url: string;
  private readonly intervalMs: number;
  private readonly onStatusChange?: (status: GatewayStatus) => void;

  constructor(options: GatewayMonitorOptions = {}) {
    this.url = options.url ?? 'http://localhost:18800/api/v1/health';
    this.intervalMs = options.intervalMs ?? 5000;
    this.onStatusChange = options.onStatusChange;
  }

  /** Start polling the gateway for health status. */
  start(): void {
    if (this.interval) return;
    void this.check();
    this.interval = setInterval(() => void this.check(), this.intervalMs);
  }

  /** Stop polling. */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /** Get current status. */
  getStatus(): GatewayStatus {
    return this.status;
  }

  private async check(): Promise<void> {
    const healthy = await checkGateway(this.url);
    const newStatus: GatewayStatus = healthy ? 'connected' : 'disconnected';
    if (newStatus !== this.status) {
      this.status = newStatus;
      this.onStatusChange?.(newStatus);
    }
  }
}
