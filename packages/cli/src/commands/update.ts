import { Command } from 'commander';
import type { UpdateChannel } from '@auxiora/updater';

export function createUpdateCommand(): Command {
  return new Command('update')
    .description('Check for and apply updates')
    .option('--check', 'Check for updates without installing')
    .option('--channel <channel>', 'Update channel: stable, beta, or nightly', 'stable')
    .option('--rollback', 'Roll back to previous version')
    .option('--force', 'Force update even if already up to date')
    .action(async (options) => {
      // Dynamic import to avoid loading updater unless needed
      const { InstallationDetector, VersionChecker, HealthChecker, Updater } = await import('@auxiora/updater');
      const { createStrategyMap } = await import('@auxiora/updater');

      const detector = new InstallationDetector();
      const info = detector.detect();

      console.log(`Installation method: ${info.method}`);
      console.log(`Current version: ${info.currentVersion}`);

      if (!info.canSelfUpdate) {
        console.log('Cannot self-update from this installation method.');
        console.log('Please update manually using your package manager.');
        return;
      }

      const checker = new VersionChecker('trollByte', 'auxiora');
      const health = new HealthChecker('http://localhost:18800');
      const strategies = createStrategyMap();

      const updater = new Updater({ detector, versionChecker: checker, healthChecker: health, strategies });

      if (options.rollback) {
        console.log('Rolling back to previous version...');
        try {
          await updater.rollback();
          console.log('Rollback complete.');
        } catch (error) {
          console.error(`Rollback failed: ${error instanceof Error ? error.message : String(error)}`);
          process.exitCode = 1;
        }
        return;
      }

      const channel = options.channel as UpdateChannel;

      if (options.check) {
        const result = await checker.check(info.currentVersion, channel);
        if (result.available) {
          console.log(`Update available: ${result.latestVersion} (${channel})`);
          console.log(`Release notes: ${result.releaseNotes.slice(0, 200)}`);
        } else {
          console.log('Already up to date.');
        }
        return;
      }

      console.log(`Checking for updates on ${channel} channel...`);
      const result = await updater.update(channel);

      if (result.success) {
        console.log(`Updated to ${result.newVersion} (took ${result.durationMs}ms)`);
      } else if (result.rolledBack) {
        console.error(`Update failed and was rolled back: ${result.error}`);
        process.exitCode = 1;
      } else {
        console.error(`Update failed: ${result.error}`);
        process.exitCode = 1;
      }
    });
}
