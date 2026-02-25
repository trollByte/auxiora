import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillInstaller } from '../src/skill-installer.js';

let testDir: string;
let installer: SkillInstaller;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-installer-'));
  installer = new SkillInstaller({ pluginsDir: testDir });
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('SkillInstaller', () => {
  const validSource = `export const plugin = { name: 'test', version: '1.0.0', tools: [] };`;

  it('should install a plugin to disk', async () => {
    const result = await installer.install('hello_world', validSource);
    expect(result.success).toBe(true);
    expect(result.filePath).toContain('hello_world.js');
    expect(fs.existsSync(result.filePath!)).toBe(true);
    expect(fs.readFileSync(result.filePath!, 'utf-8')).toBe(validSource);
  });

  it('should refuse to overwrite without force', async () => {
    await installer.install('existing', validSource);
    const result = await installer.install('existing', 'new source');
    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('should overwrite with force flag', async () => {
    await installer.install('existing', validSource);
    const result = await installer.install('existing', 'new source', { force: true });
    expect(result.success).toBe(true);
    expect(fs.readFileSync(result.filePath!, 'utf-8')).toBe('new source');
  });

  it('should reject invalid names', async () => {
    const result = await installer.install('Invalid-Name', validSource);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid plugin name');
  });

  it('should reject path traversal attempts', async () => {
    // The SAFE_NAME_PATTERN already blocks these, but test anyway
    const result = await installer.install('../escape', validSource);
    expect(result.success).toBe(false);
  });

  it('should create plugins directory if it does not exist', async () => {
    const nestedDir = path.join(testDir, 'nested', 'plugins');
    const nestedInstaller = new SkillInstaller({ pluginsDir: nestedDir });
    const result = await nestedInstaller.install('deep', validSource);
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(nestedDir, 'deep.js'))).toBe(true);
  });
});
