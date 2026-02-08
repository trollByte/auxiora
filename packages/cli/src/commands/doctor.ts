import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  getVaultPath,
  getConfigPath,
  getAuditLogPath,
  getWorkspacePath,
  getMemoryDir,
  getPluginsDir,
  isWindows,
} from '@auxiora/core';
import { AuditLogger } from '@auxiora/audit';
import { loadConfig } from '@auxiora/config';

const execFileAsync = promisify(execFile);

export interface CheckResult {
  name: string;
  category: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  fixable?: boolean;
  fix?: () => Promise<string>;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function checkPermissions(
  filePath: string,
  expected: number,
): Promise<{ ok: boolean; actual: number }> {
  if (isWindows()) return { ok: true, actual: expected };
  try {
    const stats = await fs.stat(filePath);
    const actual = stats.mode & 0o777;
    return { ok: actual === expected, actual };
  } catch {
    return { ok: true, actual: expected };
  }
}

async function fixPermissions(
  filePath: string,
  mode: number,
): Promise<string> {
  await fs.chmod(filePath, mode);
  return `Fixed permissions to ${mode.toString(8).padStart(4, '0')}`;
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    const which = isWindows() ? 'where' : 'which';
    await execFileAsync(which, [cmd]);
    return true;
  } catch {
    return false;
  }
}

// ── Check categories ────────────────────────────────────────────

