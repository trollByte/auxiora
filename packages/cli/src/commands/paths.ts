import { Command } from 'commander';
import { paths } from '@auxiora/core';

export function createPathsCommand(): Command {
  return new Command('paths')
    .description('Show all configuration paths')
    .action(() => {
      console.log('Auxiora Paths\n');
      console.log(`  Base:      ${paths.base()}`);
      console.log(`  Data:      ${paths.data()}`);
      console.log(`  Logs:      ${paths.logs()}`);
      console.log(`  Workspace: ${paths.workspace()}`);
      console.log('');
      console.log('Files:');
      console.log(`  Vault:     ${paths.vault()}`);
      console.log(`  Config:    ${paths.config()}`);
      console.log(`  Audit Log: ${paths.auditLog()}`);
      console.log(`  Sessions:  ${paths.sessions()}`);
      console.log('');
      console.log('Workspace Files:');
      console.log(`  SOUL.md:     ${paths.soul()}`);
      console.log(`  AGENTS.md:   ${paths.agents()}`);
      console.log(`  IDENTITY.md: ${paths.identity()}`);
      console.log(`  USER.md:     ${paths.user()}`);
      console.log(`  Memory:      ${paths.memory()}`);
    });
}
