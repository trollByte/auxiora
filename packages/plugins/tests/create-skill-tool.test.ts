import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { registerCreateSkillTool } from '../src/create-skill-tool.js';
import { PluginLoader } from '../src/loader.js';
import { toolRegistry } from '@auxiora/tools';

let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-create-skill-'));
});

afterEach(() => {
  try {
    toolRegistry.unregister('create_skill');
  } catch {
    /* may not exist */
  }
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('registerCreateSkillTool', () => {
  it('should register create_skill tool', () => {
    const loader = new PluginLoader({ pluginsDir: testDir });
    registerCreateSkillTool({
      loader,
      generate: vi.fn(),
      pluginsDir: testDir,
    });

    expect(toolRegistry.listNames()).toContain('create_skill');
  });

  it('should create and load a plugin from description', async () => {
    const validPlugin = `export const plugin = {
  name: 'greeter',
  version: '1.0.0',
  description: 'Greets people',
  permissions: [],
  tools: [{
    name: 'greet',
    description: 'Greet someone',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'Name' } }, required: ['name'] },
    execute: async (p) => ({ success: true, output: 'Hello ' + p.name }),
  }],
};`;

    const mockGenerate = vi.fn().mockResolvedValueOnce(validPlugin);
    const loader = new PluginLoader({ pluginsDir: testDir });

    registerCreateSkillTool({
      loader,
      generate: mockGenerate,
      pluginsDir: testDir,
    });

    const tool = toolRegistry.get('create_skill');
    const result = await tool!.execute(
      { description: 'Create a greeting tool' },
      {} as any,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('greeter');
    expect(result.output).toContain('greet');
    // Verify file was written
    expect(fs.existsSync(path.join(testDir, 'greeter.js'))).toBe(true);
  });

  it('should return error when generation fails', async () => {
    const badCode = `const fs = require('fs');\nexport const plugin = { name: 'bad', version: '1.0.0', tools: [] };`;
    const mockGenerate = vi.fn().mockResolvedValue(badCode);
    const loader = new PluginLoader({ pluginsDir: testDir });

    registerCreateSkillTool({
      loader,
      generate: mockGenerate,
      pluginsDir: testDir,
    });

    const tool = toolRegistry.get('create_skill');
    const result = await tool!.execute(
      { description: 'something bad' },
      {} as any,
    );

    expect(result.success).toBe(false);
    expect(result.output).toContain('Failed to generate');
  });

  it('should require user approval permission', () => {
    const loader = new PluginLoader({ pluginsDir: testDir });
    registerCreateSkillTool({
      loader,
      generate: vi.fn(),
      pluginsDir: testDir,
    });

    const tool = toolRegistry.get('create_skill');
    const permission = tool!.getPermission({}, {} as any);
    expect(permission).toBe('user_approval');
  });
});
