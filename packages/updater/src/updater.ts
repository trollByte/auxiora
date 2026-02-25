import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLogger } from '@auxiora/logger';
import type { InstallationInfo, UpdateCheckResult, StagedUpdate, UpdateResult, UpdateChannel, InstallMethod, UpdateStrategy } from './types.js';
import type { InstallationDetector } from './detector.js';
import type { VersionChecker } from './version-checker.js';
import type { HealthChecker } from './health-checker.js';

const logger = getLogger('updater:orchestrator');

export interface UpdaterOptions {
  detector: InstallationDetector;
  versionChecker: VersionChecker;
  healthChecker: HealthChecker;
  strategies: Map<InstallMethod, UpdateStrategy>;
}

export class Updater {
  private readonly detector: InstallationDetector;
  private readonly versionChecker: VersionChecker;
  private readonly healthChecker: HealthChecker;
  private readonly strategies: Map<InstallMethod, UpdateStrategy>;

  constructor(options: UpdaterOptions) {
    this.detector = options.detector;
    this.versionChecker = options.versionChecker;
    this.healthChecker = options.healthChecker;
    this.strategies = options.strategies;
  }

  async update(channel: UpdateChannel = 'stable'): Promise<UpdateResult> {
    const start = Date.now();
    const info = this.detector.detect();

    if (!info.canSelfUpdate) {
      return {
        success: false,
        previousVersion: info.currentVersion,
        newVersion: info.currentVersion,
        method: info.method,
        rolledBack: false,
        error: `Cannot self-update from installation method: ${info.method}`,
        durationMs: Date.now() - start,
      };
    }

    const strategy = this.strategies.get(info.method);
    if (!strategy) {
      return {
        success: false,
        previousVersion: info.currentVersion,
        newVersion: info.currentVersion,
        method: info.method,
        rolledBack: false,
        error: `No update strategy for method: ${info.method}`,
        durationMs: Date.now() - start,
      };
    }

    const checkResult = await this.versionChecker.check(info.currentVersion, channel);
    if (!checkResult.available) {
      return {
        success: false,
        previousVersion: info.currentVersion,
        newVersion: info.currentVersion,
        method: info.method,
        rolledBack: false,
        error: 'Already up to date',
        durationMs: Date.now() - start,
      };
    }

    let staged: StagedUpdate;
    try {
      logger.info('Staging update', { from: info.currentVersion, to: checkResult.latestVersion });
      staged = await strategy.stage(checkResult, info);
    } catch (error) {
      return {
        success: false,
        previousVersion: info.currentVersion,
        newVersion: checkResult.latestVersion,
        method: info.method,
        rolledBack: false,
        error: `Stage failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }

    // Persist staged update for crash recovery
    this.persistStagedUpdate(staged);

    try {
      logger.info('Applying update', { version: staged.targetVersion });
      await strategy.apply(staged);

      logger.info('Restarting', { method: info.method });
      await strategy.restart(info);

      logger.info('Running health check');
      const health = await this.healthChecker.waitForHealthy(staged.targetVersion);

      if (health.healthy) {
        await strategy.cleanup(staged);
        this.removeStagedUpdate();
        logger.info('Update successful', { version: staged.targetVersion });
        return {
          success: true,
          previousVersion: staged.previousVersion,
          newVersion: staged.targetVersion,
          method: info.method,
          rolledBack: false,
          durationMs: Date.now() - start,
        };
      }

      // Health check failed — rollback
      logger.error('Health check failed, rolling back', { error: new Error(health.reason ?? 'Unknown') });
      await strategy.rollback(staged);
      await strategy.restart(info);
      this.removeStagedUpdate();

      return {
        success: false,
        previousVersion: staged.previousVersion,
        newVersion: staged.targetVersion,
        method: info.method,
        rolledBack: true,
        error: health.reason ?? 'Health check failed after update',
        durationMs: Date.now() - start,
      };
    } catch (error) {
      // Apply/restart failed — attempt rollback
      logger.error('Update failed, attempting rollback', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      try {
        await strategy.rollback(staged);
        await strategy.restart(info);
      } catch (rollbackError) {
        logger.error('Rollback also failed', {
          error: rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)),
        });
      }
      this.removeStagedUpdate();

      return {
        success: false,
        previousVersion: staged.previousVersion,
        newVersion: staged.targetVersion,
        method: info.method,
        rolledBack: true,
        error: `Update failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  }

  /** Recover from a previously incomplete update (crash recovery). */
  async recoverIfNeeded(): Promise<UpdateResult | null> {
    const staged = this.loadStagedUpdate();
    if (!staged) return null;

    logger.info('Found incomplete update, rolling back', { version: staged.targetVersion });
    const strategy = this.strategies.get(staged.method);
    if (!strategy) {
      this.removeStagedUpdate();
      return null;
    }

    const info = this.detector.detect();
    try {
      await strategy.rollback(staged);
      await strategy.restart(info);
    } catch (error) {
      logger.error('Recovery rollback failed', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
    this.removeStagedUpdate();

    return {
      success: false,
      previousVersion: staged.previousVersion,
      newVersion: staged.targetVersion,
      method: staged.method,
      rolledBack: true,
      error: 'Recovered from incomplete update',
      durationMs: 0,
    };
  }

  /** Manual rollback command. */
  async rollback(): Promise<void> {
    const staged = this.loadStagedUpdate();
    if (!staged) {
      throw new Error('No staged update found to rollback');
    }

    const strategy = this.strategies.get(staged.method);
    if (!strategy) {
      throw new Error(`No strategy for method: ${staged.method}`);
    }

    const info = this.detector.detect();
    await strategy.rollback(staged);
    await strategy.restart(info);
    this.removeStagedUpdate();
    logger.info('Manual rollback complete');
  }

  private getDataDir(): string {
    const xdg = process.env.XDG_DATA_HOME;
    if (xdg) return path.join(xdg, 'auxiora');
    const home = process.env.HOME ?? '/tmp';
    return path.join(home, '.local', 'share', 'auxiora');
  }

  private getStagedUpdatePath(): string {
    return path.join(this.getDataDir(), 'last-update.json');
  }

  private persistStagedUpdate(staged: StagedUpdate): void {
    const filePath = this.getStagedUpdatePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(staged, null, 2));
    logger.debug('Persisted staged update', { path: filePath });
  }

  private loadStagedUpdate(): StagedUpdate | null {
    const filePath = this.getStagedUpdatePath();
    try {
      if (!fs.existsSync(filePath)) return null;
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as StagedUpdate;
    } catch {
      return null;
    }
  }

  private removeStagedUpdate(): void {
    const filePath = this.getStagedUpdatePath();
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug('Removed staged update file');
      }
    } catch {
      // Ignore
    }
  }
}
