import { getLogger } from '@auxiora/logger';

const logger = getLogger('orchestrator:circuit-breaker');

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 3 */
  failureThreshold?: number;
  /** Cooldown in ms before trying half_open. Default: 30000 */
  cooldownMs?: number;
  /** Optional callback when circuit opens */
  onOpen?: (failures: number) => void;
  /** Optional callback when circuit transitions to half_open */
  onHalfOpen?: () => void;
  /** Optional callback when circuit closes (recovery) */
  onClose?: () => void;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly onOpen?: (failures: number) => void;
  private readonly onHalfOpen?: () => void;
  private readonly onClose?: () => void;

  constructor(options?: CircuitBreakerOptions) {
    this.failureThreshold = options?.failureThreshold ?? 3;
    this.cooldownMs = options?.cooldownMs ?? 30_000;
    this.onOpen = options?.onOpen;
    this.onHalfOpen = options?.onHalfOpen;
    this.onClose = options?.onClose;
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    return this.consecutiveFailures;
  }

  /**
   * Check if the circuit allows execution.
   * Returns true if allowed, false if blocked (circuit open).
   */
  allowRequest(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      // Check if cooldown has elapsed
      if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
        this.state = 'half_open';
        this.onHalfOpen?.();
        logger.info('Circuit breaker half_open, allowing test request');
        return true;
      }
      return false;
    }
    // half_open — allow one request
    return true;
  }

  /** Record a successful execution. Resets failure count and closes circuit. */
  recordSuccess(): void {
    if (this.state === 'half_open') {
      logger.info('Circuit breaker closing after successful recovery');
      this.onClose?.();
    }
    this.consecutiveFailures = 0;
    this.state = 'closed';
  }

  /** Record a failure. Increments count and may open the circuit. */
  recordFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half_open') {
      // Failed during half_open test — reopen
      this.state = 'open';
      logger.warn('Circuit breaker reopened after half_open failure', {
        failures: this.consecutiveFailures,
      });
      this.onOpen?.(this.consecutiveFailures);
      return;
    }

    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'open';
      logger.warn('Circuit breaker opened', {
        failures: this.consecutiveFailures,
        threshold: this.failureThreshold,
      });
      this.onOpen?.(this.consecutiveFailures);
    }
  }

  /** Reset the breaker to closed state. */
  reset(): void {
    this.consecutiveFailures = 0;
    this.state = 'closed';
    this.lastFailureTime = 0;
  }
}
