import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { isWindows, isMacOS, isLinux } from '@auxiora/core';

// Strict pattern: only alphanumeric, hyphens, underscores, dots
const SAFE_SERVICE_NAME = /^[a-zA-Z0-9._-]+$/;

function validateServiceName(name: string): string {
  if (!SAFE_SERVICE_NAME.test(name)) {
    throw new Error(`Invalid service name: "${name}" — only alphanumeric, hyphens, underscores, and dots allowed`);
  }
  return name;
}

export interface DaemonConfig {
  serviceName: string;
  description: string;
  execPath: string;
  workingDirectory: string;
  user?: string;
  env?: Record<string, string>;
}

export interface DaemonStatus {
  installed: boolean;
  running: boolean;
  enabled: boolean;
  pid?: number;
}

export abstract class DaemonManager {
  constructor(protected config: DaemonConfig) {
    validateServiceName(config.serviceName);
  }

  abstract install(): Promise<void>;
  abstract uninstall(): Promise<void>;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract restart(): Promise<void>;
  abstract status(): Promise<DaemonStatus>;
  abstract enable(): Promise<void>;
  abstract disable(): Promise<void>;

  static create(config: DaemonConfig): DaemonManager {
    if (isMacOS()) {
      return new LaunchdManager(config);
    } else if (isLinux()) {
      return new SystemdManager(config);
    } else if (isWindows()) {
      return new WindowsTaskSchedulerManager(config);
    } else {
      throw new Error(`Unsupported platform: ${process.platform}`);
    }
  }
}

