import { Command } from 'commander';
import { AuditLogger, type AuditEntry } from '@auxiora/audit';

function formatEntry(entry: AuditEntry): string {
  const date = new Date(entry.timestamp);
  const time = date.toLocaleTimeString();
  const dateStr = date.toLocaleDateString();

  let details = '';
  const detailKeys = Object.keys(entry.details);
  if (detailKeys.length > 0) {
    details = ' ' + JSON.stringify(entry.details);
  }

  return `[${dateStr} ${time}] ${entry.event}${details}`;
}

export function createAuditCommand(): Command {
  const auditCmd = new Command('audit').description('View and verify audit logs');

  auditCmd
    .command('list')
    .description('List recent audit log entries')
    .option('-n, --limit <number>', 'Number of entries to show', '20')
    .action(async (options) => {
      const logger = new AuditLogger();
      const limit = parseInt(options.limit, 10);
      const entries = await logger.getEntries(limit);

      if (entries.length === 0) {
        console.log('No audit log entries');
        return;
      }

      console.log(`Last ${entries.length} audit log entries:\n`);
      for (const entry of entries) {
        console.log(formatEntry(entry));
      }
    });

  auditCmd
    .command('verify')
    .description('Verify audit log chain integrity')
    .action(async () => {
      console.log('Verifying audit log integrity...\n');

      const logger = new AuditLogger();
      const result = await logger.verify();

      if (result.entries === 0) {
        console.log('No audit log entries to verify');
        return;
      }

      if (result.valid) {
        console.log(`\x1b[32m✓ Chain intact\x1b[0m`);
        console.log(`  ${result.entries} entries verified`);
      } else {
        console.log(`\x1b[31m✗ Chain broken at entry ${result.brokenAt}\x1b[0m`);
        console.log(`  ${result.entries} total entries`);
        console.log(
          '\nThe audit log may have been tampered with or corrupted.'
        );
        process.exit(1);
      }
    });

  return auditCmd;
}
