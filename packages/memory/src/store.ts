import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import { getMemoryDir } from '@auxiora/core';
import type { MemoryEntry, MemoryCategory, MemoryProvenance, LivingMemoryState, MemoryPartition } from './types.js';

const logger = getLogger('memory:store');

export class MemoryStore {
  private filePath: string;
  private maxEntries: number;

  constructor(options?: { dir?: string; maxEntries?: number }) {
    const dir = options?.dir ?? getMemoryDir();
    this.filePath = path.join(dir, 'memories.json');
    this.maxEntries = options?.maxEntries ?? 1000;
  }

  async add(
    content: string,
    category: MemoryCategory,
    source: MemoryEntry['source'],
    extra?: Partial<Pick<MemoryEntry, 'importance' | 'confidence' | 'sentiment' | 'expiresAt' | 'encrypted' | 'relatedMemories' | 'partitionId' | 'sourceUserId'>> & { provenance?: MemoryProvenance },
  ): Promise<MemoryEntry> {
    const memories = await this.readFile();
    const tags = this.extractTags(content);

    // Dedup: check for >50% tag overlap with existing entries
    const existing = this.findOverlap(memories, tags);
    if (existing) {
      existing.content = content;
      existing.updatedAt = Date.now();
      existing.tags = tags;
      if (extra?.importance !== undefined) existing.importance = extra.importance;
      if (extra?.confidence !== undefined) existing.confidence = extra.confidence;
      if (extra?.sentiment !== undefined) existing.sentiment = extra.sentiment;
      await this.writeFile(memories);
      logger.debug('Updated existing memory (dedup)', { id: existing.id });
      return existing;
    }

    const entry: MemoryEntry = {
      id: `mem-${crypto.randomUUID().slice(0, 8)}`,
      content,
      category,
      source,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessCount: 0,
      tags,
      importance: extra?.importance ?? 0.5,
      confidence: extra?.confidence ?? 0.8,
      sentiment: extra?.sentiment ?? 'neutral',
      encrypted: extra?.encrypted ?? false,
      partitionId: extra?.partitionId ?? 'global',
      ...(extra?.sourceUserId !== undefined ? { sourceUserId: extra.sourceUserId } : {}),
      ...(extra?.expiresAt !== undefined ? { expiresAt: extra.expiresAt } : {}),
      ...(extra?.relatedMemories !== undefined ? { relatedMemories: extra.relatedMemories } : {}),
      ...(extra?.provenance !== undefined ? { provenance: extra.provenance } : {}),
    };

    memories.push(entry);

    // Enforce max entries: remove oldest by updatedAt
    if (memories.length > this.maxEntries) {
      memories.sort((a, b) => b.updatedAt - a.updatedAt);
      memories.length = this.maxEntries;
    }

    await this.writeFile(memories);
    void audit('memory.saved', { id: entry.id, category, source });
    logger.debug('Saved memory', { id: entry.id, category });
    return entry;
  }

  async remove(id: string): Promise<boolean> {
    const memories = await this.readFile();
    const filtered = memories.filter(m => m.id !== id);
    if (filtered.length === memories.length) return false;
    await this.writeFile(filtered);
    void audit('memory.deleted', { id });
    logger.debug('Removed memory', { id });
    return true;
  }

  async update(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'category' | 'importance' | 'confidence' | 'sentiment' | 'expiresAt' | 'encrypted'>>): Promise<MemoryEntry | undefined> {
    const memories = await this.readFile();
    const entry = memories.find(m => m.id === id);
    if (!entry) return undefined;

    if (updates.content !== undefined) {
      entry.content = updates.content;
      entry.tags = this.extractTags(updates.content);
    }
    if (updates.category !== undefined) entry.category = updates.category;
    if (updates.importance !== undefined) entry.importance = updates.importance;
    if (updates.confidence !== undefined) entry.confidence = updates.confidence;
    if (updates.sentiment !== undefined) entry.sentiment = updates.sentiment;
    if (updates.expiresAt !== undefined) entry.expiresAt = updates.expiresAt;
    if (updates.encrypted !== undefined) entry.encrypted = updates.encrypted;
    entry.updatedAt = Date.now();

    await this.writeFile(memories);
    return entry;
  }

