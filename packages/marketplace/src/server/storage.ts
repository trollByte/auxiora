import * as fs from 'node:fs';
import * as path from 'node:path';

export type PackageType = 'plugins' | 'personalities';

const SAFE_NAME = /^[a-z][a-z0-9_-]{0,62}$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+/; // semver-ish

export class PackageStorage {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /** Store a package tarball. Creates directories as needed. */
  async store(type: PackageType, name: string, version: string, content: Buffer): Promise<string> {
    this.validateName(name);
    this.validateVersion(version);
    const dir = path.join(this.baseDir, type, name);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${version}.tgz`);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  /** Retrieve a stored package. Returns null if not found. */
  async retrieve(type: PackageType, name: string, version: string): Promise<Buffer | null> {
    const filePath = path.join(this.baseDir, type, name, `${version}.tgz`);
    try {
      return fs.readFileSync(filePath);
    } catch {
      return null;
    }
  }

  /** List available versions for a package. */
  async listVersions(type: PackageType, name: string): Promise<string[]> {
    const dir = path.join(this.baseDir, type, name);
    try {
      const files = fs.readdirSync(dir);
      return files
        .filter(f => f.endsWith('.tgz'))
        .map(f => f.replace('.tgz', ''));
    } catch {
      return [];
    }
  }

  /** Remove a specific version. */
  async remove(type: PackageType, name: string, version: string): Promise<void> {
    const filePath = path.join(this.baseDir, type, name, `${version}.tgz`);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore if already removed
    }
  }

  private validateName(name: string): void {
    if (!SAFE_NAME.test(name)) {
      throw new Error(`Invalid package name: ${name}`);
    }
  }

  private validateVersion(version: string): void {
    if (!SAFE_VERSION.test(version)) {
      throw new Error(`Invalid version: ${version}`);
    }
  }
}
