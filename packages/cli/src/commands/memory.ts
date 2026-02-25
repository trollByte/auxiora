import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import { MemoryStore, PersonalityAdapter } from '@auxiora/memory';
import type { MemoryCategory } from '@auxiora/memory';

const VALID_CATEGORIES: MemoryCategory[] = ['preference', 'fact', 'context', 'relationship', 'pattern', 'personality'];

export function createMemoryCommand(): Command {
  const cmd = new Command('memory').description('Manage agent memory');

  cmd
    .command('show')
    .description('Show all memories, grouped by category')
    .option('--category <cat>', 'Filter by category')
    .option('--limit <n>', 'Max entries to show', '50')
    .action(async (options: { category?: string; limit: string }) => {
      const store = new MemoryStore();
      const limit = parseInt(options.limit, 10) || 50;

      let memories;
      if (options.category) {
        if (!VALID_CATEGORIES.includes(options.category as MemoryCategory)) {
          console.error(`Invalid category: ${options.category}`);
          console.error(`Valid categories: ${VALID_CATEGORIES.join(', ')}`);
          process.exit(1);
        }
        memories = await store.getByCategory(options.category as MemoryCategory);
      } else {
        memories = await store.getAll();
      }

      if (memories.length === 0) {
        console.log('No memories found.');
        return;
      }

      // Group by category
      const groups = new Map<string, typeof memories>();
      for (const m of memories.slice(0, limit)) {
        if (!groups.has(m.category)) groups.set(m.category, []);
        groups.get(m.category)!.push(m);
      }

      for (const [category, entries] of groups) {
        console.log(`\n--- ${category.toUpperCase()} (${entries.length}) ---`);
        for (const entry of entries) {
          const imp = (entry.importance * 100).toFixed(0);
          const conf = (entry.confidence * 100).toFixed(0);
          const date = new Date(entry.updatedAt).toLocaleDateString();
          console.log(`  [${entry.id}] ${entry.content}`);
          console.log(`    importance: ${imp}% | confidence: ${conf}% | accessed: ${entry.accessCount}x | updated: ${date}`);
        }
      }

      console.log(`\nShowing ${Math.min(memories.length, limit)} of ${memories.length} memories`);
    });

  cmd
    .command('search <query>')
    .description('Search memories')
    .action(async (query: string) => {
      const store = new MemoryStore();
      const results = await store.search(query);

      if (results.length === 0) {
        console.log('No matching memories found.');
        return;
      }

      console.log(`Found ${results.length} matching memories:\n`);
      for (const entry of results) {
        console.log(`  [${entry.id}] (${entry.category}) ${entry.content}`);
      }
    });

  cmd
    .command('forget')
    .description('Delete memories matching a query or by ID')
    .option('--id <id>', 'Delete by specific ID')
    .option('--dry-run', 'Show what would be deleted without deleting')
    .argument('[query]', 'Search query to find memories to delete')
    .action(async (query: string | undefined, options: { id?: string; dryRun?: boolean }) => {
      const store = new MemoryStore();

      if (options.id) {
        if (options.dryRun) {
          console.log(`Would delete memory: ${options.id}`);
          return;
        }
        const removed = await store.remove(options.id);
        console.log(removed ? `Deleted memory: ${options.id}` : `Memory not found: ${options.id}`);
        return;
      }

      if (!query) {
        console.error('Provide a query or --id to specify what to forget');
        process.exit(1);
      }

      const results = await store.search(query);
      if (results.length === 0) {
        console.log('No matching memories found.');
        return;
      }

      console.log(`Found ${results.length} matching memories:`);
      for (const entry of results) {
        console.log(`  [${entry.id}] (${entry.category}) ${entry.content}`);
      }

      if (options.dryRun) {
        console.log('\n(dry run - nothing deleted)');
        return;
      }

      for (const entry of results) {
        await store.remove(entry.id);
      }
      console.log(`\nDeleted ${results.length} memories.`);
    });

  cmd
    .command('stats')
    .description('Show memory statistics')
    .action(async () => {
      const store = new MemoryStore();
      const stats = await store.getStats();

      if (stats.totalMemories === 0) {
        console.log('No memories stored yet.');
        return;
      }

      console.log('\n--- Memory Statistics ---');
      console.log(`  Total memories: ${stats.totalMemories}`);
      console.log(`  Oldest: ${new Date(stats.oldestMemory).toLocaleDateString()}`);
      console.log(`  Newest: ${new Date(stats.newestMemory).toLocaleDateString()}`);
      console.log(`  Average importance: ${(stats.averageImportance * 100).toFixed(1)}%`);

      if (stats.topTags.length > 0) {
        console.log('\n  Top tags:');
        for (const { tag, count } of stats.topTags.slice(0, 10)) {
          console.log(`    ${tag}: ${count}`);
        }
      }

      // Category breakdown
      const all = await store.getAll();
      const byCat = new Map<string, number>();
      for (const m of all) {
        byCat.set(m.category, (byCat.get(m.category) ?? 0) + 1);
      }
      console.log('\n  By category:');
      for (const [cat, count] of byCat) {
        console.log(`    ${cat}: ${count}`);
      }

      // Personality adaptations
      const adapter = new PersonalityAdapter(store);
      const adjustments = await adapter.getAdjustments();
      if (adjustments.length > 0) {
        console.log('\n  Personality adaptations:');
        for (const a of adjustments) {
          const dir = a.adjustment > 0 ? '+' : '';
          console.log(`    ${a.trait}: ${dir}${(a.adjustment * 100).toFixed(0)}% (${a.reason}) [${a.signalCount} signals]`);
        }
      }

      console.log('');
    });

  cmd
    .command('export')
    .description('Export all memories to a JSON file')
    .option('-o, --output <file>', 'Output file path', 'auxiora-memories.json')
    .action(async (options: { output: string }) => {
      const store = new MemoryStore();
      const data = await store.exportAll();
      await fs.writeFile(options.output, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`Exported ${data.memories.length} memories to ${options.output}`);
    });

  cmd
    .command('import <file>')
    .description('Import memories from a JSON file')
    .action(async (file: string) => {
      const store = new MemoryStore();
      const content = await fs.readFile(file, 'utf-8');
      const data = JSON.parse(content);

      if (!data.memories || !Array.isArray(data.memories)) {
        console.error('Invalid import file: expected { memories: [...] }');
        process.exit(1);
      }

      const result = await store.importAll(data);
      console.log(`Imported ${result.imported} memories, skipped ${result.skipped} duplicates`);
    });

  cmd
    .command('adaptations')
    .description('Show personality adaptations learned from interactions')
    .action(async () => {
      const store = new MemoryStore();
      const adapter = new PersonalityAdapter(store);
      const adjustments = await adapter.getAdjustments();

      if (adjustments.length === 0) {
        console.log('No personality adaptations learned yet.');
        return;
      }

      console.log('\n--- Personality Adaptations ---');
      for (const a of adjustments) {
        const dir = a.adjustment > 0 ? 'Increase' : 'Decrease';
        const magnitude = Math.abs(a.adjustment) > 0.5 ? 'significantly' : 'slightly';
        console.log(`  ${dir} ${a.trait} ${magnitude}`);
        console.log(`    Reason: ${a.reason}`);
        console.log(`    Signals: ${a.signalCount} | Adjustment: ${(a.adjustment * 100).toFixed(0)}%`);
      }
      console.log('');
    });

  return cmd;
}
