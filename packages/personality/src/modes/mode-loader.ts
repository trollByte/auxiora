import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { MODE_IDS, type ModeId, type ModeTemplate, type ModeSignal } from './types.js';

export class ModeLoader {
  private builtInDir: string;
  private userDir: string;
  private cache: Map<ModeId, ModeTemplate> = new Map();

  constructor(builtInDir: string, userDir: string) {
    this.builtInDir = builtInDir;
    this.userDir = userDir;
  }

  async loadAll(): Promise<Map<ModeId, ModeTemplate>> {
    this.cache.clear();

    // Load built-in modes first
    await this.loadFromDir(this.builtInDir);

    // User modes override built-ins
    await this.loadFromDir(this.userDir);

    return this.cache;
  }

  get(id: ModeId): ModeTemplate | undefined {
    return this.cache.get(id);
  }

  getAll(): Map<ModeId, ModeTemplate> {
    return this.cache;
  }

  async reload(): Promise<Map<ModeId, ModeTemplate>> {
    return this.loadAll();
  }

  private async loadFromDir(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const id = path.basename(entry, '.md');
      if (!MODE_IDS.includes(id as ModeId)) continue;

      try {
        const content = await fs.readFile(path.join(dir, entry), 'utf-8');
        const template = this.parseMode(id as ModeId, content);
        if (template) {
          this.cache.set(template.id, template);
        }
      } catch {
        // Skip invalid files
      }
    }
  }

  private parseMode(id: ModeId, content: string): ModeTemplate | null {
    // Parse HTML comment metadata: <!-- mode: operator\n name: ...\n signals: run:0.8, execute:0.8 -->
    const metaMatch = content.match(/^<!--\s*([\s\S]*?)-->\s*\n?/);
    if (!metaMatch) return null;

    let name: string = id;
    let description = '';
    const signals: ModeSignal[] = [];
    const metaLines = metaMatch[1].split('\n');

    for (const line of metaLines) {
      const kv = line.match(/^\s*(\w+):\s*(.+)$/);
      if (!kv) continue;
      const [, key, value] = kv;

      switch (key) {
        case 'name':
          name = value.trim();
          break;
        case 'description':
          description = value.trim();
          break;
        case 'signals':
          for (const pair of value.split(',')) {
            const parts = pair.trim().split(':');
            if (parts.length === 2) {
              signals.push({
                phrase: parts[0].trim().toLowerCase(),
                weight: parseFloat(parts[1].trim()) || 0.5,
              });
            }
          }
          break;
      }
    }

    // Everything after the comment block is prompt content
    const promptContent = content.slice(metaMatch[0].length).trim();

    return { id, name, description, promptContent, signals };
  }
}
