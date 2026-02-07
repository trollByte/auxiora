import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import { getMemoryDir } from '@auxiora/core';
import type { MemoryEntry, MemoryCategory } from './types.js';

const logger = getLogger('memory:store');

export class MemoryStore {
  private filePath: string;
  private maxEntries: number;

  constructor(options?: { dir?: string; maxEntries?: number }) {
    const dir = options?.dir ?? getMemoryDir();
    this.filePath = path.join(dir, 'memories.json');
    this.maxEntries = options?.maxEntries ?? 500;
  }

  async add(content: string, category: MemoryCategory, source: 'extracted' | 'explicit'): Promise<MemoryEntry> {
    const memories = await this.readFile();
    const tags = this.extractTags(content);

    // Dedup: check for >50% tag overlap with existing entries
    const existing = this.findOverlap(memories, tags);
    if (existing) {
      existing.content = content;
      existing.updatedAt = Date.now();
      existing.tags = tags;
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

  async update(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'category'>>): Promise<MemoryEntry | undefined> {
    const memories = await this.readFile();
    const entry = memories.find(m => m.id === id);
    if (!entry) return undefined;

    if (updates.content !== undefined) {
      entry.content = updates.content;
      entry.tags = this.extractTags(updates.content);
    }
    if (updates.category !== undefined) entry.category = updates.category;
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

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => {
        s.entry.accessCount++;
        return s.entry;
      });
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

  private async readFile(): Promise<MemoryEntry[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as MemoryEntry[];
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
