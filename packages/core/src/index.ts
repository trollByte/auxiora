import * as path from 'node:path';
import * as os from 'node:os';

function getBaseDir(): string {
  const platform = process.platform;
  const homeDir = os.homedir();

  switch (platform) {
    case 'darwin':
      return path.join(homeDir, 'Library', 'Application Support', 'auxiora');
    case 'win32':
      return path.join(
        process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
        'auxiora'
      );
    default:
      // Linux and other Unix-like systems (XDG Base Directory spec)
      return path.join(
        process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config'),
        'auxiora'
      );
  }
}

function getDataDir(): string {
  const platform = process.platform;
  const homeDir = os.homedir();

  switch (platform) {
    case 'darwin':
      return path.join(homeDir, 'Library', 'Application Support', 'auxiora');
    case 'win32':
      return path.join(
        process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'),
        'auxiora'
      );
    default:
      // Linux: XDG_DATA_HOME for data files
      return path.join(
        process.env.XDG_DATA_HOME || path.join(homeDir, '.local', 'share'),
        'auxiora'
      );
  }
}

export function getLogDir(): string {
  const platform = process.platform;
  const homeDir = os.homedir();

  switch (platform) {
    case 'darwin':
      return path.join(homeDir, 'Library', 'Logs', 'auxiora');
    case 'win32':
      return path.join(
        process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'),
        'auxiora',
        'logs'
      );
    default:
      // Linux: XDG_STATE_HOME for logs
      return path.join(
        process.env.XDG_STATE_HOME || path.join(homeDir, '.local', 'state'),
        'auxiora',
        'logs'
      );
  }
}

function getWorkspaceDir(): string {
  return path.join(os.homedir(), '.auxiora', 'workspace');
}

// Path getters
export function getAuxioraDir(): string {
  return getBaseDir();
}

export function getVaultPath(): string {
  return path.join(getBaseDir(), 'vault.enc');
}

export function getConfigPath(): string {
  return path.join(getBaseDir(), 'config.json');
}

export function getAuditLogPath(): string {
  return path.join(getLogDir(), 'audit.jsonl');
}

export function getSessionsDir(): string {
  return path.join(getDataDir(), 'sessions');
}

export function getWorkspacePath(): string {
  return getWorkspaceDir();
}

export function getSoulPath(): string {
  return path.join(getWorkspaceDir(), 'SOUL.md');
}

export function getAgentsPath(): string {
  return path.join(getWorkspaceDir(), 'AGENTS.md');
}

export function getIdentityPath(): string {
  return path.join(getWorkspaceDir(), 'IDENTITY.md');
}

export function getUserPath(): string {
  return path.join(getWorkspaceDir(), 'USER.md');
}

export function getMemoryDir(): string {
  return path.join(getWorkspaceDir(), 'memory');
}

export function getBehaviorsPath(): string {
  return path.join(getDataDir(), 'behaviors.json');
}

export const paths = {
  base: getBaseDir,
  data: getDataDir,
  logs: getLogDir,
  workspace: getWorkspaceDir,
  vault: getVaultPath,
  config: getConfigPath,
  auditLog: getAuditLogPath,
  sessions: getSessionsDir,
  soul: getSoulPath,
  agents: getAgentsPath,
  identity: getIdentityPath,
  user: getUserPath,
  memory: getMemoryDir,
  behaviors: getBehaviorsPath,
};

/**
 * Zero out a buffer to prevent sensitive data from lingering in memory.
 */
export function zeroBuffer(buffer: Buffer): void {
  buffer.fill(0);
}

/**
 * Check if the current platform is Windows.
 */
export function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Check if the current platform is macOS.
 */
export function isMacOS(): boolean {
  return process.platform === 'darwin';
}

/**
 * Check if the current platform is Linux.
 */
export function isLinux(): boolean {
  return process.platform === 'linux';
}
