import { describe, it, expect } from 'vitest';
import { createPluginCommand } from '../src/commands/plugin.js';

describe('plugin CLI command', () => {
  it('should create the plugin command with subcommands', () => {
    const cmd = createPluginCommand();

    expect(cmd.name()).toBe('plugin');

    const subcommands = cmd.commands.map(c => c.name());
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('search');
    expect(subcommands).toContain('install');
    expect(subcommands).toContain('uninstall');
    expect(subcommands).toContain('create');
    expect(subcommands).toContain('dev');
    expect(subcommands).toContain('test');
    expect(subcommands).toContain('publish');
  });

  it('should have descriptions for all subcommands', () => {
    const cmd = createPluginCommand();

    for (const sub of cmd.commands) {
      expect(sub.description()).toBeTruthy();
    }
  });

  it('search should require a query argument', () => {
    const cmd = createPluginCommand();
    const search = cmd.commands.find(c => c.name() === 'search');
    expect(search).toBeDefined();
    // Commander stores required args
    const args = search!.registeredArguments;
    expect(args.length).toBe(1);
    expect(args[0].required).toBe(true);
  });

  it('install should require a name argument', () => {
    const cmd = createPluginCommand();
    const install = cmd.commands.find(c => c.name() === 'install');
    expect(install).toBeDefined();
    const args = install!.registeredArguments;
    expect(args.length).toBe(1);
    expect(args[0].required).toBe(true);
  });

  it('create should require a name argument', () => {
    const cmd = createPluginCommand();
    const create = cmd.commands.find(c => c.name() === 'create');
    expect(create).toBeDefined();
    const args = create!.registeredArguments;
    expect(args.length).toBe(1);
    expect(args[0].required).toBe(true);
  });

  it('uninstall should require a name argument', () => {
    const cmd = createPluginCommand();
    const uninstall = cmd.commands.find(c => c.name() === 'uninstall');
    expect(uninstall).toBeDefined();
    const args = uninstall!.registeredArguments;
    expect(args.length).toBe(1);
    expect(args[0].required).toBe(true);
  });
});
