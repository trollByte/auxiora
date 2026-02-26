export interface CooldownOptions {
  readonly windowMs: number;
  readonly failureThreshold: number;
  readonly cooldownMs: number;
}

export interface CooldownStatus {
  readonly key: string;
  readonly failureCount: number;
  readonly coolingDown: boolean;
  readonly remainingMs: number;
}

export class RateLimitCooldown {
  private failures = new Map<string, number[]>();
  private cooldownUntil = new Map<string, number>();
  private readonly windowMs: number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(options: CooldownOptions) {
    this.windowMs = options.windowMs;
    this.failureThreshold = options.failureThreshold;
    this.cooldownMs = options.cooldownMs;
  }

  recordFailure(key: string): void {
    const now = Date.now();
    const timestamps = this.failures.get(key) ?? [];
    timestamps.push(now);
    this.failures.set(key, timestamps);
    this.evictOld(key, now);
    const recent = this.failures.get(key)!;
    if (recent.length >= this.failureThreshold) {
      this.cooldownUntil.set(key, now + this.cooldownMs);
    }
  }

  recordSuccess(key: string): void {
    this.failures.delete(key);
  }

  isCoolingDown(key: string): boolean {
    const until = this.cooldownUntil.get(key);
    if (!until) return false;
    if (Date.now() >= until) {
      this.cooldownUntil.delete(key);
      return false;
    }
    return true;
  }

  getRemainingCooldown(key: string): number {
    const until = this.cooldownUntil.get(key);
    if (!until) return 0;
    const remaining = until - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  getStatus(): CooldownStatus[] {
    const keys = new Set([...this.failures.keys(), ...this.cooldownUntil.keys()]);
    const result: CooldownStatus[] = [];
    for (const key of keys) {
      this.evictOld(key, Date.now());
      result.push({
        key,
        failureCount: this.failures.get(key)?.length ?? 0,
        coolingDown: this.isCoolingDown(key),
        remainingMs: this.getRemainingCooldown(key),
      });
    }
    return result;
  }

  private evictOld(key: string, now: number): void {
    const timestamps = this.failures.get(key);
    if (!timestamps) return;
    const cutoff = now - this.windowMs;
    const recent = timestamps.filter(t => t > cutoff);
    if (recent.length === 0) {
      this.failures.delete(key);
    } else {
      this.failures.set(key, recent);
    }
  }
}