  async getAll(): Promise<MemoryEntry[]> {
    return this.readFile();
  }

  async search(query: string): Promise<MemoryEntry[]> {
    const memories = await this.readFile();
    const queryTags = this.extractTags(query);
    if (queryTags.length === 0) return memories;

    // Score by tag overlap
    const scored = memories.map(m => {
      const overlap = m.tags.filter(t => queryTags.includes(t)).length;
      return { entry: m, score: overlap };
    });

    const results = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => {
        s.entry.accessCount++;
        return s.entry;
      });

    // Fix: persist accessCount increments
    if (results.length > 0) {
      await this.writeFile(memories);
    }

    return results;
  }

  async getByCategory(category: MemoryCategory, partitionId?: string): Promise<MemoryEntry[]> {
    const memories = await this.readFile();
    return memories.filter(m =>
      m.category === category &&
      (partitionId === undefined || (m.partitionId ?? 'global') === partitionId),
    );
  }

  async getByPartition(partitionId: string): Promise<MemoryEntry[]> {
    const memories = await this.readFile();
    return memories.filter(m => (m.partitionId ?? 'global') === partitionId);
  }

  async getByPartitions(partitionIds: string[]): Promise<MemoryEntry[]> {
    const memories = await this.readFile();
    const idSet = new Set(partitionIds);
    return memories.filter(m => idSet.has(m.partitionId ?? 'global'));
  }

  async getExpired(): Promise<MemoryEntry[]> {
    const memories = await this.readFile();
    const now = Date.now();
    return memories.filter(m => m.expiresAt !== undefined && m.expiresAt <= now);
  }

  async cleanExpired(): Promise<number> {
    const memories = await this.readFile();
    const now = Date.now();
    const before = memories.length;
    const kept = memories.filter(m => m.expiresAt === undefined || m.expiresAt > now);
    const removed = before - kept.length;
    if (removed > 0) {
      await this.writeFile(kept);
      logger.debug('Cleaned expired memories', { removed });
    }
    return removed;
  }

  async merge(id1: string, id2: string, mergedContent: string): Promise<MemoryEntry> {
    const memories = await this.readFile();
    const entry1 = memories.find(m => m.id === id1);
    const entry2 = memories.find(m => m.id === id2);
    if (!entry1) throw new Error(`Memory not found: ${id1}`);
    if (!entry2) throw new Error(`Memory not found: ${id2}`);

    // Keep the older entry's id, merge fields
    const merged: MemoryEntry = {
      id: entry1.id,
      content: mergedContent,
      category: entry1.category,
      source: entry1.source,
      createdAt: Math.min(entry1.createdAt, entry2.createdAt),
      updatedAt: Date.now(),
      accessCount: entry1.accessCount + entry2.accessCount,
      tags: this.extractTags(mergedContent),
      importance: Math.max(entry1.importance, entry2.importance),
      confidence: Math.max(entry1.confidence, entry2.confidence),
      sentiment: entry1.sentiment,
      encrypted: entry1.encrypted || entry2.encrypted,
      relatedMemories: [
        ...new Set([
          ...(entry1.relatedMemories ?? []),
          ...(entry2.relatedMemories ?? []),
        ]),
      ],
      provenance: {
        origin: 'merged',
        derivedFrom: [id1, id2],
      },
    };

    // Remove both originals and add merged
    const filtered = memories.filter(m => m.id !== id1 && m.id !== id2);
    filtered.push(merged);
    await this.writeFile(filtered);

    logger.debug('Merged memories', { id1, id2, mergedId: merged.id });
    return merged;
  }

  async getStats(): Promise<LivingMemoryState['stats']> {
    const memories = await this.readFile();

    if (memories.length === 0) {
      return {
        totalMemories: 0,
        oldestMemory: 0,
        newestMemory: 0,
        averageImportance: 0,
        topTags: [],
      };
    }

    const tagCounts = new Map<string, number>();
    let totalImportance = 0;
    let oldest = Infinity;
    let newest = 0;

    for (const m of memories) {
      totalImportance += m.importance;
      if (m.createdAt < oldest) oldest = m.createdAt;
      if (m.createdAt > newest) newest = m.createdAt;
      for (const tag of m.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    return {
      totalMemories: memories.length,
      oldestMemory: oldest,
      newestMemory: newest,
      averageImportance: totalImportance / memories.length,
      topTags,
    };
  }

  async exportAll(): Promise<{ version: string; memories: MemoryEntry[]; exportedAt: number }> {
    const memories = await this.readFile();
    return {
      version: '1.0',
      memories,
      exportedAt: Date.now(),
    };
  }

  async importAll(data: { memories: MemoryEntry[] }): Promise<{ imported: number; skipped: number }> {
    const existing = await this.readFile();
    const existingIds = new Set(existing.map(m => m.id));
    let imported = 0;
    let skipped = 0;

    for (const entry of data.memories) {
      if (existingIds.has(entry.id)) {
        skipped++;
        continue;
      }
      // Ensure new fields have defaults for legacy imports
      existing.push(this.applyDefaults(entry));
      existingIds.add(entry.id);
      imported++;
    }

    // Enforce max entries
    if (existing.length > this.maxEntries) {
      existing.sort((a, b) => b.updatedAt - a.updatedAt);
      existing.length = this.maxEntries;
    }

    await this.writeFile(existing);
    logger.debug('Imported memories', { imported, skipped });
    return { imported, skipped };
  }

  async setImportance(id: string, importance: number): Promise<void> {
    if (importance < 0 || importance > 1) {
      throw new Error('Importance must be between 0 and 1');
    }
    const result = await this.update(id, { importance });
    if (!result) throw new Error(`Memory not found: ${id}`);
  }

  async linkMemories(id1: string, id2: string): Promise<void> {
    const memories = await this.readFile();
    const entry1 = memories.find(m => m.id === id1);
    const entry2 = memories.find(m => m.id === id2);
    if (!entry1) throw new Error(`Memory not found: ${id1}`);
    if (!entry2) throw new Error(`Memory not found: ${id2}`);

    if (!entry1.relatedMemories) entry1.relatedMemories = [];
    if (!entry2.relatedMemories) entry2.relatedMemories = [];

    if (!entry1.relatedMemories.includes(id2)) entry1.relatedMemories.push(id2);
    if (!entry2.relatedMemories.includes(id1)) entry2.relatedMemories.push(id1);

    await this.writeFile(memories);
    logger.debug('Linked memories', { id1, id2 });
  }

  extractTags(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
      'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each',
      'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some',
      'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
      'just', 'about', 'also', 'that', 'this', 'it', 'its', 'i', 'my',
      'me', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them',
      'their', 'what', 'which', 'who', 'when', 'where', 'how', 'like',
      'user', 'prefers', 'uses', 'wants', 'likes',
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .filter((w, i, arr) => arr.indexOf(w) === i); // unique
  }

  private findOverlap(memories: MemoryEntry[], tags: string[]): MemoryEntry | undefined {
    if (tags.length === 0) return undefined;

    for (const m of memories) {
      const overlap = m.tags.filter(t => tags.includes(t)).length;
      const ratio = overlap / Math.max(m.tags.length, tags.length);
      if (ratio > 0.5) return m;
    }
    return undefined;
  }

  /** Apply defaults for new fields when loading legacy entries */
  private applyDefaults(entry: MemoryEntry): MemoryEntry {
    return {
      ...entry,
      importance: entry.importance ?? 0.5,
      confidence: entry.confidence ?? 0.8,
      sentiment: entry.sentiment ?? 'neutral',
      encrypted: entry.encrypted ?? false,
      partitionId: entry.partitionId ?? 'global',
    };
  }

  private async readFile(): Promise<MemoryEntry[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const raw = JSON.parse(content) as MemoryEntry[];
      // Apply defaults for legacy entries that lack new fields
      return raw.map(e => this.applyDefaults(e));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeFile(memories: MemoryEntry[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(memories, null, 2), 'utf-8');
  }
}
