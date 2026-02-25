import { Command } from 'commander';
import { loadConfig, saveConfig } from '@auxiora/config';

export function createDesktopCommand(): Command {
  const desktopCmd = new Command('desktop').description('Manage Auxiora desktop application');

  desktopCmd
    .command('launch')
    .description('Launch the desktop application')
    .action(async () => {
      try {
        const config = await loadConfig();
        const port = config.gateway.port;
        console.log(`Launching Auxiora desktop (gateway: http://localhost:${port})`);
        console.log('Desktop app would start via Tauri binary');
      } catch (error) {
        console.error('Failed to launch desktop:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  desktopCmd
    .command('status')
    .description('Show desktop application status')
    .action(async () => {
      try {
        const config = await loadConfig();
        const desktop = config.desktop;

        console.log('Desktop Status:');
        console.log(`  Auto-start:    ${desktop.autoStart ? 'enabled' : 'disabled'}`);
        console.log(`  Minimize to tray: ${desktop.minimizeToTray ? 'yes' : 'no'}`);
        console.log(`  Hotkey:        ${desktop.hotkey}`);
        console.log(`  Notifications: ${desktop.notificationsEnabled ? 'enabled' : 'disabled'}`);
        console.log(`  Update channel: ${desktop.updateChannel}`);
        console.log(`  Ollama:        ${desktop.ollamaEnabled ? 'enabled' : 'disabled'}`);
        console.log(`  Window size:   ${desktop.windowWidth}x${desktop.windowHeight}`);
      } catch (error) {
        console.error('Failed to get status:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  desktopCmd
    .command('config')
    .description('Update desktop configuration')
    .option('--auto-start <boolean>', 'Enable or disable auto-start')
    .option('--hotkey <combo>', 'Set global hotkey')
    .option('--notifications <boolean>', 'Enable or disable notifications')
    .option('--update-channel <channel>', 'Set update channel (stable|beta|nightly)')
    .option('--ollama <boolean>', 'Enable or disable bundled Ollama')
    .action(async (opts: Record<string, string | undefined>) => {
      try {
        const config = await loadConfig();
        let changed = false;

        if (opts.autoStart !== undefined) {
          config.desktop.autoStart = opts.autoStart === 'true';
          changed = true;
        }
        if (opts.hotkey !== undefined) {
          config.desktop.hotkey = opts.hotkey;
          changed = true;
        }
        if (opts.notifications !== undefined) {
          config.desktop.notificationsEnabled = opts.notifications === 'true';
          changed = true;
        }
        if (opts.updateChannel !== undefined) {
          const ch = opts.updateChannel as 'stable' | 'beta' | 'nightly';
          if (['stable', 'beta', 'nightly'].includes(ch)) {
            config.desktop.updateChannel = ch;
            changed = true;
          } else {
            console.error('Invalid update channel. Use: stable, beta, or nightly');
            process.exit(1);
          }
        }
        if (opts.ollama !== undefined) {
          config.desktop.ollamaEnabled = opts.ollama === 'true';
          changed = true;
        }

        if (changed) {
          await saveConfig(config);
          console.log('Desktop configuration updated.');
        } else {
          console.log('No changes specified. Use --help to see options.');
        }
      } catch (error) {
        console.error('Failed to update config:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  desktopCmd
    .command('update')
    .description('Check for desktop application updates')
    .option('--channel <channel>', 'Override update channel for this check')
    .action(async (opts: Record<string, string | undefined>) => {
      try {
        const config = await loadConfig();
        const channel = opts.channel ?? config.desktop.updateChannel;
        console.log(`Checking for updates on "${channel}" channel...`);
        console.log('Update check requires the desktop application to be running.');
      } catch (error) {
        console.error('Failed to check updates:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  return desktopCmd;
}
