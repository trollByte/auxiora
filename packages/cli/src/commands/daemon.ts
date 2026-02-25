import { Command } from 'commander';
import { DaemonManager } from '@auxiora/daemon';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the CLI executable path
function getCliPath(): string {
  // When installed globally via npm, use 'auxiora' command
  // When running from source, use the built CLI
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    return path.join(__dirname, '../../dist/index.js');
  }

  // In production, the global 'auxiora' command should be in PATH
  return 'auxiora';
}

export function createDaemonCommand(): Command {
  const daemonCmd = new Command('daemon').description('Manage Auxiora as a system daemon');

  daemonCmd
    .command('install')
    .description('Install Auxiora as a system daemon')
    .action(async () => {
      try {
        const daemon = DaemonManager.create({
          serviceName: 'auxiora',
          description: 'Auxiora - Secure AI Assistant Platform',
          execPath: getCliPath(),
          workingDirectory: process.cwd(),
        });

        await daemon.install();
        await daemon.enable();

        console.log('\n✓ Daemon installed successfully');
        console.log('\nNext steps:');
        console.log('  auxiora daemon start    # Start the daemon');
        console.log('  auxiora daemon status   # Check daemon status');
      } catch (error) {
        console.error('Failed to install daemon:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  daemonCmd
    .command('uninstall')
    .description('Uninstall the Auxiora daemon')
    .action(async () => {
      try {
        const daemon = DaemonManager.create({
          serviceName: 'auxiora',
          description: 'Auxiora - Secure AI Assistant Platform',
          execPath: getCliPath(),
          workingDirectory: process.cwd(),
        });

        await daemon.uninstall();
        console.log('✓ Daemon uninstalled successfully');
      } catch (error) {
        console.error('Failed to uninstall daemon:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  daemonCmd
    .command('start')
    .description('Start the daemon')
    .action(async () => {
      try {
        const daemon = DaemonManager.create({
          serviceName: 'auxiora',
          description: 'Auxiora - Secure AI Assistant Platform',
          execPath: getCliPath(),
          workingDirectory: process.cwd(),
        });

        await daemon.start();
        console.log('✓ Daemon started');
      } catch (error) {
        console.error('Failed to start daemon:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  daemonCmd
    .command('stop')
    .description('Stop the daemon')
    .action(async () => {
      try {
        const daemon = DaemonManager.create({
          serviceName: 'auxiora',
          description: 'Auxiora - Secure AI Assistant Platform',
          execPath: getCliPath(),
          workingDirectory: process.cwd(),
        });

        await daemon.stop();
        console.log('✓ Daemon stopped');
      } catch (error) {
        console.error('Failed to stop daemon:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  daemonCmd
    .command('restart')
    .description('Restart the daemon')
    .action(async () => {
      try {
        const daemon = DaemonManager.create({
          serviceName: 'auxiora',
          description: 'Auxiora - Secure AI Assistant Platform',
          execPath: getCliPath(),
          workingDirectory: process.cwd(),
        });

        await daemon.restart();
        console.log('✓ Daemon restarted');
      } catch (error) {
        console.error('Failed to restart daemon:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  daemonCmd
    .command('status')
    .description('Show daemon status')
    .action(async () => {
      try {
        const daemon = DaemonManager.create({
          serviceName: 'auxiora',
          description: 'Auxiora - Secure AI Assistant Platform',
          execPath: getCliPath(),
          workingDirectory: process.cwd(),
        });

        const status = await daemon.status();

        console.log('Daemon Status:');
        console.log(`  Installed: ${status.installed ? '✓' : '✗'}`);
        console.log(`  Running:   ${status.running ? '✓' : '✗'}`);
        console.log(`  Enabled:   ${status.enabled ? '✓' : '✗'}`);
        if (status.pid) {
          console.log(`  PID:       ${status.pid}`);
        }

        if (!status.installed) {
          console.log('\nRun `auxiora daemon install` to install the daemon');
        } else if (!status.running) {
          console.log('\nRun `auxiora daemon start` to start the daemon');
        }
      } catch (error) {
        console.error('Failed to get daemon status:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  daemonCmd
    .command('enable')
    .description('Enable daemon to start at boot')
    .action(async () => {
      try {
        const daemon = DaemonManager.create({
          serviceName: 'auxiora',
          description: 'Auxiora - Secure AI Assistant Platform',
          execPath: getCliPath(),
          workingDirectory: process.cwd(),
        });

        await daemon.enable();
        console.log('✓ Daemon enabled (will start at boot)');
      } catch (error) {
        console.error('Failed to enable daemon:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  daemonCmd
    .command('disable')
    .description('Disable daemon from starting at boot')
    .action(async () => {
      try {
        const daemon = DaemonManager.create({
          serviceName: 'auxiora',
          description: 'Auxiora - Secure AI Assistant Platform',
          execPath: getCliPath(),
          workingDirectory: process.cwd(),
        });

        await daemon.disable();
        console.log('✓ Daemon disabled (will not start at boot)');
      } catch (error) {
        console.error('Failed to disable daemon:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  return daemonCmd;
}
