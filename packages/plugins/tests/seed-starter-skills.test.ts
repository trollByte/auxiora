import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('PluginLoader.seedStarterSkills', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auxiora-seed-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('copies starter skills when plugins dir is empty', async () => {
    const { PluginLoader } = await import('../src/loader.js');
    const loader = new PluginLoader(tmpDir);
    const count = await loader.seedStarterSkills();
    expect(count).toBeGreaterThan(0);

    const files = await fs.readdir(tmpDir);
    const jsFiles = files.filter(f => f.endsWith('.js'));
    expect(jsFiles.length).toBe(count);
  });

  it('skips seeding when plugins dir already has .js files', async () => {
    // Create a dummy plugin file
    await fs.writeFile(path.join(tmpDir, 'existing.js'), 'export const plugin = {}');

    const { PluginLoader } = await import('../src/loader.js');
    const loader = new PluginLoader(tmpDir);
    const count = await loader.seedStarterSkills();
    expect(count).toBe(0);
  });

  it('creates plugins dir if it does not exist', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'plugins');
    const { PluginLoader } = await import('../src/loader.js');
    const loader = new PluginLoader(nestedDir);
    const count = await loader.seedStarterSkills();
    expect(count).toBeGreaterThan(0);

    const stat = await fs.stat(nestedDir);
    expect(stat.isDirectory()).toBe(true);
  });
});
