import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import {
  getVaultPath,
  getConfigPath,
  getAuditLogPath,
  getWorkspacePath,
  isWindows,
} from '@auxiora/core';
import { AuditLogger } from '@auxiora/audit';

interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

async function checkFileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function checkFilePermissions(path: string): Promise<string | null> {
  if (isWindows()) return null;

  try {
    const stats = await fs.stat(path);
    const mode = stats.mode & 0o777;
    if (mode !== 0o600) {
      return `Expected 0600, got ${mode.toString(8).padStart(4, '0')}`;
    }
    return null;
  } catch {
    return null;
  }
}

async function runChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Check vault file
  const vaultPath = getVaultPath();
  const vaultExists = await checkFileExists(vaultPath);
  if (vaultExists) {
    const permError = await checkFilePermissions(vaultPath);
    if (permError) {
      results.push({
        name: 'Vault Permissions',
        status: 'warn',
        message: `${vaultPath}: ${permError}`,
      });
    } else {
      results.push({
        name: 'Vault',
        status: 'pass',
        message: `Found at ${vaultPath}`,
      });
    }
  } else {
    results.push({
      name: 'Vault',
      status: 'warn',
      message: 'Not initialized (run: auxiora vault add <name>)',
    });
  }

  // Check config file
  const configPath = getConfigPath();
  const configExists = await checkFileExists(configPath);
  if (configExists) {
    const permError = await checkFilePermissions(configPath);
    if (permError) {
      results.push({
        name: 'Config Permissions',
        status: 'warn',
        message: `${configPath}: ${permError}`,
      });
    } else {
      results.push({
        name: 'Config',
        status: 'pass',
        message: `Found at ${configPath}`,
      });
    }
  } else {
    results.push({
      name: 'Config',
      status: 'warn',
      message: 'Using defaults (run gateway to create)',
    });
  }

  // Check audit log integrity
  const auditPath = getAuditLogPath();
  const auditExists = await checkFileExists(auditPath);
  if (auditExists) {
    const logger = new AuditLogger(auditPath);
    const verification = await logger.verify();

    if (verification.valid) {
      results.push({
        name: 'Audit Log',
        status: 'pass',
        message: `${verification.entries} entries, chain intact`,
      });
    } else {
      results.push({
        name: 'Audit Log',
        status: 'fail',
        message: `Chain broken at entry ${verification.brokenAt}`,
      });
    }

    const permError = await checkFilePermissions(auditPath);
    if (permError) {
      results.push({
        name: 'Audit Log Permissions',
        status: 'warn',
        message: `${auditPath}: ${permError}`,
      });
    }
  } else {
    results.push({
      name: 'Audit Log',
      status: 'warn',
      message: 'No audit log yet',
    });
  }

  // Check workspace directory
  const workspacePath = getWorkspacePath();
  const workspaceExists = await checkFileExists(workspacePath);
  if (workspaceExists) {
    results.push({
      name: 'Workspace',
      status: 'pass',
      message: `Found at ${workspacePath}`,
    });
  } else {
    results.push({
      name: 'Workspace',
      status: 'warn',
      message: 'Not initialized',
    });
  }

  // Check Node.js version
  const nodeVersion = process.versions.node;
  const majorVersion = parseInt(nodeVersion.split('.')[0], 10);
  if (majorVersion >= 22) {
    results.push({
      name: 'Node.js',
      status: 'pass',
      message: `v${nodeVersion}`,
    });
  } else {
    results.push({
      name: 'Node.js',
      status: 'fail',
      message: `v${nodeVersion} (requires >= 22)`,
    });
  }

  return results;
}

export function createDoctorCommand(): Command {
  return new Command('doctor')
    .description('Run security and configuration diagnostics')
    .action(async () => {
      console.log('Auxiora Doctor\n');
      console.log('Running diagnostics...\n');

      const results = await runChecks();

      let hasFailures = false;
      let hasWarnings = false;

      for (const result of results) {
        let icon: string;
        switch (result.status) {
          case 'pass':
            icon = '\x1b[32m✓\x1b[0m'; // green checkmark
            break;
          case 'warn':
            icon = '\x1b[33m!\x1b[0m'; // yellow warning
            hasWarnings = true;
            break;
          case 'fail':
            icon = '\x1b[31m✗\x1b[0m'; // red X
            hasFailures = true;
            break;
        }
        console.log(`  ${icon} ${result.name}: ${result.message}`);
      }

      console.log('');

      if (hasFailures) {
        console.log('\x1b[31mSome checks failed. Please address the issues above.\x1b[0m');
        process.exit(1);
      } else if (hasWarnings) {
        console.log('\x1b[33mSome warnings detected. Review the items above.\x1b[0m');
      } else {
        console.log('\x1b[32mAll checks passed!\x1b[0m');
      }
    });
}
