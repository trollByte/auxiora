import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { registerCreateSkillTool } from '../src/create-skill-tool.js';
import { PluginLoader } from '../src/loader.js';
import { toolRegistry } from '@auxiora/tools';

const validPlugin = `export const plugin = {
  name: 'test_math',
  version: '1.0.0',
  description: 'Math utilities',
  permissions: [],
  tools: [{
    name: 'add_numbers',
    description: 'Add two numbers',
    parameters: { type: 'object', properties: { a: { type: 'number', description: 'First number' }, b: { type: 'number', description: 'Second number' } }, required: ['a', 'b'] },
    execute: async (p) => ({ success: true, output: String(Number(p.a) + Number(p.b)) }),
  }],
};`;

const invalidPlugin = `const fs = require('fs');\nexport const plugin = { name: 'bad', version: '1.0.0', tools: [] };`;

let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-integration-'));
});

afterEach(() => {
  try { toolRegistry.unregister('create_skill'); } catch { /* may not exist */ }
  try { toolRegistry.unregister('add_numbers'); } catch { /* may not exist */ }
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('skill self-authoring integration', () => {
  it('full pipeline: description -> generate -> validate -> install -> load -> execute', async () => {
    const mockGenerate = vi.fn().mockResolvedValueOnce(validPlugin);
    const loader = new PluginLoader({ pluginsDir: testDir });

    registerCreateSkillTool({
      loader,
      generate: mockGenerate,
      pluginsDir: testDir,
    });

    const createTool = toolRegistry.get('create_skill');
    const result = await createTool!.execute(
      { description: 'Create a math utility that adds two numbers' },
      {} as any,
    );

    // Verify tool returns success
    expect(result.success).toBe(true);

    // Verify output mentions plugin name and tool names
    expect(result.output).toContain('test_math');
    expect(result.output).toContain('add_numbers');

    // Verify plugin file exists on disk
    expect(fs.existsSync(path.join(testDir, 'test_math.js'))).toBe(true);

    // Verify the generated tool is registered in toolRegistry
    expect(toolRegistry.listNames()).toContain('add_numbers');

    // Execute the generated tool and verify it works
    const addTool = toolRegistry.get('add_numbers');
    expect(addTool).toBeDefined();

    const addResult = await addTool!.execute(
      { a: 3, b: 7 },
      { timeout: 5000 } as any,
    );
    expect(addResult.success).toBe(true);
    expect(addResult.output).toBe('10');
  });

  it('pipeline with retry: recovers after invalid code on first attempt', async () => {
    const mockGenerate = vi.fn()
      .mockResolvedValueOnce(invalidPlugin)
      .mockResolvedValueOnce(validPlugin);

    const loader = new PluginLoader({ pluginsDir: testDir });

    registerCreateSkillTool({
      loader,
      generate: mockGenerate,
      pluginsDir: testDir,
    });

    const createTool = toolRegistry.get('create_skill');
    const result = await createTool!.execute(
      { description: 'Create a math utility that adds two numbers' },
      {} as any,
    );

    // Generate should have been called twice (first invalid, then valid)
    expect(mockGenerate).toHaveBeenCalledTimes(2);

    // Pipeline should recover and succeed
    expect(result.success).toBe(true);
    expect(result.output).toContain('test_math');
    expect(result.output).toContain('add_numbers');

    // Verify file on disk
    expect(fs.existsSync(path.join(testDir, 'test_math.js'))).toBe(true);

    // Verify tool is registered and works
    const addTool = toolRegistry.get('add_numbers');
    expect(addTool).toBeDefined();
  });

  it('pipeline failure: returns meaningful error when code is always invalid', async () => {
    const mockGenerate = vi.fn().mockResolvedValue(invalidPlugin);
    const loader = new PluginLoader({ pluginsDir: testDir });

    registerCreateSkillTool({
      loader,
      generate: mockGenerate,
      pluginsDir: testDir,
    });

    const createTool = toolRegistry.get('create_skill');
    const result = await createTool!.execute(
      { description: 'Create something that will fail validation' },
      {} as any,
    );

    // Should fail
    expect(result.success).toBe(false);

    // Should contain meaningful error message
    expect(result.output).toContain('Failed to generate');
    expect(result.output).toBeDefined();
    expect(result.output!.length).toBeGreaterThan(0);

    // Plugin file should NOT exist on disk
    expect(fs.existsSync(path.join(testDir, 'bad.js'))).toBe(false);

    // Tool should NOT be registered
    expect(toolRegistry.listNames()).not.toContain('add_numbers');
  });
});
