import { getLogger } from '@auxiora/logger';
import type { MemoryEntry, MemoryCategory } from './types.js';

const logger = getLogger('memory:editor');

export interface MemoryView {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  confidence: number;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  sentiment?: string;
  source?: string;
}

export interface EditOperation {
  type: 'update' | 'delete';
  memoryId: string;
  updates?: Partial<Pick<MemoryEntry, 'content' | 'category' | 'importance' | 'confidence' | 'sentiment'>>;
  timestamp: number;
}

export interface EditResult {
  success: boolean;
  operation: EditOperation['type'];
  memoryId: string;
  error?: string;
}

/** Structural type so we don't import MemoryStore directly */
export interface MemoryStoreLike {
  getAll(): Promise<MemoryEntry[]>;
  search(query: string): Promise<MemoryEntry[]>;
  getByCategory(category: MemoryCategory): Promise<MemoryEntry[]>;
  update(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'category' | 'importance' | 'confidence' | 'sentiment'>>): Promise<MemoryEntry | undefined>;
  remove(id: string): Promise<boolean>;
}

export class MemoryEditor {
  private editHistory: EditOperation[] = [];
  private readonly maxHistory: number;

  constructor(
    private readonly store: MemoryStoreLike,
    options?: { maxHistory?: number },
  ) {
    this.maxHistory = options?.maxHistory ?? 100;
  }

  /** List all memories as simplified views */
  async listAll(): Promise<MemoryView[]> {
    const entries = await this.store.getAll();
    return entries.map(this.toView);
  }

  /** List memories by category */
  async listByCategory(category: MemoryCategory): Promise<MemoryView[]> {
    const entries = await this.store.getByCategory(category);
    return entries.map(this.toView);
  }

  /** Search memories */
  async search(query: string): Promise<MemoryView[]> {
    const entries = await this.store.search(query);
    return entries.map(this.toView);
  }

  /** Edit a memory's content or metadata */
  async edit(
    id: string,
    updates: Partial<Pick<MemoryEntry, 'content' | 'category' | 'importance' | 'confidence' | 'sentiment'>>,
  ): Promise<EditResult> {
    const operation: EditOperation = {
      type: 'update',
      memoryId: id,
      updates,
      timestamp: Date.now(),
    };

    const result = await this.store.update(id, updates);
    if (!result) {
      return { success: false, operation: 'update', memoryId: id, error: `Memory not found: ${id}` };
    }

    this.recordOperation(operation);
    logger.info('Memory edited', { id, fields: Object.keys(updates) });
    return { success: true, operation: 'update', memoryId: id };
  }

  /** Delete a memory */
  async delete(id: string): Promise<EditResult> {
    const operation: EditOperation = {
      type: 'delete',
      memoryId: id,
      timestamp: Date.now(),
    };

    const removed = await this.store.remove(id);
    if (!removed) {
      return { success: false, operation: 'delete', memoryId: id, error: `Memory not found: ${id}` };
    }

    this.recordOperation(operation);
    logger.info('Memory deleted', { id });
    return { success: true, operation: 'delete', memoryId: id };
  }

  /** Bulk delete by category */
  async deleteByCategory(category: MemoryCategory): Promise<{ deleted: number; failed: number }> {
    const entries = await this.store.getByCategory(category);
    let deleted = 0;
    let failed = 0;

    for (const entry of entries) {
      const result = await this.delete(entry.id);
      if (result.success) deleted++;
      else failed++;
    }

    return { deleted, failed };
  }

  /** Get edit history */
  getEditHistory(): EditOperation[] {
    return [...this.editHistory];
  }

  /** Clear edit history */
  clearHistory(): void {
    this.editHistory = [];
  }

  private recordOperation(op: EditOperation): void {
    this.editHistory.push(op);
    if (this.editHistory.length > this.maxHistory) {
      this.editHistory.shift();
    }
  }

  private toView(entry: MemoryEntry): MemoryView {
    return {
      id: entry.id,
      content: entry.content,
      category: entry.category,
      importance: entry.importance,
      confidence: entry.confidence,
      tags: entry.tags,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      sentiment: entry.sentiment,
      source: entry.provenance?.origin,
    };
  }
}
