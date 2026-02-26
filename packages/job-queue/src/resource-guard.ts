import { freemem, totalmem } from 'node:os';

export interface ResourceGuardOptions {
  memoryThresholdPercent?: number;
  minFreeMemoryMB?: number;
}

export interface ResourceCheckResult {
  readonly allowed: boolean;
  readonly reason: string;
  readonly usedPercent: number;
  readonly freeMB: number;
}

interface MemorySnapshot {
  usedPercent: number;
  freeMB: number;
}

export class ResourceGuard {
  private readonly memoryThreshold: number;
  private readonly minFreeMB: number;

  constructor(options?: ResourceGuardOptions) {
    this.memoryThreshold = options?.memoryThresholdPercent ?? 90;
    this.minFreeMB = options?.minFreeMemoryMB ?? 512;
  }

  check(): ResourceCheckResult {
    const free = freemem();
    const total = totalmem();
    const usedPercent = ((total - free) / total) * 100;
    const freeMB = free / (1024 * 1024);
    return this.checkWith({ usedPercent, freeMB });
  }

  checkWith(snapshot: MemorySnapshot): ResourceCheckResult {
    if (snapshot.usedPercent > this.memoryThreshold) {
      return {
        allowed: false,
        reason: `System memory usage at ${Math.round(snapshot.usedPercent)}% (threshold: ${this.memoryThreshold}%)`,
        usedPercent: snapshot.usedPercent,
        freeMB: snapshot.freeMB,
      };
    }

    if (snapshot.freeMB < this.minFreeMB) {
      return {
        allowed: false,
        reason: `Only ${Math.round(snapshot.freeMB)}MB free memory available (minimum: ${this.minFreeMB}MB)`,
        usedPercent: snapshot.usedPercent,
        freeMB: snapshot.freeMB,
      };
    }

    return {
      allowed: true,
      reason: '',
      usedPercent: snapshot.usedPercent,
      freeMB: snapshot.freeMB,
    };
  }
}
