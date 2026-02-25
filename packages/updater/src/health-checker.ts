import { getLogger } from '@auxiora/logger';

const logger = getLogger('updater:health-checker');

export interface HealthCheckOptions {
  maxAttempts?: number;
  intervalMs?: number;
}

export interface HealthCheckResult {
  healthy: boolean;
  reason?: string;
  attempts: number;
}

export class HealthChecker {
  constructor(private readonly baseUrl: string) {}

  async waitForHealthy(
    expectedVersion: string,
    options?: HealthCheckOptions,
  ): Promise<HealthCheckResult> {
    const maxAttempts = options?.maxAttempts ?? 10;
    const intervalMs = options?.intervalMs ?? 2000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/health`);
        if (response.ok) {
          const body = (await response.json()) as { status: string; version: string };
          if (body.version === expectedVersion) {
            logger.info('Health check passed', { version: expectedVersion, attempt });
            return { healthy: true, attempts: attempt };
          }
          logger.debug('Health check: version mismatch', {
            expected: expectedVersion,
            actual: body.version,
            attempt,
          });
        }
      } catch {
        logger.debug('Health check: endpoint unreachable', { attempt });
      }

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }

    return {
      healthy: false,
      reason: `Health check failed after ${maxAttempts} attempts -- version ${expectedVersion} not confirmed`,
      attempts: maxAttempts,
    };
  }
}
