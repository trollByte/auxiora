import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getLogger } from '@auxiora/logger';
import type { Behavior } from './types.js';

const logger = getLogger('behaviors:store');

export class BehaviorStore {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async save(behavior: Behavior): Promise<void> {
    const behaviors = await this.readFile();
    const index = behaviors.findIndex((b) => b.id === behavior.id);

    if (index >= 0) {
      behaviors[index] = behavior;
    } else {
      behaviors.push(behavior);
    }

    await this.writeFile(behaviors);
    logger.debug('Saved behavior', { id: behavior.id, type: behavior.type });
  }

  async get(id: string): Promise<Behavior | undefined> {
    const behaviors = await this.readFile();
    return behaviors.find((b) => b.id === id);
  }

  async getAll(): Promise<Behavior[]> {
    return this.readFile();
  }

  async listActive(): Promise<Behavior[]> {
    const behaviors = await this.readFile();
    return behaviors.filter((b) => b.status === 'active');
  }

  async update(id: string, updates: Partial<Behavior>): Promise<Behavior | undefined> {
    const behaviors = await this.readFile();
    const index = behaviors.findIndex((b) => b.id === id);

    if (index < 0) return undefined;

    behaviors[index] = { ...behaviors[index], ...updates, id };
    await this.writeFile(behaviors);
    logger.debug('Updated behavior', { id, updates: Object.keys(updates) });
    return behaviors[index];
  }

  async remove(id: string): Promise<boolean> {
    const behaviors = await this.readFile();
    const filtered = behaviors.filter((b) => b.id !== id);

    if (filtered.length === behaviors.length) return false;

    await this.writeFile(filtered);
    logger.debug('Removed behavior', { id });
    return true;
  }

  private async readFile(): Promise<Behavior[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as Behavior[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeFile(behaviors: Behavior[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(behaviors, null, 2), 'utf-8');
  }
}
