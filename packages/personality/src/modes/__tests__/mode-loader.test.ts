import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ModeLoader } from '../mode-loader.js';

describe('ModeLoader', () => {
  let tmpDir: string;
  let builtInDir: string;
  let userDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mode-loader-test-'));
    builtInDir = path.join(tmpDir, 'built-in');
    userDir = path.join(tmpDir, 'user');
    await fs.mkdir(builtInDir, { recursive: true });
    await fs.mkdir(userDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should load built-in mode files', async () => {
    await fs.writeFile(
      path.join(builtInDir, 'operator.md'),
      `<!-- mode: operator\n name: Operator\n description: Fast execution\n signals: run:0.8, execute:0.7 -->\n# Operator mode content`,
    );
    await fs.writeFile(
      path.join(builtInDir, 'analyst.md'),
      `<!-- mode: analyst\n name: Analyst\n description: Deep analysis\n signals: analyze:0.8 -->\n# Analyst mode content`,
    );

    const loader = new ModeLoader(builtInDir, userDir);
    const modes = await loader.loadAll();

    expect(modes.size).toBe(2);
    expect(modes.get('operator')).toBeDefined();
    expect(modes.get('analyst')).toBeDefined();
  });

  it('should parse metadata correctly', async () => {
    await fs.writeFile(
      path.join(builtInDir, 'writer.md'),
      `<!-- mode: writer\n name: Writer\n description: Creative writing\n signals: write:0.7, draft:0.8, blog post:0.9 -->\n# Writer mode\nBe creative.`,
    );

    const loader = new ModeLoader(builtInDir, userDir);
    await loader.loadAll();
    const mode = loader.get('writer');

    expect(mode).toBeDefined();
    expect(mode!.name).toBe('Writer');
    expect(mode!.description).toBe('Creative writing');
    expect(mode!.signals).toHaveLength(3);
    expect(mode!.signals[0]).toEqual({ phrase: 'write', weight: 0.7 });
    expect(mode!.signals[1]).toEqual({ phrase: 'draft', weight: 0.8 });
    expect(mode!.signals[2]).toEqual({ phrase: 'blog post', weight: 0.9 });
    expect(mode!.promptContent).toContain('# Writer mode');
    expect(mode!.promptContent).toContain('Be creative.');
  });

  it('should return empty map when directory does not exist', async () => {
    const loader = new ModeLoader('/nonexistent/path', '/also/nonexistent');
    const modes = await loader.loadAll();
    expect(modes.size).toBe(0);
  });

  it('should skip files without valid metadata', async () => {
    // File with no HTML comment header
    await fs.writeFile(
      path.join(builtInDir, 'operator.md'),
      `# Just some markdown\nNo metadata here.`,
    );

    const loader = new ModeLoader(builtInDir, userDir);
    const modes = await loader.loadAll();
    expect(modes.size).toBe(0);
  });

  it('should skip non-.md files', async () => {
    await fs.writeFile(path.join(builtInDir, 'readme.txt'), 'not a mode');
    await fs.writeFile(
      path.join(builtInDir, 'operator.md'),
      `<!-- mode: operator\n name: Operator\n description: test\n signals: run:0.8 -->\ncontent`,
    );

    const loader = new ModeLoader(builtInDir, userDir);
    const modes = await loader.loadAll();
    expect(modes.size).toBe(1);
  });

  it('should skip files with unknown mode IDs', async () => {
    await fs.writeFile(
      path.join(builtInDir, 'custom-mode.md'),
      `<!-- mode: custom-mode\n name: Custom\n description: test\n signals: foo:0.8 -->\ncontent`,
    );

    const loader = new ModeLoader(builtInDir, userDir);
    const modes = await loader.loadAll();
    expect(modes.size).toBe(0);
  });

  it('should allow user modes to override built-in modes', async () => {
    await fs.writeFile(
      path.join(builtInDir, 'operator.md'),
      `<!-- mode: operator\n name: Operator\n description: Built-in operator\n signals: run:0.8 -->\nBuilt-in content`,
    );
    await fs.writeFile(
      path.join(userDir, 'operator.md'),
      `<!-- mode: operator\n name: My Operator\n description: Custom operator\n signals: run:0.9, go:0.7 -->\nCustom content`,
    );

    const loader = new ModeLoader(builtInDir, userDir);
    await loader.loadAll();
    const mode = loader.get('operator');

    expect(mode).toBeDefined();
    expect(mode!.name).toBe('My Operator');
    expect(mode!.description).toBe('Custom operator');
    expect(mode!.promptContent).toBe('Custom content');
  });

  it('should reload modes', async () => {
    await fs.writeFile(
      path.join(builtInDir, 'operator.md'),
      `<!-- mode: operator\n name: Operator\n description: v1\n signals: run:0.8 -->\nv1`,
    );

    const loader = new ModeLoader(builtInDir, userDir);
    await loader.loadAll();
    expect(loader.get('operator')!.description).toBe('v1');

    // Modify file
    await fs.writeFile(
      path.join(builtInDir, 'operator.md'),
      `<!-- mode: operator\n name: Operator\n description: v2\n signals: run:0.8 -->\nv2`,
    );

    await loader.reload();
    expect(loader.get('operator')!.description).toBe('v2');
  });
});
