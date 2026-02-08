import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import { getMemoryDir } from '@auxiora/core';
import type { MemoryPartition } from './types.js';

const logger = getLogger('memory:partition');

export class MemoryPartitionManager {
  private filePath: string;

  constructor(options?: { dir?: string }) {
    const dir = options?.dir ?? getMemoryDir();
    this.filePath = path.join(dir, 'partitions.json');
  }

  async createPartition(
    name: string,
    type: MemoryPartition['type'],
    options?: { ownerId?: string; memberIds?: string[] },
  ): Promise<MemoryPartition> {
    const partitions = await this.readFile();

    const partition: MemoryPartition = {
      id: type === 'global' ? 'global' : `part-${crypto.randomUUID().slice(0, 8)}`,
      name,
      type,
      ownerId: options?.ownerId,
      memberIds: options?.memberIds ?? [],
      createdAt: Date.now(),
    };

    partitions.push(partition);
    await this.writeFile(partitions);
    logger.debug('Created partition', { id: partition.id, type });
    return partition;
  }

  async getPartition(id: string): Promise<MemoryPartition | undefined> {
    // Always have the implicit global partition
    if (id === 'global') {
      const partitions = await this.readFile();
      const existing = partitions.find(p => p.id === 'global');
      return existing ?? { id: 'global', name: 'Global', type: 'global', createdAt: 0 };
    }

    const partitions = await this.readFile();
    return partitions.find(p => p.id === id);
  }

  async listPartitions(userId?: string): Promise<MemoryPartition[]> {
    const partitions = await this.readFile();

    // Always include the implicit global partition
    if (!partitions.some(p => p.id === 'global')) {
      partitions.unshift({ id: 'global', name: 'Global', type: 'global', createdAt: 0 });
    }

    if (!userId) return partitions;

    // Return partitions accessible to this user
    return partitions.filter(p =>
      p.type === 'global' ||
      p.ownerId === userId ||
      p.memberIds?.includes(userId),
    );
  }

  async deletePartition(id: string): Promise<boolean> {
    if (id === 'global') return false;

    const partitions = await this.readFile();
    const filtered = partitions.filter(p => p.id !== id);
    if (filtered.length === partitions.length) return false;

    await this.writeFile(filtered);
    logger.debug('Deleted partition', { id });
    return true;
  }

  /**
   * Check if a user has access to a partition.
   */
  async hasAccess(partitionId: string, userId: string): Promise<boolean> {
    if (partitionId === 'global') return true;

    const partition = await this.getPartition(partitionId);
    if (!partition) return false;

    if (partition.type === 'global') return true;
    if (partition.ownerId === userId) return true;
    if (partition.memberIds?.includes(userId)) return true;

    return false;
  }

  /**
   * Get all partition IDs accessible to a user.
   */
  async getAccessiblePartitionIds(userId: string): Promise<string[]> {
    const accessible = await this.listPartitions(userId);
    return accessible.map(p => p.id);
  }

  private async readFile(): Promise<MemoryPartition[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as MemoryPartition[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeFile(partitions: MemoryPartition[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(partitions, null, 2), 'utf-8');
  }
}
