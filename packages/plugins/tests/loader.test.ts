import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { PluginLoader } from '../src/loader.js';
import { toolRegistry } from '@auxiora/tools';

let tmpDir: string;
const registeredTools: string[] = [];

async function writePlugin(fileName: string, content: string): Promise<void> {
  await fs.writeFile(path.join(tmpDir, fileName), content, 'utf-8');
}

function trackTool(name: string) {
  registeredTools.push(name);
}

const VALID_PLUGIN = `
export const plugin = {
  name: 'test-plugin',
  version: '1.0.0',
  tools: [{
    name: 'test_tool',
    description: 'A test tool',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input value' }
      },
      required: ['input']
    },
    execute: async ({ input }) => ({ success: true, output: 'result: ' + input })
  }]
};
`;

const MANIFEST_PLUGIN = `
export const plugin = {
  name: 'manifest-plugin',
  version: '2.0.0',
  permissions: ['NETWORK'],
  tools: [{
    name: 'manifest_tool',
    description: 'A manifest tool',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Query' }
      },
      required: ['query']
    },
    execute: async ({ query }) => ({ success: true, output: 'queried: ' + query })
  }],
  behaviors: [{
    name: 'test-behavior',
    description: 'A test behavior',
    type: 'scheduled',
    defaultSchedule: '0 * * * *',
    execute: async (ctx) => 'done'
  }],
  providers: [{
    name: 'test-provider',
    displayName: 'Test Provider',
    description: 'A test provider',
    models: ['test-model-1'],
    initialize: async () => {},
    complete: async () => ({ content: 'hello', model: 'test-model-1' })
  }]
};
`;

const MANIFEST_WITH_CONTEXT = `
export const plugin = {
  name: 'ctx-plugin',
  version: '1.0.0',
  permissions: [],
  tools: [{
    name: 'ctx_base_tool',
    description: 'Base tool',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ success: true, output: 'base' })
  }],
  initialize: async (ctx) => {
    ctx.logger.info('Initializing');
    ctx.registerTool({
      name: 'ctx_dynamic_tool',
      description: 'Dynamically registered',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ success: true, output: 'dynamic' })
    });
    ctx.registerBehavior({
      name: 'dynamic-behavior',
      description: 'Dynamic behavior',
      type: 'one-shot',
      execute: async () => 'done'
    });
  }
};
`;

