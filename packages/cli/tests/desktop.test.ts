import { describe, it, expect } from 'vitest';
import { createDesktopCommand } from '../src/commands/desktop.js';

describe('desktop CLI command', () => {
  it('should create the desktop command with subcommands', () => {
    const cmd = createDesktopCommand();
    expect(cmd.name()).toBe('desktop');

    const subcommands = cmd.commands.map(c => c.name());
    expect(subcommands).toContain('launch');
    expect(subcommands).toContain('status');
    expect(subcommands).toContain('config');
    expect(subcommands).toContain('update');
  });

  it('should have descriptions for all subcommands', () => {
    const cmd = createDesktopCommand();
    for (const sub of cmd.commands) {
      expect(sub.description()).toBeTruthy();
    }
  });

  it('config subcommand should accept options', () => {
    const cmd = createDesktopCommand();
    const configCmd = cmd.commands.find(c => c.name() === 'config');
    expect(configCmd).toBeDefined();

    const optionNames = configCmd!.options.map(o => o.long);
    expect(optionNames).toContain('--auto-start');
    expect(optionNames).toContain('--hotkey');
    expect(optionNames).toContain('--notifications');
    expect(optionNames).toContain('--update-channel');
    expect(optionNames).toContain('--ollama');
  });

  it('update subcommand should accept channel option', () => {
    const cmd = createDesktopCommand();
    const updateCmd = cmd.commands.find(c => c.name() === 'update');
    expect(updateCmd).toBeDefined();

    const optionNames = updateCmd!.options.map(o => o.long);
    expect(optionNames).toContain('--channel');
  });
});