// macOS launchd implementation
class LaunchdManager extends DaemonManager {
  private get plistPath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, 'Library', 'LaunchAgents', `com.${this.config.serviceName}.plist`);
  }

  private generatePlist(): string {
    const envVars = this.config.env || {};
    const envDict = Object.entries(envVars)
      .map(([key, value]) => `    <key>${key}</key>\n    <string>${value}</string>`)
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.${this.config.serviceName}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${this.config.execPath}</string>
    <string>start</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${this.config.workingDirectory}</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <key>StandardOutPath</key>
  <string>${path.join(os.homedir(), 'Library', 'Logs', this.config.serviceName + '.log')}</string>

  <key>StandardErrorPath</key>
  <string>${path.join(os.homedir(), 'Library', 'Logs', this.config.serviceName + '.err.log')}</string>

  ${envDict ? `<key>EnvironmentVariables</key>\n  <dict>\n${envDict}\n  </dict>` : ''}
</dict>
</plist>`;
  }

  async install(): Promise<void> {
    const plist = this.generatePlist();
    const plistDir = path.dirname(this.plistPath);

    await fs.mkdir(plistDir, { recursive: true });
    await fs.writeFile(this.plistPath, plist, 'utf-8');

    console.log(`Installed launchd service at ${this.plistPath}`);
  }

  async uninstall(): Promise<void> {
    try {
      await this.stop();
    } catch {
      // Ignore if not running
    }

    try {
      await fs.unlink(this.plistPath);
      console.log('Uninstalled launchd service');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async start(): Promise<void> {
    execFileSync('launchctl', ['load', this.plistPath], { stdio: 'inherit' });
  }

  async stop(): Promise<void> {
    execFileSync('launchctl', ['unload', this.plistPath], { stdio: 'inherit' });
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async status(): Promise<DaemonStatus> {
    const installed = await fs.access(this.plistPath).then(() => true).catch(() => false);

    if (!installed) {
      return { installed: false, running: false, enabled: false };
    }

    let running = false;
    try {
      const output = execFileSync('launchctl', ['list'], { encoding: 'utf-8' });
      running = output.includes(`com.${this.config.serviceName}`);
    } catch {
      running = false;
    }

    return {
      installed,
      running,
      enabled: installed, // launchd services are enabled if installed
    };
  }

  async enable(): Promise<void> {
    // launchd services are enabled by default when installed
    await this.start();
  }

  async disable(): Promise<void> {
    await this.stop();
  }
}

// Linux systemd implementation
class SystemdManager extends DaemonManager {
  private get servicePath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.config', 'systemd', 'user', `${this.config.serviceName}.service`);
  }

  private generateServiceFile(): string {
    const envVars = this.config.env || {};
    const envLines = Object.entries(envVars)
      .map(([key, value]) => `Environment="${key}=${value}"`)
      .join('\n');

    return `[Unit]
Description=${this.config.description}
After=network.target

[Service]
Type=simple
ExecStart=${this.config.execPath} start
WorkingDirectory=${this.config.workingDirectory}
Restart=on-failure
RestartSec=5s
${envLines}

[Install]
WantedBy=default.target`;
  }

  async install(): Promise<void> {
    const service = this.generateServiceFile();
    const serviceDir = path.dirname(this.servicePath);

    await fs.mkdir(serviceDir, { recursive: true });
    await fs.writeFile(this.servicePath, service, 'utf-8');

    execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' });
    console.log(`Installed systemd service at ${this.servicePath}`);
  }

  async uninstall(): Promise<void> {
    try {
      await this.disable();
      await this.stop();
    } catch {
      // Ignore if not running
    }

    try {
      await fs.unlink(this.servicePath);
      execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' });
      console.log('Uninstalled systemd service');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async start(): Promise<void> {
    execFileSync('systemctl', ['--user', 'start', this.config.serviceName], { stdio: 'inherit' });
  }

  async stop(): Promise<void> {
    execFileSync('systemctl', ['--user', 'stop', this.config.serviceName], { stdio: 'inherit' });
  }

  async restart(): Promise<void> {
    execFileSync('systemctl', ['--user', 'restart', this.config.serviceName], { stdio: 'inherit' });
  }

  async status(): Promise<DaemonStatus> {
    const installed = await fs.access(this.servicePath).then(() => true).catch(() => false);

    if (!installed) {
      return { installed: false, running: false, enabled: false };
    }

    let running = false;
    let enabled = false;
    let pid: number | undefined;

    try {
      const output = execFileSync('systemctl', ['--user', 'is-active', this.config.serviceName], { encoding: 'utf-8' });
      running = output.trim() === 'active';
    } catch {
      running = false;
    }

    try {
      const output = execFileSync('systemctl', ['--user', 'is-enabled', this.config.serviceName], { encoding: 'utf-8' });
      enabled = output.trim() === 'enabled';
    } catch {
      enabled = false;
    }

    if (running) {
      try {
        const output = execFileSync('systemctl', ['--user', 'show', this.config.serviceName, '--property=MainPID'], { encoding: 'utf-8' });
        const match = output.match(/MainPID=(\d+)/);
        if (match) {
          pid = parseInt(match[1], 10);
        }
      } catch {
        // Ignore
      }
    }

    return { installed, running, enabled, pid };
  }

  async enable(): Promise<void> {
    execFileSync('systemctl', ['--user', 'enable', this.config.serviceName], { stdio: 'inherit' });
  }

  async disable(): Promise<void> {
    execFileSync('systemctl', ['--user', 'disable', this.config.serviceName], { stdio: 'inherit' });
  }
}

// Windows Task Scheduler implementation
class WindowsTaskSchedulerManager extends DaemonManager {
  private get taskName(): string {
    return `Auxiora_${this.config.serviceName}`;
  }

  private generateTaskXml(): string {
    const envVars = this.config.env || {};
    const envEntries = Object.entries(envVars)
      .map(([key, value]) => `      <Variable><Name>${key}</Name><Value>${value}</Value></Variable>`)
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>${this.config.description}</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${this.config.execPath}</Command>
      <Arguments>start</Arguments>
      <WorkingDirectory>${this.config.workingDirectory}</WorkingDirectory>
    </Exec>
  </Actions>
  ${envEntries ? `<Environment>\n${envEntries}\n  </Environment>` : ''}
</Task>`;
  }

  async install(): Promise<void> {
    const xml = this.generateTaskXml();
    const tempFile = path.join(os.tmpdir(), `${this.taskName}.xml`);

    await fs.writeFile(tempFile, xml, 'utf-16le');

    execFileSync('schtasks', ['/Create', '/TN', this.taskName, '/XML', tempFile, '/F'], { stdio: 'inherit' });
    await fs.unlink(tempFile);

    console.log(`Installed Windows scheduled task: ${this.taskName}`);
  }

  async uninstall(): Promise<void> {
    try {
      await this.stop();
    } catch {
      // Ignore if not running
    }

    try {
      execFileSync('schtasks', ['/Delete', '/TN', this.taskName, '/F'], { stdio: 'inherit' });
      console.log('Uninstalled Windows scheduled task');
    } catch {
      // Ignore if doesn't exist
    }
  }

  async start(): Promise<void> {
    execFileSync('schtasks', ['/Run', '/TN', this.taskName], { stdio: 'inherit' });
  }

  async stop(): Promise<void> {
    execFileSync('schtasks', ['/End', '/TN', this.taskName], { stdio: 'inherit' });
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async status(): Promise<DaemonStatus> {
    let installed = false;
    let running = false;
    let enabled = false;

    try {
      const output = execFileSync('schtasks', ['/Query', '/TN', this.taskName, '/FO', 'CSV', '/NH'], { encoding: 'utf-8' });
      installed = true;

      const lines = output.trim().split('\n');
      if (lines.length > 0) {
        const fields = lines[0].split(',');
        const status = fields[2]?.replace(/"/g, '');
        running = status === 'Running';
        enabled = fields[1]?.replace(/"/g, '') !== 'Disabled';
      }
    } catch {
      installed = false;
    }

    return { installed, running, enabled };
  }

  async enable(): Promise<void> {
    execFileSync('schtasks', ['/Change', '/TN', this.taskName, '/ENABLE'], { stdio: 'inherit' });
  }

  async disable(): Promise<void> {
    execFileSync('schtasks', ['/Change', '/TN', this.taskName, '/DISABLE'], { stdio: 'inherit' });
  }
}