describe('PluginLoader', () => {
  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `auxiora-plugins-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });
    registeredTools.length = 0;
  });

  afterEach(async () => {
    for (const name of registeredTools) {
      toolRegistry.unregister(name);
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should load a valid plugin and register its tools', async () => {
    await writePlugin('test.js', VALID_PLUGIN);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe('test-plugin');
    expect(plugins[0].status).toBe('loaded');
    expect(plugins[0].toolNames).toEqual(['test_tool']);
    expect(plugins[0].behaviorNames).toEqual([]);
    expect(plugins[0].providerNames).toEqual([]);
    expect(plugins[0].permissions).toEqual([]);
    expect(toolRegistry.get('test_tool')).toBeDefined();
    trackTool('test_tool');
  });

  it('should execute a loaded plugin tool', async () => {
    await writePlugin('test.js', VALID_PLUGIN);

    const loader = new PluginLoader(tmpDir);
    await loader.loadAll();
    trackTool('test_tool');

    const tool = toolRegistry.get('test_tool')!;
    const result = await tool.execute(
      { input: 'hello' },
      { sessionId: 'test', workingDirectory: '/tmp', timeout: 5000 }
    );
    expect(result.success).toBe(true);
    expect(result.output).toBe('result: hello');
  });

  it('should skip files starting with underscore', async () => {
    await writePlugin('_disabled.js', VALID_PLUGIN);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(0);
  });

  it('should skip files starting with dot', async () => {
    await writePlugin('.hidden.js', VALID_PLUGIN);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(0);
  });

  it('should reject plugin with missing name', async () => {
    await writePlugin('bad.js', `
      export const plugin = {
        tools: [{ name: 'xx', description: 'x', execute: async () => ({ success: true }) }]
      };
    `);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].status).toBe('failed');
    expect(plugins[0].error).toContain('name');
  });

  it('should reject plugin with missing tools array', async () => {
    await writePlugin('bad.js', `
      export const plugin = { name: 'bad', version: '1.0.0' };
    `);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].status).toBe('failed');
    expect(plugins[0].error).toContain('tools');
  });

  it('should reject tool with missing execute function', async () => {
    await writePlugin('bad.js', `
      export const plugin = {
        name: 'bad',
        version: '1.0.0',
        tools: [{ name: 'no_exec', description: 'missing execute' }]
      };
    `);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].status).toBe('failed');
    expect(plugins[0].error).toContain('execute');
  });

  it('should reject tool name that collides with built-in tool', async () => {
    await writePlugin('collision.js', `
      export const plugin = {
        name: 'collision',
        version: '1.0.0',
        tools: [{
          name: 'bash',
          description: 'Override bash',
          execute: async () => ({ success: true })
        }]
      };
    `);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].status).toBe('failed');
    expect(plugins[0].error).toContain('collides');
  });

  it('should reject tool with invalid name characters', async () => {
    await writePlugin('badname.js', `
      export const plugin = {
        name: 'badname',
        version: '1.0.0',
        tools: [{
          name: 'Invalid-Name',
          description: 'Bad name',
          execute: async () => ({ success: true })
        }]
      };
    `);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].status).toBe('failed');
    expect(plugins[0].error).toContain('invalid');
  });

  it('should handle plugin file with syntax error', async () => {
    await writePlugin('syntax.js', 'export const plugin = {{{{{');

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();

    expect(plugins).toHaveLength(1);
    expect(plugins[0].status).toBe('failed');
  });

  it('should handle plugin tool that throws an error', async () => {
    await writePlugin('throws.js', `
      export const plugin = {
        name: 'throws',
        version: '1.0.0',
        tools: [{
          name: 'throw_tool',
          description: 'Throws on execute',
          parameters: { type: 'object', properties: {} },
          execute: async () => { throw new Error('boom'); }
        }]
      };
    `);

    const loader = new PluginLoader(tmpDir);
    await loader.loadAll();
    trackTool('throw_tool');

    const tool = toolRegistry.get('throw_tool')!;
    const result = await tool.execute({}, { sessionId: 'test', workingDirectory: '/tmp', timeout: 5000 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('boom');
  });

  it('should call initialize on plugin load', async () => {
    await writePlugin('init.js', `
      let initialized = false;
      export const plugin = {
        name: 'init-test',
        version: '1.0.0',
        initialize: async () => { initialized = true; },
        tools: [{
          name: 'check_init',
          description: 'Check if initialized',
          parameters: { type: 'object', properties: {} },
          execute: async () => ({ success: true, output: String(initialized) })
        }]
      };
    `);

    const loader = new PluginLoader(tmpDir);
    await loader.loadAll();
    trackTool('check_init');

    const tool = toolRegistry.get('check_init')!;
    const result = await tool.execute({}, { sessionId: 'test', workingDirectory: '/tmp', timeout: 5000 });
    expect(result.output).toBe('true');
  });

  it('should return empty list for nonexistent directory', async () => {
    const loader = new PluginLoader('/nonexistent/path/plugins');
    const plugins = await loader.loadAll();
    expect(plugins).toHaveLength(0);
  });

  it('should reject cross-plugin tool name collision', async () => {
    await writePlugin('alpha.js', `
      export const plugin = {
        name: 'alpha',
        version: '1.0.0',
        tools: [{
          name: 'shared_tool',
          description: 'Tool from alpha',
          execute: async () => ({ success: true })
        }]
      };
    `);

    await writePlugin('beta.js', `
      export const plugin = {
        name: 'beta',
        version: '1.0.0',
        tools: [{
          name: 'shared_tool',
          description: 'Tool from beta',
          execute: async () => ({ success: true })
        }]
      };
    `);

    const loader = new PluginLoader(tmpDir);
    const plugins = await loader.loadAll();
    trackTool('shared_tool');

    const loaded = plugins.find(p => p.status === 'loaded');
    const failed = plugins.find(p => p.status === 'failed');

    expect(loaded).toBeDefined();
    expect(failed).toBeDefined();
    expect(failed!.error).toContain('collides');
  });

  it('should call shutdown hook via shutdownAll', async () => {
    await writePlugin('shutdown.js', `
      let shutdownCalled = false;
      export const plugin = {
        name: 'shutdown-test',
        version: '1.0.0',
        shutdown: async () => { shutdownCalled = true; },
        tools: [{
          name: 'check_shutdown',
          description: 'Check shutdown state',
          parameters: { type: 'object', properties: {} },
          execute: async () => ({ success: true, output: String(shutdownCalled) })
        }]
      };
    `);

    const loader = new PluginLoader(tmpDir);
    await loader.loadAll();
    trackTool('check_shutdown');

    const tool = toolRegistry.get('check_shutdown')!;

    const before = await tool.execute({}, { sessionId: 'test', workingDirectory: '/tmp', timeout: 5000 });
    expect(before.output).toBe('false');

    await loader.shutdownAll();

    const after = await tool.execute({}, { sessionId: 'test', workingDirectory: '/tmp', timeout: 5000 });
    expect(after.output).toBe('true');
  });

  it('should not crash when shutdown hook throws', async () => {
    await writePlugin('shutdown-err.js', `
      export const plugin = {
        name: 'shutdown-err',
        version: '1.0.0',
        shutdown: async () => { throw new Error('shutdown boom'); },
        tools: [{
          name: 'sd_err_tool',
          description: 'Dummy tool',
          parameters: { type: 'object', properties: {} },
          execute: async () => ({ success: true })
        }]
      };
    `);

    const loader = new PluginLoader(tmpDir);
    await loader.loadAll();
    trackTool('sd_err_tool');

    await expect(loader.shutdownAll()).resolves.toBeUndefined();
  });

  // New tests for expanded plugin interface

  describe('PluginManifest support', () => {
    it('should load a manifest plugin with behaviors and providers', async () => {
      await writePlugin('manifest.js', MANIFEST_PLUGIN);

      const loader = new PluginLoader({
        pluginsDir: tmpDir,
        approvedPermissions: { 'manifest-plugin': ['NETWORK'] },
      });
      const plugins = await loader.loadAll();
      trackTool('manifest_tool');

      expect(plugins).toHaveLength(1);
      expect(plugins[0].status).toBe('loaded');
      expect(plugins[0].name).toBe('manifest-plugin');
      expect(plugins[0].permissions).toEqual(['NETWORK']);
      expect(plugins[0].behaviorNames).toEqual(['test-behavior']);
      expect(plugins[0].providerNames).toEqual(['test-provider']);

      expect(loader.listBehaviors()).toHaveLength(1);
      expect(loader.listBehaviors()[0].name).toBe('test-behavior');
      expect(loader.listProviders()).toHaveLength(1);
      expect(loader.listProviders()[0].name).toBe('test-provider');
    });

    it('should reject plugin with unapproved permissions', async () => {
      await writePlugin('unapproved.js', MANIFEST_PLUGIN);

      const loader = new PluginLoader({
        pluginsDir: tmpDir,
        approvedPermissions: { 'manifest-plugin': [] },
      });
      const plugins = await loader.loadAll();

      expect(plugins).toHaveLength(1);
      expect(plugins[0].status).toBe('failed');
      expect(plugins[0].error).toContain('unapproved permissions');
      expect(plugins[0].error).toContain('NETWORK');
    });

    it('should pass PluginContext to manifest initialize', async () => {
      await writePlugin('ctx.js', MANIFEST_WITH_CONTEXT);

      const loader = new PluginLoader(tmpDir);
      const plugins = await loader.loadAll();
      trackTool('ctx_base_tool');
      trackTool('ctx_dynamic_tool');

      expect(plugins).toHaveLength(1);
      expect(plugins[0].status).toBe('loaded');
      expect(plugins[0].toolNames).toContain('ctx_base_tool');
      expect(plugins[0].toolNames).toContain('ctx_dynamic_tool');
      expect(plugins[0].behaviorNames).toContain('dynamic-behavior');

      // Verify dynamic tool works
      const tool = toolRegistry.get('ctx_dynamic_tool')!;
      const result = await tool.execute({}, { sessionId: 'test', workingDirectory: '/tmp', timeout: 5000 });
      expect(result.success).toBe(true);
      expect(result.output).toBe('dynamic');
    });

    it('should allow plugins with no approved permissions entry (permissive)', async () => {
      await writePlugin('manifest.js', MANIFEST_PLUGIN);

      // No approvedPermissions entry for this plugin = permissive mode
      const loader = new PluginLoader({ pluginsDir: tmpDir });
      const plugins = await loader.loadAll();
      trackTool('manifest_tool');

      expect(plugins).toHaveLength(1);
      expect(plugins[0].status).toBe('loaded');
    });

    it('should accept options object in constructor', async () => {
      await writePlugin('test.js', VALID_PLUGIN);

      const loader = new PluginLoader({
        pluginsDir: tmpDir,
        pluginConfigs: { 'test-plugin': { foo: 'bar' } },
      });
      const plugins = await loader.loadAll();
      trackTool('test_tool');

      expect(plugins).toHaveLength(1);
      expect(plugins[0].status).toBe('loaded');
    });

    it('should reject unknown permission values', async () => {
      await writePlugin('badperm.js', `
        export const plugin = {
          name: 'badperm',
          version: '1.0.0',
          permissions: ['INVALID_PERMISSION'],
          tools: [{
            name: 'badperm_tool',
            description: 'Bad perm tool',
            parameters: { type: 'object', properties: {} },
            execute: async () => ({ success: true })
          }]
        };
      `);

      const loader = new PluginLoader(tmpDir);
      const plugins = await loader.loadAll();

      expect(plugins).toHaveLength(1);
      expect(plugins[0].status).toBe('failed');
      expect(plugins[0].error).toContain('unknown permission');
    });
  });
});
