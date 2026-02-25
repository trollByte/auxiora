import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getPluginsDir } from '@auxiora/core';

export interface InstallOptions {
  /** Override plugins directory (for testing). */
  pluginsDir?: string;
  /** Allow overwriting existing plugin files. */
  force?: boolean;
}

export interface InstallResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/** Name must be safe for filesystem use — no path traversal. */
const SAFE_NAME_PATTERN = /^[a-z][a-z0-9_]{1,62}$/;

export class SkillInstaller {
  private pluginsDir: string;

  constructor(options?: { pluginsDir?: string }) {
    this.pluginsDir = options?.pluginsDir ?? getPluginsDir();
  }

  async install(name: string, source: string, options?: InstallOptions): Promise<InstallResult> {
    // Sanitize name
    if (!SAFE_NAME_PATTERN.test(name)) {
      return { success: false, error: `Invalid plugin name "${name}" — must match ${SAFE_NAME_PATTERN}` };
    }

    // Prevent path traversal
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return { success: false, error: 'Plugin name contains path traversal characters' };
    }

    const dir = options?.pluginsDir ?? this.pluginsDir;
    await fs.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, `${name}.js`);

    // Check for existing file
    if (!options?.force) {
      try {
        await fs.access(filePath);
        return { success: false, error: `Plugin "${name}" already exists. Use force to overwrite.` };
      } catch {
        // File doesn't exist — good
      }
    }

    await fs.writeFile(filePath, source, 'utf-8');
    return { success: true, filePath };
  }
}
