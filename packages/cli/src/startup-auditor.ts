import { getLogger } from '@auxiora/logger';
import type { CheckResult } from './commands/doctor.js';
import { runDoctorChecks } from './commands/doctor.js';

const logger = getLogger('cli:startup-audit');

export interface AuditSummary {
  passed: number;
  warnings: number;
  failures: number;
  results: CheckResult[];
  /** Whether the system is safe to start */
  canStart: boolean;
  /** Critical failures that should block startup */
  blockers: CheckResult[];
  /** Warnings that should be logged */
  notices: CheckResult[];
  durationMs: number;
}

/** Categories that are critical — failure in these blocks startup */
const CRITICAL_CATEGORIES = new Set(['Config', 'System']);

/** Categories to skip during startup (too slow or not relevant) */
const SKIP_CATEGORIES = new Set(['Network', 'Docker']);

export class StartupAuditor {
  private skipCategories: Set<string>;
  private criticalCategories: Set<string>;

  constructor(options?: {
    skipCategories?: string[];
    criticalCategories?: string[];
  }) {
    this.skipCategories = new Set(options?.skipCategories ?? SKIP_CATEGORIES);
    this.criticalCategories = new Set(options?.criticalCategories ?? CRITICAL_CATEGORIES);
  }

  /**
   * Run startup audit. Returns a summary with pass/warn/fail counts.
   * Does NOT exit the process — the caller decides what to do.
   */
  async audit(): Promise<AuditSummary> {
    const start = Date.now();
    logger.info('Running startup audit...');

    const allResults = await runDoctorChecks();

    // Filter out skipped categories
    const results = allResults.filter(r => !this.skipCategories.has(r.category));

    let passed = 0;
    let warnings = 0;
    let failures = 0;
    const blockers: CheckResult[] = [];
    const notices: CheckResult[] = [];

    for (const result of results) {
      switch (result.status) {
        case 'pass':
          passed++;
          break;
        case 'warn':
          warnings++;
          notices.push(result);
          logger.warn(`Audit warning: ${result.name} — ${result.message}`, { category: result.category });
          break;
        case 'fail':
          failures++;
          if (this.criticalCategories.has(result.category)) {
            blockers.push(result);
            logger.error(`Audit FAILURE (blocking): ${result.name} — ${result.message}`, new Error(result.message));
          } else {
            notices.push(result);
            logger.warn(`Audit failure (non-blocking): ${result.name} — ${result.message}`, { category: result.category });
          }
          break;
      }
    }

    const canStart = blockers.length === 0;
    const durationMs = Date.now() - start;

    logger.info('Startup audit complete', { passed, warnings, failures, canStart, durationMs });

    return { passed, warnings, failures, results, canStart, blockers, notices, durationMs };
  }

  /**
   * Run audit and auto-fix fixable issues, then re-audit.
   */
  async auditAndFix(): Promise<AuditSummary> {
    const firstPass = await this.audit();

    if (firstPass.canStart && firstPass.warnings === 0) {
      return firstPass;
    }

    // Try to auto-fix
    let fixCount = 0;
    for (const result of firstPass.results) {
      if (result.fixable && result.fix && result.status !== 'pass') {
        try {
          await result.fix();
          fixCount++;
          logger.info(`Auto-fixed: ${result.name}`);
        } catch (err) {
          logger.warn(`Auto-fix failed: ${result.name}`, { error: err instanceof Error ? err : new Error(String(err)) });
        }
      }
    }

    if (fixCount > 0) {
      logger.info(`Applied ${fixCount} auto-fixes, re-auditing...`);
      return this.audit();
    }

    return firstPass;
  }
}
