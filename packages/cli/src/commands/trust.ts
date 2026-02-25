import { Command } from 'commander';

export function createTrustCommand(): Command {
  const trustCmd = new Command('trust').description(
    'Manage trust levels and autonomy'
  );

  trustCmd
    .command('show')
    .description('Show current trust levels for all domains')
    .action(async () => {
      const { TrustEngine } = await import('@auxiora/autonomy');
      const engine = new TrustEngine();
      await engine.load();

      const levels = engine.getAllLevels();
      const { TRUST_LEVEL_NAMES } = await import('@auxiora/autonomy');
      console.log('Trust Levels:');
      for (const [domain, level] of Object.entries(levels)) {
        const name = TRUST_LEVEL_NAMES[level as keyof typeof TRUST_LEVEL_NAMES] ?? 'Unknown';
        console.log(`  ${domain}: ${level} (${name})`);
      }
    });

  trustCmd
    .command('set <domain> <level>')
    .description('Set trust level for a domain (0-4)')
    .option('-r, --reason <reason>', 'Reason for the change', 'Manual override')
    .action(async (domain: string, levelStr: string, opts: { reason: string }) => {
      const level = parseInt(levelStr, 10);
      if (isNaN(level) || level < 0 || level > 4) {
        console.error('Error: level must be 0-4');
        process.exit(1);
      }

      const { TrustEngine, TRUST_LEVEL_NAMES } = await import('@auxiora/autonomy');
      const engine = new TrustEngine();
      await engine.load();

      await engine.setTrustLevel(domain as any, level as any, opts.reason);
      const name = TRUST_LEVEL_NAMES[level as keyof typeof TRUST_LEVEL_NAMES];
      console.log(`Trust level for "${domain}" set to ${level} (${name})`);
    });

  trustCmd
    .command('history')
    .description('Show trust level change history')
    .option('-l, --limit <n>', 'Max entries to show', '20')
    .action(async (opts: { limit: string }) => {
      const { TrustEngine } = await import('@auxiora/autonomy');
      const engine = new TrustEngine();
      await engine.load();

      const promotions = engine.getPromotions();
      const demotions = engine.getDemotions();
      const all = [
        ...promotions.map((p) => ({ ...p, type: 'promotion' as const })),
        ...demotions.map((d) => ({ ...d, type: 'demotion' as const })),
      ].sort((a, b) => b.timestamp - a.timestamp);

      const limit = parseInt(opts.limit, 10) || 20;
      const shown = all.slice(0, limit);

      if (shown.length === 0) {
        console.log('No trust level changes recorded.');
        return;
      }

      console.log('Trust History:');
      for (const entry of shown) {
        const date = new Date(entry.timestamp).toISOString();
        const arrow = entry.type === 'promotion' ? '+' : '-';
        console.log(`  [${date}] ${arrow} ${entry.domain}: ${entry.fromLevel} -> ${entry.toLevel} (${entry.reason})`);
      }
    });

  trustCmd
    .command('audit')
    .description('Show action audit trail')
    .option('-l, --limit <n>', 'Max entries to show', '20')
    .option('-d, --domain <domain>', 'Filter by domain')
    .action(async (opts: { limit: string; domain?: string }) => {
      const { ActionAuditTrail } = await import('@auxiora/autonomy');
      const trail = new ActionAuditTrail();
      await trail.load();

      const entries = trail.query({
        domain: opts.domain as any,
        limit: parseInt(opts.limit, 10) || 20,
      });

      if (entries.length === 0) {
        console.log('No audit entries found.');
        return;
      }

      console.log('Action Audit Trail:');
      for (const entry of entries) {
        const date = new Date(entry.timestamp).toISOString();
        const rb = entry.rollbackAvailable ? ' [rollback available]' : '';
        console.log(`  [${date}] ${entry.domain} (L${entry.trustLevel}) ${entry.intent} -> ${entry.outcome}${rb}`);
        console.log(`    ID: ${entry.id}`);
      }
    });

  trustCmd
    .command('rollback <id>')
    .description('Roll back an action by audit ID')
    .action(async (id: string) => {
      const { ActionAuditTrail, RollbackManager } = await import('@auxiora/autonomy');
      const trail = new ActionAuditTrail();
      await trail.load();

      const manager = new RollbackManager(trail);
      const result = await manager.rollback(id);

      if (result.success) {
        console.log(`Action ${id} rolled back successfully.`);
      } else {
        console.error(`Rollback failed: ${result.error}`);
        process.exit(1);
      }
    });

  return trustCmd;
}