async function checkConfig(results: CheckResult[]): Promise<void> {
  const configPath = getConfigPath();
  const exists = await fileExists(configPath);

  if (!exists) {
    results.push({
      name: 'Config file',
      category: 'Config',
      status: 'warn',
      message: 'Not found (using defaults)',
    });
    return;
  }

  const perm = await checkPermissions(configPath, 0o600);
  if (!perm.ok) {
    results.push({
      name: 'Config permissions',
      category: 'Config',
      status: 'warn',
      message: `${configPath}: expected 0600, got ${perm.actual.toString(8).padStart(4, '0')}`,
      fixable: true,
      fix: () => fixPermissions(configPath, 0o600),
    });
  } else {
    results.push({
      name: 'Config file',
      category: 'Config',
      status: 'pass',
      message: `Found at ${configPath}`,
    });
  }

  // Validate config content
  try {
    await loadConfig();
    results.push({
      name: 'Config validation',
      category: 'Config',
      status: 'pass',
      message: 'Configuration is valid',
    });
  } catch (err) {
    results.push({
      name: 'Config validation',
      category: 'Config',
      status: 'fail',
      message: `Invalid: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function checkProviders(results: CheckResult[]): Promise<void> {
  const providerEnvVars: Record<string, string> = {
    Anthropic: 'ANTHROPIC_API_KEY',
    OpenAI: 'OPENAI_API_KEY',
    Google: 'GOOGLE_API_KEY',
    Groq: 'GROQ_API_KEY',
    DeepSeek: 'DEEPSEEK_API_KEY',
    Cohere: 'COHERE_API_KEY',
    xAI: 'XAI_API_KEY',
    Replicate: 'REPLICATE_API_TOKEN',
  };

  let hasAny = false;
  for (const [name, envVar] of Object.entries(providerEnvVars)) {
    const key = process.env[envVar];
    if (key) {
      hasAny = true;
      results.push({
        name: `${name} API key`,
        category: 'Providers',
        status: 'pass',
        message: `${envVar} set (${key.slice(0, 6)}...)`,
      });
    }
  }

  // Check vault for stored keys
  const vaultPath = getVaultPath();
  const vaultExists = await fileExists(vaultPath);

  if (!hasAny && !vaultExists) {
    results.push({
      name: 'Provider keys',
      category: 'Providers',
      status: 'warn',
      message: 'No API keys found in env or vault',
    });
  } else if (!hasAny && vaultExists) {
    results.push({
      name: 'Provider keys',
      category: 'Providers',
      status: 'pass',
      message: 'Keys may be stored in vault (unlock to verify)',
    });
  }
}

async function checkChannels(results: CheckResult[]): Promise<void> {
  const channelTokens: Record<string, string> = {
    Discord: 'DISCORD_TOKEN',
    Telegram: 'TELEGRAM_BOT_TOKEN',
    Slack: 'SLACK_BOT_TOKEN',
    Matrix: 'MATRIX_ACCESS_TOKEN',
  };

  for (const [name, envVar] of Object.entries(channelTokens)) {
    const val = process.env[envVar];
    if (val) {
      results.push({
        name: `${name} token`,
        category: 'Channels',
        status: 'pass',
        message: `${envVar} set`,
      });
    }
  }
}

async function checkVault(results: CheckResult[]): Promise<void> {
  const vaultPath = getVaultPath();
  const exists = await fileExists(vaultPath);

  if (!exists) {
    results.push({
      name: 'Vault',
      category: 'Vault',
      status: 'warn',
      message: 'Not initialized (run: auxiora vault add <name>)',
    });
    return;
  }

  const perm = await checkPermissions(vaultPath, 0o600);
  if (!perm.ok) {
    results.push({
      name: 'Vault permissions',
      category: 'Vault',
      status: 'warn',
      message: `Expected 0600, got ${perm.actual.toString(8).padStart(4, '0')}`,
      fixable: true,
      fix: () => fixPermissions(vaultPath, 0o600),
    });
  } else {
    results.push({
      name: 'Vault',
      category: 'Vault',
      status: 'pass',
      message: `Found at ${vaultPath}`,
    });
  }
}

async function checkMemory(results: CheckResult[]): Promise<void> {
  const memoryDir = getMemoryDir();
  const exists = await fileExists(memoryDir);

  if (!exists) {
    results.push({
      name: 'Memory store',
      category: 'Memory',
      status: 'warn',
      message: 'Not initialized (created on first use)',
      fixable: true,
      fix: async () => {
        await fs.mkdir(memoryDir, { recursive: true });
        return `Created ${memoryDir}`;
      },
    });
  } else {
    results.push({
      name: 'Memory store',
      category: 'Memory',
      status: 'pass',
      message: `Found at ${memoryDir}`,
    });
  }
}

async function checkPlugins(results: CheckResult[]): Promise<void> {
  const pluginsDir = getPluginsDir();
  const exists = await fileExists(pluginsDir);

  if (!exists) {
    results.push({
      name: 'Plugins directory',
      category: 'Plugins',
      status: 'warn',
      message: 'Not initialized',
      fixable: true,
      fix: async () => {
        await fs.mkdir(pluginsDir, { recursive: true });
        return `Created ${pluginsDir}`;
      },
    });
  } else {
    try {
      const entries = await fs.readdir(pluginsDir);
      const pluginCount = entries.length;
      results.push({
        name: 'Plugins directory',
        category: 'Plugins',
        status: 'pass',
        message: `${pluginCount} plugin${pluginCount !== 1 ? 's' : ''} installed`,
      });
    } catch {
      results.push({
        name: 'Plugins directory',
        category: 'Plugins',
        status: 'warn',
        message: `Cannot read ${pluginsDir}`,
      });
    }
  }
}

async function checkAuditLog(results: CheckResult[]): Promise<void> {
  const auditPath = getAuditLogPath();
  const exists = await fileExists(auditPath);

  if (!exists) {
    results.push({
      name: 'Audit log',
      category: 'Audit',
      status: 'warn',
      message: 'No audit log yet',
    });
    return;
  }

  const logger = new AuditLogger(auditPath);
  const verification = await logger.verify();

  if (verification.valid) {
    results.push({
      name: 'Audit log',
      category: 'Audit',
      status: 'pass',
      message: `${verification.entries} entries, chain intact`,
    });
  } else {
    results.push({
      name: 'Audit log',
      category: 'Audit',
      status: 'fail',
      message: `Chain broken at entry ${verification.brokenAt}`,
    });
  }

  const perm = await checkPermissions(auditPath, 0o600);
  if (!perm.ok) {
    results.push({
      name: 'Audit log permissions',
      category: 'Audit',
      status: 'warn',
      message: `Expected 0600, got ${perm.actual.toString(8).padStart(4, '0')}`,
      fixable: true,
      fix: () => fixPermissions(auditPath, 0o600),
    });
  }
}

async function checkSystem(results: CheckResult[]): Promise<void> {
  // Node.js version
  const nodeVersion = process.versions.node;
  const majorVersion = parseInt(nodeVersion.split('.')[0], 10);
  if (majorVersion >= 22) {
    results.push({
      name: 'Node.js',
      category: 'System',
      status: 'pass',
      message: `v${nodeVersion}`,
    });
  } else {
    results.push({
      name: 'Node.js',
      category: 'System',
      status: 'fail',
      message: `v${nodeVersion} (requires >= 22)`,
    });
  }

  // Workspace directory
  const workspacePath = getWorkspacePath();
  const wsExists = await fileExists(workspacePath);
  if (wsExists) {
    results.push({
      name: 'Workspace',
      category: 'System',
      status: 'pass',
      message: `Found at ${workspacePath}`,
    });
  } else {
    results.push({
      name: 'Workspace',
      category: 'System',
      status: 'warn',
      message: 'Not initialized',
      fixable: true,
      fix: async () => {
        await fs.mkdir(workspacePath, { recursive: true });
        return `Created ${workspacePath}`;
      },
    });
  }

  // System resources
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memPct = ((freeMem / totalMem) * 100).toFixed(0);
  const totalGB = (totalMem / 1024 / 1024 / 1024).toFixed(1);
  results.push({
    name: 'System memory',
    category: 'System',
    status: Number(memPct) < 10 ? 'warn' : 'pass',
    message: `${totalGB} GB total, ${memPct}% free`,
  });

  // Disk space
  try {
    const workDir = getWorkspacePath();
    const stats = await fs.statfs(workDir);
    const freeGB = (Number(stats.bfree) * Number(stats.bsize) / 1024 / 1024 / 1024).toFixed(1);
    results.push({
      name: 'Disk space',
      category: 'System',
      status: Number(freeGB) < 1 ? 'warn' : 'pass',
      message: `${freeGB} GB free`,
    });
  } catch {
    // statfs may not be available everywhere
  }
}

async function checkNetwork(results: CheckResult[]): Promise<void> {
  // Basic connectivity check
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://api.anthropic.com', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    results.push({
      name: 'Internet connectivity',
      category: 'Network',
      status: 'pass',
      message: `Reachable (HTTP ${res.status})`,
    });
  } catch {
    results.push({
      name: 'Internet connectivity',
      category: 'Network',
      status: 'warn',
      message: 'Cannot reach api.anthropic.com (offline or firewalled)',
    });
  }
}

async function checkDocker(results: CheckResult[]): Promise<void> {
  const hasDocker = await commandExists('docker');
  if (!hasDocker) {
    results.push({
      name: 'Docker',
      category: 'Docker',
      status: 'warn',
      message: 'Not installed (optional, needed for containerized deployments)',
    });
    return;
  }

  try {
    const { stdout } = await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}']);
    results.push({
      name: 'Docker',
      category: 'Docker',
      status: 'pass',
      message: `v${stdout.trim()}`,
    });
  } catch {
    results.push({
      name: 'Docker',
      category: 'Docker',
      status: 'warn',
      message: 'Installed but daemon not running',
    });
  }

  // Check Docker Compose
  try {
    const { stdout } = await execFileAsync('docker', ['compose', 'version', '--short']);
    results.push({
      name: 'Docker Compose',
      category: 'Docker',
      status: 'pass',
      message: `v${stdout.trim()}`,
    });
  } catch {
    results.push({
      name: 'Docker Compose',
      category: 'Docker',
      status: 'warn',
      message: 'Not available',
    });
  }
}

// ── Main ────────────────────────────────────────────────────────

export async function runDoctorChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  await checkConfig(results);
  await checkProviders(results);
  await checkChannels(results);
  await checkVault(results);
  await checkMemory(results);
  await checkPlugins(results);
  await checkAuditLog(results);
  await checkSystem(results);
  await checkNetwork(results);
  await checkDocker(results);

  return results;
}

function formatResults(results: CheckResult[]): {
  hasFailures: boolean;
  hasWarnings: boolean;
} {
  let hasFailures = false;
  let hasWarnings = false;
  let currentCategory = '';

  for (const result of results) {
    if (result.category !== currentCategory) {
      currentCategory = result.category;
      console.log(`\n  \x1b[1m${currentCategory}\x1b[0m`);
    }

    let icon: string;
    switch (result.status) {
      case 'pass':
        icon = '\x1b[32m✓\x1b[0m';
        break;
      case 'warn':
        icon = '\x1b[33m!\x1b[0m';
        hasWarnings = true;
        break;
      case 'fail':
        icon = '\x1b[31m✗\x1b[0m';
        hasFailures = true;
        break;
    }
    const fixTag = result.fixable ? ' \x1b[36m(--fix)\x1b[0m' : '';
    console.log(`    ${icon} ${result.name}: ${result.message}${fixTag}`);
  }

  return { hasFailures, hasWarnings };
}

export function createDoctorCommand(): Command {
  return new Command('doctor')
    .description('Run security and configuration diagnostics')
    .option('--fix', 'Auto-fix common issues (permissions, missing directories)')
    .action(async (options: { fix?: boolean }) => {
      console.log('Auxiora Doctor\n');
      console.log('Running diagnostics...');

      const results = await runDoctorChecks();

      // Apply fixes if requested
      if (options.fix) {
        let fixCount = 0;
        for (const result of results) {
          if (result.fixable && result.fix && result.status !== 'pass') {
            try {
              const msg = await result.fix();
              result.status = 'pass';
              result.message = msg;
              fixCount++;
            } catch (err) {
              result.message += ` (fix failed: ${err instanceof Error ? err.message : String(err)})`;
            }
          }
        }
        if (fixCount > 0) {
          console.log(`\n  Applied ${fixCount} fix${fixCount !== 1 ? 'es' : ''}`);
        }
      }

      const { hasFailures, hasWarnings } = formatResults(results);

      console.log('');

      const fixableCount = results.filter(
        (r) => r.fixable && r.status !== 'pass',
      ).length;

      if (hasFailures) {
        console.log(
          '\x1b[31mSome checks failed. Please address the issues above.\x1b[0m',
        );
        if (fixableCount > 0 && !options.fix) {
          console.log(
            `\x1b[36mRun with --fix to auto-fix ${fixableCount} issue${fixableCount !== 1 ? 's' : ''}.\x1b[0m`,
          );
        }
        process.exit(1);
      } else if (hasWarnings) {
        console.log(
          '\x1b[33mSome warnings detected. Review the items above.\x1b[0m',
        );
        if (fixableCount > 0 && !options.fix) {
          console.log(
            `\x1b[36mRun with --fix to auto-fix ${fixableCount} issue${fixableCount !== 1 ? 's' : ''}.\x1b[0m`,
          );
        }
      } else {
        console.log('\x1b[32mAll checks passed!\x1b[0m');
      }
    });
}
