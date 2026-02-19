import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLogger } from '@auxiora/logger';
import type { InstallMethod, InstallationInfo } from './types.js';

const logger = getLogger('updater:detector');

function readPackageVersion(): string {
  try {
    let dir = path.dirname(new URL(import.meta.url).pathname);
    for (let i = 0; i < 5; i++) {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.version) return pkg.version;
      }
      dir = path.dirname(dir);
    }
  } catch {
    // Fall through
  }
  return '0.0.0';
}

export class InstallationDetector {
  detect(): InstallationInfo {
    const method = this.detectMethod();
    const currentVersion = readPackageVersion();
    const installPath = this.resolveInstallPath(method);

    const info: InstallationInfo = {
      method,
      currentVersion,
      installPath,
      canSelfUpdate: method !== 'unknown',
      requiresSudo: method === 'apt' || (method === 'tarball' && installPath.startsWith('/opt/')),
    };

    if (method === 'docker' || method === 'k8s') {
      info.containerRuntime = this.detectContainerRuntime();
    }

    logger.debug('Installation detected', { method, installPath, currentVersion });
    return info;
  }

  private detectMethod(): InstallMethod {
    if (fs.existsSync('/.dockerenv')) return 'docker';
    if (process.env.KUBERNETES_SERVICE_HOST) return 'k8s';

    const override = process.env.AUXIORA_INSTALL_METHOD;
    if (override && this.isValidMethod(override)) return override;

    const execPath = process.argv[1] ?? '';
    if (execPath.includes('homebrew') || execPath.includes('Homebrew') || execPath.includes('Cellar')) {
      return 'brew';
    }

    if (fs.existsSync('/var/lib/dpkg/info/auxiora.list')) return 'apt';

    const projectRoot = this.findProjectRoot();
    if (projectRoot && fs.existsSync(path.join(projectRoot, '.git'))) return 'git';

    if (execPath.includes('node_modules')) return 'npm';

    const home = process.env.HOME ?? '';
    if (
      execPath.startsWith(path.join(home, '.local/lib/auxiora')) ||
      execPath.startsWith('/opt/auxiora')
    ) {
      return 'tarball';
    }

    return 'unknown';
  }

  private isValidMethod(value: string): value is InstallMethod {
    return ['npm', 'git', 'docker', 'apt', 'brew', 'tarball', 'k8s'].includes(value);
  }

  private findProjectRoot(): string | null {
    let dir = path.dirname(new URL(import.meta.url).pathname);
    for (let i = 0; i < 10; i++) {
      if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }

  private resolveInstallPath(method: InstallMethod): string {
    switch (method) {
      case 'docker':
      case 'k8s':
        return '/app';
      case 'apt':
        return '/opt/auxiora';
      case 'git':
        return this.findProjectRoot() ?? process.cwd();
      case 'tarball': {
        const home = process.env.HOME ?? '';
        const localPath = path.join(home, '.local/lib/auxiora');
        return fs.existsSync(localPath) ? localPath : '/opt/auxiora';
      }
      default:
        return process.cwd();
    }
  }

  private detectContainerRuntime(): 'docker' | 'podman' {
    if (process.env.container === 'podman') return 'podman';
    return 'docker';
  }
}
