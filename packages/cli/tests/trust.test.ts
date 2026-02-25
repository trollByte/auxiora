import { describe, it, expect } from 'vitest';
import { createTrustCommand } from '../src/commands/trust.js';

describe('trust CLI command', () => {
  it('should create the trust command with subcommands', () => {
    const cmd = createTrustCommand();
    expect(cmd.name()).toBe('trust');

    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain('show');
    expect(subcommands).toContain('set');
    expect(subcommands).toContain('history');
    expect(subcommands).toContain('audit');
    expect(subcommands).toContain('rollback');
  });

  it('should have descriptions for all subcommands', () => {
    const cmd = createTrustCommand();
    for (const sub of cmd.commands) {
      expect(sub.description()).toBeTruthy();
    }
  });

  it('set subcommand should accept domain and level arguments', () => {
    const cmd = createTrustCommand();
    const setCmd = cmd.commands.find((c) => c.name() === 'set');
    expect(setCmd).toBeDefined();

    const args = setCmd!.registeredArguments.map((a) => a.name());
    expect(args).toContain('domain');
    expect(args).toContain('level');
  });

  it('set subcommand should accept reason option', () => {
    const cmd = createTrustCommand();
    const setCmd = cmd.commands.find((c) => c.name() === 'set');
    expect(setCmd).toBeDefined();

    const optionNames = setCmd!.options.map((o) => o.long);
    expect(optionNames).toContain('--reason');
  });

  it('history subcommand should accept limit option', () => {
    const cmd = createTrustCommand();
    const historyCmd = cmd.commands.find((c) => c.name() === 'history');
    expect(historyCmd).toBeDefined();

    const optionNames = historyCmd!.options.map((o) => o.long);
    expect(optionNames).toContain('--limit');
  });

  it('audit subcommand should accept domain and limit options', () => {
    const cmd = createTrustCommand();
    const auditCmd = cmd.commands.find((c) => c.name() === 'audit');
    expect(auditCmd).toBeDefined();

    const optionNames = auditCmd!.options.map((o) => o.long);
    expect(optionNames).toContain('--limit');
    expect(optionNames).toContain('--domain');
  });

  it('rollback subcommand should accept id argument', () => {
    const cmd = createTrustCommand();
    const rollbackCmd = cmd.commands.find((c) => c.name() === 'rollback');
    expect(rollbackCmd).toBeDefined();

    const args = rollbackCmd!.registeredArguments.map((a) => a.name());
    expect(args).toContain('id');
  });
});
