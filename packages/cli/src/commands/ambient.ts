import { Command } from 'commander';

export function createAmbientCommand(): Command {
  const ambientCmd = new Command('ambient').description(
    'Ambient intelligence — patterns, briefings, notifications'
  );

  ambientCmd
    .command('status')
    .description('Show ambient intelligence status')
    .action(async () => {
      const { AmbientPatternEngine } = await import('@auxiora/ambient');
      const { QuietNotificationManager } = await import('@auxiora/ambient');
      const engine = new AmbientPatternEngine();
      const notifications = new QuietNotificationManager();

      console.log('Ambient Intelligence Status:');
      console.log(`  Observed events: ${engine.getEventCount()}`);
      console.log(`  Detected patterns: ${engine.getPatterns().length}`);
      console.log(`  Pending notifications: ${notifications.getPendingCount()}`);
    });

  ambientCmd
    .command('briefing')
    .description('Generate a personalized briefing')
    .option('-t, --time <time>', 'Time of day (morning/evening)', 'morning')
    .action(async (opts: { time: string }) => {
      const { BriefingGenerator } = await import('@auxiora/ambient');
      const generator = new BriefingGenerator();
      const time = opts.time === 'evening' ? 'evening' : 'morning';

      const briefing = generator.generateBriefing('cli-user', time, {});

      console.log(`\n${time.charAt(0).toUpperCase() + time.slice(1)} Briefing`);
      console.log('='.repeat(40));

      if (briefing.sections.length === 0) {
        console.log('No items for your briefing yet.');
        console.log('As you use Auxiora, patterns and data will be collected.');
      } else {
        for (const section of briefing.sections) {
          console.log(`\n## ${section.title}`);
          for (const item of section.items) {
            console.log(`  - ${item}`);
          }
        }
      }
      console.log('');
    });

  ambientCmd
    .command('patterns')
    .description('Show detected behavioral patterns')
    .option('-l, --limit <n>', 'Max patterns to show', '10')
    .action(async (opts: { limit: string }) => {
      const { AmbientPatternEngine } = await import('@auxiora/ambient');
      const engine = new AmbientPatternEngine();
      const patterns = engine.getPatterns();
      const limit = parseInt(opts.limit, 10) || 10;
      const shown = patterns.slice(0, limit);

      if (shown.length === 0) {
        console.log('No patterns detected yet.');
        console.log('Patterns emerge as Auxiora observes your usage over time.');
        return;
      }

      console.log('Detected Patterns:');
      for (const pattern of shown) {
        const confidence = Math.round(pattern.confidence * 100);
        console.log(`  [${pattern.type}] ${pattern.description} (${confidence}% confidence)`);
        console.log(`    Occurrences: ${pattern.occurrences} | Last: ${new Date(pattern.lastConfirmedAt).toISOString()}`);
      }
    });

  ambientCmd
    .command('notifications')
    .description('Show quiet notifications')
    .action(async () => {
      const { QuietNotificationManager } = await import('@auxiora/ambient');
      const manager = new QuietNotificationManager();
      const queue = manager.getQueue();

      if (queue.length === 0) {
        console.log('No notifications.');
        return;
      }

      console.log('Notifications:');
      for (const n of queue) {
        const date = new Date(n.createdAt).toLocaleTimeString();
        console.log(`  [${n.priority}] ${n.message} (${date})`);
        if (n.detail) {
          console.log(`    ${n.detail}`);
        }
      }
    });

  return ambientCmd;
}
